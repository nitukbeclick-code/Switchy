// Unit tests for _shared/observability.ts — the fail-soft Sentry capture shim.
//
// Contract under test:
//   1) parseDsn — PURE: a valid DSN yields the legacy store endpoint + public
//      key; empty/garbage yields null (the dark path).
//   2) DARK (no DSN): captureError/captureMessage make NO network call and never
//      throw. We pass dsn:"" explicitly so the test never touches Vault/config.
//   3) CONFIGURED (DSN set): exactly one fail-soft POST to the parsed Sentry
//      store endpoint, carrying the X-Sentry-Auth public key + a Sentry-shaped
//      event body (event_id, level, message, exception for errors).
//   4) A thrown/rejected fetch is swallowed — capture still resolves, no throw.
//
// send() is FIRE-AND-FORGET (the public fns don't await the POST), so after each
// capture we yield a few microtasks (flushMicrotasks) before asserting on calls.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertExists, assertFalse, assertStringIncludes } from "@std/assert";
import { captureError, captureMessage, parseDsn } from "../_shared/observability.ts";

const realFetch = globalThis.fetch;

type Capture = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

// Record every call; return a queued response per call (extra calls reuse the
// last responder). Mirrors the stub in google_sheets_test.ts.
function stubFetch(
  responders: Array<(c: Capture, i: number) => Response>,
): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers: Record<string, string> = {};
    const h = init?.headers;
    if (h && typeof h === "object" && !Array.isArray(h)) {
      for (const [k, v] of Object.entries(h as Record<string, string>)) headers[k] = String(v);
    }
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const c: Capture = { url, headers, body };
    const i = calls.length;
    calls.push(c);
    return Promise.resolve(responders[Math.min(i, responders.length - 1)](c, i));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

function sentryOk(): Response {
  return new Response(JSON.stringify({ id: "abc" }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// Let the fire-and-forget POST (and its .then/.catch) run before we assert.
async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

const DSN = "https://pub1234567890abcdef@o42.ingest.sentry.io/55555";

// ── parseDsn: PURE ───────────────────────────────────────────────────────────

Deno.test("parseDsn derives the store endpoint + public key from a valid DSN", () => {
  const t = parseDsn(DSN);
  assertExists(t);
  assertEquals(t!.publicKey, "pub1234567890abcdef");
  assertEquals(t!.projectId, "55555");
  assertEquals(t!.storeUrl, "https://o42.ingest.sentry.io/api/55555/store/");
});

Deno.test("parseDsn handles a self-hosted DSN with a path prefix + explicit port", () => {
  const t = parseDsn("http://abc@sentry.local:9000/team/77");
  assertExists(t);
  assertEquals(t!.publicKey, "abc");
  assertEquals(t!.projectId, "77");
  // the prefix segment ('team') is preserved before /api/{projectId}/store/
  assertEquals(t!.storeUrl, "http://sentry.local:9000/team/api/77/store/");
});

Deno.test("parseDsn returns null for empty / garbage / incomplete DSNs (dark path)", () => {
  assertEquals(parseDsn(""), null);
  assertEquals(parseDsn("   "), null);
  assertEquals(parseDsn("not-a-url"), null);
  // missing public key (no userinfo)
  assertEquals(parseDsn("https://o42.ingest.sentry.io/55555"), null);
  // missing project id (no path segment)
  assertEquals(parseDsn("https://pub@o42.ingest.sentry.io"), null);
});

// ── DARK: no DSN ⇒ no network, never throws ──────────────────────────────────

Deno.test("captureError is a no-op (no fetch) when the DSN is unset, and never throws", async () => {
  const s = stubFetch([() => sentryOk()]);
  try {
    await captureError(new Error("boom"), { where: "test" }, ""); // explicit '' ⇒ dark
    await flushMicrotasks();
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

Deno.test("captureMessage is a no-op (no fetch) when the DSN is unset, and never throws", async () => {
  const s = stubFetch([() => sentryOk()]);
  try {
    await captureMessage("hello", { k: 1 }, "");
    await flushMicrotasks();
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});

// ── CONFIGURED: one fail-soft POST with the right shape ──────────────────────

Deno.test("captureError POSTs ONE Sentry envelope to the parsed store endpoint with the right shape", async () => {
  const s = stubFetch([() => sentryOk()]);
  try {
    await captureError(new TypeError("kaboom"), { lead: "x1", n: 3 }, DSN);
    await flushMicrotasks();
    assertEquals(s.calls.length, 1);
    const c = s.calls[0];
    // URL = the parsed store endpoint
    assertEquals(c.url, "https://o42.ingest.sentry.io/api/55555/store/");
    // auth header carries the PUBLIC key (never the full DSN)
    assertStringIncludes(c.headers["X-Sentry-Auth"] ?? "", "sentry_key=pub1234567890abcdef");
    assertStringIncludes(c.headers["X-Sentry-Auth"] ?? "", "sentry_version=7");
    // body is a Sentry "store" event
    assertEquals(c.body.level, "error");
    assertEquals(c.body.message, "kaboom");
    assertExists(c.body.event_id);
    // event_id is 32 hex chars, no dashes
    assert(/^[0-9a-f]{32}$/.test(String(c.body.event_id)));
    // exception carries the error type + value
    const ex = c.body.exception as { values?: Array<{ type?: string; value?: string }> };
    assertEquals(ex?.values?.[0]?.type, "TypeError");
    assertEquals(ex?.values?.[0]?.value, "kaboom");
    // context is attached under `extra` (JSON-safe)
    assertEquals((c.body.extra as Record<string, unknown>)?.lead, "x1");
    assertEquals((c.body.extra as Record<string, unknown>)?.n, 3);
  } finally {
    s.restore();
  }
});

Deno.test("captureMessage POSTs an info-level event with no exception block", async () => {
  const s = stubFetch([() => sentryOk()]);
  try {
    await captureMessage("just fyi", { src: "cron" }, DSN);
    await flushMicrotasks();
    assertEquals(s.calls.length, 1);
    const c = s.calls[0];
    assertEquals(c.url, "https://o42.ingest.sentry.io/api/55555/store/");
    assertEquals(c.body.level, "info");
    assertEquals(c.body.message, "just fyi");
    assertFalse("exception" in c.body); // message capture carries no exception
    assertEquals((c.body.extra as Record<string, unknown>)?.src, "cron");
  } finally {
    s.restore();
  }
});

// ── A thrown fetch is swallowed (fail-soft) ──────────────────────────────────

Deno.test("captureError swallows a fetch that throws — resolves, never rejects", async () => {
  const s = stubFetch([() => { throw new Error("network down"); }]);
  try {
    // Must not reject; the rejected/thrown fetch is caught inside send().
    await captureError(new Error("x"), undefined, DSN);
    await flushMicrotasks();
    assertEquals(s.calls.length, 1); // the attempt was made
  } finally {
    s.restore();
  }
});

Deno.test("captureError swallows a fetch that rejects asynchronously — never rejects", async () => {
  const s = stubFetch([() => { /* unreachable */ return sentryOk(); }]);
  // Override with a rejecting fetch for this case.
  globalThis.fetch = (() => Promise.reject(new Error("ECONNRESET"))) as typeof globalThis.fetch;
  try {
    await captureError(new Error("y"), { a: 1 }, DSN);
    await flushMicrotasks();
    // No assertion on call count (our reject-fetch isn't the recording stub);
    // the point is that the await above resolved without throwing.
    assert(true);
  } finally {
    s.restore();
  }
});
