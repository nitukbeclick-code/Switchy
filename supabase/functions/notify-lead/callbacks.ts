// Telegram callback_query + chat-message handling: status buttons, claiming,
// undo, won-flow savings capture, reply-notes, renewal→lead creation.

import type { Cfg, Lead, RenewalRow, TgCallbackQuery, TgMessage } from "../_shared/types.ts";
import { esc, NL, sendTelegram, tgApi } from "../_shared/telegram.ts";
import { fetchRows, insertRow, logEvent, patchCount, rpcRows, serviceFetch } from "../_shared/db.ts";
import { formatTimeline, frozenKeyboard, isWonAskMarkup, keyboardFor, leadIdFromMarkup, type LeadEvent, STATUS_HE, tgDisplayName } from "../_shared/leads.ts";
import { isLinkAskMarkup, isRescheduleAskMarkup } from "../_shared/meetings.ts";
import { sendText as waSendText } from "../_shared/whatsapp.ts";
import { baresPhone, handleCommand } from "./commands.ts";
import { handleMeetingCallback, handleMeetingLinkReply, handleMeetingRescheduleReply } from "./meeting_callbacks.ts";

type HandlerResult = Record<string, unknown>;

// Outbound rep relay body cap — matches the CRM's MAX_REPLY_LEN intent and stays
// well under Graph's 4096-char text limit. A rep paste longer than this is clipped.
const MAX_RELAY_LEN = 3000;

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp live-relay (human takeover) — rep→customer half.
//
// RELAY CONTRACT (shared with whatsapp-webhook's customer→rep half):
//   whatsapp_conversations.relay_tg_chat_id (text, nullable; NULL = no relay).
//   TAKE-OVER : bot_enabled=false + relay_tg_chat_id = <pressing rep's TG chat id>.
//   HAND-BACK : bot_enabled=true  + relay_tg_chat_id = NULL.
//   RELAY-ACTIVE = (bot_enabled=false AND relay_tg_chat_id IS NOT NULL).
// Rep→customer relay sends via _shared/whatsapp.ts sendText to the customer phone;
// the webhook side sends customer→rep via _shared/telegram.ts sendTelegram.
// ─────────────────────────────────────────────────────────────────────────────

// A WhatsApp conversation row, narrowed to the fields the relay needs.
type WaConvo = {
  id: string;
  contact_id?: string | null;
  bot_enabled?: boolean | null;
  relay_tg_chat_id?: string | null;
};

// National IL phone → E.164 digits (the form whatsapp_contacts.wa_phone stores,
// e.g. "0501234567" → "972501234567"). Returns "" when there aren't enough
// digits to be a real number. Mirrors telegram.ts intlPhone (kept local so leads
// stays dependency-light) — used only to derive a match suffix, never to send.
export function leadPhoneToE164(phone: unknown): string {
  const d = String(phone ?? "").replace(/[^0-9]/g, "");
  if (d.length < 9) return "";
  return d.startsWith("0") ? "972" + d.slice(1) : d;
}

// Resolve a lead's phone → its live WhatsApp conversation (contact by wa_phone,
// then the newest open/bot/human conversation). Matches on the last 9 digits via
// ilike so a contact stored as 972… or 0… both resolve (same suffix-match the
// dossier uses for meetings). Returns null on no-match OR a DB error — the caller
// reports "no live WhatsApp conversation" either way (fail-soft, never throws).
export async function resolveWaConvoByPhone(phone: unknown): Promise<WaConvo | null> {
  const e164 = leadPhoneToE164(phone);
  if (!e164) return null;
  const suffix = e164.slice(-9);
  const contacts = await fetchRows<{ id: string }>(
    `/rest/v1/whatsapp_contacts?wa_phone=ilike.*${encodeURIComponent(suffix)}&select=id&order=last_message_at.desc.nullslast&limit=1`,
  );
  if (!contacts || contacts.length === 0) return null;
  const contactId = String(contacts[0].id);
  const convos = await fetchRows<WaConvo>(
    `/rest/v1/whatsapp_conversations?contact_id=eq.${encodeURIComponent(contactId)}&status=in.(open,bot,human)&order=created_at.desc&limit=1&select=id,contact_id,bot_enabled,relay_tg_chat_id`,
  );
  if (!convos || convos.length === 0) return null;
  return convos[0];
}

