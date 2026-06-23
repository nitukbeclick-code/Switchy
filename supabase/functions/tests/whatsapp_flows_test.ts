// Unit tests for the richer WhatsApp conversational flows (whatsapp-webhook/
// flows.ts + context.ts) — the grounded templated answers for common telecom
// asks and the multi-turn context memory that lets terse follow-ups continue a
// thread. Pure logic, no DB / no network. Run from supabase/functions/:
//   deno task test
//
// The guiding invariant: every figure a flow quotes must come from a REAL
// catalogue row it was handed — these tests pin that the builders never invent a
// provider, plan or price, and that context carries category/budget/topic across
// turns.

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Plan } from "../_shared/catalogue.ts";
import {
  buildCheapest,
  buildCompare,
  buildCoverageInfo,
  buildRoamingInfo,
  buildSavingHint,
  buildSwitchSteps,
  buildTopicReply,
  detectTopic,
} from "../whatsapp-webhook/flows.ts";
import {
  effectiveTopic,
  extractBudget,
  extractSlots,
  isFollowUp,
  mentionsAbroad,
  mergeContext,
  parseContext,
} from "../whatsapp-webhook/context.ts";

// A small grounded catalogue spanning the categories the flows read.
const PLANS: Plan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "סלקום 100GB", price: 39, is5G: true, kind: "regular", specs: { data: "100GB" } },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "פרטנר Unlimited", price: 59, noCommit: true, kind: "regular", specs: { data: "ללא הגבלה" } },
  { id: "c3", cat: "cellular", provider: "רמי לוי", plan: "רמי לוי 50GB", price: 25, kind: "regular", specs: { data: "50GB" } },
  { id: "c4", cat: "cellular", provider: "גולן טלקום", plan: "כשר", price: 19, kind: "kosher", specs: { data: "5GB" } },
  { id: "i1", cat: "internet", provider: "בזק", plan: "סיב 1000", price: 99, kind: "regular", specs: { speed: "1000Mb" } },
  { id: "a1", cat: "abroad", provider: "019 מובייל", plan: 'חבילת חו"ל אירופה', price: 49, hasAbroad: true, priceUnit: "package", kind: "regular", specs: { data: "10GB" } },
  { id: "a2", cat: "abroad", provider: "Airalo eSIM", plan: "eSIM גלובלי", price: 29, hasAbroad: true, priceUnit: "package", kind: "regular", specs: { data: "5GB" } },
];

// Every provider/plan/price string that legitimately appears in the catalogue —
// used to assert a flow never emits a name/number that isn't real.
const REAL_PROVIDERS = PLANS.map((p) => p.provider!);

// ── detectTopic: classifying the common telecom asks ──────────────────────────

Deno.test("detectTopic recognises the switching ask", () => {
  assertEquals(detectTopic("איך עוברים ספק?"), "switch");
  assertEquals(detectTopic("אני רוצה לעבור לחברה אחרת"), "switch");
  assertEquals(detectTopic("איך מנייד את המספר"), "switch");
});

Deno.test("detectTopic recognises roaming / abroad asks", () => {
  assertEquals(detectTopic('מה יש לכם לחו"ל?'), "roaming");
  assertEquals(detectTopic("אני טס לתאילנד, צריך eSIM"), "roaming");
  assertEquals(detectTopic("רומינג ביוון"), "roaming");
});

Deno.test("detectTopic recognises cheapest vs compare", () => {
  assertEquals(detectTopic("מה הכי זול?"), "cheapest");
  assertEquals(detectTopic("הזול ביותר בסלולר"), "cheapest");
  assertEquals(detectTopic("אפשר להשוות בין שני המסלולים?"), "compare");
  assertEquals(detectTopic("מה ההבדל בין סלקום לפרטנר"), "compare");
});

Deno.test("detectTopic recognises cancel + coverage", () => {
  assertEquals(detectTopic("איך מבטלים מסלול?"), "cancel");
  assertEquals(detectTopic("יש לי קנס יציאה?"), "cancel");
  assertEquals(detectTopic("איך הכיסוי שלכם בצפון?"), "coverage");
});

Deno.test("detectTopic returns null for a plain catalogue question", () => {
  assertEquals(detectTopic("כמה עולה אינטרנט 1 גיגה?"), null);
  assertEquals(detectTopic(""), null);
  assertEquals(detectTopic("שלום"), null);
});

