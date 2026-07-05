import { assert, assertEquals } from "@std/assert";
import {
  batchStrings,
  buildSystemPrompt,
  isSupportedLang,
  langEnglishName,
  needsTranslation,
  parseTranslations,
  protectText,
  restoredMatchesTokens,
  restoreText,
  sha256Hex,
  sentinelSequence,
  SUPPORTED_LANGS,
  tokensPreserved,
} from "../translate/lib.ts";

// ── protect / restore round-trip — the price-safety core ─────────────────────

Deno.test("protectText masks price, brand and unit; restore is exact", () => {
  const src = "מפסיקים לשלם — סלולר מ-₪11 לחודש עם הוט, 20GB";
  const { masked, tokens } = protectText(src);
  // The masked string handed to the model must contain NONE of the raw values.
  assert(!masked.includes("₪11"));
  assert(!masked.includes("20GB"));
  assert(!masked.includes("הוט"));
  // It must still contain human words to translate.
  assert(masked.includes("לחודש"));
  // Round-trip restores the exact original.
  assertEquals(restoreText(masked, tokens), src);
});

Deno.test("restoreText tolerates the model spacing the sentinel", () => {
  const { tokens } = protectText("מחיר ₪11");
  // Model returned "⟦ 0 ⟧" with stray spaces inside the brackets.
  assertEquals(restoreText("price ⟦ 0 ⟧", tokens), "price ₪11");
});

Deno.test("tokensPreserved detects a dropped sentinel", () => {
  const { tokens } = protectText("סלולר ב-₪11 לחודש"); // 1 token (₪11)
  assert(tokensPreserved("cellular ⟦0⟧ per month", tokens.length));
  assert(!tokensPreserved("cellular per month", tokens.length)); // dropped → reject
});

Deno.test("tokensPreserved rejects REORDERED and DUPLICATED sentinels", () => {
  assert(tokensPreserved("⟦0⟧-⟦1⟧", 2)); // in order → ok
  assert(!tokensPreserved("⟦1⟧-⟦0⟧", 2)); // reordered → would invert a price range
  assert(!tokensPreserved("⟦0⟧ ⟦0⟧", 2)); // duplicated + missing
  assert(!tokensPreserved("from ⟦0⟧ to ⟦0⟧", 1)); // one price duplicated into a range
});

Deno.test("restoredMatchesTokens catches reorder, duplication and glued digits", () => {
  // reorder: "11-15₪" masks to ⟦0⟧-⟦1⟧; a reversed model output restores to "15₪-11"
  const range = protectText("11-15₪");
  assert(!restoredMatchesTokens(restoreText("⟦1⟧-⟦0⟧", range.tokens), range.tokens));
  assert(restoredMatchesTokens(restoreText("⟦0⟧-⟦1⟧", range.tokens), range.tokens));
  // duplication: a single ₪11 must not become a "₪11 to ₪11" range
  const one = protectText("₪11");
  assert(!restoredMatchesTokens("from ₪11 to ₪11", one.tokens));
  assert(restoredMatchesTokens("starting ₪11 monthly", one.tokens));
  // glued digit: token "10%" but the model emitted ⟦0⟧0 → restored "10%0"
  const pct = protectText("10%");
  assert(!restoredMatchesTokens("10%0", pct.tokens));
});

Deno.test("CJK full-width bracket sentinels are still recognized + restored", () => {
  const { tokens } = protectText("מסלול מ-₪11"); // 1 token: ₪11
  // A Chinese model re-emitted ⟦0⟧ as full-width 【0】 — must still verify + restore.
  assert(tokensPreserved("每月从【0】开始", 1));
  assertEquals(restoreText("每月从【0】开始", tokens), "每月从₪11开始");
  assert(restoredMatchesTokens(restoreText("每月从【0】开始", tokens), tokens));
  // full-width parens variant （0） (some JP/KR outputs)
  assertEquals(restoreText("プラン（0）から", tokens), "プラン₪11から");
});

Deno.test("protect masks number + Hebrew unit WORD as one span", () => {
  for (const s of ["מסלול ב-11 שקל לחודש", "אינטרנט 300 מגה", "כולל 50 דקות", "עד 5 ג׳יגה"]) {
    const { masked, tokens } = protectText(s);
    assert(tokens.length >= 1, s);
    // No source digit may remain OUTSIDE a sentinel (⟦0⟧ itself contains a digit).
    const bare = masked.replace(/⟦\d+⟧/g, "");
    assert(!/\d/.test(bare), `digits leaked for: ${s} -> ${masked}`);
    assertEquals(restoreText(masked, tokens), s);
  }
});

