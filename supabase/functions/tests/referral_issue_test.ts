// Unit tests for the referral-issue edge function (referral-issue/index.ts) —
// the thin, rate-limited, FAIL-SOFT wrapper that mints + persists an app-channel
// referral code. We capture the REAL request handler (see _capture_handler.ts)
// and drive it with synthetic Requests, so these tests pin the function's actual
// behaviour without modifying its source:
//
//   • GET health + OPTIONS preflight + the 405 method gate
//   • CORS origin policy (exact-origin echo, "null" for a stranger, "*" app path)
//   • fail-soft contract: NO service-role env ⇒ still 200 { ok:true, persisted:false }
//     with a real, well-formed code — the share UX never dead-ends
//   • persisted path: the row lands in referral_codes with channel 'app'
//   • per-IP throttle: over the cap the client STILL gets a code, but no row is
//     written (persisted:false) — and other IPs are unaffected
//
// The pure builders (makeReferralCode / buildReferralRow) are covered in
// agent_tools_test.ts; this file covers the handler wrapper itself.
// DB writes are intercepted via a per-test fetch stub that is always restored
// (no network, no port). Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";
import { __resetRateLimitForTests } from "../_shared/ratelimit.ts";

// ── Test rig ──────────────────────────────────────────────────────────────────
// Default posture: NO service-role env, so issueReferralCode fails soft (null)
// and the handler must take the unpersisted-code path. Individual tests that
// exercise the persisted path set the env inside a try/finally.
Deno.env.delete("SUPABASE_URL");
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

const handler = await captureServeHandler("../referral-issue/index.ts");

// Matches the unambiguous-alphabet contract of _shared/referrals.ts:
// "SW-" + 6 of [A-Z2-9] minus lookalikes 0/O, 1/I/L.
const CODE_RE = /^SW-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

function post(opts: { body?: unknown; rawBody?: string; origin?: string; ip?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.origin) headers["Origin"] = opts.origin;
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  return Promise.resolve(handler(new Request("https://edge/referral-issue", {
    method: "POST",
    headers,
    body: opts.rawBody ?? JSON.stringify(opts.body ?? {}),
  })));
}

// Intercepts the PostgREST insert into referral_codes, recording each row.
function referralSink(rows: Array<Record<string, unknown>>) {
  return [{
    match: (u: string) => u.includes("/rest/v1/referral_codes"),
    respond: (_u: string, init?: RequestInit) => {
      rows.push(JSON.parse(String(init?.body ?? "{}")));
      return jsonResponse({}, 201);
    },
  }];
}

// Run `fn` with the service-role env set (and a DB stub installed), always
// restoring the env-less default so later tests keep the fail-soft posture.
async function withDbEnv(rows: Array<Record<string, unknown>>, fn: () => Promise<void>): Promise<void> {
  Deno.env.set("SUPABASE_URL", "https://db.test");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
  try {
    await withFetchStub(referralSink(rows), fn);
  } finally {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
}

// ── health + method gate ──────────────────────────────────────────────────────

Deno.test("referral-issue GET is a health probe", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/referral-issue", { method: "GET" })));
  assertEquals(r.status, 200);
  assertStringIncludes(await r.text(), "referral-issue: ok");
});

Deno.test("referral-issue OPTIONS preflight succeeds with CORS headers", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/referral-issue", {
    method: "OPTIONS",
    headers: { "Origin": "https://switchy-ai.com" },
  })));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("Access-Control-Allow-Origin"), "https://switchy-ai.com");
  assertStringIncludes(r.headers.get("Access-Control-Allow-Headers") ?? "", "apikey");
  await r.body?.cancel();
});

Deno.test("referral-issue rejects other methods with 405", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/referral-issue", { method: "DELETE" })));
  assertEquals(r.status, 405);
  assertEquals((await r.json()).ok, false);
});

// ── CORS origin policy ────────────────────────────────────────────────────────