Deno.test("detectTopic: a concrete action (switch) beats a vague compare cue", () => {
  // Contains both "לעבור" (switch) and "מול" (compare) — switch is the actionable
  // intent and must win.
  assertEquals(detectTopic("כדאי לעבור מסלקום מול פרטנר?"), "switch");
});

// ── switching steps (deterministic, no invented numbers) ──────────────────────

Deno.test("buildSwitchSteps states the real, regulated ניוד process", () => {
  const out = buildSwitchSteps("cellular");
  assertStringIncludes(out, "ניוד");
  assertStringIncludes(out, "אותו מספר");
  // Names the category in Hebrew when given.
  assertStringIncludes(out, "סלולר");
  // It must NOT quote any specific price — switching steps carry no catalogue
  // numbers (those would be fabricated here).
  assertFalse(/₪\s*\d/.test(out));
});

Deno.test("buildSwitchSteps works without a category", () => {
  const out = buildSwitchSteps();
  assertStringIncludes(out, "מעבר ספק");
  assertFalse(out.includes("undefined"));
});

// ── coverage explainer is honest about missing per-region data ────────────────

Deno.test("buildCoverageInfo never claims coverage data it doesn't have", () => {
  const out = buildCoverageInfo();
  assertStringIncludes(out, "כיסוי");
  // Explicitly disclaims per-address coverage data (honesty / E-E-A-T).
  assertStringIncludes(out, "אין לי נתוני כיסוי");
  assertFalse(/₪\s*\d/.test(out));
});

// ── roaming: grounded in REAL abroad rows ─────────────────────────────────────

Deno.test("buildRoamingInfo quotes only real abroad plans (cheapest first)", () => {
  const out = buildRoamingInfo(PLANS);
  // Cheapest abroad row first: Airalo ₪29 before 019 ₪49.
  assert(out.indexOf("Airalo eSIM") < out.indexOf("019 מובייל"));
  assertStringIncludes(out, "₪29");
  assertStringIncludes(out, "₪49");
  // No provider that isn't in the catalogue.
  assertOnlyRealProviders(out);
});

Deno.test("buildRoamingInfo degrades gracefully with no abroad rows", () => {
  const noAbroad = PLANS.filter((p) => p.cat !== "abroad");
  const out = buildRoamingInfo(noAbroad);
  // No fabricated plan; asks for the destination instead.
  assertFalse(/₪\s*\d/.test(out));
  assertStringIncludes(out, "לאן");
});

// ── cheapest: grounded, category-gated ────────────────────────────────────────

Deno.test("buildCheapest returns the real cheapest regular plans in a category", () => {
  const out = buildCheapest(PLANS, "cellular");
  // רמי לוי ₪25 is the cheapest REGULAR cellular plan (kosher ₪19 is kind!=regular
  // and must be excluded).
  assertStringIncludes(out, "רמי לוי");
  assertStringIncludes(out, "₪25");
  assertFalse(out.includes("₪19")); // the kosher plan is not "regular"
  assertOnlyRealProviders(out);
});

Deno.test("buildCheapest asks for the category when it's unknown", () => {
  const out = buildCheapest(PLANS, undefined);
  assertStringIncludes(out, "באיזה תחום");
  assertFalse(/₪\s*\d/.test(out));
});

// ── compare: grounded + budget-aware ──────────────────────────────────────────

Deno.test("buildCompare lists real plans and is honest about the budget header", () => {
  const out = buildCompare(PLANS, "cellular", 50);
  assertStringIncludes(out, "רמי לוי");
  assertStringIncludes(out, "סלקום");
  // Only 2 cellular rows are ≤₪50, so pickCandidates widens to include פרטנר
  // ₪59. Because a row exceeds the ceiling, the header must NOT claim "עד ₪50"
  // (honesty — see buildCompare).
  assertFalse(out.includes("עד ₪50"));
  assertOnlyRealProviders(out);
});

Deno.test("buildCompare shows the 'עד ₪N' header only when all rows fit the budget", () => {
  // A tight catalogue where 3+ cellular rows fall under ₪45 → header is honest.
  const tight: Plan[] = [
    { id: "x1", cat: "cellular", provider: "סלקום", plan: "A", price: 19, kind: "regular", specs: {} },
    { id: "x2", cat: "cellular", provider: "פרטנר", plan: "B", price: 29, kind: "regular", specs: {} },
    { id: "x3", cat: "cellular", provider: "רמי לוי", plan: "C", price: 39, kind: "regular", specs: {} },
  ];
  const out = buildCompare(tight, "cellular", 45);
  assertStringIncludes(out, "עד ₪45");
});