// RELAY-ACTIVE: a rep has the conversation (bot_enabled=false) AND a relay target
// is set. NULL relay_tg_chat_id (or bot_enabled still true) = not relaying.
export function isRelayActive(convo: WaConvo | null | undefined): boolean {
  if (!convo) return false;
  const target = String(convo.relay_tg_chat_id ?? "").trim();
  return convo.bot_enabled === false && target.length > 0;
}

// Reg.13 security-audit row for a relay control/action — mirrors crm-api's
// logAudit + auditDetail: the actor uid is stamped LAST so a caller can never
// spoof it, and the detail stays PII-light (ids + a short preview, never the raw
// customer-controlled body). Best-effort: never blocks the relay, never throws.
async function logRelayAudit(
  actorTgId: number | null,
  event: string,
  detail: Record<string, unknown>,
): Promise<void> {
  await insertRow("security_audit_log", {
    user_id: null, // Telegram reps are not auth.users; the tg id lives inside detail
    event,
    detail: { ...detail, actor_tg_id: actorTgId ?? null },
  });
}

// Exported for unit tests. Fail-close: an empty allowlist means the bot is not
// fully configured, so nobody is authorized. The config guard in index.ts
// rejects updates before they reach here, but keep this defensive in case a
// caller bypasses it.
export function allowed(cfg: Cfg, userId: number | undefined): boolean {
  if (cfg.allowedUserIds.length === 0) return false;
  return cfg.allowedUserIds.includes(userId ?? 0);
}

