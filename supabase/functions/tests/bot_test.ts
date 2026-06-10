// Unit tests for the bot's pure logic. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertMatch, assertStringIncludes } from "@std/assert";
import type { Lead } from "../_shared/types.ts";
import { buildText, defaultDraft, frozenKeyboard, isWonAskMarkup, keyboardFor, leadIdFromMarkup, leadKeyboard } from "../_shared/leads.ts";
import { waDraftLink, waLink } from "../_shared/telegram.ts";
import { safeEqual, tgWebhookToken } from "../_shared/config.ts";
import { parseTriage } from "../notify-lead/triage.ts";
import { parseSavingAmount } from "../notify-lead/callbacks.ts";
import { planFollowUps } from "../_shared/followup.ts";
import { buildDigest, formatMinutes, medianMinutes } from "../_shared/digests.ts";

const LEAD: Lead = {
  id: "11111111-2222-3333-4444-555555555555",
  name: "דנה כהן",
  phone: "050-1234567",
  provider: "פרטנר",
  plan_id: "partner-5g-100",
  callback_time: "evening",
  status: "new",
  source: "form",
  created_at: "2026-06-10T08:00:00.000Z",
};

// ── lead formatting ──────────────────────────────────────────────────────────

Deno.test("buildText renders name, phone, WhatsApp link and Hebrew callback time", () => {
  const text = buildText(LEAD);
  assertStringIncludes(text, "דנה כהן");
  assertStringIncludes(text, "050-1234567");
  assertStringIncludes(text, "https://wa.me/972501234567");
  assertStringIncludes(text, "בערב");
});

Deno.test("buildText shows the hot prefix for triage score >= 4 and claimed line", () => {
  const hot = buildText({ ...LEAD, claimed_by: "איתן" }, { line: "לקוח חם", score: 5, draft: "" });
  assertStringIncludes(hot, "🔥");
  assertStringIncludes(hot, "בטיפול:");
  assertStringIncludes(hot, "(כוונה: 5/5)");
  const cold = buildText(LEAD, { line: "סתם שאלה", score: 1, draft: "" });
  assertFalse(cold.includes("🔥"));
});

Deno.test("buildText truncates oversized notes below the Telegram limit", () => {
  const text = buildText({ ...LEAD, notes: "א".repeat(3000) });
  assert(text.length < 4096);
});

Deno.test("buildText escapes HTML in user-controlled fields", () => {
  const text = buildText({ ...LEAD, name: "<script>alert(1)</script>" });
  assertFalse(text.includes("<script>"));
  assertStringIncludes(text, "&lt;script&gt;");
});

// ── keyboards ────────────────────────────────────────────────────────────────

Deno.test("leadKeyboard offers claim + prefilled WhatsApp when unclaimed", () => {
  const kb = leadKeyboard(LEAD, "היי דנה");
  assert(kb);
  const flat = kb.inline_keyboard.flat();
  assert(flat.some((b) => b.callback_data === `lead:${LEAD.id}:claim`));
  assert(flat.some((b) => b.callback_data === `lead:${LEAD.id}:contacted`));
  const wa = flat.find((b) => b.url);
  assert(wa && wa.url!.includes("text="));
});

Deno.test("leadKeyboard shows the owner instead of claim once claimed", () => {
  const kb = leadKeyboard({ ...LEAD, claimed_by: "איתן לוי" });
  const flat = kb!.inline_keyboard.flat();
  assertFalse(flat.some((b) => b.callback_data === `lead:${LEAD.id}:claim`));
  assert(flat.some((b) => b.callback_data === `lead:${LEAD.id}:claimed` && b.text.includes("איתן")));
});

Deno.test("leadKeyboard returns undefined without a lead id", () => {
  assertEquals(leadKeyboard({ ...LEAD, id: undefined }), undefined);
});

Deno.test("frozenKeyboard keeps the lead id reachable for undo and replies", () => {
  const kb = frozenKeyboard(LEAD, "contacted", "דנה");
  assertEquals(leadIdFromMarkup(kb), LEAD.id);
  const flat = kb.inline_keyboard.flat();
  assert(flat.some((b) => b.callback_data === `lead:${LEAD.id}:undo`));
});

Deno.test("isWonAskMarkup distinguishes the won prompt from a regular card", () => {
  assert(isWonAskMarkup({ inline_keyboard: [[{ callback_data: `lead:${LEAD.id}:wonask` }]] }));
  assertFalse(isWonAskMarkup(leadKeyboard(LEAD)));
});

