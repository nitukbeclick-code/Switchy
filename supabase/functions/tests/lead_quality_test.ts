// Unit tests for _shared/lead_quality.ts — the PURE lead quality + dedup helpers
// the business relies on to sell clean, scored, de-duplicated rows. Four concerns:
//   1) normalizeIlPhone — every spelling of one IL number folds to ONE E.164;
//      junk yields "" (so it can never create a false dedup collision).
//   2) deriveCategory — recovers the desired service from plan_id/notes, never
//      fabricating one (unknown → "").
//   3) scoreLead — a 0–100 completeness score whose ranges track which real
//      fields are present (phone + consent dominate).
//   4) dedupKey — the same person ⊕ same service collapses to one key; different
//      people / different services stay distinct.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import type { Lead } from "../_shared/types.ts";
import {
  dedupKey,
  deriveCategory,
  normalizeIlPhone,
  scoreLead,
} from "../_shared/lead_quality.ts";

// ── normalizeIlPhone ─────────────────────────────────────────────────────────

Deno.test("normalizeIlPhone folds every IL spelling of one number to a single E.164", () => {
  const e164 = "+972521234567";
  assertEquals(normalizeIlPhone("0521234567"), e164); // national mobile
  assertEquals(normalizeIlPhone("052-123 4567"), e164); // punctuation/spaces
  assertEquals(normalizeIlPhone("+972521234567"), e164); // already E.164
  assertEquals(normalizeIlPhone("972521234567"), e164); // country code, no +
  assertEquals(normalizeIlPhone("521234567"), e164); // bare, missing trunk 0
});

Deno.test("normalizeIlPhone accepts a 9-digit IL landline", () => {
  // 09-XXXXXXX landline (9 national digits) → +9729XXXXXXX
  assertEquals(normalizeIlPhone("095551234"), "+97295551234");
});

Deno.test("normalizeIlPhone returns '' for junk so it can't create a false dedup collision", () => {
  assertEquals(normalizeIlPhone(""), "");
  assertEquals(normalizeIlPhone(null), "");
  assertEquals(normalizeIlPhone(undefined), "");
  assertEquals(normalizeIlPhone("abc"), "");
  assertEquals(normalizeIlPhone("12345"), ""); // too short
  assertEquals(normalizeIlPhone("05212345678"), ""); // too long (11 national)
});

// ── deriveCategory ───────────────────────────────────────────────────────────

Deno.test("deriveCategory reads a known category token out of the plan_id", () => {
  assertEquals(deriveCategory({ plan_id: "partner-cellular-100" }), "cellular");
  assertEquals(deriveCategory({ plan_id: "hot-internet-fiber" }), "internet");
  assertEquals(deriveCategory({ plan_id: "yes-tv-basic" }), "tv");
  assertEquals(deriveCategory({ plan_id: "bezeq-triple-max" }), "triple");
  assertEquals(deriveCategory({ plan_id: "airalo-abroad-eu" }), "abroad");
});

Deno.test("deriveCategory falls back to the 'שירות מבוקש:' notes tag (Hebrew → canonical)", () => {
  assertEquals(deriveCategory({ notes: "נוצר משיחה | שירות מבוקש: סלולר" }), "cellular");
  assertEquals(deriveCategory({ notes: 'שירות מבוקש: חבילת חו"ל לטיול' }), "abroad");
  // an english key written into the tag also normalizes
  assertEquals(deriveCategory({ notes: "שירות מבוקש: internet" }), "internet");
});

Deno.test("deriveCategory reads category cues from a free-text notes blob (no tag)", () => {
  assertEquals(deriveCategory({ notes: "רוצה לעבור חבילת אינטרנט וסיב" }), "internet");
});

Deno.test("deriveCategory returns '' when there's nothing to recover (never fabricates)", () => {
  assertEquals(deriveCategory({}), "");
  assertEquals(deriveCategory({ plan_id: "promo-2026-summer" }), ""); // no category token
  assertEquals(deriveCategory({ notes: "תחזרו אליי בבקשה" }), ""); // no category cue
});

Deno.test("deriveCategory prefers the plan_id token over the notes tag", () => {
  // plan_id says cellular, notes tag says tv — plan_id (the structured id) wins.
  assertEquals(
    deriveCategory({ plan_id: "partner-cellular-100", notes: "שירות מבוקש: טלוויזיה" }),
    "cellular",
  );
});

// ── scoreLead ────────────────────────────────────────────────────────────────