// Re-render the message keyboard from current DB state. Status-aware: a lead
// closed by a concurrent press stays frozen — a late claim can't resurrect
// live buttons.
async function refreshKeyboard(cfg: Cfg, msg: TgMessage | undefined, leadId: string): Promise<void> {
  if (!msg || msg.chat?.id == null) return;
  const rows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=*`);
  if (!rows || rows.length === 0) return;
  await tgApi(cfg, "editMessageReplyMarkup", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    reply_markup: keyboardFor(rows[0]),
  });
}

async function handleRenewLead(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  trackedId: string,
): Promise<HandlerResult> {
  const renewals = await rpcRows<RenewalRow>("get_upcoming_renewals", { days: 90 });
  if (renewals === null) {
    await answer("שאילתת החידושים נכשלה — נסו שוב");
    return { ok: false, skipped: "renewals query failed" };
  }
  const r = renewals.find((x) => x.id === trackedId);
  if (!r) {
    await answer("החידוש לא נמצא");
    return { ok: false, skipped: "renewal not found" };
  }
  // sanitize against the leads insert gate: profile data is free text
  const phone = String(r.phone ?? "").replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 9) {
    await answer("אין טלפון תקין בפרופיל של הלקוח");
    return { ok: false, skipped: "no phone" };
  }
  const name = (String(r.name ?? "").trim() || "לקוח חידוש").slice(0, 80);
  // the leads INSERT trigger pings notify-lead, so the new lead card (with
  // status buttons) lands in this chat by itself
  const ok = await insertRow("leads", {
    user_id: r.user_id,
    name,
    phone,
    provider: String(r.provider ?? "").slice(0, 120),
    plan_id: String(r.plan_name ?? "").slice(0, 120),
    source: "renewal",
    callback_time: "now",
    notes: `חידוש: ${r.plan_name} (₪${r.monthly_price}/חודש) מסתיים ב-${r.promo_end_date}`.slice(0, 600),
  });
  await answer(ok ? "ליד נוצר ✅ — הכרטיס יופיע כאן מיד" : "שגיאת מסד נתונים — נסו שוב בעוד רגע");
  return { ok };
}

// TAKE-OVER: the pressing rep takes the live WhatsApp conversation off the bot and
// into Telegram. Flips whatsapp_conversations: bot_enabled=false + relay_tg_chat_id
// = the rep's Telegram chat id (cb.from?.id). After this, the webhook relays the
// customer's inbound to this chat, and a rep reply here relays back to the customer.
// Atomic on the conversation id (the patchCount confirms a row actually changed);
// re-pressing just re-points the relay to whoever pressed last. Audited (Reg.13).
async function handleRelayTakeover(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  leadId: string,
  cb: TgCallbackQuery,
): Promise<HandlerResult> {
  const leads = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=id,phone,name`);
  if (leads === null) {
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  const lead = leads[0];
  if (!lead) {
    await answer("הליד לא נמצא");
    return { ok: false };
  }
  const convo = await resolveWaConvoByPhone(lead.phone);
  if (!convo) {
    await answer("אין שיחת וואטסאפ פעילה ללקוח הזה");
    return { ok: false, skipped: "no whatsapp conversation" };
  }
  const repChat = cb.from?.id;
  if (repChat == null) {
    await answer("לא זוהה צ׳אט נציג");
    return { ok: false, skipped: "no rep chat id" };
  }
  // Flip the gate OFF + point the relay at THIS rep's Telegram chat. patchCount on
  // the conversation id confirms the write landed (0 rows = the conv vanished or a
  // DB error) — the atomic-claim style: act on a filtered id, trust the row count.
  const n = await patchCount(`/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(convo.id)}`, {
    bot_enabled: false,
    relay_tg_chat_id: String(repChat),
  });
  if (n === 0) {
    await answer("ההשתלטות נכשלה — נסו שוב בעוד רגע");
    return { ok: false };
  }
  await logRelayAudit(repChat, "wa_relay_takeover", {
    lead_id: leadId,
    conversation_id: convo.id,
    contact_id: convo.contact_id ?? null,
    relay_tg_chat_id: String(repChat),
  });
  await answer("השתלטת על השיחה 🤝 — הודעות הלקוח יגיעו לכאן");
  await sendTelegram(
    cfg,
    `🤝 <b>השתלטת על שיחת הוואטסאפ</b>${lead.name ? ` עם ${esc(lead.name)}` : ""}.${NL}` +
      `הבוט הושתק — הודעות הלקוח יופנו לכאן, וכל הודעה שתשיבו (reply) לכרטיס תישלח אליו בוואטסאפ.`,
  );
  return { ok: true };
}