Deno.test("buildCompare prompts for the category when missing", () => {
  const out = buildCompare(PLANS, undefined);
  assertStringIncludes(out, "מה נשווה");
});

// ── saving hint: only real cheaper rows, never a promised figure ──────────────

Deno.test("buildSavingHint quotes real cheaper plans + annual saving vs the spend", () => {
  // Current spend ₪60 cellular → רמי לוי ₪25 saves (60-25)*12 = ₪420/yr.
  const out = buildSavingHint(PLANS, "cellular", 60);
  assertStringIncludes(out, "רמי לוי");
  assertStringIncludes(out, "₪420");
  assertOnlyRealProviders(out);
});

Deno.test("buildSavingHint returns empty when nothing is cheaper / no inputs", () => {
  assertEquals(buildSavingHint(PLANS, "cellular", 10), ""); // ₪10 < every plan
  assertEquals(buildSavingHint(PLANS, undefined, 60), "");
  assertEquals(buildSavingHint(PLANS, "cellular", 0), "");
});

// ── buildTopicReply dispatcher ────────────────────────────────────────────────

Deno.test("buildTopicReply routes each topic to its builder", () => {
  assertStringIncludes(buildTopicReply("switch", PLANS, {})!, "ניוד");
  assertStringIncludes(buildTopicReply("roaming", PLANS, {})!, "eSIM");
  assertStringIncludes(buildTopicReply("coverage", PLANS, {})!, "כיסוי");
  assertStringIncludes(buildTopicReply("cancel", PLANS, {})!, "התחייבות");
  assertStringIncludes(buildTopicReply("cheapest", PLANS, { category: "cellular" })!, "רמי לוי");
  assertStringIncludes(buildTopicReply("compare", PLANS, { category: "cellular" })!, "סלקום");
});

// ── context: budget extraction ────────────────────────────────────────────────

Deno.test("extractBudget reads a price near a cue", () => {
  assertEquals(extractBudget("תקציב עד 60 שקל"), 60);
  assertEquals(extractBudget("משהו בערך 50"), 50);
  assertEquals(extractBudget("₪80 לחודש"), 80);
  assertEquals(extractBudget('100 ש"ח'), 100);
});

Deno.test("extractBudget reads a bare monthly-looking number, ignores junk", () => {
  assertEquals(extractBudget("עד 45"), 45);
  // A year / a 4-digit figure with no price cue is not a budget.
  assertEquals(extractBudget("נולדתי בשנת 1990"), undefined);
  assertEquals(extractBudget("שלום מה שלומך"), undefined);
  assertEquals(extractBudget(""), undefined);
});

Deno.test("mentionsAbroad fires on travel / roaming cues only", () => {
  assert(mentionsAbroad("אני טס לחו\"ל"));
  assert(mentionsAbroad("צריך eSIM לטיול"));
  assert(mentionsAbroad("נוסע ליוון"));
  assertFalse(mentionsAbroad("כמה עולה סלולר"));
});

// ── context: slot extraction + merge ──────────────────────────────────────────

Deno.test("extractSlots pulls category, budget, abroad and topic together", () => {
  // A roaming/abroad cue is the more specific intent, so topic resolves to
  // "roaming" even though "הכי זול" is also present (detectTopic precedence).
  const s = extractSlots('מחפש מסלול סלולר עד 50 לחו"ל, מה הכי זול?');
  assertEquals(s.category, "cellular");
  assertEquals(s.budget, 50);
  assertEquals(s.abroad, true);
  assertEquals(s.topic, "roaming");
  // A plain cheapest ask with no abroad cue resolves to "cheapest".
  assertEquals(extractSlots("מה הכי זול בסלולר").topic, "cheapest");
});

Deno.test("extractSlots omits fields the message says nothing about", () => {
  const s = extractSlots("כמה עולה אינטרנט?");
  assertEquals(s.category, "internet");
  assertEquals(s.budget, undefined);
  assertEquals(s.abroad, undefined);
  assertEquals(s.topic, undefined);
});

Deno.test("mergeContext: new slots win, old ones fill the gaps, turns increments", () => {
  const prev = { category: "cellular", budget: 60, turns: 1 };
  // Follow-up only reveals a new budget — category is preserved from prior.
  const next = mergeContext(prev, { budget: 40 });
  assertEquals(next.category, "cellular");
  assertEquals(next.budget, 40);
  assertEquals(next.turns, 2);
});

