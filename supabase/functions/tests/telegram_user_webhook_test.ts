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
  catalogueCategories,
  chunkTelegram,
  FIRST_CONTACT_NOTE,
  HELP_REPLY,
  isOptOut,
  langFromTelegramLocale,
  OPTOUT_CONFIRM_REPLY,
  parseInbound,
  telegramSessionId,
  telegramUpdateDedupKey,
  type TgUserUpdate,
  WELCOME_REPLY,
  welcomeCategoryKeyboard,
  withFirstContactNote,
} from "../telegram-user-webhook/lib.ts";
import type { Plan } from "../_shared/catalogue.ts";
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

// ── chunkTelegram: split a long reply under Telegram's 4096-char limit ──────────

Deno.test("chunkTelegram: short text is a single unchanged piece", () => {
  assertEquals(chunkTelegram("hi"), ["hi"]);
  assertEquals(chunkTelegram("   spaced   "), ["spaced"]); // trims, single piece
  assertEquals(chunkTelegram(""), []); // empty → no pieces (nothing to send)
});

Deno.test("chunkTelegram: splits a >4096 reply into ordered ≤4096 pieces, no broken words, rejoins to the original", () => {
  // Build a long multi-paragraph Hebrew/English reply well over 4096 chars from
  // whole WORDS, so any mid-word break would be detectable on rejoin.
  const sentence = "המסלול הסלולרי הזול ביותר כרגע הוא חבילה במחיר נמוך ללא התחייבות and it includes generous data. ";
  const para = sentence.repeat(12).trim(); // one big paragraph
  const text = Array.from({ length: 8 }, () => para).join("\n\n"); // 8 paragraphs
  assert(text.length > 4096, "fixture must exceed Telegram's 4096 limit");

  const parts = chunkTelegram(text); // default max 4000
  assert(parts.length >= 2, "a >4096 reply must produce multiple pieces");
  for (const p of parts) {
    assert(p.length > 0, "no empty piece");
    assert(p.length <= 4096, `each piece must be <= 4096, got ${p.length}`);
    assert(p.length <= 4000, `each piece must respect the 4000 soft cap, got ${p.length}`);
  }

  // No word is broken across pieces: every space-delimited token in the rejoined
  // output is a token that existed in the original (mid-word cuts would create a
  // fragment token that the original never had).
  const origWords = new Set(text.split(/\s+/).filter(Boolean));
  for (const p of parts) {
    for (const w of p.split(/\s+/).filter(Boolean)) {
      assert(origWords.has(w), `chunk introduced a broken-word fragment: "${w}"`);
    }
  }

  // Lossless: the concatenation (normalising whitespace) preserves every word in
  // order — chunkTelegram never drops or reorders text.
  const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
  assertEquals(norm(parts.join(" ")), norm(text));
});

Deno.test("chunkTelegram: an over-long single paragraph (no blank lines) is still broken on word boundaries", () => {
  const oneLine = "word ".repeat(2000).trim(); // ~10000 chars, single paragraph, spaces only
  assert(oneLine.length > 4096);
  const parts = chunkTelegram(oneLine);
  assert(parts.length >= 2);
  for (const p of parts) {
    assert(p.length <= 4000);
    // Only ever the exact token "word" — never a fragment like "wor" / "ord".
    for (const w of p.split(/\s+/).filter(Boolean)) assertEquals(w, "word");
  }
});

// ── update_id idempotency: helper key + the dedup decision (store stubbed) ──────

Deno.test("telegramUpdateDedupKey: namespaced safe-char key, distinct from a chat session key; empty for non-finite", () => {
  const safe = /^[A-Za-z0-9_-]{6,64}$/;
  assertEquals(telegramUpdateDedupKey(123), "tgu-upd-123");
  assert(safe.test(telegramUpdateDedupKey(123)));
  assertEquals(telegramUpdateDedupKey(-7), "tgu-upd--7");
  assert(safe.test(telegramUpdateDedupKey(-7)));
  // Must NOT collide with a real chat session id ("tg-u-<chatId>").
  assert(telegramUpdateDedupKey(999) !== telegramSessionId(999));
  // No/!finite update_id ⇒ "" ⇒ dedup disabled → process anyway (fail-soft).
  assertEquals(telegramUpdateDedupKey(undefined), "");
  assertEquals(telegramUpdateDedupKey(null), "");
  assertEquals(telegramUpdateDedupKey(NaN), "");
});