Deno.test("sentinelSequence extracts indices in order", () => {
  assertEquals(sentinelSequence("a ⟦0⟧ b ⟦2⟧ c ⟦1⟧"), [0, 2, 1]);
  assertEquals(sentinelSequence("no tokens"), []);
});

Deno.test("protect masks urls, emails and phone numbers", () => {
  const src = "כתבו ל-hello@switchy-ai.com או 050-503-7537, פרטים ב-https://switchy-ai.com";
  const { masked, tokens } = protectText(src);
  assert(!masked.includes("hello@switchy-ai.com"));
  assert(!masked.includes("switchy-ai.com/"));
  assert(!masked.includes("050-503-7537"));
  assertEquals(restoreText(masked, tokens), src);
});

Deno.test("multi-word brand wins over its prefix (longest-first)", () => {
  const { masked, tokens } = protectText("עם גולן טלקום");
  // Exactly one token — "גולן טלקום" as a whole, not "גולן" + "טלקום".
  assertEquals(tokens.length, 1);
  assertEquals(tokens[0], "גולן טלקום");
  assertEquals(restoreText(masked, tokens), "עם גולן טלקום");
});

// ── needsTranslation — skip strings the model would only echo ─────────────────

Deno.test("needsTranslation skips number/symbol-only strings", () => {
  assert(!needsTranslation("₪11"));
  assert(!needsTranslation("20GB".replace(/[A-Za-z]/g, ""))); // "20" only
  assert(!needsTranslation("100%"));
  assert(!needsTranslation("   "));
  assert(!needsTranslation("→ 5 · 10"));
  assert(needsTranslation("מסלול סלולר"));
  assert(needsTranslation("Best plan")); // has letters → translatable
});

// ── parseTranslations — robust to the model's shapes ─────────────────────────

Deno.test("parseTranslations reads {t:[…]}, bare arrays and fenced json", () => {
  assertEquals(parseTranslations('{"t":["a","b"]}', 2), ["a", "b"]);
  assertEquals(parseTranslations('["a","b"]', 2), ["a", "b"]);
  assertEquals(parseTranslations('```json\n{"t":["a","b"]}\n```', 2), ["a", "b"]);
  assertEquals(parseTranslations('here you go: ["a","b"]', 2), ["a", "b"]);
});

Deno.test("parseTranslations rejects wrong length / non-strings / junk", () => {
  assertEquals(parseTranslations('{"t":["a"]}', 2), null); // wrong length
  assertEquals(parseTranslations('{"t":["a",5]}', 2), null); // non-string
  assertEquals(parseTranslations("not json at all", 2), null);
  assertEquals(parseTranslations("", 1), null);
});

// ── batching, language table, hashing ────────────────────────────────────────

Deno.test("batchStrings respects the item cap", () => {
  const items = Array.from({ length: 95 }, (_, i) => `s${i}`);
  const batches = batchStrings(items, 40, 100_000);
  assertEquals(batches.length, 3); // 40 + 40 + 15
  assertEquals(batches.flat().length, 95);
});

Deno.test("batchStrings respects the char cap", () => {
  const items = [ "x".repeat(2000), "y".repeat(2000) ];
  const batches = batchStrings(items, 40, 3500); // second string won't fit with the first
  assertEquals(batches.length, 2);
});

Deno.test("language table is consistent (rtl=ar/fa/ur, rest ltr; unique codes)", () => {
  assert(isSupportedLang("ar"));
  assert(isSupportedLang("th")); // a newly-added language
  assert(isSupportedLang("zh"));
  assert(!isSupportedLang("he")); // source is never a target
  assert(!isSupportedLang("zz"));
  assertEquals(langEnglishName("am"), "Amharic");
  const rtl = new Set(["ar", "fa", "ur"]);
  for (const l of SUPPORTED_LANGS) {
    assertEquals(l.dir, rtl.has(l.code) ? "rtl" : "ltr", l.code);
    assert(l.label.length > 0 && l.english.length > 0, l.code);
  }
  assertEquals(new Set(SUPPORTED_LANGS.map((l) => l.code)).size, SUPPORTED_LANGS.length); // unique
  assert(SUPPORTED_LANGS.length >= 20);
});

Deno.test("buildSystemPrompt names the target language and demands the JSON envelope", () => {
  const p = buildSystemPrompt("Arabic");
  assert(p.includes("Arabic"));
  assert(p.includes('{"t":'));
});

Deno.test("sha256Hex is deterministic and 64 hex chars", async () => {
  const a = await sha256Hex("שלום");
  const b = await sha256Hex("שלום");
  assertEquals(a, b);
  assertEquals(a.length, 64);
  assert(/^[0-9a-f]+$/.test(a));
});
