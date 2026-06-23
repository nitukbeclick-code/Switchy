// Unit tests for the site-bill-analyzer pure helpers (site-bill-analyzer/lib.ts)
// + the shared buildSuggestions it now delegates to (B4 drift fix). These pin the
// defensive JSON parsing (fence-strip, first-{} extraction, NaN→0) and the
// raw/data-URL image parsing, with no network or env. Run from
// supabase/functions/:
//   deno task test

import { assert, assertEquals } from "@std/assert";
import { parseExtraction, parseImage } from "../site-bill-analyzer/lib.ts";
import { buildSuggestions, type Plan } from "../_shared/catalogue.ts";

// ── parseExtraction: defensive JSON parsing of Gemini's reply ─────────────────

Deno.test("parseExtraction reads a clean JSON object", () => {
  const out = parseExtraction('{"provider":"סלקום","monthly":89,"category":"cellular","confidence":0.9}');
  assertEquals(out, { provider: "סלקום", monthly: 89, category: "cellular", confidence: 0.9 });
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
