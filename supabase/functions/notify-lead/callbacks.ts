// Telegram callback_query + chat-message handling: status buttons, claiming,
// undo, won-flow savings capture, reply-notes, renewal→lead creation.

import type { Cfg, Lead, RenewalRow, TgCallbackQuery, TgMessage } from "../_shared/types.ts";
import { esc, NL, sendTelegram, tgApi } from "../_shared/telegram.ts";
import { fetchRows, insertRow, logEvent, patchCount, rpcRows } from "../_shared/db.ts";
import { formatTimeline, frozenKeyboard, isWonAskMarkup, keyboardFor, leadIdFromMarkup, type LeadEvent, STATUS_HE, tgDisplayName } from "../_shared/leads.ts";
import { handleCommand } from "./commands.ts";

type HandlerResult = Record<string, unknown>;

function allowed(cfg: Cfg, userId: number | undefined): boolean {
  return cfg.allowedUserIds.length === 0 || cfg.allowedUserIds.includes(userId ?? 0);
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
  await answer(ok ? "ליד נוצר ✅ — הכרטיס יופיע כאן מיד" : "יצירת הליד נכשלה");
  return { ok };
}

export async function handleCallback(cfg: Cfg, cb: TgCallbackQuery): Promise<HandlerResult> {
  const answer = (text?: string) =>
    tgApi(cfg, "answerCallbackQuery", { callback_query_id: cb.id, ...(text ? { text } : {}) });

  if (!allowed(cfg, cb.from?.id)) {
    await answer("אין הרשאה לפעולה זו");
    return { ok: false, skipped: "user not allowed" };
  }

  const data = String(cb.data ?? "");
  const msg = cb.message;
  const chatId = msg?.chat?.id;
  // Honor presses only from the configured team chat.
  if (cfg.tgChat && String(chatId ?? "") !== cfg.tgChat) {
    await answer();
    return { ok: false, skipped: "wrong chat" };
  }

  const renewM = data.match(/^renew:([0-9a-fA-F-]{36}):lead$/);
  if (renewM) return await handleRenewLead(cfg, answer, renewM[1]);

  const m = data.match(/^lead:([0-9a-fA-F-]{36}):(contacted|won|lost|claim|claimed|undo|wonask|noop|history)$/);
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
    if (leadRows === null || evs === null || !leadRows[0]) {
      await answer("טעינת ההיסטוריה נכשלה");
      return { ok: false };
    }
    await answer();
    await sendTelegram(cfg, formatTimeline(leadRows[0], evs));
    return { ok: true };
  }

  if (action === "claimed") {
    const rows = await fetchRows<Lead>(`/rest/v1/leads?id=eq.${leadId}&select=claimed_by`);
    if (rows === null) {
      await answer("הבדיקה נכשלה — נסו שוב");
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

  if (action === "undo") {
    const evs = await fetchRows<Record<string, unknown>>(
      `/rest/v1/lead_events?lead_id=eq.${leadId}&event=eq.status_change&order=created_at.desc&limit=1`,
    );
    if (evs === null) {
      await answer("הביטול נכשל — נסו שוב");
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
      await answer("הביטול נכשל — נסו שוב");
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
    await answer("העדכון נכשל — נסו שוב");
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
    await answer("העדכון נכשל — נסו שוב");
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

export async function handleTeamMessage(cfg: Cfg, msg: TgMessage): Promise<HandlerResult> {
  const chatId = msg.chat?.id;
  if (cfg.tgChat && String(chatId ?? "") !== cfg.tgChat) return { ok: true, skipped: "wrong chat" };
  if (!allowed(cfg, msg.from?.id)) return { ok: false, skipped: "user not allowed" };
  const text = String(msg.text ?? "").trim();

  // Replies to a lead card become notes; replies to the won-flow prompt with a
  // single number record the actual saving.
  const reply = msg.reply_to_message;
  if (reply) {
    const leadId = leadIdFromMarkup(reply.reply_markup);
    if (!leadId || !text) return { ok: true, skipped: "reply without lead context" };
    const who = tgDisplayName(msg.from);
    if (isWonAskMarkup(reply.reply_markup)) {
      const amount = parseSavingAmount(text);
      if (amount !== null) {
        const n = await patchCount(`/rest/v1/leads?id=eq.${leadId}`, { actual_saving: amount });
        await logEvent({ lead_id: leadId, event: "saving", note: String(amount), actor_tg_id: msg.from?.id ?? null, actor_name: who });
        await sendTelegram(cfg, n > 0 ? `💰 נרשם: ₪${amount} חיסכון שנתי ללקוח` : "הרישום נכשל — נסו שוב");
        return { ok: n > 0 };
      }
      await logEvent({ lead_id: leadId, event: "note", note: text.slice(0, 1000), actor_tg_id: msg.from?.id ?? null, actor_name: who });
      await sendTelegram(cfg, "לא זיהיתי סכום (צריך מספר בלבד, למשל <code>1200</code>) — נשמר כהערה 📝");
      return { ok: true };
    }
    await logEvent({ lead_id: leadId, event: "note", note: text.slice(0, 1000), actor_tg_id: msg.from?.id ?? null, actor_name: who });
    await sendTelegram(cfg, "📝 ההערה נשמרה על הליד");
    return { ok: true };
  }

  if (!text.startsWith("/")) return { ok: true, skipped: "not a command" };
  const [cmdTok, ...rest] = text.split(/\s+/);
  const cmd = cmdTok.split("@")[0].toLowerCase();
  return await handleCommand(cfg, cmd, rest.join(" ").trim());
}
