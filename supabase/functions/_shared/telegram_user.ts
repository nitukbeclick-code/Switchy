// ─────────────────────────────────────────────────────────────────────────────
// _shared/telegram_user.ts — the ONE hardened sender for the PUBLIC user bot
// (TELEGRAM_USER_BOT_TOKEN). Shared by BOTH halves of the customer channel:
//   • telegram-user-webhook/index.ts — the bot's own replies (agent answers,
//     /start, opt-out confirmations, handoff acks)
//   • notify-lead/callbacks.ts — the team→customer human-takeover relay
//     (a rep's reply to the takeover card + the hand-back notice)
//
// WHY SHARED: each half used to carry its own sender, and only the bot's copy
// had the hardening (429 retry honoring retry_after, transient-network retry,
// permanent HTML-rejection → clipped plain-text fallback) — so a rep's relayed
// reply could fail on exactly the conditions the bot's own replies survive.
// One sender = one delivery contract for every customer-facing message.
//
// The token is read PER CALL (not at module load): env is stable for an
// isolate, and the per-call read lets any caller report "user bot dark"
// honestly at the moment of sending (the tg_handoff tests toggle the env var
// at runtime to pin exactly that contract). Every path returns a boolean and
// NEVER throws — a Telegram miss must never take down a webhook handler.
// ─────────────────────────────────────────────────────────────────────────────

import { jlog } from "./log.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The user bot's OWN token — distinct from the TEAM bot's cfg.tgToken
// (telegram.ts sendTelegram). Empty ⇒ the user-bot channel is dark and every
// send returns false (ships-dark, like the webhook's 503 no-op).
export function userBotToken(): string {
  const v = Deno.env.get("TELEGRAM_USER_BOT_TOKEN");
  return v && v.trim() ? v.trim() : "";
}

// Send ONE plain-text message (no parse_mode) — the degrade lane for a payload
// Telegram permanently rejected as HTML. Single attempt, fail-soft.
export async function sendUserBotPlain(chatId: number | string, text: string): Promise<boolean> {
  const token = userBotToken();
  if (!token) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Send ONE HTML message to a customer chat with the full hardening:
//   • 429            → single retry honoring retry_after (clamped 1–5s)
//   • network throw  → single retry after a short pause
//   • permanent "too long / can't parse entities" rejection → clipped plain
//     text once (a poisoned payload must degrade, not drop the reply)
// Returns whether Telegram accepted the message. Never throws.
export async function sendUserBotMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: Record<string, unknown>,
  attempt = 0,
): Promise<boolean> {
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
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
    if (r.status === 429 && attempt === 0) {
      const j = await r.json().catch(() => ({} as Record<string, unknown>));
      const retryAfter = Number((j.parameters as { retry_after?: number } | undefined)?.retry_after ?? 1);
      await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
      return await sendUserBotMessage(chatId, text, replyMarkup, 1);
    }
    if (!r.ok) {
      // A permanently-rejected HTML payload (broken entities / too long) would
      // otherwise drop the reply — degrade to clipped plain text once.
      const body = await r.text().catch(() => "");
      if (attempt === 0 && /too long|can't parse|parse entities/i.test(body)) {
        return await sendUserBotPlain(chatId, text.replace(/<[^>]+>/g, "").slice(0, 3900));
      }
      jlog({ at: "tgu.send", ok: false, status: r.status });
      return false;
    }
    return true;
  } catch (e) {
    if (attempt === 0) {
      await sleep(800);
      return await sendUserBotMessage(chatId, text, replyMarkup, 1);
    }
    jlog({ at: "tgu.send", ok: false, error: String(e) });
    return false;
  }
}

// Show the "typing…" chat action while a slow reply is being produced. Telegram
// clears it automatically (~5s or on the next message), so there is nothing to
// turn off. Best-effort + fail-soft fire-and-forget: never blocks the reply
// path and swallows every error.
export function sendUserBotTyping(chatId: number | string): void {
  const token = userBotToken();
  if (!token) return;
  fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch((e) => jlog({ at: "tgu.typing", ok: false, error: String(e) }));
}
