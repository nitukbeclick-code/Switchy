// ─────────────────────────────────────────────────────────────────────────────
// telegram-user-webhook/lib.ts — pure, dependency-light helpers for the Telegram
// USER bot (the public, customer-facing conversational bot — NOT the internal rep
// bot in telegram-webhook/). Extracted so the guard chain (opt-out detection,
// command parsing, the §11 first-contact note, the §30A privacy/STOP wiring, the
// safe per-chat session id) is unit-testable without booting Deno.serve or
// touching Telegram / the DB.
//
// WHY A SEPARATE BOT: telegram-webhook/ is the TEAM bot — authorized reps press
// inline cards and relay to WhatsApp; it trusts from.id against an allowlist. This
// bot serves END USERS: anyone can DM it, it answers with the SHARED grounded,
// multilingual agent (runAgent), captures consent-gated leads, and honours STOP.
// The two never share auth or behaviour, so they live in disjoint functions.
// ─────────────────────────────────────────────────────────────────────────────

// ── Minimal Telegram update shapes (we only read what we route on) ────────────
export type TgUserFrom = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string; // Telegram's UI locale hint (e.g. "he", "ar", "ru", "en")
};

export type TgUserMessage = {
  message_id: number;
  from?: TgUserFrom;
  chat?: { id: number; type?: string };
  date?: number;
  text?: string;
};

export type TgUserUpdate = {
  update_id?: number;
  message?: TgUserMessage;
  // We deliberately ignore edited_message / channel_post / callback_query — the
  // user bot is a plain text conversation; nothing else is actionable.
};

// A parsed, sanitized inbound message — the only thing the handler routes on.
export type ParsedInbound = {
  chatId: number;
  userId: number;
  firstName: string;
  // Telegram's own locale hint, lowercased + clipped (advisory; the agent still
  // auto-detects the reply language from the message text itself).
  languageCode: string;
  text: string;
  isCommand: boolean;
  command: string; // "" for plain text; e.g. "start" | "help" | "stop"
  args: string; // the rest of a "/cmd rest…" line, trimmed
};

// Parse a raw update into the sanitized shape the handler uses, or null when the
// update carries nothing we can act on (no message, no text, no chat, no from,
// or a message from another bot). Pure — never throws on malformed input.
export function parseInbound(update: TgUserUpdate): ParsedInbound | null {
  const m = update?.message;
  if (!m) return null;
  const chatId = Number(m.chat?.id);
  const userId = Number(m.from?.id);
  if (!Number.isFinite(chatId) || !Number.isFinite(userId)) return null;
  if (m.from?.is_bot) return null; // never converse with other bots
  const text = String(m.text ?? "").trim();
  if (!text) return null; // user bot only handles text turns
  const firstName = String(m.from?.first_name ?? "").trim().slice(0, 80) || "משתמש";
  const languageCode = String(m.from?.language_code ?? "").trim().toLowerCase().slice(0, 8);

  // Command detection: a leading "/cmd" or "/cmd@BotName". Strip an @mention so
  // "/start@MyBot" in a group still routes as "start".
  let isCommand = false;
  let command = "";
  let args = "";
  if (text.startsWith("/")) {
    isCommand = true;
    const sp = text.indexOf(" ");
    const head = sp === -1 ? text.slice(1) : text.slice(1, sp);
    command = head.split("@")[0].toLowerCase();
    args = sp === -1 ? "" : text.slice(sp + 1).trim();
  }

  return { chatId, userId, firstName, languageCode, text, isCommand, command, args };
}

// ── §30A STOP / opt-out detection ─────────────────────────────────────────────
// A user can withdraw consent at any time. We recognise the universal STOP words
// (EN) plus their Hebrew/Arabic/Russian equivalents, as a /stop command OR as
// plain text, so the opt-out is honoured however it's phrased. Conservative: only
// these explicit tokens count, so a normal sentence that happens to contain a
// substring never trips it. Substring/anchored matching only (JS \b is ASCII-only
// and never matches around Hebrew/Arabic/Cyrillic letters).
const OPTOUT_PATTERNS: RegExp[] = [
  /^\/?stop$/i,
  /^\/?unsubscribe$/i,
  /^\/?(הסר|הסרה|הסירו|להסיר)$/, // Hebrew: remove me
  /^\/?(הפסק|הפסיקו|תפסיקו|תסירו)$/, // Hebrew: stop
  /^\/?(ביטול|בטל|לבטל)$/, // Hebrew: cancel
  /^\/?(إلغاء|توقف|الغاء|إيقاف)$/, // Arabic: stop / cancel
  /^\/?(стоп|отписаться|отмена)$/i, // Russian: stop / unsubscribe
];