Deno.test("keyboardFor freezes closed leads and keeps open leads live", () => {
  const live = keyboardFor(LEAD)!;
  assert(live.inline_keyboard.flat().some((b) => b.callback_data === `lead:${LEAD.id}:contacted`));
  const frozen = keyboardFor({ ...LEAD, status: "won", claimed_by: "דנה" })!;
  const flat = frozen.inline_keyboard.flat();
  assertFalse(flat.some((b) => b.callback_data === `lead:${LEAD.id}:won`));
  assert(flat.some((b) => b.callback_data === `lead:${LEAD.id}:undo`));
});

Deno.test("parseSavingAmount accepts only a lone amount, not digits in prose", () => {
  assertEquals(parseSavingAmount("1200"), 1200);
  assertEquals(parseSavingAmount(" ₪1,200 "), 1200);
  assertEquals(parseSavingAmount('850 ש"ח'), 850);
  assertEquals(parseSavingAmount("999999999"), null);          // 7+ digits rejected
  assertEquals(parseSavingAmount("אתקשר אליו ב-17:30"), null);
  assertEquals(parseSavingAmount("חסכנו 100 בחודש, 1200 בשנה"), null);
  assertEquals(parseSavingAmount("050-1234567"), null);
  assertEquals(parseSavingAmount("0"), null);
});

// ── WhatsApp links ───────────────────────────────────────────────────────────

Deno.test("waLink converts a leading 0 to the 972 prefix and rejects short numbers", () => {
  assertEquals(waLink("050-1234567"), "https://wa.me/972501234567");
  assertEquals(waLink("123"), null);
});

Deno.test("waDraftLink URL-encodes the Hebrew opener", () => {
  const url = waDraftLink("0501234567", "היי דנה");
  assert(url!.startsWith("https://wa.me/972501234567?text="));
  assertFalse(url!.includes("היי"));
});

Deno.test("defaultDraft greets by first name", () => {
  assertStringIncludes(defaultDraft(LEAD), "דנה");
  assertStringIncludes(defaultDraft(LEAD), "פרטנר");
});

// ── secrets ──────────────────────────────────────────────────────────────────

Deno.test("tgWebhookToken is a deterministic 64-char hex digest", async () => {
  const a = await tgWebhookToken("secret-1");
  assertEquals(a, await tgWebhookToken("secret-1"));
  assertMatch(a, /^[0-9a-f]{64}$/);
  assert(a !== await tgWebhookToken("secret-2"));
});

Deno.test("safeEqual matches equal strings and rejects different ones", async () => {
  assert(await safeEqual("topsecret", "topsecret"));
  assertFalse(await safeEqual("topsecret", "topsecreT"));
  assertFalse(await safeEqual("", "topsecret"));
});

// ── triage parsing ───────────────────────────────────────────────────────────

Deno.test("parseTriage handles plain and fenced JSON and clamps the score", () => {
  const a = parseTriage('{"summary":"לקוח חם","score":9,"draft":"היי"}');
  assertEquals(a.score, 5);
  assertEquals(a.line, "לקוח חם");
  const b = parseTriage('```json\n{"summary":"בסדר","score":2,"draft":""}\n```');
  assertEquals(b.score, 2);
});

Deno.test("parseTriage falls back to treating non-JSON as the summary", () => {
  const r = parseTriage("לקוח מתעניין בסיבים");
  assertEquals(r.score, 0);
  assertStringIncludes(r.line, "סיבים");
});

// ── follow-up planner ────────────────────────────────────────────────────────

const NOW = Date.parse("2026-06-10T16:00:00.000Z"); // 19:00 Israel (summer)
const lead = (over: Partial<Lead>): Lead => ({ ...LEAD, callback_time: null, ...over });
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

Deno.test("planFollowUps skips fresh leads and escalates urgency with age", () => {
  const plan = planFollowUps([
    lead({ id: "a".repeat(36), created_at: hoursAgo(1) }),
    lead({ id: "b".repeat(36), created_at: hoursAgo(3) }),
    lead({ id: "c".repeat(36), created_at: hoursAgo(30) }),
  ], NOW, 19);
  assertEquals(plan.length, 2);
  assertEquals(plan[0].urgency, "🔴"); // oldest first
  assertEquals(plan[1].urgency, "🟡");
});

