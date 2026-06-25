// Unit tests for the PUBLIC Telegram user bot's pure helpers
// (telegram-user-webhook/lib.ts) — the parsing + guard-chain primitives that the
// handler routes on: inbound parse/sanitize, §30A STOP detection, the §11
// first-contact note, the safe per-chat session id, and the locale→lang hint.
// These pin behaviour without booting Deno.serve, hitting Telegram, or the DB.
// Run from supabase/functions/:  deno task test
//
// NOTE: index.ts is intentionally NOT imported here — importing it would read
// TELEGRAM_USER_BOT_TOKEN at module load and (more importantly) is an HTTP entry
// point with side-effecting Deno.serve. The routing/guard LOGIC lives in lib.ts,
// which is what we test; deno check (the type gate) covers index.ts.

import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "@std/assert";
import {
  FIRST_CONTACT_NOTE,
  HELP_REPLY,
  isOptOut,
  langFromTelegramLocale,
  OPTOUT_CONFIRM_REPLY,
  parseInbound,
  telegramSessionId,
  type TgUserUpdate,
  WELCOME_REPLY,
  withFirstContactNote,
} from "../telegram-user-webhook/lib.ts";
import {
  isDataAccessRequest,
  isErasureRequest,
} from "../_shared/compliance.ts";

// Build a minimal Telegram update with a text message.
function upd(text: string, over: Record<string, unknown> = {}): TgUserUpdate {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: 555, first_name: "דנה", language_code: "he", ...(over.from as object ?? {}) },
      chat: { id: 999, type: "private", ...(over.chat as object ?? {}) },
      date: 1_700_000_000,
      text,
      ...(over.message as object ?? {}),
    },
  };
}

// ── parseInbound ───────────────────────────────────────────────────────────────

Deno.test("parseInbound: extracts a plain text turn", () => {
  const p = parseInbound(upd("מה המסלול הכי זול?"));
  assert(p);
  assertEquals(p!.chatId, 999);
  assertEquals(p!.userId, 555);
  assertEquals(p!.firstName, "דנה");
  assertEquals(p!.languageCode, "he");
  assertEquals(p!.text, "מה המסלול הכי זול?");
  assertFalse(p!.isCommand);
  assertEquals(p!.command, "");
  assertEquals(p!.args, "");
});

Deno.test("parseInbound: parses a /start command with args", () => {
  const p = parseInbound(upd("/start ref_ABC123"));
  assert(p);
  assert(p!.isCommand);
  assertEquals(p!.command, "start");
  assertEquals(p!.args, "ref_ABC123");
});

Deno.test("parseInbound: strips a @BotName mention from the command (group chats)", () => {
  const p = parseInbound(upd("/help@SwitchyBot"));
  assert(p);
  assert(p!.isCommand);
  assertEquals(p!.command, "help");
});

Deno.test("parseInbound: trims and defaults first name", () => {
  const p = parseInbound(upd("היי", { from: { id: 7, first_name: "  " } }));
  assert(p);
  assertEquals(p!.firstName, "משתמש");
});

Deno.test("parseInbound: returns null for non-actionable updates", () => {
  assertEquals(parseInbound({} as TgUserUpdate), null); // no message
  assertEquals(parseInbound(upd("   ")), null); // whitespace-only text
  assertEquals(parseInbound(upd("hi", { from: { id: 1, first_name: "B", is_bot: true } })), null); // from a bot
  assertEquals(
    parseInbound({ message: { message_id: 1, from: { id: 1 }, date: 1, text: "hi" } } as TgUserUpdate),
    null,
  ); // no chat id
});

// ── §30A STOP / opt-out detection ──────────────────────────────────────────────

Deno.test("isOptOut: matches universal + localized STOP tokens", () => {
  assert(isOptOut("STOP"));
  assert(isOptOut("stop"));
  assert(isOptOut("/stop"));
  assert(isOptOut("unsubscribe"));
  assert(isOptOut("הסר"));
  assert(isOptOut("הסירו"));
  assert(isOptOut("הפסק"));
  assert(isOptOut("ביטול"));
  assert(isOptOut("توقف")); // Arabic: stop
  assert(isOptOut("стоп")); // Russian: stop
  assert(isOptOut("отписаться")); // Russian: unsubscribe
});

