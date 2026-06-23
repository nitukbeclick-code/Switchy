// Unit tests for the analytics-track pure helpers (analytics-track/lib.ts): the
// event allowlist gate, the props sanitiser (the function's main security
// boundary — it must drop nested/PII-shaped blobs and bound size), and the
// trusted client-IP picker (must never trust the spoofable first XFF hop). No
// network, no env, no Deno.serve. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  ALLOWED_EVENTS,
  clientIp,
  isAllowedEvent,
  MAX_EVENT_LEN,
  MAX_PROPS_BYTES,
  sanitizeProps,
} from "../analytics-track/lib.ts";
import { KNOWN_EVENTS } from "../admin-metrics/metrics.ts";

// ── isAllowedEvent / ALLOWED_EVENTS: the writer allowlist ─────────────────────

Deno.test("isAllowedEvent accepts every known funnel event", () => {
  for (const e of ALLOWED_EVENTS) assert(isAllowedEvent(e), `expected allowed: ${e}`);
});

Deno.test("isAllowedEvent rejects unknown / empty / oversized names", () => {
  for (const bad of ["", "  ", "unknownEvent", "leadstart", "DROP TABLE", "x".repeat(MAX_EVENT_LEN + 1)]) {
    assertFalse(isAllowedEvent(bad), `expected rejected: ${JSON.stringify(bad)}`);
  }
});

Deno.test("ALLOWED_EVENTS (writer) and KNOWN_EVENTS (reader) stay in lockstep", () => {
  // Drift in either direction means the dashboard silently misses a real event
  // or rolls up one the app can't emit — this pins both sides to one another.
  assertEquals([...ALLOWED_EVENTS].sort(), [...KNOWN_EVENTS].sort());
});

// ── sanitizeProps: scalar-only, clamped, size-bounded jsonb bag ───────────────

Deno.test("sanitizeProps keeps plain scalars (string/number/bool)", () => {
  assertEquals(
    sanitizeProps({ provider: "פרטנר", price: 39, isHot: true }),
    { provider: "פרטנר", price: 39, isHot: true },
  );
});

Deno.test("sanitizeProps drops nested objects, arrays, null and non-finite numbers", () => {
  const out = sanitizeProps({
    nested: { a: 1 }, // object → dropped
    list: [1, 2, 3], // array → dropped
    empty: null, // null → dropped
    nan: Number.NaN, // non-finite → dropped
    inf: Number.POSITIVE_INFINITY, // non-finite → dropped
    keep: "ok", // scalar survives
  });
  assertEquals(out, { keep: "ok" });
});

Deno.test("sanitizeProps returns {} for non-object inputs", () => {
  for (const raw of ["a string", 7, true, null, undefined, [1, 2], () => {}]) {
    assertEquals(sanitizeProps(raw), {});
  }
});

Deno.test("sanitizeProps clamps long string values to 200 chars", () => {
  const out = sanitizeProps({ note: "x".repeat(500) });
  assertEquals((out.note as string).length, 200);
});

Deno.test("sanitizeProps drops keys that are empty or longer than 40 chars", () => {
  const out = sanitizeProps({ "": "skip", ["k".repeat(41)]: "skip", ok: "keep" });
  assertEquals(out, { ok: "keep" });
});

Deno.test("sanitizeProps drops the whole bag when it exceeds the byte ceiling", () => {
  // Many max-length scalar values blows past MAX_PROPS_BYTES → entire bag dropped.
  const big: Record<string, string> = {};
  for (let i = 0; i < 50; i++) big[`k${i}`] = "v".repeat(200);
  const out = sanitizeProps(big);
  assertEquals(out, {});
  assert(JSON.stringify(big).length > MAX_PROPS_BYTES); // sanity: the input really is over budget
});

// ── clientIp: trust the CDN header / last XFF hop, never the first ────────────

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://edge.example/functions/v1/analytics-track", { method: "POST", headers });
}

Deno.test("clientIp prefers the CDN-set cf-connecting-ip header", () => {
  const r = reqWith({ "cf-connecting-ip": " 203.0.113.7 ", "x-forwarded-for": "9.9.9.9" });
  assertEquals(clientIp(r), "203.0.113.7"); // trimmed, CDN wins
});

Deno.test("clientIp takes the LAST (infra-appended) XFF hop, not the spoofable first", () => {
  // The client can prepend anything; only the rightmost hop is infra-trusted.
  const r = reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 198.51.100.4" });
  assertEquals(clientIp(r), "198.51.100.4");
});

Deno.test("clientIp returns '' when no trusted header is present", () => {
  assertEquals(clientIp(reqWith({})), "");
  // an all-blank XFF yields no usable hop
  assertEquals(clientIp(reqWith({ "x-forwarded-for": " , , " })), "");
});
