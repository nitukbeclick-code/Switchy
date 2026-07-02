// Regression tests for the request-code RPC SHAPE bug that silently killed
// every OTP email 2026-06-28→07-02: `meeting_otp_try_send` is `returns boolean`,
// so PostgREST answers with the BARE scalar `true` — the old rpcRows parse
// collapsed that to [] and the handler took the outcome-blind "denied" path
// (no send, generic {ok:true}) while the SECURITY DEFINER function had ALREADY
// inserted the OTP row. These tests drive the REAL handler (captured via
// _capture_handler.ts) against the REAL PostgREST wire shapes — a stub that
// returns [true] would have hidden the bug, which is exactly how it slipped.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// Fake project env BEFORE the module import: serviceFetch builds URLs from
// SUPABASE_URL (our stub intercepts them) and the Resend key resolves through
// the env fallback once the vault RPC answers {}. SENTRY_DSN stays unset so
// observability never fires extra fetches into the counters.
Deno.env.set("SUPABASE_URL", "http://sb.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc-test-key");
Deno.env.set("RESEND_API_KEY", "re_test_key");
Deno.env.set("RESEND_FROM", "Switchy AI <hello@switchy-ai.com>");
Deno.env.delete("SENTRY_DSN");

const handler = await captureServeHandler("../meeting-book/index.ts");

// Shared routes: the Vault cfg RPC answers an EMPTY jsonb (→ env fallback) and
// Resend accepts. Each test supplies its own meeting_otp_try_send shape.
function baseRoutes(otpRpcRespond: () => Response) {
  return [
    {
      match: (u: string) => u.includes("/rest/v1/rpc/get_lead_notify_config"),
      respond: () => jsonResponse({}),
    },
    {
      match: (u: string) => u.includes("/rest/v1/rpc/meeting_otp_try_send"),
      respond: otpRpcRespond,
    },
    {
      match: (u: string) => u.includes("api.resend.com/emails"),
      respond: () => jsonResponse({ id: "email_test" }),
    },
  ];
}

// Distinct email + client IP per test: the handler keeps in-memory per-address
// cooldowns and a per-IP throttle in module state that persists across tests.
function requestCode(email: string, ip: string): Request {
  return new Request("http://edge.test/meeting-book", {
    method: "POST",
    // No Origin header: non-browser callers pass the origin allow-list.
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ action: "request-code", email, name: "Shape Test" }),
  });
}

Deno.test("request-code: BARE `true` from the RPC (real PostgREST shape) → email SENT + sent:true", async () => {
  await withFetchStub(baseRoutes(() => jsonResponse(true)), async (calls) => {
    const res = await handler(requestCode("shape-allow@example.com", "10.1.1.1"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    // THE regression: the old parse read [] → "denied" → no sent field, no send.
    assertEquals(body.sent, true);
    assertEquals(calls.filter((u) => u.includes("api.resend.com")).length, 1);
  });
});

Deno.test("request-code: BARE `false` (denied) → outcome-blind {ok:true}, NO send", async () => {
  await withFetchStub(baseRoutes(() => jsonResponse(false)), async (calls) => {
    const res = await handler(requestCode("shape-deny@example.com", "10.1.1.2"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    // Outcome-blind by design: the throttle must not be observable.
    assert(!("sent" in body), `denied path must not expose sent: ${JSON.stringify(body)}`);
    assertEquals(calls.filter((u) => u.includes("api.resend.com")).length, 0);
  });
});

Deno.test("request-code: RPC HTTP failure → fail-soft-allow sends once (sent:true)", async () => {
  await withFetchStub(baseRoutes(() => jsonResponse({ error: "boom" }, 500)), async (calls) => {
    const res = await handler(requestCode("shape-failsoft@example.com", "10.1.1.3"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.sent, true);
    assertEquals(calls.filter((u) => u.includes("api.resend.com")).length, 1);
  });
});

Deno.test("request-code: Resend rejection surfaces sent:false (the honest-fallback trigger)", async () => {
  const routes = baseRoutes(() => jsonResponse(true));
  routes[2] = {
    match: (u: string) => u.includes("api.resend.com/emails"),
    respond: () => jsonResponse({ message: "invalid key" }, 401),
  };
  await withFetchStub(routes, async () => {
    const res = await handler(requestCode("shape-reject@example.com", "10.1.1.4"));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ok, true);
    assertEquals(body.sent, false);
  });
});
