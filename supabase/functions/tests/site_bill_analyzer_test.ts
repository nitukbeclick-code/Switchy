// Unit tests for the site-bill-analyzer pure helpers (site-bill-analyzer/lib.ts)
// + the shared buildSuggestions it now delegates to (B4 drift fix). These pin the
// defensive JSON parsing (fence-strip, first-{} extraction, NaN→0) and the
// raw/data-URL image parsing, with no network or env. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals } from "@std/assert";
import { buildParsedBill, parseExtraction, parseImage, parseLines } from "../site-bill-analyzer/lib.ts";
import { buildSuggestions, type Plan } from "../_shared/catalogue.ts";

// ── parseExtraction: defensive JSON parsing of Gemini's reply ─────────────────

Deno.test("parseExtraction reads a clean JSON object", () => {
  const out = parseExtraction('{"provider":"סלקום","monthly":89,"category":"cellular","confidence":0.9}');
  assertEquals(out, { provider: "סלקום", monthly: 89, category: "cellular", confidence: 0.9, warnings: [], lines: [] });
});

Deno.test("parseExtraction strips a ```json fence", () => {
  const out = parseExtraction('```json\n{"provider":"בזק","monthly":120,"category":"internet","confidence":0.8}\n```');
  assertEquals(out?.provider, "בזק");
  assertEquals(out?.monthly, 120);
  assertEquals(out?.category, "internet");
});

Deno.test("parseExtraction strips a bare ``` fence (no language tag)", () => {
  const out = parseExtraction('```\n{"provider":"yes","monthly":100,"category":"tv","confidence":0.7}\n```');
  assertEquals(out?.provider, "yes");
  assertEquals(out?.monthly, 100);
});

Deno.test("parseExtraction pulls the first {...} block out of surrounding prose", () => {
  const out = parseExtraction('הנה התשובה: {"provider":"פרטנר","monthly":60,"category":"cellular","confidence":0.6} בהצלחה');
  assertEquals(out?.provider, "פרטנר");
  assertEquals(out?.monthly, 60);
});

Deno.test("parseExtraction coerces a non-numeric/missing monthly+confidence to 0 (NaN→0)", () => {
  const out = parseExtraction('{"provider":"x","monthly":"לא ידוע","category":"cellular"}');
  assertEquals(out?.monthly, 0); // Number("לא ידוע") → NaN → 0
  assertEquals(out?.confidence, 0); // missing → NaN → 0
});

Deno.test("parseExtraction clips over-long provider/category strings", () => {
  const longProvider = "א".repeat(200);
  const longCategory = "ב".repeat(200);
  const out = parseExtraction(JSON.stringify({ provider: longProvider, monthly: 50, category: longCategory, confidence: 1 }));
  assertEquals(out?.provider.length, 80);
  assertEquals(out?.category.length, 40);
});

// ── confidence clamping + warnings (honest about blurry photos) ───────────────

Deno.test("parseExtraction clamps confidence into [0,1]", () => {
  assertEquals(parseExtraction('{"monthly":50,"confidence":1.7}')?.confidence, 1);
  assertEquals(parseExtraction('{"monthly":50,"confidence":-0.5}')?.confidence, 0);
  // a 0-100 style score from a confused model still clamps to 1
  assertEquals(parseExtraction('{"monthly":50,"confidence":85}')?.confidence, 1);
});

Deno.test("parseExtraction reads a warnings array, trims + clips entries", () => {
  const out = parseExtraction(
    '{"monthly":50,"confidence":0.5,"warnings":["  התמונה מטושטשת  ","",123]}',
  );
  // empties dropped, whitespace trimmed, the number coerced to its string form
  assertEquals(out?.warnings, ["התמונה מטושטשת", "123"]);
});

Deno.test("parseExtraction accepts a single warning string", () => {
  const out = parseExtraction('{"monthly":50,"confidence":0.4,"warnings":"הסכום לא ברור"}');
  assertEquals(out?.warnings, ["הסכום לא ברור"]);
});

Deno.test("parseExtraction caps warnings at 5 entries", () => {
  const many = JSON.stringify({ monthly: 50, confidence: 0.4, warnings: ["a", "b", "c", "d", "e", "f", "g"] });
  assertEquals(parseExtraction(many)?.warnings.length, 5);
});

Deno.test("parseExtraction defaults warnings to [] when the model omits it", () => {
  assertEquals(parseExtraction('{"provider":"yes","monthly":100,"category":"tv","confidence":0.7}')?.warnings, []);
});

Deno.test("parseExtraction returns null on empty input or unparseable garbage", () => {
  assertEquals(parseExtraction(""), null);
  assertEquals(parseExtraction("   "), null);
  assertEquals(parseExtraction("no json here at all"), null);
  assertEquals(parseExtraction("{not valid json"), null);
});

// ── parseImage: data-URL + raw base64 ─────────────────────────────────────────

Deno.test("parseImage parses a data URL into mimeType + bare base64", () => {
  const out = parseImage("data:image/png;base64,AAAABBBB");
  assertEquals(out, { mimeType: "image/png", data: "AAAABBBB" });
});

Deno.test("parseImage strips whitespace inside the base64 payload", () => {
  const out = parseImage("data:image/jpeg;base64,AAAA\n  BBBB\tCCCC");
  assertEquals(out?.data, "AAAABBBBCCCC");
});

Deno.test("parseImage treats a bare base64 string as jpeg", () => {
  const out = parseImage("AAAABBBBCCCCDDDD");
  assertEquals(out, { mimeType: "image/jpeg", data: "AAAABBBBCCCCDDDD" });
});

