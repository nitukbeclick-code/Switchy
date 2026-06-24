// Unit tests for the whatsapp-webhook intent classification (whatsapp-webhook/
// intents.ts) — the regexes + routing that decide whether an inbound message is a
// human handoff, a recommendation, a greeting, or plain catalogue Q&A. These pin
// the regexes' ACTUAL behaviour, including two Hebrew quirks worth knowing about
// (see the greeting + recommend tests). Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import {
  classifyTextIntent,
  FIRST_CONTACT_NOTICE,
  isOptedOut,
  isOptOut,
  messageText,
  OPTOUT_CONFIRM_REPLY,
  RE_GREETING,
  RE_HANDOFF,
  RE_OPTOUT,
  RE_RECOMMEND,
  withFirstContactNotice,
} from "../whatsapp-webhook/intents.ts";

// ── opt-out / STOP regex (Spam Law §30A) ──────────────────────────────────────

Deno.test("RE_OPTOUT / isOptOut match Hebrew unsubscribe verbs", () => {
  assert(isOptOut("הסר"));
  assert(isOptOut("הסירו אותי מהרשימה"));
  assert(isOptOut("אני רוצה להסיר"));
  assert(isOptOut("עצור"));
  assert(isOptOut("תפסיקו לשלוח לי הודעות"));
  assert(isOptOut("ביטול"));
  assert(isOptOut("בטל מנוי"));
  assert(isOptOut("אל תשלח לי יותר"));
  assert(isOptOut("לא לשלוח"));
});

Deno.test("RE_OPTOUT / isOptOut match the universal English carriers", () => {
  assert(isOptOut("STOP"));
  assert(isOptOut("stop"));
  assert(isOptOut("please unsubscribe"));
  assert(isOptOut("CANCEL"));
});

Deno.test("isOptOut does NOT fire on ordinary catalogue / chat messages", () => {
  // None of these contain an opt-out verb — they must reach the normal AI flow.
  assertFalse(isOptOut("כמה עולה סלולר?"));
  assertFalse(isOptOut("מה המסלול הזול ביותר"));
  assertFalse(isOptOut("רוצה לדבר עם נציג"));
  assertFalse(isOptOut("תמליצו לי על מסלול"));
  assertFalse(isOptOut("שלום, מה שלומך"));
  // "stop" must be a whole word — not a substring of an unrelated English word.
  assertFalse(isOptOut("nonstop internet"));
  assertFalse(isOptOut(""));
  assertFalse(isOptOut("   "));
});

Deno.test("RE_OPTOUT is the same predicate isOptOut uses (trim aside)", () => {
  assert(RE_OPTOUT.test("הסר"));
  assertFalse(RE_OPTOUT.test("כמה עולה אינטרנט"));
});

// ── opted-out contact guard (outbound path) ───────────────────────────────────

Deno.test("isOptedOut recognises the opted_out contact status only", () => {
  assert(isOptedOut("opted_out"));
  assert(isOptedOut("OPTED_OUT"));
  assertFalse(isOptedOut("new"));
  assertFalse(isOptedOut("active"));
  assertFalse(isOptedOut("handed_off"));
  assertFalse(isOptedOut(null));
  assertFalse(isOptedOut(undefined));
});

// ── §11 first-contact privacy notice gate ─────────────────────────────────────

Deno.test("withFirstContactNotice appends the notice ONLY on the first inbound", () => {
  const reply = "היי, אני העוזר החכם של Switchy AI";
  // First contact → reply + notice, separated by a blank line.
  const first = withFirstContactNotice(reply, true);
  assertStringIncludes(first, reply);
  assertStringIncludes(first, FIRST_CONTACT_NOTICE);
  // Later messages → reply returned unchanged (notice shown exactly once).
  assertEquals(withFirstContactNotice(reply, false), reply);
});

Deno.test("the first-contact notice carries the required §11 disclosures", () => {
  // Brand identity, the privacy-policy URL, and the opt-out keyword.
  assertStringIncludes(FIRST_CONTACT_NOTICE, "Switchy AI");
  assertStringIncludes(FIRST_CONTACT_NOTICE, "https://app.switchy-ai.com/privacy");
  assertStringIncludes(FIRST_CONTACT_NOTICE, "הסר");
  // The opt-out keyword in the notice is itself a real opt-out trigger.
  assert(isOptOut("הסר"));
});

Deno.test("withFirstContactNotice falls back to just the notice on an empty reply", () => {
  assertEquals(withFirstContactNotice("", true), FIRST_CONTACT_NOTICE);
});

Deno.test("the opt-out confirmation reply is a single, clear Hebrew message", () => {
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "הוסרת מרשימת הדיוור");
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "לא נשלח אליך הודעות יזומות");
  // And it invites re-engagement (the person can always write again).
  assertStringIncludes(OPTOUT_CONFIRM_REPLY, "אפשר לכתוב שוב");
});

// ── handoff regex ─────────────────────────────────────────────────────────────