// True when the WHOLE message is an opt-out token (after trimming). Anchored so a
// question like "איך מפסיקים את החבילה?" is NOT an opt-out — only a bare STOP.
export function isOptOut(text: string): boolean {
  const s = String(text ?? "").trim();
  if (!s) return false;
  return OPTOUT_PATTERNS.some((re) => re.test(s));
}

// ── §11 first-contact identification + §30A privacy/STOP note ──────────────────
// On the FIRST message from a chat we MUST identify who we are (Switchy AI),
// link the privacy policy, and tell the user how to stop. Shown exactly once;
// every later turn returns the reply unchanged. The note is appended below the
// agent's actual reply so the conversation still answers the question.
const PRIVACY_URL = "https://switchy-ai.com/privacy";

export const FIRST_CONTACT_NOTE =
  `\n\nℹ️ זהו הבוט הרשמי של <b>Switchy AI</b> — השוואת מסלולי תקשורת וחיסכון בחשבון. ` +
  `מדיניות הפרטיות: ${PRIVACY_URL} · לעצירת הודעות שלחו «STOP».`;

// The ONE confirmation we send back when a user opts out. Hebrew (the default
// audience); the agent's multilingual reply path doesn't run on an opt-out, so a
// single bilingual-friendly Hebrew line is the honest, minimal acknowledgement.
export const OPTOUT_CONFIRM_REPLY =
  "הוסרתם מרשימת ההודעות של Switchy AI ✅ לא נשלח אליכם יותר הודעות יזומות. אם תרצו לחזור — פשוט כתבו לנו שוב כאן.";

// Append the first-contact §11 note exactly once. No-op on later turns.
export function withFirstContactNote(reply: string, firstContact: boolean): string {
  if (!firstContact) return reply;
  return `${reply}${FIRST_CONTACT_NOTE}`;
}

// ── Safe per-chat session id ───────────────────────────────────────────────────
// The unified ChatSession store (public.ai_sessions) keys on a string id. We must
// NEVER feed a raw, attacker-controllable value into a PostgREST filter, so we
// derive a fixed-shape, safe-char id from the numeric chat id. Telegram chat ids
// are integers (optionally negative for groups), so the namespaced form is always
// /^tg-u-\-?\d+$/ — already matching the session layer's safe-id charset
// ([A-Za-z0-9_-]). Returns "" for a non-finite id (⇒ memory disabled, stateless).
export function telegramSessionId(chatId: number): string {
  if (!Number.isFinite(chatId)) return "";
  return `tg-u-${Math.trunc(chatId)}`;
}

// ── Reply-language hint from Telegram's locale ─────────────────────────────────
// runAgent auto-detects the reply language from the message TEXT (its primary
// signal). But a terse first message ("היי", "hi", an emoji) carries little script
// signal, so we offer Telegram's own UI locale as a fallback hint. We only map the
// four languages the agent supports; anything else returns undefined so runAgent
// falls back to its own text-based detection (Hebrew default).
export type AgentLangHint = "he" | "ar" | "ru" | "en";

export function langFromTelegramLocale(languageCode: string): AgentLangHint | undefined {
  const c = String(languageCode ?? "").toLowerCase();
  if (c.startsWith("he") || c.startsWith("iw")) return "he"; // iw = legacy Hebrew code
  if (c.startsWith("ar")) return "ar";
  if (c.startsWith("ru")) return "ru";
  if (c.startsWith("en")) return "en";
  return undefined;
}

// ── /help copy (Hebrew, the default audience) ──────────────────────────────────
export const HELP_REPLY =
  `<b>עזרה — Switchy AI 🤖</b>\n\n` +
  `אני משווה בשבילכם מסלולי סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו"ל, ` +
  `ועוזר לחסוך בחשבון.\n\n` +
  `<b>פקודות:</b>\n` +
  `/start — התחלה\n` +
  `/help — הצגת הודעה זו\n` +
  `STOP — עצירת הודעות\n\n` +
  `אפשר פשוט לכתוב לי כל שאלה — למשל «מה המסלול הסלולרי הכי זול עד 50 ₪?»`;

// The one-time welcome for a brand-new chat (before the §11 note is appended).
export const WELCOME_REPLY =
  `היי! אני העוזר החכם של <b>Switchy AI</b> 🤖\n` +
  `אני משווה בשבילכם מסלולי סלולר, אינטרנט, טלוויזיה וחבילות חו"ל ועוזר לחסוך בחשבון.\n` +
  `אפשר לשאול אותי כל דבר על המסלולים והמחירים, ואם תרצו — אחבר אתכם לנציג אנושי.`;