Deno.test("referral-issue CORS: allowed origin echoed, stranger gets 'null', app (no Origin) gets '*'", async () => {
  const allowed = await post({ origin: "https://www.switchy-ai.com", ip: "10.0.0.1" });
  assertEquals(allowed.headers.get("Access-Control-Allow-Origin"), "https://www.switchy-ai.com");
  assertEquals(allowed.headers.get("Vary"), "Origin");
  await allowed.body?.cancel();

  const stranger = await post({ origin: "https://evil.example", ip: "10.0.0.1" });
  assertEquals(stranger.headers.get("Access-Control-Allow-Origin"), "null");
  await stranger.body?.cancel();

  const app = await post({ ip: "10.0.0.1" }); // Flutter app sends no Origin
  assertEquals(app.headers.get("Access-Control-Allow-Origin"), "*");
  await app.body?.cancel();
});

// ── fail-soft: no service-role env ⇒ unpersisted but REAL code ────────────────

Deno.test("referral-issue without DB env still returns a well-formed code (persisted:false)", async () => {
  const r = await post({ ip: "10.0.0.2" });
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.ok, true);
  assertEquals(j.persisted, false);
  assert(CODE_RE.test(j.code), `malformed code: ${j.code}`);
});

Deno.test("referral-issue tolerates a malformed / empty body (all fields optional)", async () => {
  const r = await post({ rawBody: "{ not json", ip: "10.0.0.3" });
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.ok, true);
  assert(CODE_RE.test(j.code), `malformed code: ${j.code}`);
});

// ── persisted path: the row lands in referral_codes, channel 'app' ────────────

Deno.test("referral-issue persists an app-channel row with attribution and returns its code", async () => {
  const rows: Array<Record<string, unknown>> = [];
  await withDbEnv(rows, async () => {
    const r = await post({
      body: { name: "דנה", conversationId: "conv-42", contact: "0501234567" },
      ip: "10.0.0.4",
    });
    assertEquals(r.status, 200);
    const j = await r.json();
    assertEquals(j.ok, true);
    assertEquals(j.persisted, true);
    assert(CODE_RE.test(j.code), `malformed code: ${j.code}`);

    assertEquals(rows.length, 1);
    assertEquals(rows[0].channel, "app");
    assertEquals(rows[0].code, j.code); // the returned code IS the stored code
    assertEquals(rows[0].referrer_name, "דנה");
    assertEquals(rows[0].referrer_contact, "0501234567");
    assertEquals(rows[0].conversation_id, "conv-42");
    assertEquals(rows[0].source, "agent");
  });
});

Deno.test("referral-issue ignores non-string attribution fields (never throws)", async () => {
  const rows: Array<Record<string, unknown>> = [];
  await withDbEnv(rows, async () => {
    const r = await post({ body: { name: 42, contact: { nested: true } }, ip: "10.0.0.5" });
    assertEquals((await r.json()).persisted, true);
    assertEquals(rows[0].referrer_name, null);
    assertEquals(rows[0].referrer_contact, null);
  });
});

// ── per-IP throttle: over the cap ⇒ code still issued, row NOT written ────────

Deno.test("referral-issue throttles the 21st request per IP but never dead-ends the share UX", async () => {
  __resetRateLimitForTests(); // own the whole window for these IPs
  const rows: Array<Record<string, unknown>> = [];
  await withDbEnv(rows, async () => {
    for (let i = 0; i < 20; i++) {
      const j = await (await post({ ip: "10.9.9.9" })).json();
      assertEquals(j.persisted, true, `request ${i + 1} should persist`);
    }
    assertEquals(rows.length, 20);

    // 21st from the SAME IP: throttled — still ok:true with a REAL code, but
    // nothing is written (attribution is simply not recorded).
    const throttled = await (await post({ ip: "10.9.9.9" })).json();
    assertEquals(throttled.ok, true);
    assertEquals(throttled.persisted, false);
    assert(CODE_RE.test(throttled.code), `malformed code: ${throttled.code}`);
    assertEquals(rows.length, 20, "throttled request must not insert a row");

    // The first x-forwarded-for hop is the bucket key: a proxy-suffixed variant
    // of the hot IP is throttled too…
    const sameHop = await (await post({ ip: "10.9.9.9, 172.16.0.1" })).json();
    assertEquals(sameHop.persisted, false);

    // …while a genuinely different client is unaffected.
    const otherIp = await (await post({ ip: "10.8.8.8" })).json();
    assertEquals(otherIp.persisted, true);
    assertEquals(rows.length, 21);
  });
  __resetRateLimitForTests(); // leave no window state for other test files
});
