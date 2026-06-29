// Regression tests for _shared/email.ts → resendSend's retry contract, exercised
// through the EXPORTED sendCustomerEmail wrapper (resendSend itself is private,
// but every public send funnels through it, so the wrapper is the stable seam).
//
// The contract under test (email.ts resendSend):
//   • a transient 5xx is retried EXACTLY ONCE — if the second POST succeeds the
//     send returns { ok: true } (two fetches total);
//   • a 4xx is a real client error (bad address/payload) and is NOT retried — a
//     re-POST would just fail again (one fetch total, { ok: false });
//   • a 5xx that stays 5xx is retried once then gives up ({ ok: false }, two
//     fetches) — bounding the retry so a Resend outage can't loop.
//
// We stub globalThis.fetch and count calls. SITE_BASE/observability are dark in
// tests (no SENTRY_DSN), so captureError is a no-op network-wise. Run from
// supabase/functions/:  deno task test
//
// Mirrors the fetch-stub style of google_sheets_test.ts (queued responders,
// captured calls, realFetch restore).

import { assert, assertEquals } from "@std/assert";
import { sendCustomerEmail } from "../_shared/email.ts";

const realFetch = globalThis.fetch;

type Capture = { url: string; body: Record<string, unknown> };

// Record every call; return queued responses in order (extra calls reuse the
// last responder so an unexpected 3rd call surfaces as a still-defined response).
function stubFetch(
  responders: Array<(c: Capture, i: number) => Response>,
): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const i = calls.length;
    calls.push({ url, body });
    return Promise.resolve(responders[Math.min(i, responders.length - 1)]({ url, body }, i));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

// A fully-configured send target (cfg.resend + cfg.resendFrom + `to` all set) so
// resendSend passes its "not configured" guard and actually POSTs to Resend.
const CFG = { resend: "re_test_key", resendFrom: "Switchy AI <hello@switchy-ai.com>" };
const TO = "customer@example.com";

function resendOk(id = "email_123"): Response {
  return new Response(JSON.stringify({ id }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}
function resp(status: number, body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// ── 5xx → retried ONCE → succeeds ────────────────────────────────────────────

Deno.test("resendSend retries ONCE on a 5xx, then succeeds (two POSTs, ok:true)", async () => {
  const s = stubFetch([
    () => resp(503, { message: "service unavailable" }), // first attempt: transient
    () => resendOk(),                                     // retry succeeds
  ]);
  try {
    const r = await sendCustomerEmail(CFG, TO, "נושא", "<p>שלום</p>");
    assertEquals(r.ok, true);
    // Exactly two POSTs: the original + a single retry.
    assertEquals(s.calls.length, 2);
    assertEquals(s.calls[0].url, "https://api.resend.com/emails");
    // Both hit Resend's send endpoint; the retry re-posts the same payload.
    assertEquals(s.calls[1].url, "https://api.resend.com/emails");
    assertEquals(s.calls[1].body.to, [TO]);
  } finally {
    s.restore();
  }
});

// ── 4xx → NOT retried ────────────────────────────────────────────────────────

Deno.test("resendSend does NOT retry a 4xx (one POST, ok:false)", async () => {
  const s = stubFetch([
    () => resp(422, { message: "invalid `to` field" }), // client error — no retry
    () => resendOk(),                                    // must never be reached
  ]);
  try {
    const r = await sendCustomerEmail(CFG, TO, "נושא", "<p>שלום</p>");
    assertEquals(r.ok, false);
    // A 4xx is terminal: a single POST, no retry.
    assertEquals(s.calls.length, 1);
    // The Resend error message is surfaced back to the caller.
    assertEquals(r.error, "invalid `to` field");
  } finally {
    s.restore();
  }
});

// ── 5xx that stays 5xx → retried once, then gives up (bounded) ───────────────

Deno.test("resendSend retries a 5xx at most ONCE then gives up (two POSTs, ok:false)", async () => {
  const s = stubFetch([
    () => resp(500, { message: "boom" }),
    () => resp(500, { message: "boom again" }),
    () => resendOk(), // a 3rd call would mean an unbounded retry — must NOT happen
  ]);
  try {
    const r = await sendCustomerEmail(CFG, TO, "נושא", "<p>שלום</p>");
    assertEquals(r.ok, false);
    // The retry is capped at one: original + one retry = two, never three.
    assertEquals(s.calls.length, 2);
  } finally {
    s.restore();
  }
});

// ── guard: unconfigured cfg short-circuits before any network ────────────────

Deno.test("resendSend makes NO network call when resend/from/to is missing", async () => {
  const s = stubFetch([() => resendOk()]);
  try {
    const r = await sendCustomerEmail({ resend: "", resendFrom: "" }, "", "נושא", "<p/>");
    assertEquals(r.ok, false);
    assertEquals(s.calls.length, 0);
  } finally {
    s.restore();
  }
});
