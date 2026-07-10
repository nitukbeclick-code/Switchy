// Unit tests for the SHARED bill extractor (_shared/bill.ts) — the ONE
// Vision→billHint path used by the in-chat photo feature (site-ai-chat) and
// re-exported to site-bill-analyzer. Drives the REAL callGeminiVision through a
// globalThis.fetch stub (no network) to pin: provider/category normalization,
// the 0..5000 monthly clamp (never a fake giant saving), the hint:null
// unreadable contract, and that a hard vision failure THROWS (so the caller can
// fail soft). Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import { extractBillHint, MAX_BILL_BASE64_LEN, parseBillHint, parseExtraction, parseImage } from "../_shared/bill.ts";
import type { Plan } from "../_shared/catalogue.ts";

const realFetch = globalThis.fetch;

const PLANS: Plan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49 },
  { id: "c2", cat: "cellular", provider: "פרטנר", plan: "בסיסי", price: 29 },
];

const IMG = { mimeType: "image/jpeg", data: "AAAABBBBCCCC" };

// A Gemini-Vision fetch stub: returns ONE candidate whose text part is `text`
// (the extractor then parseExtraction()s it). A non-2xx status makes
// callGeminiVision retry then throw — used for the failure test.
function visionStub(text: string, status = 200): typeof globalThis.fetch {
  return ((_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
        { status },
      ),
    )) as typeof globalThis.fetch;
}

Deno.test("extractBillHint normalizes provider/category + surfaces confidence", async () => {
  globalThis.fetch = visionStub(
    JSON.stringify({ provider: "סלקום", monthly: 189, category: "cellular", confidence: 0.9 }),
  );
  try {
    const { hint, extracted } = await extractBillHint("k", PLANS, IMG);
    assert(hint);
    assertEquals(hint?.provider, "סלקום");
    assertEquals(hint?.monthly, 189);
    assertEquals(hint?.category, "cellular");
    assertEquals(extracted?.confidence, 0.9);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("extractBillHint clamps an absurd monthly to 5000 + omits an unknown provider", async () => {
  globalThis.fetch = visionStub(
    JSON.stringify({ provider: "ספק דמיוני", monthly: 99999, category: "cellular", confidence: 0.8 }),
  );
  try {
    const { hint } = await extractBillHint("k", PLANS, IMG);
    assertEquals(hint?.monthly, 5000); // never a fabricated giant saving
    assertEquals(hint?.provider, undefined); // unknown provider → omitted, never guessed
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("extractBillHint returns hint:null on an unreadable read (monthly<=0), keeping the warnings", async () => {
  globalThis.fetch = visionStub(
    JSON.stringify({ provider: "", monthly: 0, category: "", confidence: 0, warnings: ["לא ניתן לקרוא"] }),
  );
  try {
    const { hint, extracted } = await extractBillHint("k", PLANS, IMG);
    assertEquals(hint, null);
    assert(extracted); // still surfaced so the caller can be honest about the read
    assertEquals(extracted?.warnings, ["לא ניתן לקרוא"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("extractBillHint throws on a hard vision failure (caller then fails soft)", async () => {
  globalThis.fetch = visionStub("upstream error", 500);
  try {
    let threw = false;
    try {
      await extractBillHint("k", PLANS, IMG);
    } catch {
      threw = true;
    }
    assert(threw, "a hard vision failure must throw for the caller to handle");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// The moved parsers keep their new home (site-bill-analyzer/lib.ts re-exports
// them; here we pin the source of truth directly).
Deno.test("_shared/bill.ts re-homes parseImage + parseExtraction", () => {
  assertEquals(parseImage("data:image/png;base64,AAAA")?.mimeType, "image/png");
  assertEquals(
    parseExtraction('{"provider":"yes","monthly":100,"category":"tv","confidence":0.7}')?.monthly,
    100,
  );
  assert(MAX_BILL_BASE64_LEN > 0);
});

// ── parseBillHint: client-supplied hint parse + honesty clamp ──────────────────
// The 0..5000 clamp is the honesty rail: a misread or hostile client can't turn
// the referenced bill into a giant fake saving. No image here (that's extractBillHint).

Deno.test("parseBillHint clamps monthly to 0..5000 and rounds", () => {
  assertEquals(parseBillHint({ monthly: 120 })?.monthly, 120);
  assertEquals(parseBillHint({ monthly: 120.6 })?.monthly, 121); // rounded
  assertEquals(parseBillHint({ monthly: 99999 })?.monthly, 5000); // clamped to ceiling
  assertEquals(parseBillHint({ monthly: "80" })?.monthly, 80); // numeric string coerced
});

Deno.test("parseBillHint rejects a non-usable bill (⇒ undefined, prompt unchanged)", () => {
  assertEquals(parseBillHint({ monthly: 0 }), undefined);
  assertEquals(parseBillHint({ monthly: -50 }), undefined); // clamps to 0 → rejected
  assertEquals(parseBillHint({ monthly: "abc" }), undefined); // NaN
  assertEquals(parseBillHint({}), undefined);
  assertEquals(parseBillHint(null), undefined);
  assertEquals(parseBillHint("not an object"), undefined);
});

Deno.test("parseBillHint trims + length-caps provider/category, omits when blank", () => {
  const r = parseBillHint({ monthly: 60, provider: "  סלקום  ", category: "cellular" });
  assertEquals(r?.provider, "סלקום");
  assertEquals(r?.category, "cellular");
  // Blank/whitespace provider/category are omitted, never an empty string.
  const r2 = parseBillHint({ monthly: 60, provider: "   ", category: 123 });
  assertEquals(r2?.provider, undefined);
  assertEquals(r2?.category, undefined);
  // Over-long provider is capped at 40 chars.
  assertEquals(parseBillHint({ monthly: 60, provider: "x".repeat(80) })?.provider?.length, 40);
});