// A fully-loaded, consented lead — every weighted field present.
const RICH: Lead = {
  name: "דנה כהן",
  phone: "0521234567",
  email: "dana@example.com",
  provider: "סלקום",
  plan_id: "partner-cellular-100",
  notes: "רוצה לעבור, שירות מבוקש: סלולר",
  terms_accepted_at: "2026-06-20T08:00:00.000Z",
  privacy_accepted_at: "2026-06-20T08:00:00.000Z",
} as Lead;

Deno.test("scoreLead returns 0–100 and scores a complete consented lead near the top", () => {
  const s = scoreLead(RICH);
  assert(s >= 0 && s <= 100, `out of range: ${s}`);
  assertEquals(s, 100); // all weighted fields present → full marks
});

Deno.test("scoreLead returns 0 for an empty lead", () => {
  assertEquals(scoreLead({}), 0);
});

Deno.test("scoreLead weights phone as the single most valuable signal", () => {
  // phone alone outscores any other single field (name/email/provider/etc.)
  const phoneOnly = scoreLead({ phone: "0521234567" });
  const emailOnly = scoreLead({ email: "x@y.co" });
  const nameOnly = scoreLead({ name: "דנה" });
  assert(phoneOnly > emailOnly, `${phoneOnly} !> ${emailOnly}`);
  assert(phoneOnly > nameOnly, `${phoneOnly} !> ${nameOnly}`);
  assertEquals(phoneOnly, 30);
});

Deno.test("scoreLead counts consent only when BOTH terms + privacy timestamps are present", () => {
  const base: Lead = { phone: "0521234567" } as Lead;
  const onlyTerms = scoreLead({ ...base, terms_accepted_at: "2026-06-20T00:00:00Z" } as Lead);
  const both = scoreLead({
    ...base,
    terms_accepted_at: "2026-06-20T00:00:00Z",
    privacy_accepted_at: "2026-06-20T00:00:00Z",
  } as Lead);
  assertEquals(onlyTerms, 30); // phone only — half-consent doesn't count
  assertEquals(both, 55); // phone (30) + consent (25)
});

Deno.test("scoreLead ignores a junk phone (only a normalizable IL number scores)", () => {
  assertEquals(scoreLead({ phone: "not-a-number" }), 0);
  assertEquals(scoreLead({ phone: "12345" }), 0); // wrong length
});

Deno.test("scoreLead is monotonic: adding a valid field never lowers the score", () => {
  const a = scoreLead({ phone: "0521234567" });
  const b = scoreLead({ phone: "0521234567", email: "x@y.co" });
  const c = scoreLead({ phone: "0521234567", email: "x@y.co", provider: "סלקום" });
  assert(b >= a && c >= b, `${a} ${b} ${c}`);
});

// ── dedupKey ─────────────────────────────────────────────────────────────────

Deno.test("dedupKey collapses every spelling of the same person+service to one key", () => {
  const k = dedupKey({ phone: "0521234567", plan_id: "partner-cellular-100" });
  assertEquals(k, "+972521234567|cellular");
  // different spelling of the SAME number + a notes-derived category → same key
  assertEquals(
    dedupKey({ phone: "+972-52-123-4567", notes: "שירות מבוקש: סלולר" }),
    k,
  );
});

Deno.test("dedupKey keeps the same person on DIFFERENT services as distinct leads", () => {
  const cellular = dedupKey({ phone: "0521234567", plan_id: "partner-cellular-100" });
  const tv = dedupKey({ phone: "0521234567", plan_id: "yes-tv-basic" });
  assert(cellular !== tv, "same phone, different category should not collapse");
  assertEquals(tv, "+972521234567|tv");
});

Deno.test("dedupKey keeps DIFFERENT people on the same service distinct", () => {
  const a = dedupKey({ phone: "0521234567", plan_id: "partner-cellular-100" });
  const b = dedupKey({ phone: "0539876543", plan_id: "partner-cellular-100" });
  assert(a !== b, "different phones should not collapse");
});

Deno.test("dedupKey falls back to a name token when the phone can't be normalized", () => {
  // no usable phone → person token is the normalized name; category still axis.
  const k = dedupKey({ phone: "junk", name: "  דנה   כהן ", plan_id: "yes-tv-basic" });
  assertEquals(k, "דנה כהן|tv");
});

Deno.test("dedupKey returns '' for a row with neither a phone nor a name (un-dedupable)", () => {
  assertEquals(dedupKey({ plan_id: "partner-cellular-100" }), "");
  assertEquals(dedupKey({}), "");
});
