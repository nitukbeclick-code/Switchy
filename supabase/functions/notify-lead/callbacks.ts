// Telegram callback_query + chat-message handling: status buttons, claiming,
// undo, won-flow savings capture, reply-notes, renewal→lead creation.

import type { Cfg, Lead, RenewalRow, TgCallbackQuery, TgInlineKeyboard, TgMessage } from "../_shared/types.ts";
import { esc, NL, sendTelegram, tgApi } from "../_shared/telegram.ts";
import { fetchRows, insertRow, logEvent, patchCount, rpcRows, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { desiredCategory, formatTimeline, frozenKeyboard, isWonAskMarkup, keyboardFor, leadIdFromMarkup, type LeadEvent, STATUS_HE, tgDisplayName } from "../_shared/leads.ts";
import { isLinkAskMarkup, isRescheduleAskMarkup } from "../_shared/meetings.ts";
import { sendText as waSendText } from "../_shared/whatsapp.ts";
import { aiMeetingsSummary, applyBookSlot, auditBookedMeeting, baresPhone, handleCommand } from "./commands.ts";
import { handleMeetingCallback, handleMeetingLinkReply, handleMeetingRescheduleReply } from "./meeting_callbacks.ts";
import { applyMeetingAct, buildBoard, fetchOpenMeetings } from "./console.ts";
import {
  type BoardTab,
  type LeadsPipeline,
  pipelineCounts,
  renderLeadCard,
  renderLeadsPipeline,
  renderMeetingsBoard,
} from "./board.ts";

type HandlerResult = Record<string, unknown>;

// A lead in 'won' or 'lost' is in a TERMINAL (closed) state. The status-change
// branch mirrors applyLostReason's guard: a closed lead must not be re-PATCHed,
// regressed back to contacted, resurrected, nor re-fire its side effects (the won
// savings-ask). The only sanctioned way out of a terminal state is the explicit
// "undo" path (which replays the recorded transition). Pure + exported so the
// idempotency guard is unit-testable without the DB.
export function isClosedLeadStatus(status: unknown): boolean {
  const s = String(status ?? "new");
  return s === "won" || s === "lost";
}

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

// ─────────────────────────────────────────────────────────────────────────────
// TAKEOVER CONTEXT HEADER — when a rep takes a live WhatsApp conversation over, we
// hand them the full picture in one message so they don't have to scroll: who the
// customer is (name/category/desired need from the lead), and the last few things
// the customer actually said — including a SHORT note when the customer sent media
// (a bill photo / a voice note). We never re-send the bytes (they live only
// transiently in Graph and are never stored — whatsapp_messages.body is "text/
// caption only; NEVER base64 bytes"), so the media "reference" is an honest, PII-
// light note of what type arrived + any caption/transcript that WAS stored. Truth-
// only: every line is grounded in a real DB row; nothing is fabricated.
// ─────────────────────────────────────────────────────────────────────────────

// A whatsapp_messages row, narrowed to the fields the context header reads.
type WaMessage = {
  direction?: string | null;
  actor?: string | null;
  msg_type?: string | null;
  body?: string | null;
  created_at?: string | null;
};

// msg_type → a short Hebrew media note (with an icon), or "" for plain text. The
// closed set mirrors the webhook's stored msg_type vocabulary (text/image/audio/
// voice/document/interactive/template/system). A bill photo arrives as "image",
// a voice note as "audio"/"voice".
export function mediaNoteFor(msgType: unknown): string {
  switch (String(msgType ?? "").toLowerCase()) {
    case "image":
      return "📷 שלח/ה תמונה (ייתכן צילום חשבון)";
    case "audio":
    case "voice":
      return "🎤 שלח/ה הודעה קולית";
    case "document":
      return "📄 שלח/ה מסמך";
    default:
      return "";
  }
}

// Build the compact takeover context header (pure → unit-testable). Combines the
// lead dossier (name + desired category + provider/plan + the notes context) with
// the last few CUSTOMER messages, surfacing a media note for any non-text inbound.
// `recent` is newest-first (the order PostgREST returns with created_at.desc); we
// show the last few customer turns oldest→newest so they read naturally. Every
// customer-controlled string is HTML-escaped (sendTelegram posts parse_mode HTML).
export function buildTakeoverContextHeader(lead: Lead, recent: WaMessage[]): string {
  const category = desiredCategory(lead);
  const lines: (string | null)[] = [
    `🤝 <b>השתלטת על שיחת הוואטסאפ</b>${lead.name ? ` עם ${esc(lead.name)}` : ""}.`,
    "",
    `👤 <b>שם:</b> ${esc(lead.name || "—")}`,
    category ? `🎯 <b>צריך:</b> ${esc(category)}` : null,
    (lead.provider || lead.plan_id)
      ? `📦 <b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}`
      : null,
    // The "desired need" / last bill mention lives in the notes free text (the AI
    // capture folds it there) — surface it when present, clipped, never invented.
    lead.notes ? `📋 <b>הקשר:</b> ${esc(String(lead.notes).slice(0, 400))}` : null,
  ];

  // Last few CUSTOMER messages (inbound), oldest→newest, with a media note for any
  // non-text turn. We cap at 3 so the header stays readable.
  const inbound = (recent ?? [])
    .filter((m) => String(m.direction ?? "") === "in")
    .slice(0, 3)
    .reverse();
  if (inbound.length > 0) {
    lines.push("", "🧵 <b>מה הלקוח כתב לאחרונה:</b>");
    for (const m of inbound) {
      const note = mediaNoteFor(m.msg_type);
      const text = String(m.body ?? "").trim();
      if (note) {
        // Media turn: the note + any stored caption/transcript (honest, no bytes).
        lines.push(`• ${note}${text ? `: ${esc(text.slice(0, 200))}` : ""}`);
      } else if (text) {
        lines.push(`• ${esc(text.slice(0, 200))}`);
      }
    }
  }

  lines.push(
    "",
    "הבוט הושתק — הודעות הלקוח יופנו לכאן, וכל הודעה שתשיבו (reply) לכרטיס תישלח אליו בוואטסאפ.",
  );
  return lines.filter((x) => x !== null).join(NL);
}

// Fetch the conversation's most recent messages for the takeover header. Newest
// first, capped small. Fail-soft: a null/error query → [] so the takeover header
// still posts (degrades to the lead dossier alone, never blocks the takeover).
async function fetchRecentConvoMessages(convoId: string): Promise<WaMessage[]> {
  const rows = await fetchRows<WaMessage>(
    `/rest/v1/whatsapp_messages?conversation_id=eq.${encodeURIComponent(convoId)}&order=created_at.desc&limit=8&select=direction,actor,msg_type,body,created_at`,
  );
  return rows ?? [];
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
  // Full row (not just id/phone/name): the takeover context header reads the
  // desired category + provider/plan + notes context to brief the rep in one shot.
  const leads = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=*`);
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
  // Relay the customer's inbound to the TEAM GROUP chat (cfg.tgChat) — where the
  // lead card + this takeover button live and where the owner already is — NOT
  // the pressing rep's personal user id. A bot CANNOT message a user who never
  // opened a chat with it, so relaying to cb.from.id silently 403'd (fail-soft)
  // and the owner saw nothing. The group is the one chat the bot can always post
  // to. repChat is still recorded as the takeover ACTOR in the audit below.
  const relayChat = String(cfg.tgChat);
  const n = await patchCount(`/rest/v1/whatsapp_conversations?id=eq.${encodeURIComponent(convo.id)}`, {
    bot_enabled: false,
    relay_tg_chat_id: relayChat,
  });
  if (n === 0) {
    await answer("ההשתלטות נכשלה — נסו שוב בעוד רגע");
    return { ok: false };
  }
  await logRelayAudit(repChat, "wa_relay_takeover", {
    lead_id: leadId,
    conversation_id: convo.id,
    contact_id: convo.contact_id ?? null,
    relay_tg_chat_id: relayChat,
  });
  await answer("השתלטת על השיחה 🤝 — הודעות הלקוח יגיעו לכאן");
  // Richer takeover brief: the lead dossier (name/category/provider/notes) + the
  // last few customer messages, with a short note for any media (bill photo /
  // voice note). The recent-messages fetch is fail-soft — on a null/error query it
  // returns [], so the header degrades to the dossier alone and never blocks.
  const recent = await fetchRecentConvoMessages(convo.id);
  await sendTelegram(cfg, buildTakeoverContextHeader(lead, recent));
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

// ─────────────────────────────────────────────────────────────────────────────
// In-chat NATIVE board (Wave 16) — the rep's meetings board + leads pipeline as a
// tap-to-act Telegram message (the richer Mini App console is a separate surface).
//
// CALLBACK-DATA CONTRACT (shared verbatim with board.ts + console.ts; do NOT drift):
//   meeting actions = "mtg:<id>:zoom" | "mtg:<id>:reschedule"
//                   | "mtg:<id>:confirm" | "mtg:<id>:cancel"
//   board tab switch = "board:today" | "board:pending" | "board:week"
//   leads view       = "leads:new" | "leads:all"
// The per-meeting action LOGIC lives in console.ts applyMeetingAct (the shared
// write path); here we authorize, call it, then re-render the board + toast.
// zoom/reschedule need free-text input, so they prompt the rep to REPLY (the
// same reply-capture pattern as the meeting cards) and apply on the reply.
// ─────────────────────────────────────────────────────────────────────────────

// Open leads for the pipeline view: status new|contacted|won so the counts header
// reflects the live funnel, newest first. `recent` (the cards we surface) is the
// caller's filtered slice. Returns null on a failed query (the caller reports it).
async function fetchLeadsPipeline(view: "new" | "all"): Promise<LeadsPipeline | null> {
  const open = await fetchRows<Lead>(
    "/rest/v1/leads?status=in.(new,contacted,won)&order=created_at.desc&limit=60&select=*",
  );
  if (open === null) return null;
  const counts = pipelineCounts(open);
  // "new" view → only uncontacted cards; "all" → the live funnel (new+contacted),
  // never the closed (won/lost) rows. Cap the cards so we don't flood the chat.
  const recent = (view === "new"
    ? open.filter((l) => String(l.status ?? "new") === "new")
    : open.filter((l) => ["new", "contacted"].includes(String(l.status ?? "new"))))
    .slice(0, 5);
  return { counts, recent };
}

// The reply-capture markers for the native board's free-text acts. A board zoom /
// reschedule tap posts a single-button prompt whose callback_data is the marker;
// a reply to that prompt resolves the meeting id + which act to apply. Mirrors
// isLinkAskMarkup / isRescheduleAskMarkup but for the mtg:<id>:… namespace.
export function isBoardZoomAskMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): string | null {
  const rows = markup?.inline_keyboard ?? [];
  if (rows.length === 1 && rows[0].length === 1) {
    const m = String(rows[0][0].callback_data ?? "").match(/^mtg:([0-9a-fA-F-]{36}):zoom$/);
    if (m) return m[1];
  }
  return null;
}
export function isBoardRescheduleAskMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): string | null {
  const rows = markup?.inline_keyboard ?? [];
  if (rows.length === 1 && rows[0].length === 1) {
    const m = String(rows[0][0].callback_data ?? "").match(/^mtg:([0-9a-fA-F-]{36}):reschedule$/);
    if (m) return m[1];
  }
  return null;
}

const boardZoomAskMarkup = (id: string): TgInlineKeyboard => ({
  inline_keyboard: [[{ text: "🔗 ממתין לקישור Zoom", callback_data: `mtg:${id}:zoom` }]],
});
const boardRescheduleAskMarkup = (id: string): TgInlineKeyboard => ({
  inline_keyboard: [[{ text: "⏰ ממתין למועד חדש", callback_data: `mtg:${id}:reschedule` }]],
});

// Re-render the board message in place for `tab`. Re-fetches the open meetings so
// the board reflects the action that just landed; the AI day-line is fail-soft
// (omitted when there's no key / it errors). Edits the message the rep tapped.
async function renderBoardInto(cfg: Cfg, msg: TgMessage | undefined, tab: BoardTab): Promise<void> {
  if (!msg || msg.chat?.id == null) return;
  const board = buildBoard(await fetchOpenMeetings(), Date.now());
  const summary = await aiMeetingsSummary(cfg, board);
  const { text, reply_markup } = renderMeetingsBoard(board, summary, tab);
  await tgApi(cfg, "editMessageText", {
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup,
  });
}

// "board:<tab>" — re-render the board for the chosen tab (re-fetch + buildBoard +
// renderMeetingsBoard, edit the message). Always toasts so the rep gets feedback.
async function handleBoardTab(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  tab: BoardTab,
  msg: TgMessage | undefined,
): Promise<HandlerResult> {
  await answer();
  await renderBoardInto(cfg, msg, tab);
  return { ok: true, board: tab };
}

// "mtg:<id>:confirm|cancel" — apply via the shared applyMeetingAct, then re-render
// the board + toast. confirm with no auto-Zoom returns needsLink → we prompt the
// rep to reply with the link (the zoom reply-capture below applies it).
async function handleMeetingAct(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  id: string,
  act: "confirm" | "cancel",
  cb: TgCallbackQuery,
): Promise<HandlerResult> {
  const actor = tgDisplayName(cb.from) || "נציג";
  const res = await applyMeetingAct(cfg, id, act, undefined, actor);
  if (res.notFound) {
    await answer("הפגישה לא נמצאה");
    return { ok: false, skipped: "meeting not found" };
  }
  if (res.needsLink) {
    // confirm ran but there's no auto-Zoom — collect a link, then apply sendlink.
    await answer("Zoom לא מוגדר — השיבו עם קישור");
    await sendTelegram(
      cfg,
      "🔗 השיבו (reply) להודעה זו עם קישור ה-Zoom לפגישה — https://zoom.us/...",
      boardZoomAskMarkup(id),
    );
    return { ok: true, pending: "manual link" };
  }
  if (!res.ok) {
    await answer(res.error ?? "הפעולה נכשלה");
    return { ok: false, skipped: res.error };
  }
  await answer(act === "confirm" ? "אושר ✅" : "בוטל");
  // Re-render the tab the action belongs to: a confirm shows under today/week, a
  // cancel removes a pending row — re-rendering "today" is the safe default that
  // always reflects the change; the rep can switch tabs from the board.
  await renderBoardInto(cfg, cb.message, "today");
  return { ok: true, meeting: id, act };
}

// "mtg:<id>:zoom" / "mtg:<id>:reschedule" — these need free text, so prompt the
// rep to REPLY; the reply handler (handleBoardMeetingReply) applies it via
// applyMeetingAct. Mirrors the meeting-card link/reschedule-ask flow.
async function handleMeetingPrompt(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  id: string,
  act: "zoom" | "reschedule",
): Promise<HandlerResult> {
  if (act === "zoom") {
    await answer("השיבו עם קישור Zoom");
    await sendTelegram(
      cfg,
      "🔗 השיבו (reply) להודעה זו עם קישור ה-Zoom לפגישה — https://zoom.us/...",
      boardZoomAskMarkup(id),
    );
    return { ok: true, pending: "zoom link" };
  }
  await answer("השיבו עם מועד חדש");
  await sendTelegram(
    cfg,
    "⏰ השיבו (reply) להודעה זו עם מועד חדש בפורמט <code>YYYY-MM-DD HH:MM</code> (שעון ישראל), למשל <code>2026-06-18 14:30</code>.",
    boardRescheduleAskMarkup(id),
  );
  return { ok: true, pending: "reschedule" };
}

// "leads:new|all" — render the leads pipeline: a counts header (+ §7b reminder)
// followed by the recent lead cards (each with the EXISTING lead keyboard). Sends
// fresh messages rather than editing, so the live cards carry their own buttons.
async function handleLeadsView(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  view: "new" | "all",
): Promise<HandlerResult> {
  const pipeline = await fetchLeadsPipeline(view);
  if (pipeline === null) {
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  await answer();
  const header = renderLeadsPipeline(pipeline);
  await sendTelegram(cfg, header.text, header.reply_markup);
  let failures = 0;
  // oldest first so the newest lead lands closest to the input box
  for (const lead of [...pipeline.recent].reverse()) {
    const card = renderLeadCard(lead);
    const r = await sendTelegram(cfg, card.text, card.reply_markup);
    if (!r.ok) failures++;
  }
  if (failures > 0) {
    await sendTelegram(cfg, `⚠️ ${failures} כרטיסים לא נשלחו (תקלת טלגרם) — נסו שוב עוד רגע.`);
  }
  return { ok: true, leads: view, failures };
}

// A reply to a board zoom/reschedule prompt → apply via applyMeetingAct (the same
// shared write path the console uses). Called from handleTeamMessage after its
// chat/allowlist gates pass. zoom → act="sendlink"; reschedule → act="reschedule".
export async function handleBoardMeetingReply(
  cfg: Cfg,
  msg: TgMessage,
  id: string,
  act: "sendlink" | "reschedule",
  text: string,
): Promise<HandlerResult> {
  const actor = tgDisplayName(msg.from) || "נציג";
  const res = await applyMeetingAct(cfg, id, act, text, actor);
  if (res.notFound) {
    await sendTelegram(cfg, "הפגישה לא נמצאה.");
    return { ok: false, skipped: "meeting not found" };
  }
  if (!res.ok) {
    await sendTelegram(cfg, res.error ?? "הפעולה נכשלה — נסו שוב.");
    return { ok: false, skipped: res.error };
  }
  await sendTelegram(cfg, act === "sendlink" ? "✅ הקישור נרשם והלקוח עודכן." : "✅ המועד עודכן והלקוח עודכן.");
  return { ok: true, meeting: id, act };
}

// Route the native-board callbacks (board:/mtg:/leads:). Returns null when `data`
// isn't a board callback so the caller falls through to the lead callbacks. The
// allowlist + team-chat gates were already enforced by handleCallback.
async function handleBoardCallback(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  cb: TgCallbackQuery,
  data: string,
): Promise<HandlerResult | null> {
  const boardM = data.match(/^board:(today|pending|week)$/);
  if (boardM) return await handleBoardTab(cfg, answer, boardM[1] as BoardTab, cb.message);

  const mtgM = data.match(/^mtg:([0-9a-fA-F-]{36}):(zoom|reschedule|confirm|cancel)$/);
  if (mtgM) {
    const [, id, act] = mtgM;
    if (act === "confirm" || act === "cancel") return await handleMeetingAct(cfg, answer, id, act, cb);
    return await handleMeetingPrompt(cfg, answer, id, act as "zoom" | "reschedule");
  }

  const leadsM = data.match(/^leads:(new|all)$/);
  if (leadsM) return await handleLeadsView(cfg, answer, leadsM[1] as "new" | "all");

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// REP-BOOK-A-MEETING — the rep tapped a slot from the /book picker. We authorize
// (already done by handleCallback's gates), book via the SHARED applyBookSlot
// (commands.ts) which re-validates the slot through parseReschedule, creates a
// REAL Google Calendar event (fail-soft), and persists a confirmed meetings row,
// then audit + confirm. A greyed busy slot carries book:busy:noop → just toast.
//
// CALLBACK-DATA CONTRACT (own namespace; the lead/board regexes never match it):
//   slot pick = "book:<YYYY-MM-DD>:<HH:MM>"   (e.g. book:2026-06-18:14:30)
//   busy noop = "book:busy:noop"
// ─────────────────────────────────────────────────────────────────────────────

// "יום ג׳, 18.6, 14:30" — Israel wall-clock confirmation label for a booked slot.
function bookWhenLabel(startsAt: string): string {
  const t = Date.parse(startsAt);
  if (!Number.isFinite(t)) return startsAt;
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(t));
}

// Handle a book:<day>:<slot> tap (or the busy noop). Auth + team-chat gate already
// enforced by handleCallback. Books via the shared applyBookSlot, audits, confirms.
async function handleBookSlot(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  cb: TgCallbackQuery,
  day: string,
  slot: string,
): Promise<HandlerResult> {
  const actor = tgDisplayName(cb.from) || "נציג";
  const res = await applyBookSlot(cfg, day, slot, actor);
  if (!res.ok) {
    await answer(res.error ?? "הקביעה נכשלה");
    return { ok: false, skipped: res.error };
  }
  await answer("נקבע ✅");
  // Best-effort audit — never blocks. The id comes back from applyBookSlot.
  await auditBookedMeeting(res.meetingId, actor, `${res.day} ${res.slot}`);
  // Confirm in chat so the booking is visible to the team (it also now shows on
  // the board/digest). Honest note when the calendar didn't sync (dark/failed).
  const when = bookWhenLabel(res.startsAt ?? "");
  const calNote = res.gcalSynced ? "" : `${NL}⚠️ סנכרון יומן Google לא בוצע — הוסיפו ידנית אם צריך.`;
  await sendTelegram(
    cfg,
    `🗓️ <b>פגישה נקבעה</b> ל${esc(when)} (30 דק׳, שעון ישראל) על ידי ${esc(actor)}.${calNote}`,
  );
  return { ok: true, booked: res.meetingId ?? true, startsAt: res.startsAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOST-REASON disposition — when a rep marks a lead "לא רלוונטי" (lost) we don't
// just flip the status: we ask WHY with a small inline keyboard of GROUNDED
// reasons (no free-text fabrication), persist the chosen reason as a lost_reason
// note on the lead (via the existing notes PATCH path + a lead_events audit row),
// and confirm. This turns a dead lead into a measurable disposition the team can
// learn from. The reasons are a fixed, real vocabulary — never invented.
//
// CALLBACK-DATA CONTRACT (kept distinct from the lead:<id>:… status namespace so
// the generic status regex never swallows it):
//   reason picker rows = "lostreason:<id>:<key>"   (key ∈ LOST_REASONS keys)
// ─────────────────────────────────────────────────────────────────────────────

// Grounded lost-reason vocabulary: key → Hebrew label. Closed set only.
const LOST_REASONS: Record<string, string> = {
  price: "מחיר גבוה",
  switched: "כבר עבר ספק",
  noanswer: "לא ענה",
  irrelevant: "לא רלוונטי",
  other: "אחר",
};
const LOST_REASON_ORDER = ["price", "switched", "noanswer", "irrelevant", "other"];

// The reason picker keyboard for a lead about to be marked lost. Two reasons per
// row + a cancel row that re-renders the live keyboard (no status change).
function lostReasonKeyboard(leadId: string): TgInlineKeyboard {
  const rows: TgInlineKeyboard["inline_keyboard"] = [];
  for (let i = 0; i < LOST_REASON_ORDER.length; i += 2) {
    const pair = LOST_REASON_ORDER.slice(i, i + 2).map((k) => ({
      text: LOST_REASONS[k],
      callback_data: `lostreason:${leadId}:${k}`,
    }));
    rows.push(pair);
  }
  // Cancel = "noop"-style: just re-assert the live card (handled below).
  rows.push([{ text: "↩️ ביטול", callback_data: `lostreason:${leadId}:cancel` }]);
  return { inline_keyboard: rows };
}

// Mark a lead lost with a grounded reason. Reuses the EXISTING status PATCH path
// (patchCount on leads) — the only addition is a lost_reason note appended to the
// notes column in the same PATCH, plus a lead_events audit row. Status-aware: a
// lead already won/lost by a concurrent press is left alone (no resurrection,
// no double-disposition). Fail-soft: a DB miss toasts and changes nothing.
async function applyLostReason(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  leadId: string,
  reasonKey: string,
  cb: TgCallbackQuery,
): Promise<HandlerResult> {
  const who = tgDisplayName(cb.from);
  const msg = cb.message;
  // Cancel → re-render the live keyboard, no write. The lead stays as it was.
  if (reasonKey === "cancel") {
    await answer("בוטל");
    await refreshKeyboard(cfg, msg, leadId);
    return { ok: true, skipped: "lost reason cancelled" };
  }
  const label = LOST_REASONS[reasonKey];
  if (!label) {
    await answer();
    return { ok: true, skipped: "unknown lost reason" };
  }
  const rows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=*`);
  if (rows === null) {
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  const before = rows[0];
  if (!before) {
    await answer("הליד לא נמצא");
    return { ok: false };
  }
  const prev = String(before.status ?? "new");
  if (prev === "lost" || prev === "won") {
    // already closed — don't overwrite a disposition / resurrect-then-reclose.
    await answer(`הליד כבר במצב "${STATUS_HE[prev] ?? prev}"`);
    await refreshKeyboard(cfg, msg, leadId);
    return { ok: true, skipped: "lead already closed" };
  }
  // Append the lost_reason to notes (the existing notes column / PATCH path).
  // Keep the prior context; clip to the same 1900 ceiling the AI-capture uses so
  // we stay under the DB's notes cap.
  const stamp = `סיבת סגירה: ${label}`;
  const existing = String(before.notes ?? "").trim();
  const notes = (existing ? `${existing} | ${stamp}` : stamp).slice(0, 1900);
  const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}`, { status: "lost", notes });
  if (n === 0) {
    // the row existed a moment ago and wasn't already lost/won, so a zero-row
    // patch is a DB failure, not a no-match.
    await answer("שגיאת מסד נתונים — נסו שוב בעוד רגע");
    return { ok: false };
  }
  // Audit: a status_change to lost + a note carrying the structured reason, so the
  // 📜 timeline and the lead_events stats both see the disposition.
  await logEvent({
    lead_id: leadId,
    event: "status_change",
    old_status: prev,
    new_status: "lost",
    actor_tg_id: cb.from?.id ?? null,
    actor_name: who,
  });
  await logEvent({ lead_id: leadId, event: "note", note: stamp, actor_tg_id: cb.from?.id ?? null, actor_name: who });
  await answer(`נסגר: ${label}`);
  // Freeze the card with the lost stamp (same frozen view a direct lost gives).
  if (msg && msg.chat?.id != null) {
    await tgApi(cfg, "editMessageReplyMarkup", {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      reply_markup: frozenKeyboard(before, "lost", who),
    });
  }
  return { ok: true, lead: leadId, status: "lost", reason: reasonKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// TELEGRAM customer-channel live-relay (human takeover) — team→customer half.
//
// The PUBLIC Telegram bot (telegram-user-webhook) pauses its agent when a customer
// asks for a human and forwards the live conversation here, to the team chat, with
// a takeover card carrying the reply/hand-back keyboard. This is the mirror of the
// WhatsApp rep→customer relay above, but for the Telegram customer channel:
//
// RELAY CONTRACT (shared verbatim with telegram-user-webhook):
//   ai_sessions row "tg-u-<chatId>" carries bot_enabled + relay_team_chat_id.
//   TAKE-OVER (by the customer's request) : bot_enabled=false + relay_team_chat_id=<team chat>.
//   HAND-BACK (rep ends it here)          : bot_enabled=true  + relay_team_chat_id=NULL.
//   Callback-data on the team card / each forwarded line:
//     reply marker = "tgu:<chatId>:relay"     (a rep REPLY to it relays to the customer)
//     hand-back    = "tgu:<chatId>:handback"  (ends the takeover, returns to the bot)
//
// Team→customer sends use the CUSTOMER-FACING USER bot token (TELEGRAM_USER_BOT_
// TOKEN) — NOT cfg.tgToken (the team/rep bot). A bot can only message a chat that
// opened a conversation with IT, and the customer talked to the USER bot, so the
// reply must go out over that bot. The §30A STOP gate (marketing_suppression
// channel='telegram', contact='tg:<chatId>') still WINS before any send.
// ─────────────────────────────────────────────────────────────────────────────

// Outbound cap for a relayed rep message to the customer's Telegram (HTML text;
// Telegram's hard limit is 4096 — stay well under, matching MAX_RELAY_LEN intent).
// This caps the ESCAPED output, so the value is the real on-the-wire length.
const MAX_TG_RELAY_LEN = 3500;

// HTML-escape FIRST, then clip the escaped string — never the other way round.
// esc() expands entities (& → &amp; is 5×, < / > → 4×), so clipping the raw text
// and escaping after can blow past Telegram's 4096-char hard limit (a body of
// all '&' would 5× on escape). Clipping the escaped string guarantees the wire
// length stays ≤ max. Pure + exported so the length invariant is unit-testable.
// (We clip on the escaped string's char boundary; a trailing entity may be cut,
// which Telegram tolerates far more gracefully than a 4096 overflow rejection.)
export function escClip(text: unknown, max: number = MAX_TG_RELAY_LEN): string {
  return esc(text).slice(0, max);
}

// The customer-facing USER bot token. Read from env (the user bot ships with its
// own TELEGRAM_USER_BOT_TOKEN — distinct from the team bot's cfg.tgToken). Empty
// ⇒ the relay-back can't send (the user bot is dark); we report it honestly.
function userBotToken(): string {
  const v = Deno.env.get("TELEGRAM_USER_BOT_TOKEN");
  return v && v.trim() ? v.trim() : "";
}

// Parse a customer Telegram chat id out of a tgu:<chatId>:<action> callback_data
// in a message's inline keyboard. Telegram chat ids are integers (optionally
// negative for groups). Returns null when no tgu: button is present.
export function tguChatIdFromMarkup(markup?: { inline_keyboard?: { callback_data?: string }[][] }): string | null {
  for (const row of markup?.inline_keyboard ?? []) {
    for (const btn of row) {
      const m = String(btn.callback_data ?? "").match(/^tgu:(-?\d{1,20}):(?:relay|handback)$/);
      if (m) return m[1];
    }
  }
  return null;
}

// The "tg-u-<chatId>" session key the telegram-user-webhook stores relay state on.
// Kept in sync with telegram-user-webhook/lib.ts telegramSessionId (the customer
// bot's safe per-chat id). chatId is the numeric Telegram chat id as a string.
function tguSessionKey(chatId: string): string {
  return `tg-u-${chatId}`;
}

// Send ONE message to the customer's Telegram chat via the USER bot. Plain HTML,
// single attempt (the caller treats a failure as "not delivered" and tells the
// rep to retry — same fail-soft contract as the WhatsApp relay). Returns whether
// Telegram accepted it. Never throws.
async function sendUserBot(chatId: string, text: string): Promise<boolean> {
  const token = userBotToken();
  if (!token) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return r.ok;
  } catch (e) {
    jlog({ at: "tgu.relay.send", ok: false, error: String(e) });
    return false;
  }
}

// §30A STOP gate for the Telegram customer channel: a durable marketing_suppression
// row (channel='telegram', contact='tg:<chatId>') means the customer asked us to
// stop — we never message them, even inside an active human takeover. Mirrors the
// WhatsApp relay's opted_out/suppression check. Fail-soft: a query error returns
// false (we don't BLOCK a live human reply on a transient read failure — the
// suppression write itself is the authoritative opt-out act; this is a courtesy
// double-check), matching how the WhatsApp side treats its checks as best-effort.
async function isTelegramSuppressed(chatId: string): Promise<boolean> {
  const contact = `tg:${chatId}`;
  const rows = await fetchRows<{ id?: string }>(
    `/rest/v1/marketing_suppression?channel=eq.telegram&contact=eq.${encodeURIComponent(contact)}&select=id&limit=1`,
  );
  return !!(rows && rows.length > 0);
}

// END a Telegram customer takeover: flip the session row back to bot_enabled=true
// + relay_team_chat_id=NULL (the hand-back half of the contract), tell the customer
// (via the user bot) the human chat ended, confirm to the team. Idempotent — handing
// back a not-relaying session is a harmless no-op flip. Audited (Reg.13). The
// pressing rep's tg id (cb.from?.id) is the actor; the customer chat id comes from
// the button's callback_data (already extracted by the caller).
async function handleTgHandback(
  cfg: Cfg,
  answer: (text?: string) => Promise<unknown>,
  chatId: string,
  cb: TgCallbackQuery,
): Promise<HandlerResult> {
  const sessionKey = tguSessionKey(chatId);
  const n = await patchCount(`/rest/v1/ai_sessions?session_id=eq.${encodeURIComponent(sessionKey)}`, {
    bot_enabled: true,
    relay_team_chat_id: null,
    updated_at: new Date().toISOString(),
  });
  if (n === 0) {
    // No row matched — the session vanished or the columns aren't migrated yet.
    // Tell the rep honestly; nothing was changed.
    await answer("לא נמצאה שיחת טלגרם פעילה להחזרה");
    return { ok: false, skipped: "no telegram relay session" };
  }
  await logRelayAudit(cb.from?.id ?? null, "tg_relay_handback", {
    channel: "telegram",
    chat_id: chatId,
    session_id: sessionKey,
  });
  // Best-effort customer notice that the human chat ended + the bot is back.
  // §30A STOP gate guards ONLY this customer-facing send — a suppressed customer
  // (marketing_suppression telegram/tg:<chatId>) gets NO message, even this benign
  // "bot is back" notice. The session flip, the audit row, and the team confirmation
  // below stay UNCONDITIONAL: handing the conversation back to the bot is an
  // internal state change the rep must always be able to complete.
  if (!(await isTelegramSuppressed(chatId))) {
    await sendUserBot(
      chatId,
      "השיחה עם הנציג הסתיימה ✅ חזרתי לענות אוטומטית — אפשר להמשיך לשאול אותי כל דבר על המסלולים והמחירים.",
    );
  }
  await answer("הוחזר לבוט 🤖");
  await sendTelegram(cfg, `🤖 <b>שיחת הטלגרם הוחזרה לבוט</b> (<code>tg:${esc(chatId)}</code>) — העוזר האוטומטי חזר לענות ללקוח.`);
  return { ok: true, channel: "telegram", chat_id: chatId };
}

// Relay a rep's Telegram reply to the customer over the USER bot — the team→customer
// half. Preconditions (checked by the caller): the reply is to a message bearing
// the tgu:<chatId>:relay marker. Here we:
//   §30A FIRST — refuse if the customer is on the telegram suppression list (STOP).
//   1) sendUserBot(customer chat, text) via the customer-facing USER bot token.
//   2) Reg.13 audit (who/when, PII-light preview).
//   3) Leave the takeover ACTIVE (the human stays in the loop; only hand-back ends it).
// Fail-soft: a send failure is reported to the rep with a retry nudge (we never
// silently drop the reply). Never throws.
async function relayTeamReplyToTelegram(
  cfg: Cfg,
  chatId: string,
  text: string,
  who: string,
  actorTgId: number | null,
): Promise<HandlerResult> {
  if (!userBotToken()) {
    await sendTelegram(cfg, "⚠️ בוט המשתמש (Telegram) אינו מוגדר — לא ניתן להשיב ללקוח כאן.");
    return { ok: false, skipped: "user bot token not set" };
  }
  // §30A STOP gate — runs FIRST and WINS. A telegram-suppression row blocks the
  // relay outright (we never message someone who asked to stop, even mid-takeover).
  if (await isTelegramSuppressed(chatId)) {
    await sendTelegram(cfg, "⛔ הלקוח ביקש להפסיק לקבל הודעות (STOP) — ההודעה לא נשלחה.");
    return { ok: false, skipped: "customer suppressed" };
  }
  // Escape FIRST, then clip the escaped string — so the on-the-wire HTML can never
  // exceed Telegram's 4096 limit even when esc() expands entities (a raw-then-escape
  // clip on an all-'&' body would 5× past the cap). escClip caps the ESCAPED length.
  const safe = escClip(text, MAX_TG_RELAY_LEN);
  const delivered = await sendUserBot(chatId, safe);
  // Reg.13 audit (who/when, PII-light preview) — like the WhatsApp relay reply.
  await logRelayAudit(actorTgId, "tg_relay_reply", {
    channel: "telegram",
    chat_id: chatId,
    delivered,
    preview: text.slice(0, 120),
  });
  // Lightweight delivery feedback: a ✓ when the user bot accepted the relay, with
  // a short echo of what was sent. Fail-soft on a send miss — tell the rep to retry.
  const echo = escClip(text, 140) + (esc(text).length > 140 ? "…" : "");
  await sendTelegram(
    cfg,
    delivered
      ? `✓ <b>נמסר ללקוח</b> בטלגרם (${esc(who || "נציג")})${NL}💬 <i>${echo}</i>`
      : "⚠️ שליחת ההודעה ללקוח בטלגרם נכשלה — נסו שוב.",
  );
  return { ok: true, relayed: true, channel: "telegram", delivered };
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

  // Native in-chat board (board:/mtg:/leads:) — same allowlist + team-chat gates
  // above apply. Returns null for non-board data so we fall through to the rest.
  if (data.startsWith("board:") || data.startsWith("mtg:") || data.startsWith("leads:")) {
    const handled = await handleBoardCallback(cfg, answer, cb, data);
    if (handled) return handled;
    await answer();
    return { ok: true, skipped: "unrecognized board callback" };
  }

  // Rep-book-a-meeting slot picker (book:<day>:<slot>) — its own namespace, gated
  // by the same allowlist + team-chat checks above. A greyed busy slot carries
  // book:busy:noop; a real slot is book:<YYYY-MM-DD>:<HH:MM>.
  if (data.startsWith("book:")) {
    if (data === "book:busy:noop") {
      await answer("המועד הזה תפוס ביומן — בחרו מועד אחר");
      return { ok: true, skipped: "busy slot" };
    }
    const bookM = data.match(/^book:(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
    if (bookM) return await handleBookSlot(cfg, answer, cb, bookM[1], bookM[2]);
    await answer();
    return { ok: true, skipped: "unrecognized book callback" };
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

  // TELEGRAM customer-channel live-relay controls (its own namespace, keyed by the
  // customer's Telegram chat id). "tgu:<chatId>:relay" is the reply marker — a tap
  // just toasts the rep to REPLY (the actual relay happens on the reply-to in
  // handleTeamMessage). "tgu:<chatId>:handback" ends the takeover. Auth + team-chat
  // gates above already enforced.
  const tguM = data.match(/^tgu:(-?\d{1,20}):(relay|handback)$/);
  if (tguM) {
    const [, tguChatId, tguAction] = tguM;
    if (tguAction === "handback") return await handleTgHandback(cfg, answer, tguChatId, cb);
    // "relay" tap → nudge the rep to use Reply; the relay fires on the reply text.
    await answer("השיבו (reply) להודעה זו כדי לשלוח ללקוח בטלגרם");
    return { ok: true, channel: "telegram", prompt: "reply" };
  }

  // Lost-reason disposition: the rep picked a grounded reason (or cancelled) from
  // the picker that the lead:<id>:lost tap raised. Its own namespace so the lead
  // status regex below never swallows it. Auth + team-chat gate already enforced.
  const lostM = data.match(/^lostreason:([0-9a-fA-F-]{36}):([a-z]+)$/);
  if (lostM) return await applyLostReason(cfg, answer, lostM[1], lostM[2], cb);

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

  // "lost" no longer flips straight to closed: raise the grounded reason picker
  // first (the lostreason:<id>:<key> tap then persists status=lost + the reason).
  // We swap the card's keyboard in place for the reason buttons so the rep can
  // pick (or cancel back). The actual status write happens in applyLostReason —
  // this branch records nothing, so a mis-tap costs only a keyboard swap.
  if (action === "lost") {
    if (msg && msg.chat?.id != null) {
      await tgApi(cfg, "editMessageReplyMarkup", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: lostReasonKeyboard(leadId),
      });
    }
    await answer("בחרו סיבת סגירה");
    return { ok: true, lead: leadId, prompt: "lost reason" };
  }

  // status change: contacted | won
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
  // Terminal-state guard (mirrors applyLostReason): a lead already won/lost is
  // CLOSED. A late/stale press — double-won, double-lost, or a regress back to
  // "contacted" — must NOT re-PATCH the row, resurrect a closed lead, nor re-fire
  // the won savings-ask. Short-circuit with an idempotent toast; the only
  // sanctioned route out of a terminal state is the explicit "undo" button.
  const prevStatus = String(before.status ?? "new");
  if (isClosedLeadStatus(prevStatus)) {
    await answer(`הליד כבר במצב "${STATUS_HE[prevStatus] ?? prevStatus}"`);
    await refreshKeyboard(cfg, msg, leadId);
    return { ok: true, skipped: "lead already closed" };
  }
  if (prevStatus === action) {
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
  // Lightweight delivery feedback: a ✓ when Graph accepted the relay (the rep sees
  // their reply reached the customer), with a short echo of what was sent so the
  // two-way thread is clear. Fail-soft on a send miss — the message is still stored
  // (the human stays in the loop), so we tell the rep to retry rather than error.
  const echo = esc(body.slice(0, 140)) + (body.length > 140 ? "…" : "");
  await sendTelegram(
    cfg,
    wamid
      ? `✓ <b>נמסר ללקוח</b> בוואטסאפ (${esc(who || "נציג")})${NL}💬 <i>${echo}</i>`
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

    // Native-board (mtg:<id>:…) reply-capture: a board zoom / reschedule tap posts
    // a marker prompt, and the reply applies via the shared applyMeetingAct path.
    const boardZoomId = isBoardZoomAskMarkup(reply.reply_markup);
    if (boardZoomId) return await handleBoardMeetingReply(cfg, msg, boardZoomId, "sendlink", text);
    const boardReschedId = isBoardRescheduleAskMarkup(reply.reply_markup);
    if (boardReschedId) return await handleBoardMeetingReply(cfg, msg, boardReschedId, "reschedule", text);

    // TELEGRAM customer-relay reply-capture: a reply to the takeover card / a
    // forwarded customer line (both carry the tgu:<chatId>:relay|handback marker)
    // is a message to the CUSTOMER, relayed over the user bot. Resolved by the chat
    // id in the marker — checked BEFORE leadIdFromMarkup (a tgu card has no lead id,
    // so it would otherwise fall through to "reply without lead context"). An empty
    // reply (e.g. a sticker) is ignored honestly.
    const tguChatId = tguChatIdFromMarkup(reply.reply_markup);
    if (tguChatId) {
      if (!text) return { ok: true, skipped: "empty telegram relay reply" };
      const tguWho = tgDisplayName(msg.from);
      return await relayTeamReplyToTelegram(cfg, tguChatId, text, tguWho, msg.from?.id ?? null);
    }

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
    if (digits) return await handleCommand(cfg, "/customer", digits, msg.from?.id);
    return { ok: true, skipped: "not a command" };
  }
  const [cmdTok, ...rest] = text.split(/\s+/);
  const cmd = cmdTok.split("@")[0].toLowerCase();
  // Pass the pressing rep's tg id so /myleads can scope to leads THEY own.
  return await handleCommand(cfg, cmd, rest.join(" ").trim(), msg.from?.id);
}