Deno.test('update_id dedup returns "already seen" on the SECOND call (store stubbed)', async () => {
  // Reproduce the index.ts ledger decision against a STUBBED store that mirrors the
  // real PostgREST contract (on_conflict + resolution=ignore-duplicates +
  // return=representation): a FIRST insert returns the row (→ not seen); a repeat
  // insert of the same key returns [] (→ already seen → no-op). No network/env.
  const store = new Set<string>();
  const stubInsert = (key: string): Record<string, unknown>[] => {
    if (store.has(key)) return []; // already recorded → ignore-duplicates returns []
    store.add(key);
    return [{ session_id: key }]; // first insert → the new row
  };
  // The same shape as alreadyProcessed(): empty key ⇒ false (process); else the
  // store decides (empty array ⇒ seen).
  const alreadyProcessed = (updateId: number | undefined | null): boolean => {
    const key = telegramUpdateDedupKey(updateId);
    if (!key) return false;
    return stubInsert(key).length === 0;
  };

  assertFalse(alreadyProcessed(42)); // first delivery → process
  assert(alreadyProcessed(42)); // Telegram re-delivery of the SAME update → no-op
  assert(alreadyProcessed(42)); // and again — still seen
  assertFalse(alreadyProcessed(43)); // a different update is independent
  // A missing update_id can't be deduped → always "process" (never drop the turn).
  assertFalse(alreadyProcessed(undefined));
  assertFalse(alreadyProcessed(undefined));
});

// ── /start category quick-replies (truth-only) + typing helper shape ────────────
// Pure parts only: the network helpers (sendTyping/sendChunked) live in index.ts
// and no-op without a bot token; we don't import index.ts (it side-effects
// Deno.serve) and we assert NO API calls here — only the pure keyboard builder.

function plan(cat: string, price: number): Plan {
  return { cat, price, provider: "x", plan: "p" } as Plan;
}

Deno.test("catalogueCategories: only categories that actually have priced plans, in canonical order", () => {
  const plans = [plan("tv", 50), plan("cellular", 20), plan("cellular", 30), plan("internet", 90)];
  // Canonical CATEGORIES order is cellular, internet, tv, triple, abroad.
  assertEquals(catalogueCategories(plans), ["cellular", "internet", "tv"]);
  // A category with no priced plan is never surfaced.
  const noPrice = [{ cat: "abroad", provider: "y", plan: "z" } as Plan];
  assertEquals(catalogueCategories(noPrice), []);
  assertEquals(catalogueCategories([]), []);
});

Deno.test("welcomeCategoryKeyboard: builds a truth-only reply-keyboard, null on empty catalogue", () => {
  const kb = welcomeCategoryKeyboard([plan("cellular", 20), plan("internet", 90), plan("tv", 50)]);
  assert(kb !== null);
  assertEquals(kb!.resize_keyboard, true);
  assertEquals(kb!.one_time_keyboard, true);
  const rows = kb!.keyboard as { text: string }[][];
  // 3 categories → 2 rows (2 buttons, then 1).
  assertEquals(rows.length, 2);
  const labels = rows.flat().map((b) => b.text);
  assertEquals(labels.length, 3);
  // Truth-only: every button label is derived from a REAL category (Hebrew name),
  // none fabricated. Spot-check the cellular + internet + tv Hebrew labels.
  assert(labels.some((l) => l.includes("סלולר")));
  assert(labels.some((l) => l.includes("אינטרנט")));
  assert(labels.some((l) => l.includes("טלוויזיה")));
  // Empty / no-priced-plan catalogue ⇒ null (never a fabricated option).
  assertEquals(welcomeCategoryKeyboard([]), null);
});