Deno.test("parseImage rejects empty and non-base64 input", () => {
  assertEquals(parseImage(""), null);
  assertEquals(parseImage("   "), null);
  // leading 64 chars contain illegal base64 characters
  assertEquals(parseImage("הטקסט הזה אינו base64 כלל וכלל ולכן צריך להידחות מיד"), null);
  // a data URL with an empty payload
  assertEquals(parseImage("data:image/png;base64,"), null);
});

// ── buildSuggestions: clamp/sort (now the shared impl) ────────────────────────

const BILL_PLANS: Plan[] = [
  { cat: "cellular", provider: "סלקום", plan: "A", price: 39 },
  { cat: "cellular", provider: "פרטנר", plan: "B", price: 59 },
  { cat: "cellular", provider: "פלאפון", plan: "C", price: 29 },
  { cat: "cellular", provider: "HOT", plan: "D", price: 49 },
  { cat: "internet", provider: "בזק", plan: "net", price: 80 },
];

Deno.test("buildSuggestions returns cheaper same-category plans sorted ascending, capped at max", () => {
  // current spend ₪70 → cellular plans under 70: 29, 39, 49, 59 → capped at 3.
  const out = buildSuggestions(BILL_PLANS, "cellular", 70, 3);
  assertEquals(out.map((s) => s.price), [29, 39, 49]);
  assertEquals(out.map((s) => s.provider), ["פלאפון", "סלקום", "HOT"]);
});

Deno.test("buildSuggestions annualSaving is (spend-price)*12 clamped at 0", () => {
  const out = buildSuggestions(BILL_PLANS, "cellular", 70, 3);
  assertEquals(out[0].annualSaving, (70 - 29) * 12); // 492
  // never negative: every returned plan is strictly cheaper than spend
  for (const s of out) assert(s.annualSaving >= 0);
});

Deno.test("buildSuggestions ignores other categories and plans at/above the spend", () => {
  // spend ₪40 → only 29 and 39 qualify (49/59 excluded, internet excluded).
  const out = buildSuggestions(BILL_PLANS, "cellular", 40, 3);
  assertEquals(out.map((s) => s.price), [29, 39]);
});

Deno.test("buildSuggestions is empty without a category or a positive spend", () => {
  assertEquals(buildSuggestions(BILL_PLANS, "", 70, 3), []);
  assertEquals(buildSuggestions(BILL_PLANS, "cellular", 0, 3), []);
});

// ── parseLines: itemized charge lines for the forensic auditor ────────────────

Deno.test("parseLines reads desc+amount and passes through forensic hints", () => {
  const out = parseLines([
    { desc: "חבילת גלישה 5G", amount: 89, prevAmount: 49, isAddon: false },
    { desc: "ביטוח מכשיר", amount: 19, isAddon: true, promoEnd: "2026-01-01" },
  ]);
  assertEquals(out.length, 2);
  assertEquals(out[0], { desc: "חבילת גלישה 5G", amount: 89, prevAmount: 49, promoEnd: null, category: null, isAddon: false });
  assertEquals(out[1].isAddon, true);
  assertEquals(out[1].promoEnd, "2026-01-01");
});

Deno.test("parseLines accepts synonym keys (description/price/is_addon)", () => {
  const out = parseLines([{ description: "ערוצי פרימיום", price: 30, is_addon: true }]);
  assertEquals(out.length, 1);
  assertEquals(out[0].desc, "ערוצי פרימיום");
  assertEquals(out[0].amount, 30);
  assertEquals(out[0].isAddon, true);
});

Deno.test("parseLines drops a line with no desc AND no positive amount, never fabricates", () => {
  const out = parseLines([
    { desc: "", amount: 0 },
    { desc: "   ", amount: "x" },
    { desc: "שורה אמיתית", amount: 50 },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].desc, "שורה אמיתית");
});

Deno.test("parseLines coerces a non-finite/negative prevAmount to null", () => {
  const out = parseLines([{ desc: "x", amount: 50, prevAmount: -5 }, { desc: "y", amount: 50, prevAmount: "n/a" }]);
  assertEquals(out[0].prevAmount, null);
  assertEquals(out[1].prevAmount, null);
});

Deno.test("parseLines caps at 30 lines (OCR-noise guard)", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ desc: `שורה ${i}`, amount: 10 }));
  assertEquals(parseLines(many).length, 30);
});

Deno.test("parseLines returns [] for a non-array / missing value", () => {
  assertEquals(parseLines(undefined), []);
  assertEquals(parseLines("not an array"), []);
  assertEquals(parseLines({}), []);
});

Deno.test("parseExtraction surfaces lines when present", () => {
  const out = parseExtraction(
    '{"provider":"yes","monthly":120,"category":"tv","confidence":0.8,"lines":[{"desc":"בסיס","amount":90},{"desc":"ערוצים","amount":30,"isAddon":true}]}',
  );
  assertEquals(out?.lines.length, 2);
  assertEquals(out?.lines[1].isAddon, true);
});

// ── buildParsedBill: assembles the ParsedBill for the auditor ─────────────────

Deno.test("buildParsedBill carries normalized provider/category/monthly + extracted lines", () => {
  const extracted = parseExtraction(
    '{"provider":"raw","monthly":150,"category":"cellular","confidence":0.9,"lines":[{"desc":"a","amount":50}]}',
  )!;
  const bill = buildParsedBill(extracted, "סלקום", "cellular", 150);
  assertEquals(bill.provider, "סלקום");
  assertEquals(bill.category, "cellular");
  assertEquals(bill.monthly, 150);
  assertEquals(bill.lines.length, 1);
  assertEquals(bill.lines[0].desc, "a");
});