Deno.test("mergeContext: abroad is sticky-true within a conversation", () => {
  const next = mergeContext({ abroad: true, turns: 0 }, {}); // no new abroad cue
  assertEquals(next.abroad, true);
});

// ── context: parse / round-trip of ai_state ───────────────────────────────────

Deno.test("parseContext tolerates empty / malformed ai_state", () => {
  assertEquals(parseContext(null), {});
  assertEquals(parseContext("nope"), {});
  assertEquals(parseContext({}), {});
  // A stray, wrong-typed key is ignored rather than poisoning routing.
  assertEquals(parseContext({ category: 123, budget: "lots" }), {});
});

Deno.test("parseContext keeps only recognised, well-typed fields", () => {
  const ctx = parseContext({ category: "cellular", budget: 50, abroad: true, topic: "compare", turns: 3, junk: 1 });
  assertEquals(ctx.category, "cellular");
  assertEquals(ctx.budget, 50);
  assertEquals(ctx.abroad, true);
  assertEquals(ctx.topic, "compare");
  assertEquals(ctx.turns, 3);
  assertFalse("junk" in ctx);
});

Deno.test("context round-trips: extract → merge → parse(persisted) is stable", () => {
  const turn1 = mergeContext(parseContext(null), extractSlots("מחפש סלולר עד 50"));
  assertEquals(turn1.category, "cellular");
  assertEquals(turn1.budget, 50);
  // Persist as jsonb then reload on the next turn.
  const reloaded = parseContext(JSON.parse(JSON.stringify(turn1)));
  assertEquals(reloaded.category, "cellular");
  assertEquals(reloaded.budget, 50);
  assertEquals(reloaded.turns, turn1.turns);
});

// ── context: follow-up detection ──────────────────────────────────────────────

Deno.test("isFollowUp flags terse continuations, not standalone questions", () => {
  assert(isFollowUp("וכמה זה עולה?"));
  assert(isFollowUp("ומה עם חו\"ל"));
  assert(isFollowUp("כן בבקשה"));
  assert(isFollowUp("אוקיי"));
  // A full standalone question is NOT a follow-up even if long.
  assertFalse(isFollowUp("כמה עולה מסלול אינטרנט מהיר עם סיב אופטי לבית"));
  assertFalse(isFollowUp("מה הכי זול בסלולר"));
  assertFalse(isFollowUp(""));
});

// ── effectiveTopic: the multi-turn continuation decision ──────────────────────

Deno.test("effectiveTopic: a stated topic always wins", () => {
  assertEquals(effectiveTopic("מה הכי זול?", { topic: "cheapest" }, "compare"), "cheapest");
});

Deno.test("effectiveTopic: a slot-only answer continues the prior thread", () => {
  // "עד 40" reveals only a budget — no topic word, not a "ו…" follow-up — but it
  // should still continue an active compare thread.
  assertEquals(effectiveTopic("עד 40", { budget: 40 }, "compare"), "compare");
  // A bare category answer ("סלולר") continues a cheapest thread.
  assertEquals(effectiveTopic("סלולר", { category: "cellular" }, "cheapest"), "cheapest");
});

Deno.test("effectiveTopic: a 'וכמה?' follow-up continues even with no slot", () => {
  assertEquals(effectiveTopic("וכמה זה עולה?", {}, "roaming"), "roaming");
});

Deno.test("effectiveTopic: no prior topic and no own topic → undefined (general chat)", () => {
  assertEquals(effectiveTopic("כמה עולה אינטרנט?", { category: "internet" }, undefined), undefined);
});

Deno.test("effectiveTopic: a fresh standalone question does NOT inherit a stale topic", () => {
  // A long, self-contained question is not a continuation — it must not silently
  // reuse a prior topic.
  assertEquals(
    effectiveTopic("ספר לי הכל על האינטרנט הסיבים האופטי המהיר ביותר שיש לכם בארץ", {}, "compare"),
    undefined,
  );
});

// ── grounding guard: a flow must never emit a non-catalogue provider ──────────

function assertOnlyRealProviders(reply: string): void {
  // Each "• ספק — מסלול" bullet must start with a real catalogue provider.
  for (const line of reply.split("\n")) {
    if (!line.trim().startsWith("•")) continue;
    const named = REAL_PROVIDERS.some((p) => line.includes(p));
    assert(named, `bullet quotes a non-catalogue provider: ${line}`);
  }
}
