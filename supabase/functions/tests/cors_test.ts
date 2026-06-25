// Unit tests for the shared CORS allowlist (_shared/cors.ts) that fronts the
// public, paid-LLM site-* endpoints. The point of these tests is to PIN the
// security property: an off-allowlist origin must NOT receive an
// Access-Control-Allow-Origin header (the browser then blocks the cross-origin
// read), while the production surfaces + localhost + *.vercel.app do.
// No network, no env. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import { corsHeaders, isAllowedOrigin, preflight } from "../_shared/cors.ts";

function reqFrom(origin?: string): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set("origin", origin);
  return new Request("https://edge.example/functions/v1/site-ai-chat", { method: "POST", headers });
}

// ── isAllowedOrigin: the allowlist itself ─────────────────────────────────────

Deno.test("isAllowedOrigin accepts the production site surfaces", () => {
  assert(isAllowedOrigin("https://switchy-ai.com"));
  assert(isAllowedOrigin("https://www.switchy-ai.com"));
  assert(isAllowedOrigin("https://app.switchy-ai.com"));
});

Deno.test("isAllowedOrigin accepts localhost (any port) for dev", () => {
  assert(isAllowedOrigin("http://localhost"));
  assert(isAllowedOrigin("http://localhost:3000"));
  assert(isAllowedOrigin("http://127.0.0.1:5173"));
});

Deno.test("isAllowedOrigin accepts a *.vercel.app preview alias", () => {
  assert(isAllowedOrigin("https://switchy-ai-git-main.vercel.app"));
  assert(isAllowedOrigin("https://chosech-abc123.vercel.app"));
});

Deno.test("isAllowedOrigin REJECTS an arbitrary third-party site", () => {
  assertFalse(isAllowedOrigin("https://evil.example.com"));
  assertFalse(isAllowedOrigin("https://switchy-ai.com.evil.com"));
  assertFalse(isAllowedOrigin("http://switchy-ai.com")); // http (not https) prod
  assertFalse(isAllowedOrigin(""));
  // a vercel look-alike on the wrong TLD
  assertFalse(isAllowedOrigin("https://evil.vercel.app.attacker.com"));
});

// ── corsHeaders: reflect only an allowed origin ───────────────────────────────

Deno.test("corsHeaders reflects an allowed Origin + sets Vary", () => {
  const h = corsHeaders(reqFrom("https://app.switchy-ai.com"));
  assertEquals(h["Access-Control-Allow-Origin"], "https://app.switchy-ai.com");
  assertEquals(h["Vary"], "Origin");
});

Deno.test("corsHeaders OMITS Allow-Origin for a disallowed Origin", () => {
  const h = corsHeaders(reqFrom("https://evil.example.com"));
  assert(!("Access-Control-Allow-Origin" in h), "must not reflect a disallowed origin");
  // Vary:Origin is still set so caches don't reuse a same-path response across origins
  assertEquals(h["Vary"], "Origin");
});

Deno.test("corsHeaders OMITS Allow-Origin when there is no Origin header", () => {
  const h = corsHeaders(reqFrom());
  assert(!("Access-Control-Allow-Origin" in h));
});

Deno.test("corsHeaders never emits a wildcard '*'", () => {
  for (const o of ["https://app.switchy-ai.com", "https://evil.example.com", ""]) {
    const h = corsHeaders(reqFrom(o));
    assert(h["Access-Control-Allow-Origin"] !== "*", `wildcard leaked for origin '${o}'`);
  }
});

// ── preflight: methods + allowlisted reflection ───────────────────────────────

Deno.test("preflight advertises POST/OPTIONS and reflects an allowed origin", () => {
  const res = preflight(reqFrom("https://switchy-ai.com"));
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://switchy-ai.com");
});

Deno.test("preflight does not reflect a disallowed origin", () => {
  const res = preflight(reqFrom("https://evil.example.com"));
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});