Deno.test("planFollowUps respects the re-nudge gap", () => {
  const recentlyNudged = lead({ created_at: hoursAgo(3), nudged_at: hoursAgo(1) });
  assertEquals(planFollowUps([recentlyNudged], NOW, 19).length, 0);
  const staleNudge = lead({ created_at: hoursAgo(10), nudged_at: hoursAgo(7) });
  assertEquals(planFollowUps([staleNudge], NOW, 19).length, 1);
});

Deno.test("planFollowUps fires evening callbacks in the evening window, once", () => {
  const evening = lead({ callback_time: "evening", created_at: hoursAgo(5) });
  const plan = planFollowUps([evening], NOW, 19);
  assertEquals(plan.length, 1);
  assertEquals(plan[0].kind, "callback");
  // before the window — nothing
  assertEquals(planFollowUps([lead({ callback_time: "evening", created_at: hoursAgo(1) })], NOW, 15)
    .filter((f) => f.kind === "callback").length, 0);
  // already pinged — nothing (and the ping counts as a nudge for the SLA ladder)
  const pinged = { ...evening, callback_pinged_at: hoursAgo(1) };
  assertEquals(planFollowUps([pinged], NOW, 19).length, 0);
});

Deno.test("planFollowUps: noon window closes in the evening", () => {
  // a lead created at 18:00 asking for noon must NOT ping at 19:00 same day
  assertEquals(planFollowUps([lead({ callback_time: "noon", created_at: hoursAgo(1) })], NOW, 19)
    .filter((f) => f.kind === "callback").length, 0);
  // but does ping at 13:00 the next day (hour in window)
  const noonNow = NOW + 18 * 3_600_000; // ~13:00 Israel next day
  assertEquals(planFollowUps([lead({ callback_time: "noon", created_at: hoursAgo(1) })], noonNow, 13)
    .filter((f) => f.kind === "callback").length, 1);
});

Deno.test("planFollowUps: 'tomorrow' requires an Israel calendar-day boundary", () => {
  // created 21:00 Israel yesterday, now 19:00 Israel today -> due
  const yesterdayEvening = lead({ callback_time: "tomorrow", created_at: "2026-06-09T18:00:00.000Z" });
  assertEquals(planFollowUps([yesterdayEvening], NOW, 19).filter((f) => f.kind === "callback").length, 1);
  // created 08:30 Israel today, now 19:00 Israel the SAME day -> not yet
  const thisMorning = lead({ callback_time: "tomorrow", created_at: "2026-06-10T05:30:00.000Z" });
  assertEquals(planFollowUps([thisMorning], NOW, 19).filter((f) => f.kind === "callback").length, 0);
});

Deno.test("planFollowUps caps the batch and puts callbacks first", () => {
  const leads: Lead[] = [];
  for (let i = 0; i < 8; i++) leads.push(lead({ id: `${i}`.repeat(36).slice(0, 36), created_at: hoursAgo(5 + i) }));
  leads.push(lead({ callback_time: "evening", created_at: hoursAgo(4) }));
  const plan = planFollowUps(leads, NOW, 19);
  assertEquals(plan.length, 5);
  assertEquals(plan[0].kind, "callback");
});

Deno.test("planFollowUps ignores non-new leads", () => {
  assertEquals(planFollowUps([lead({ status: "contacted", created_at: hoursAgo(10) })], NOW, 19).length, 0);
});

// ── digests ──────────────────────────────────────────────────────────────────

Deno.test("buildDigest handles the empty case and renders urgency rows", () => {
  assertStringIncludes(buildDigest([], 14), "אין מסלולים");
  const msg = buildDigest([{
    id: "r1", user_id: null, provider: "HOT", plan_name: "סיבים 1000", monthly_price: 89,
    promo_end_date: new Date(NOW + 2 * 86_400_000).toISOString().slice(0, 10),
    category: "internet", name: "יוסי", phone: "0521112222", email: null,
  }], 14, new Date(NOW));
  assertStringIncludes(msg, "🔴");
  assertStringIncludes(msg, "יוסי");
});

Deno.test("medianMinutes and formatMinutes", () => {
  assertEquals(medianMinutes([]), null);
  const pairs = [
    { created_at: hoursAgo(2), contacted_at: hoursAgo(1) },          // 60 min
    { created_at: hoursAgo(3), contacted_at: hoursAgo(2.5) },        // 30 min
    { created_at: hoursAgo(5), contacted_at: hoursAgo(1) },          // 240 min
  ];
  assertEquals(medianMinutes(pairs), 60);
  assertEquals(formatMinutes(45), "45 דק׳");
  assertStringIncludes(formatMinutes(150), "שע׳");
});