Deno.test("isOptOut: matches MULTI-WORD opt-out phrasings (broadened §30A detector)", () => {
  // Now backed by the UNIFIED _shared/compliance.ts isOptOut — a CONTAINS match,
  // so a real opt-out embedded in a sentence is caught (it was MISSED before when
  // Telegram anchored to a bare token). §30A: err toward catching the opt-out.
  assert(isOptOut("אנא הסירו אותי מהרשימה"));
  assert(isOptOut("בבקשה תפסיקו לשלוח לי הודעות"));
  assert(isOptOut("please unsubscribe me from this list"));
  assert(isOptOut("I want to cancel my subscription"));
});

Deno.test("isOptOut: empty/whitespace and a plain question are not opt-outs", () => {
  assertFalse(isOptOut(""));
  assertFalse(isOptOut("   "));
  // A genuine pricing question with no opt-out keyword still routes to the agent.
  assertFalse(isOptOut("מה המסלול הסלולרי הכי זול עד 50 ₪?"));
});

// ── Amendment-13 data-subject detection (deterministic, no LLM) ─────────────────

Deno.test("isErasureRequest: detects HE/EN delete-my-data phrasings", () => {
  assert(isErasureRequest("מחק את המידע שלי"));
  assert(isErasureRequest("תמחקו אותי מהמערכת"));
  assert(isErasureRequest("please delete my data"));
  assert(isErasureRequest("erase my data"));
  assertFalse(isErasureRequest("מה המסלול הכי זול?"));
});

Deno.test("isDataAccessRequest: detects access asks; erasure wins over access", () => {
  assert(isDataAccessRequest("מה אתם יודעים עליי?"));
  assert(isDataAccessRequest("what data do you have about me"));
  // Erasure is the stronger intent — a delete request is NOT a read-only access ask.
  assertFalse(isDataAccessRequest("מחק את המידע שלי"));
  assertFalse(isDataAccessRequest("מה המסלול הכי זול?"));
});

// ── §11 first-contact note ─────────────────────────────────────────────────────

Deno.test("withFirstContactNote: appends the identification + privacy + STOP note once", () => {
  const reply = "המסלול הזול ביותר הוא X.";
  const first = withFirstContactNote(reply, true);
  assertStringIncludes(first, reply);
  assertStringIncludes(first, "Switchy AI");
  assertStringIncludes(first, "switchy-ai.com/privacy");
  assertStringIncludes(first, "STOP");
  // The note text itself is present exactly once.
  assertEquals(first.split("מדיניות הפרטיות").length - 1, 1);
});

Deno.test("withFirstContactNote: no-op on later turns", () => {
  const reply = "הנה ההמלצה.";
  assertEquals(withFirstContactNote(reply, false), reply);
});

Deno.test("FIRST_CONTACT_NOTE + OPTOUT_CONFIRM_REPLY are honest, non-empty Hebrew", () => {
  assertStringIncludes(FIRST_CONTACT_NOTE, "Switchy");
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "הוסרתם");
  // Welcome + help identify the brand and never promise anything.
  assertStringIncludes(WELCOME_REPLY, "Switchy AI");
  assertStringIncludes(HELP_REPLY, "/help");
});

// ── safe per-chat session id ────────────────────────────────────────────────────

Deno.test("telegramSessionId: namespaced, safe-char id matching the session layer charset", () => {
  const safe = /^[A-Za-z0-9_-]{6,64}$/;
  assertEquals(telegramSessionId(999), "tg-u-999");
  assert(safe.test(telegramSessionId(999)));
  // Group chats have negative ids — still safe-char (digits + leading '-').
  assertEquals(telegramSessionId(-100123), "tg-u--100123");
  assert(safe.test(telegramSessionId(-100123)));
  // Non-finite ⇒ "" (memory disabled).
  assertEquals(telegramSessionId(NaN), "");
});

// ── locale → reply-language hint ────────────────────────────────────────────────

Deno.test("langFromTelegramLocale: maps the four supported languages, else undefined", () => {
  assertEquals(langFromTelegramLocale("he"), "he");
  assertEquals(langFromTelegramLocale("he-IL"), "he");
  assertEquals(langFromTelegramLocale("iw"), "he"); // legacy Hebrew code
  assertEquals(langFromTelegramLocale("ar"), "ar");
  assertEquals(langFromTelegramLocale("ru-RU"), "ru");
  assertEquals(langFromTelegramLocale("en-US"), "en");
  assertEquals(langFromTelegramLocale("fr"), undefined); // unsupported → let runAgent auto-detect
  assertEquals(langFromTelegramLocale(""), undefined);
});