Deno.test("RE_HANDOFF matches requests to reach a human, not catalogue questions", () => {
  assert(RE_HANDOFF.test("אפשר לדבר עם נציג?"));
  assert(RE_HANDOFF.test("רוצה לדבר עם בן אדם"));
  assert(RE_HANDOFF.test("תתקשרו אליי בבקשה"));
  assert(RE_HANDOFF.test("מישהו אמיתי בבקשה"));
  assertFalse(RE_HANDOFF.test("כמה עולה סלולר?"));
  assertFalse(RE_HANDOFF.test("מה המסלול הזול ביותר"));
});

// ── recommend regex ───────────────────────────────────────────────────────────

Deno.test("RE_RECOMMEND matches advisor asks", () => {
  assert(RE_RECOMMEND.test("מה הכי משתלם?"));
  assert(RE_RECOMMEND.test("איזה מסלול מתאים לי"));
  assert(RE_RECOMMEND.test("מצא לי משהו זול"));
  assert(RE_RECOMMEND.test("מה כדאי לי לקחת"));
  assertFalse(RE_RECOMMEND.test("שלום, מה שלומך"));
});

Deno.test("RE_RECOMMEND's 'תמליצ' stem matches inflected forms, not the final-tsadi imperative", () => {
  // The stem uses a NON-final tsadi (צ), so mid-word inflections match…
  assert(RE_RECOMMEND.test("תמליצו לי על מסלול"));
  assert(RE_RECOMMEND.test("תמליצי לי בבקשה"));
  // …but the bare imperative "תמליץ" ends in a FINAL tsadi (ץ) — a different
  // Unicode char — so it does NOT match the stem on its own.
  assertFalse(RE_RECOMMEND.test("תמליץ"));
});

// ── greeting regex ────────────────────────────────────────────────────────────

Deno.test("RE_GREETING matches the ASCII openers at the start, case-insensitively", () => {
  assert(RE_GREETING.test("hi"));
  assert(RE_GREETING.test("Hello there"));
  assert(RE_GREETING.test("START"));
  assert(RE_GREETING.test("help me"));
  // A greeting word mid-sentence doesn't count — the pattern is anchored with ^.
  assertFalse(RE_GREETING.test("please say hi"));
});

Deno.test("RE_GREETING's \\b never fires after the Hebrew openers (a known quirk)", () => {
  // JS \b is a boundary between a [A-Za-z0-9_] char and a non-word char. Hebrew
  // letters are 'non-word' to \b, so "^…היי\b" can never find a boundary right
  // after an all-Hebrew opener — these inputs are classified as plain Q&A, NOT
  // greeting. Pinned so a future regex fix is a deliberate, visible change.
  assertFalse(RE_GREETING.test("היי"));
  assertFalse(RE_GREETING.test("שלום"));
  assertFalse(RE_GREETING.test("מה נשמע"));
});

// ── classifyTextIntent: the routing decision ──────────────────────────────────

Deno.test("classifyTextIntent routes handoff > recommend > greeting > qa", () => {
  assertEquals(classifyTextIntent("אפשר נציג אנושי?"), "human");
  assertEquals(classifyTextIntent("מה הכי משתלם לי?"), "recommend");
  assertEquals(classifyTextIntent("hello"), "greeting");
  assertEquals(classifyTextIntent("כמה עולה אינטרנט 1 גיגה?"), "qa");
});

Deno.test("classifyTextIntent: handoff wins even when other cues are present", () => {
  // Contains a recommend cue ("מה הכי") AND a handoff cue ("נציג") — handoff wins.
  assertEquals(classifyTextIntent("מה הכי משתלם? ואם אפשר חבר אותי לנציג"), "human");
});

Deno.test("classifyTextIntent: an all-Hebrew greeting falls through to qa (the \\b quirk)", () => {
  // Consistent with the RE_GREETING quirk above: "היי" alone is qa, not greeting.
  assertEquals(classifyTextIntent("היי"), "qa");
  assertEquals(classifyTextIntent("  היי  "), "qa");
});

Deno.test("classifyTextIntent trims and handles empty input", () => {
  assertEquals(classifyTextIntent("   "), "qa");
  assertEquals(classifyTextIntent(""), "qa");
});

// ── messageText: pulling text out of the Meta envelope ────────────────────────

Deno.test("messageText reads text.body for text messages", () => {
  assertEquals(messageText({ type: "text", text: { body: "שלום" } }), "שלום");
  // Default type is "text".
  assertEquals(messageText({ text: { body: "ללא type" } }), "ללא type");
});

Deno.test("messageText reads image.caption for image messages", () => {
  assertEquals(messageText({ type: "image", image: { caption: "החשבון שלי" } }), "החשבון שלי");
  // An image with no caption collapses to "".
  assertEquals(messageText({ type: "image", image: { id: "media-1" } }), "");
});

Deno.test("messageText is tolerant of a malformed/empty envelope", () => {
  assertEquals(messageText({}), "");
  assertEquals(messageText({ type: "text" }), "");
});