// HAND-BACK: return the conversation to the AI bot. Flips bot_enabled=true +
// relay_tg_chat_id=NULL (per the contract). Idempotent — handing back a bot-driven
// conversation is a harmless no-op flip. Audited (Reg.13).
async function handleRelayHandback(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  leadId: string,
  cb: TgCallbackQuery,
): Promise<HandlerResult> {
  const leads = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=id,phone,name`);
  if (leads === null) {
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  const lead = leads[0];
  if (!lead) {
    await answer("הליד לא נמצא");
    return { ok: false };
  }
  const convo = await resolveWaConvoByPhone(lead.phone);
  if (!convo) {
    await answer("אין שיחת וואטסאפ פעילה ללקוח הזה");
    return { ok: false, skipped: "no whatsapp conversation" };
  }
  const n = await patchCount(`/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(convo.id)}`, {
    bot_enabled: true,
    relay_tg_chat_id: null,
  });
  if (n === 0) {
    await answer("ההחזרה לבוט נכשלה — נסו שוב בעוד רגע");
    return { ok: false };
  }
  await logRelayAudit(cb.from?.id ?? null, "wa_relay_handback", {
    lead_id: leadId,
    conversation_id: convo.id,
    contact_id: convo.contact_id ?? null,
  });
  await answer("הוחזר לבוט 🤖");
  await sendTelegram(
    cfg,
    `🤖 <b>השיחה הוחזרה לבוט</b>${lead.name ? ` (${esc(lead.name)})` : ""} — הבוט האוטומטי חזר לענות ללקוח.`,
  );
  return { ok: true };
}

export async function handleCallback(cfg: Cfg, cb: TgCallbackQuery): Promise<HandlerResult> {
  // Meeting cards live in their own namespace and carry the same gates inside.
  if (String(cb.data ?? "").startsWith("meet:")) return await handleMeetingCallback(cfg, cb);

  const answer = (text?: string) =>
    tgApi(cfg, "answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) });

  if (!allowed(cfg, cb.from?.id)) {
    await answer("אין הרשאה לפעולה זו");
    return { ok: false, skipped: "user not allowed" };
  }

  const data = String(cb.data ?? "");
  const msg = cb.message;
  const chatId = msg?.chat?.id;
  // Honor presses only from the configured team chat. Fail-close: an unset
  // tgChat rejects (the config guard in index.ts should already have stopped
  // this, but never trust an unconfigured chat gate to allow).
  if (!cfg.tgChat || String(chatId ?? "") !== cfg.tgChat) {
    await answer();
    return { ok: false, skipped: "wrong chat" };
  }

  const renewM = data.match(/^renew:([0-9a-fA-F-]{36}):lead$/);
  if (renewM) return await handleRenewLead(cfg, answer, renewM[1]);

  // WhatsApp live-relay controls live in the lead namespace but resolve through
  // the conversation, not the lead status machine — route them first.
  const relayM = data.match(/^lead:([0-9a-fA-F-]{36}):(takeover|handback)$/);
  if (relayM) {
    const [, relayLeadId, relayAction] = relayM;
    return relayAction === "takeover"
      ? await handleRelayTakeover(cfg, answer, relayLeadId, cb)
      : await handleRelayHandback(cfg, answer, relayLeadId, cb);
  }

  const m = data.match(/^lead:([0-9a-fA-F-]{36}):(contacted|won|lost|claim|claimed|undo|snooze|wonask|noop|history)$/);
  if (!m) {
    await answer();
    return { ok: true, skipped: "unrecognized callback" };
  }
  const [, leadId, action] = m;
  const who = tgDisplayName(cb.from);

  if (action === "noop" || action === "wonask") {
    await answer();
    return { ok: true };
  }

  if (action === "history") {
    const [leadRows, evs] = await Promise.all([
      fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=*`),
      fetchRows<LeadEvent>(`/rest/v1/lead_events?lead_id=eq.${leadId}&order=created_at.asc&limit=30`),
    ]);
    if (leadRows === null || evs === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    if (!leadRows[0]) {
      await answer("הליד לא נמצא");
      return { ok: false };
    }
    await answer();
    await sendTelegram(cfg, formatTimeline(leadRows[0], evs));
    return { ok: true };
  }

  if (action === "claimed") {
    const rows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=claimed_by`);
    if (rows === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    await answer(rows[0]?.claimed_by ? `בטיפול אצל ${rows[0].claimed_by}` : "פנוי לטיפול");
    return { ok: true };
  }

  if (action === "claim") {
    // claimed_by_tg_id=is.null makes the claim atomic — the second presser
    // matches zero rows
    const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}&claimed_by_tg_id=is.null`, {
      claimed_by: (who || "נציג").slice(0, 60),
      claimed_by_tg_id: cb.from?.id ?? null,
      claimed_at: new Date().toISOString(),
    });
    if (n === 0) {
      const rows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=claimed_by`);
      const owner = rows?.[0]?.claimed_by;
      await answer(owner ? `כבר בטיפול אצל ${owner}` : "התפיסה נכשלה — נסו שוב");
      return { ok: false, skipped: "already claimed" };
    }
    await logEvent({ lead_id: leadId, event: "claim", actor_tg_id: cb.from?.id ?? null, actor_name: who });
    await answer("נתפס על ידך 🙋");
    await refreshKeyboard(cfg, msg, leadId);
    return { ok: true };
  }

  if (action === "snooze") {
    // "Not now, but not dropping it": push the SLA nudge back ~2h by stamping
    // nudged_at forward (the follow-up planner treats nudged_at as the last
    // reminder and waits its 2h/6h/24h gap from it). The lead stays status=new
    // so it still shows in the agenda — only the reminder is deferred. Only
    // applies to OPEN leads; a won/lost lead has no pending nudge to defer.
    const rows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=status`);
    if (rows === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    if (!rows[0]) {
      await answer("הליד לא נמצא");
      return { ok: false };
    }
    const st = String(rows[0].status ?? "new");
    if (st === "won" || st === "lost") {
      await answer("הליד סגור — אין מה לדחות");
      return { ok: false, skipped: "lead closed" };
    }
    const until = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}`, { nudged_at: until });
    if (n === 0) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    await logEvent({ lead_id: leadId, event: "snooze", note: until, actor_tg_id: cb.from?.id ?? null, actor_name: who });
    await answer("נדחה ל-~שעתיים ⏰");
    return { ok: true };
  }

  if (action === "undo") {
    const evs = await fetchRows<Record<string, unknown>>(
      `/rest/v1/lead_events?lead_id=eq.${leadId}&event=eq.status_change&order=created_at.desc&limit=1`,
    );
    if (evs === null) {
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    if (evs.length === 0) {
      // no recorded transition — guessing 'new' could silently regress a
      // legitimately-contacted lead
      await answer("אין היסטוריית סטטוס לשחזור");
      return { ok: false, skipped: "no status history" };
    }
    const prev = String(evs[0]?.old_status ?? "new");
    // reverting all the way to 'new' also clears the side effects the
    // mistaken press created
    const body: Record<string, unknown> = prev === "new"
      ? { status: prev, contacted_at: null, actual_saving: null }
      : { status: prev };
    const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}`, body);
    if (n === 0) {
      // the lead was just read above, so a zero-row revert is a DB failure.
      await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    await logEvent({ lead_id: leadId, event: "undo", new_status: prev, actor_tg_id: cb.from?.id ?? null, actor_name: who });
    await answer(`שוחזר ל"${STATUS_HE[prev] ?? prev}"`);
    await refreshKeyboard(cfg, msg, leadId);
    return { ok: true };
  }

  // status change: contacted | won | lost
  const beforeRows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=*`);
  if (beforeRows === null) {
    // fetchRows === null is a real DB error, not an empty result set.
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  const before = beforeRows[0];
  if (!before) {
    await answer("הליד לא נמצא");
    return { ok: false };
  }
  if (String(before.status ?? "new") === action) {
    // double-tap or stale card — don't log a self-transition (it would make
    // undo a no-op) and don't regress anything
    await answer(`כבר במצב "${STATUS_HE[action]}"`);
    await refreshKeyboard(cfg, msg, leadId);
    return { ok: true, skipped: "no-op transition" };
  }
  const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}`, { status: action });
  if (n === 0) {
    // the row existed a moment ago (beforeRows had it) and the status differs,
    // so a zero-row patch means the DB call itself failed — not a no-match.
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  if (action === "contacted" && !before.contacted_at) {
    // first contact only — the speed-to-lead KPI must not reset on re-presses
    await patchCount(`/rest/v1/leads?id=eq.${leadId}&contacted_at=is.null`, { contacted_at: new Date().toISOString() });
  }
  await logEvent({
    lead_id: leadId,
    event: "status_change",
    old_status: String(before.status ?? "new"),
    new_status: action,
    actor_tg_id: cb.from?.id ?? null,
    actor_name: who,
  });
  await answer(`הסטטוס עודכן: ${STATUS_HE[action]}`);
  if (msg && msg.chat?.id != null) {
    await tgApi(cfg, "editMessageReplyMarkup", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reply_markup: frozenKeyboard(before, action, who),
    });
  }
  if (action === "won") {
    await sendTelegram(
      cfg,
      `🏆 <b>נסגר!</b> כמה חיסכון שנתי עשיתם ל${before.name ? "־" + esc(before.name) : "לקוח"}?${NL}השיבו (reply) להודעה הזו עם הסכום בש״ח בלבד ונרשום אותו על הליד.`,
      { inline_keyboard: [[{ text: "💰 רישום חיסכון", callback_data: `lead:${leadId}:wonask` }]] },
    );
  }
  return { ok: true };
}

