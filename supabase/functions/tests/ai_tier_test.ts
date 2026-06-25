// Unit tests for the model ROUTING ("tier" opt) added to _shared/ai.ts. These pin
// the BEHAVIOR-ADDITIVE contract:
//   • default (no opts) == "smart" == today's order (gemini-2.5-flash first);
//   • "fast" floats gemini-2.0-flash to the front (cheaper/lower-latency) while
//     keeping the FULL degradation chain (every model still reachable on 404);
//   • generateWithToolsStep + generateReply honor the optional trailing opts and
//     hit the tier's preferred Gemini model FIRST.
// We stub globalThis.fetch (no real network) and read the model out of the
// generateContent URL to assert which candidate was tried first.
//   deno task test

import { assert, assertEquals } from "@std/assert";
import {
  DEFAULT_TIER,
  GEMINI_MODELS,
  generateReply,
  generateWithToolsStep,
  modelsForTier,
  newToolContents,
  resolveTier,
  TIER_GEMINI_MODEL,
} from "../_shared/ai.ts";

const realFetch = globalThis.fetch;

// Pull the Gemini model id out of a generateContent URL:
//   .../v1beta/models/<model>:generateContent?key=...
function modelFromUrl(url: string): string | null {
  const m = url.match(/\/models\/([^:]+):generateContent/);
  return m ? m[1] : null;
}

// A fetch stub that records every Gemini model it's asked for (in order) and
// returns a minimal-but-valid generateContent body. `okModels` decides which
// models answer 200; anything else answers 404 (→ the caller falls through to the
// next candidate, exactly like the real 404-fallthrough).
function recordingGeminiFetch(opts: {
  seen: string[];
  okModels: Set<string>;
  // What the 200 body should contain: a plain text reply (text path / tools final)
  text?: string;
}): typeof globalThis.fetch {
  return ((input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const model = modelFromUrl(url);
    if (model) opts.seen.push(model);
    if (model && opts.okModels.has(model)) {
      const body = JSON.stringify({
        candidates: [{ content: { parts: [{ text: opts.text ?? "שלום, אני כאן לעזור." }] } }],
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof globalThis.fetch;
}

// ── resolveTier ──────────────────────────────────────────────────────────────

Deno.test("resolveTier: default (no opts) is the safe default 'smart'", () => {
  assertEquals(DEFAULT_TIER, "smart");
  assertEquals(resolveTier(), "smart");
  assertEquals(resolveTier(undefined), "smart");
  assertEquals(resolveTier({}), "smart");
});

Deno.test("resolveTier: 'fast' maps to fast, anything else falls back to 'smart'", () => {
  assertEquals(resolveTier({ tier: "fast" }), "fast");
  assertEquals(resolveTier({ tier: "smart" }), "smart");
  // A stray/unknown value degrades to the safe default rather than throwing.
  assertEquals(resolveTier({ tier: "bogus" as unknown as "fast" }), "smart");
});

// ── modelsForTier ────────────────────────────────────────────────────────────

Deno.test("modelsForTier('smart') == today's canonical GEMINI_MODELS order", () => {
  assertEquals(modelsForTier("smart"), GEMINI_MODELS);
  // smart leads with gemini-2.5-flash
  assertEquals(modelsForTier("smart")[0], "gemini-2.5-flash");
  assertEquals(modelsForTier("smart")[0], TIER_GEMINI_MODEL.smart);
});

Deno.test("modelsForTier('fast') leads with gemini-2.0-flash", () => {
  const fast = modelsForTier("fast");
  assertEquals(fast[0], "gemini-2.0-flash");
  assertEquals(fast[0], TIER_GEMINI_MODEL.fast);
});

Deno.test("modelsForTier keeps the FULL degradation chain (every model still reachable, no dupes)", () => {
  for (const tier of ["fast", "smart"] as const) {
    const list = modelsForTier(tier);
    // Same set as GEMINI_MODELS (nothing dropped) ...
    assertEquals([...list].sort(), [...GEMINI_MODELS].sort());
    // ... and no duplicate candidate.
    assertEquals(new Set(list).size, list.length);
  }
});

// ── generateWithToolsStep tier routing ───────────────────────────────────────

Deno.test("generateWithToolsStep: default tier hits gemini-2.5-flash first (smart == today)", async () => {
  const seen: string[] = [];
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(GEMINI_MODELS), text: "סיכום." });
  try {
    const contents = newToolContents([], "שלום");
    const step = await generateWithToolsStep("k", "sys", contents, []);
    assertEquals(seen[0], "gemini-2.5-flash");
    assertEquals(step.text, "סיכום.");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("generateWithToolsStep: tier 'fast' hits gemini-2.0-flash first", async () => {
  const seen: string[] = [];
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(GEMINI_MODELS), text: "סיכום." });
  try {
    const contents = newToolContents([], "שלום");
    await generateWithToolsStep("k", "sys", contents, [], 500, { tier: "fast" });
    assertEquals(seen[0], "gemini-2.0-flash");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("generateWithToolsStep: tier 'smart' (explicit) hits gemini-2.5-flash first", async () => {
  const seen: string[] = [];
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(GEMINI_MODELS), text: "סיכום." });
  try {
    const contents = newToolContents([], "שלום");
    await generateWithToolsStep("k", "sys", contents, [], 500, { tier: "smart" });
    assertEquals(seen[0], "gemini-2.5-flash");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("generateWithToolsStep: 'fast' still 404-falls-through the rest of the chain", async () => {
  // The fast lead (2.0) 404s; the next candidate in the fast order must be tried.
  const seen: string[] = [];
  // Only gemini-2.5-flash answers — fast leads with 2.0 (404) then 2.5 (ok).
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(["gemini-2.5-flash"]), text: "סיכום." });
  try {
    const contents = newToolContents([], "שלום");
    const step = await generateWithToolsStep("k", "sys", contents, [], 500, { tier: "fast" });
    assertEquals(seen[0], "gemini-2.0-flash"); // tried the fast lead first
    assert(seen.includes("gemini-2.5-flash")); // and fell through to the next
    assertEquals(step.text, "סיכום.");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── generateReply tier routing ───────────────────────────────────────────────

Deno.test("generateReply: default tier hits gemini-2.5-flash first (smart == today)", async () => {
  const seen: string[] = [];
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(GEMINI_MODELS), text: "תשובה חמה." });
  try {
    const out = await generateReply({ gemini: "k" }, "sys", [], "שלום", 400);
    assertEquals(seen[0], "gemini-2.5-flash");
    assertEquals(out, "תשובה חמה.");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("generateReply: tier 'fast' hits gemini-2.0-flash first", async () => {
  const seen: string[] = [];
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(GEMINI_MODELS), text: "תשובה חמה." });
  try {
    const out = await generateReply({ gemini: "k" }, "sys", [], "שלום", 400, undefined, { tier: "fast" });
    assertEquals(seen[0], "gemini-2.0-flash");
    assertEquals(out, "תשובה חמה.");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("generateReply: tier 'fast' falls through to the smart model when the fast lead 404s (full chain intact)", async () => {
  const seen: string[] = [];
  globalThis.fetch = recordingGeminiFetch({ seen, okModels: new Set(["gemini-2.5-flash"]), text: "תשובה חמה." });
  try {
    const out = await generateReply({ gemini: "k" }, "sys", [], "שלום", 400, undefined, { tier: "fast" });
    assertEquals(seen[0], "gemini-2.0-flash");
    assert(seen.includes("gemini-2.5-flash"));
    assertEquals(out, "תשובה חמה."); // same grounded answer — never fabricated
  } finally {
    globalThis.fetch = realFetch;
  }
});
