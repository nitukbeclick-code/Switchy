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
// plain text, so the opt-out is honoured however it's phrased. Detection is the
// SHARED, UNIFIED §30A detector (_shared/compliance.ts isOptOut) — a CONTAINS
// match across he/en/ar/ru, including multi-word phrasings ("אנא הסירו אותי
// מהרשימה"). This BROADENS the Telegram gate so it no longer misses a real
// opt-out that isn't a bare token, per the §30A "err toward catching it" rule:
// a missed opt-out is an illegal proactive contact; a false-positive merely sends
// one confirmation and stops. Re-exported so the handler imports it from here.
export { isOptOut } from "../_shared/compliance.ts";

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

// ─────────────────────────────────────────────────────────────────────────────
// HUMAN HANDOFF — "connect me to a human" intent (the customer→team takeover).
//
// A customer can ask to speak with a real rep at any time. When they do (an
// explicit /human (or /agent / /rep) command, OR plain text that clearly asks
// for a person), we PAUSE the agent for this chat and relay the live conversation
// to the team — the mirror of the WhatsApp human takeover. Detection is pure +
// testable here so the handler just routes on it.
//
// Conservative, like isOptOut: only clear human-request phrasings trip it, so an
// ordinary question that merely MENTIONS a rep ("כמה זמן לוקח לנציג לחזור?") does
// NOT force a handoff — it still goes to the agent, which can offer one itself.
// Substring/anchored matching only (JS \b is ASCII-only and never matches around
// Hebrew/Arabic/Cyrillic letters), so the patterns are whole-message anchored.
// ─────────────────────────────────────────────────────────────────────────────

// Commands that explicitly request a human. Bare /human, /agent, /rep, /support.
const HUMAN_COMMANDS = new Set(["human", "agent", "rep", "support", "representative"]);

// Whole-message phrasings that clearly ask for a person (HE/AR/RU/EN). Each
// pattern requires BOTH an explicit ACTION verb (want / talk to / connect me /
// transfer me) AND a HUMAN noun (rep / human / live person / customer service), so
// an ordinary question that merely MENTIONS a rep ("כמה זמן לוקח לנציג לחזור?") or
// even uses a soft verb does NOT trip it — only a real request does. The whole
// message is checked, but the short-length guard in wantsHuman keeps it to a bare
// ask. Substring matching (no ASCII \b around non-Latin scripts).
//
// HE_HUMAN / etc. are the human-noun alternations; HE_WANT / etc. the action verbs.
const HE_WANT = "רוצה|רוצָה|מבקש|מבקשת|צריך|צריכה|מעוניין|מעוניינת|תחברו|חברו|תעבירו|העבירו|לדבר|לשוחח|לעבור|חבר אותי|תחבר אותי|העבר אותי";
const HE_HUMAN = "נציג|נציגה|נציגים|בנאדם|בן.?אדם|אדם אמיתי|איש אמיתי|אנושי|מוקד|שירות לקוחות|מישהו אמיתי|מוקדן|מוקדנית";
const AR_WANT = "أريد|اريد|عايز|عاوز|ممكن|اطلب|بدي|حوّلني|حولني|كلموني";
const AR_HUMAN = "ممثل|موظف|شخص|إنسان|انسان|بشري|مندوب|خدمة العملاء|موظف حقيقي|شخص حقيقي";
const RU_WANT = "хочу|можно|соедините|переключите|дайте|свяжите|нужен|нужна|перевед";
const RU_HUMAN = "оператор|человек|живой человек|менеджер|поддержк|представител|сотрудник";
const EN_WANT = "want|need|can i|let me|talk|speak|connect|chat|transfer|put me through";
const EN_HUMAN = "human|agent|representative|rep|real person|live (?:person|agent)|customer (?:service|support)|support agent|someone real|a person";

const HUMAN_PATTERNS: RegExp[] = [
  new RegExp(`(?:${HE_WANT}).*(?:${HE_HUMAN})`, "u"),
  new RegExp(`(?:${HE_HUMAN}).*(?:${HE_WANT})`, "u"), // word order can flip in Hebrew
  new RegExp(`(?:${AR_WANT}).*(?:${AR_HUMAN})`, "u"),
  new RegExp(`(?:${RU_WANT}).*(?:${RU_HUMAN})`, "iu"),
  new RegExp(`(?:${EN_WANT}).*(?:${EN_HUMAN})`, "iu"),
];

// True when the message (command OR text) is a clear request for a human rep.
// `isCommand`/`command` come from parseInbound (already lowercased, @-stripped).
export function wantsHuman(text: string, isCommand: boolean, command: string): boolean {
  if (isCommand && HUMAN_COMMANDS.has(String(command ?? "").toLowerCase())) return true;
  const s = String(text ?? "").trim();
  if (!s || s.length > 120) return false; // a long paragraph isn't a bare handoff ask
  return HUMAN_PATTERNS.some((re) => re.test(s));
}

// ── Handoff customer-facing copy (Hebrew, the default audience) ────────────────
// The single ack the customer gets the moment a takeover starts — honest, sets
// the expectation (a human is being connected; the auto-bot is paused), and tells
// them they can still type STOP. No promise about timing we can't keep.
export const HANDOFF_ACK_REPLY =
  "מחבר/ת אתכם לנציג אנושי 🤝 מרגע זה ההודעות שלכם מגיעות ישירות לצוות והעוזר האוטומטי מושהה. " +
  "כתבו כאן כרגיל — נציג יענה בהקדם. (לעצירת הודעות: «STOP».)";

// Shown once when the customer pings during an ACTIVE takeover but we couldn't
// reach the team relay (fail-soft) — honest, never silently swallows the message.
export const HANDOFF_RELAY_FAIL_REPLY =
  "ההודעה נשמרה ותועבר לנציג. אם זה דחוף אפשר גם להשוות הכול ב-https://switchy-ai.com 🙏";

// The notice the customer gets when a rep ENDS the takeover (hand-back to the
// bot). Sent by the team side via the user bot, but defined here so the copy
// lives with the rest of the bot's voice.
export const HANDOFF_ENDED_REPLY =
  "השיחה עם הנציג הסתיימה ✅ חזרתי לענות אוטומטית — אפשר להמשיך לשאול אותי כל דבר על המסלולים והמחירים.";