// A savings reply must be a single number token (optionally ₪/ש"ח) — a free
// sentence with digits in it ("אתקשר ב-17:30") must NOT be recorded as money.
export function parseSavingAmount(text: string): number | null {
  const m = text.replace(/[,،]/g, "").match(/^\s*₪?\s*(\d{1,6})(?:\s*(?:₪|ש"ח|שח))?\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000) : null;
}

// A lone-number reply that parses to 0 ("0", "₪0") is a well-formed-but-invalid
// amount — parseSavingAmount returns null for it (same as prose), but the rep
// deserves the precise "positive amount required" nudge rather than the generic
// "not recognized as a number" one.
export function isLoneZeroAmount(text: string): boolean {
  const m = text.replace(/[,،]/g, "").match(/^\s*₪?\s*(\d{1,6})(?:\s*(?:₪|ש"ח|שח))?\s*$/);
  return m !== null && Number(m[1]) === 0;
}

// Relay a rep's Telegram reply to the customer over WhatsApp — the rep→customer
// half of the live relay. Preconditions (checked by the caller): the conversation
// is RELAY-ACTIVE (bot_enabled=false + relay_tg_chat_id set). Here we:
//   §30A FIRST  — refuse if the customer has opted out (contact opted_out OR a
//                 marketing_suppression row). The relay is an ACTIVE human
//                 conversation, not marketing, but the STOP gate still WINS:
//                 we never push a message to someone who asked us to stop.
//   1) sendText(customer phone, text) via _shared/whatsapp.ts (the shared sender).
//   2) Store the outbound in whatsapp_messages (direction=out, actor=rep, wamid).
//   3) Reg.13 audit (who/when, PII-light preview) — exactly like crm-api sendReply.
//   4) Keep bot_enabled=false (the human stays in the loop; we do NOT re-enable).
// Fail-soft: the DB write is authoritative; a Graph failure is recorded as failed.
async function relayRepReplyToCustomer(
  cfg: Cfg,
  msg: TgMessage,
  leadId: string,
  convo: WaConvo,
  text: string,
  who: string,
): Promise<HandlerResult> {
  const contactId = String(convo.contact_id ?? "").trim();
  if (!contactId) {
    await sendTelegram(cfg, "לא נמצא איש קשר לשיחה — ההודעה לא נשלחה");
    return { ok: false, skipped: "relay conversation has no contact" };
  }
  const contacts = await fetchRows<{ wa_phone?: string; status?: string }>(
    `/rest/v1/whatsapp_contacts?id=eq.${encodeURIComponent(contactId)}&select=wa_phone,status&limit=1`,
  );
  if (contacts === null) {
    await sendTelegram(cfg, "שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  const contact = contacts[0];
  const phone = String(contact?.wa_phone ?? "").trim();
  if (!phone) {
    await sendTelegram(cfg, "אין מספר וואטסאפ לאיש הקשר — ההודעה לא נשלחה");
    return { ok: false, skipped: "contact has no wa_phone" };
  }

  // §30A STOP gate — runs FIRST and WINS. opted_out contact status OR a durable
  // marketing_suppression row blocks the relay outright (we never message someone
  // who asked to stop, even inside an active conversation).
  if (String(contact?.status ?? "").toLowerCase() === "opted_out") {
    await sendTelegram(cfg, "⛔ הלקוח ביקש להפסיק לקבל הודעות (STOP) — ההודעה לא נשלחה.");
    return { ok: false, skipped: "customer opted out" };
  }
  const suppressed = await fetchRows<{ id?: string }>(
    `/rest/v1/marketing_suppression?channel=eq.whatsapp&contact=eq.${encodeURIComponent(phone)}&select=id&limit=1`,
  );
  if (suppressed && suppressed.length > 0) {
    await sendTelegram(cfg, "⛔ הלקוח ברשימת ההסרה (STOP) — ההודעה לא נשלחה.");
    return { ok: false, skipped: "customer suppressed" };
  }

  const body = text.slice(0, MAX_RELAY_LEN);
  // 1) Best-effort Graph send first so we can store the real wamid + status.
  const wamid = await waSendText(phone, body);
  // 2) DB write is authoritative — store the outbound regardless of send success.
  const wrote = await insertRow("whatsapp_messages", {
    conversation_id: convo.id,
    contact_id: contactId,
    direction: "out",
    actor: "rep",
    msg_type: "text",
    body,
    wa_message_id: wamid,
    status: wamid ? "sent" : "failed",
  });
  // 3) Keep the human in the loop: re-assert bot_enabled=false (idempotent; the
  //    conversation was already RELAY-ACTIVE) + bump last_message_at. We do NOT
  //    touch relay_tg_chat_id — only hand-back clears it.
  await serviceFetch(`/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(convo.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ bot_enabled: false, last_message_at: new Date().toISOString() }),
  });
  // 4) Reg.13 audit (who/when, PII-light preview) — like crm-api actSendReply.
  await logRelayAudit(msg.from?.id ?? null, "wa_relay_reply", {
    lead_id: leadId,
    conversation_id: convo.id,
    contact_id: contactId,
    delivered: Boolean(wamid),
    preview: body.slice(0, 120),
  });
  if (!wrote) {
    await sendTelegram(cfg, "⚠️ שמירת ההודעה נכשלה — בדקו אם נשלחה ללקוח.");
    return { ok: false, skipped: "message store failed", delivered: Boolean(wamid) };
  }
  await sendTelegram(
    cfg,
    wamid
      ? `📤 נשלח ללקוח בוואטסאפ (${esc(who || "נציג")}).`
      : "⚠️ ההודעה נשמרה אך השליחה לוואטסאפ נכשלה — נסו שוב.",
  );
  return { ok: true, relayed: true, delivered: Boolean(wamid) };
}

export async function handleTeamMessage(cfg: Cfg, msg: TgMessage): Promise<HandlerResult> {
  const chatId = msg.chat?.id;
  // Fail-close: an unset tgChat rejects rather than accepting any chat.
  if (!cfg.tgChat || String(chatId ?? "") !== cfg.tgChat) return { ok: true, skipped: "wrong chat" };
  if (!allowed(cfg, msg.from?.id)) return { ok: false, skipped: "user not allowed" };
  const text = String(msg.text ?? "").trim();

  // Replies to a lead card become notes; replies to the won-flow prompt with a
  // single number record the actual saving.
  const reply = msg.reply_to_message;
  if (reply) {
    // Meeting link-ask replies first: the prompt's markup carries the meeting
    // id, and the reply must be a valid Zoom link (validated inside).
    const meetingId = isLinkAskMarkup(reply.reply_markup);
    if (meetingId) return await handleMeetingLinkReply(cfg, msg, meetingId, text);

    // Reschedule-ask replies: the prompt's markup carries the meeting id, the
    // reply must be a valid 'YYYY-MM-DD HH:MM' (validated inside).
    const reschedId = isRescheduleAskMarkup(reply.reply_markup);
    if (reschedId) return await handleMeetingRescheduleReply(cfg, msg, reschedId, text);

    const leadId = leadIdFromMarkup(reply.reply_markup);
    if (!leadId || !text) return { ok: true, skipped: "reply without lead context" };
    const who = tgDisplayName(msg.from);
    if (isWonAskMarkup(reply.reply_markup)) {
      // A lone "0" is a well-formed amount that's just invalid — say so precisely
      // instead of stashing it as a note like genuinely-unparseable prose.
      if (isLoneZeroAmount(text)) {
        await sendTelegram(cfg, "סכום חיובי נדרש (גדול מ-0) — השיבו עם מספר כמו <code>1200</code>");
        return { ok: false, skipped: "non-positive saving" };
      }
      const amount = parseSavingAmount(text);
      if (amount !== null) {
        const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}`, { actual_saving: amount });
        if (n === 0) {
          // the won-ask prompt only exists for a real lead, so a zero-row write
          // is a DB failure, not a missing lead.
          await sendTelegram(cfg, "שגיאת מסד נתונים — נסו שוב בעוד רגע");
          return { ok: false };
        }
        await logEvent({ lead_id: leadId, event: "saving", note: String(amount), actor_tg_id: msg.from?.id ?? null, actor_name: who });
        await sendTelegram(cfg, `💰 נרשם: ₪${amount} חיסכון שנתי ללקוח`);
        return { ok: true };
      }
      await logEvent({ lead_id: leadId, event: "note", note: text.slice(0, 1000), actor_tg_id: msg.from?.id ?? null, actor_name: who });
      await sendTelegram(cfg, "לא זיהיתי סכום (צריך מספר בלבד, למשל <code>1200</code>) — נשמר כהערה 📝");
      return { ok: true };
    }
    // Plain note on a lead card. Reject notes on a closed (won/lost) lead — its
    // card is frozen and a stray note would be misleading. We also need the phone
    // to resolve a possible live WhatsApp relay (the rep→customer half).
    const leadRows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=status,phone`);
    if (leadRows === null) {
      await sendTelegram(cfg, "שגיאת מסד נתונים — נסו שוב בעוד רגע");
      return { ok: false };
    }
    if (!leadRows[0]) {
      await sendTelegram(cfg, "הליד לא נמצא");
      return { ok: false, skipped: "lead not found" };
    }
    const st = String(leadRows[0].status ?? "new");
    if (st === "won" || st === "lost") {
      await sendTelegram(cfg, "הליד סגור — אי אפשר להוסיף הערות");
      return { ok: false, skipped: "lead closed" };
    }
    // LIVE RELAY: if this lead's WhatsApp conversation is RELAY-ACTIVE (a rep took
    // it over → bot_enabled=false + relay_tg_chat_id set), a reply is a message to
    // the customer, not a CRM note — relay it. Otherwise fall through to a note,
    // preserving the existing non-relay behaviour. Resolved by phone; a no-match or
    // a not-relaying conversation simply means "note", never an error.
    const convo = await resolveWaConvoByPhone(leadRows[0].phone);
    if (isRelayActive(convo) && convo) {
      return await relayRepReplyToCustomer(cfg, msg, leadId, convo, text, who);
    }
    await logEvent({ lead_id: leadId, event: "note", note: text.slice(0, 1000), actor_tg_id: msg.from?.id ?? null, actor_name: who });
    await sendTelegram(cfg, "✅ הערה נשמרה");
    return { ok: true };
  }

  if (!text.startsWith("/")) {
    // A bare phone number in the team chat is a shortcut for /customer <phone>.
    const digits = baresPhone(text);
    if (digits) return await handleCommand(cfg, "/customer", digits);
    return { ok: true, skipped: "not a command" };
  }
  const [cmdTok, ...rest] = text.split(/\s+/);
  const cmd = cmdTok.split("@")[0].toLowerCase();
  return await handleCommand(cfg, cmd, rest.join(" ").trim());
}
