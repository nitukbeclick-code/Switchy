// Integration tests for site-ai-chat/index.ts AFTER it was routed through the
// shared agent (runAgent({channel:'site'}) + the unified _shared/session.ts).
//
// We capture the REAL Deno.serve handler (see _capture_handler.ts) and drive it
// with synthetic Requests, pinning the function's actual edge behaviour without
// modifying its source. The focus is the WAVE-5 guardrails this fn still owns +
// the agent-routing contract:
//
//   • method gate (405) / input validation (400)
//   • Origin allowlist — corsHeaders reflects an allowlisted Origin only, and the
//     OPTIONS preflight echoes it (a public, paid-LLM endpoint; `*` would let any
//     site spend our quota)
//   • per-IP rate-limit — fail-CLOSED on a DB error (503), 429 when exceeded
//   • graceful degradation — with the AI providers stubbed to fail and no
//     templateFallback, runAgent returns its hard fallback; the customer still
//     gets a 200 reply (never hard-fails), and offerLead fires on switch intent
//   • memory — a sessionId echoes back; the unified session is persisted via the
//     ai_sessions upsert (we assert the write is attempted)
//
// All Supabase + AI calls are intercepted by a per-test fetch stub that is always
// restored afterwards (no global leak, no network, no port).
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// ── Test rig ──────────────────────────────────────────────────────────────────
// SUPABASE_URL + SERVICE_ROLE_KEY must be set so the rate-limit query / session
// upsert actually issue a (stubbed) request — without them serviceFetch returns
// null and the rate-limit gate fails CLOSED (which we test separately by NOT
// stubbing the query). A fake Gemini key passes the "configured" gate; the stub
// then makes every provider fail so the agent degrades deterministically.
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("GEMINI_API_KEY", "fake-gemini-key");
Deno.env.delete("GROQ_API_KEY");
Deno.env.delete("OPENROUTER_API_KEY");
// A known allowlisted origin (the static production app surface).
const ALLOWED_ORIGIN = "https://app.switchy-ai.com";

const handler = await captureServeHandler("../site-ai-chat/index.ts");

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(
    handler(new Request("https://edge/site-ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
      body: JSON.stringify(body),
    })),
  );
}

// PostgREST + AI interceptors. The rate-limit query (GET chat_messages) returns
// `count` synthetic rows; every other Supabase write (chat_messages insert,
// ai_sessions upsert, crm_events / security_audit_log) succeeds minimally; every
// AI provider call FAILS (503) so runAgent degrades to its hard fallback.
function rig(count = 0, writes?: string[]) {
  return [
    // Rate-limit read.
    {
      match: (u: string) => u.includes("/rest/v1/chat_messages?select=id"),
      respond: () => jsonResponse(Array.from({ length: count }, (_, i) => ({ id: `r${i}` }))),
    },
    // Any other Supabase write (insert/upsert) — record + 201.
    {
      match: (u: string) => u.includes("/rest/v1/"),
      respond: (u: string) => {
        writes?.push(u);
        return jsonResponse({}, 201);
      },
    },
    // AI providers all fail → tool loop + text chain no-op.
    {
      match: (u: string) =>
        u.includes("generativelanguage.googleapis.com") ||
        u.includes("api.groq.com") ||
        u.includes("openrouter.ai"),
      respond: () => jsonResponse({ error: "down" }, 503),
    },
  ];
}

// ── method gate + validation ────────────────────────────────────────────────────

Deno.test("rejects non-POST with 405", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/site-ai-chat", { method: "GET" })));
  assertEquals(r.status, 405);
});

Deno.test("rejects an empty message with 400", async () => {
  await withFetchStub(rig(), async () => {
    const r = await post({ message: "   " });
    assertEquals(r.status, 400);
  });
});

Deno.test("rejects an oversized raw payload before any AI work (400)", async () => {
  await withFetchStub(rig(), async () => {
    const r = await post({ message: "א".repeat(2100) });
    assertEquals(r.status, 400);
  });
});

// ── Wave-5: Origin allowlist ────────────────────────────────────────────────────

Deno.test("preflight echoes an allowlisted Origin and POST method", async () => {
  const r = await Promise.resolve(
    handler(new Request("https://edge/site-ai-chat", { method: "OPTIONS", headers: { origin: ALLOWED_ORIGIN } })),
  );
  assertEquals(r.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  assert((r.headers.get("access-control-allow-methods") ?? "").includes("POST"));
});

Deno.test("a disallowed Origin is NOT reflected (paid-endpoint quota guard)", async () => {
  await withFetchStub(rig(), async () => {
    const r = await post({ message: "מה זול?" }, { origin: "https://evil.example.com" });
    assertEquals(r.headers.get("access-control-allow-origin"), null);
  });
});

Deno.test("an allowlisted Origin is reflected on the actual POST response", async () => {
  await withFetchStub(rig(), async () => {
    const r = await post({ message: "מה זול?" }, { origin: ALLOWED_ORIGIN });
    await r.body?.cancel();
    assertEquals(r.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  });
});

// ── Wave-5: rate-limit ──────────────────────────────────────────────────────────

Deno.test("rate-limit fails CLOSED (503) when the DB query errors", async () => {
  // No stub for the chat_messages read ⇒ serviceFetch hits the real fetch which
  // we replace with one that errors for that URL; fetchRows returns null ⇒ 503.
  await withFetchStub([
    {
      match: (u: string) => u.includes("/rest/v1/chat_messages?select=id"),
      respond: () => jsonResponse({ error: "db down" }, 500),
    },
  ], async () => {
    const r = await post({ message: "מה זול?" });
    assertEquals(r.status, 503);
  });
});

Deno.test("returns 429 once the per-IP hourly limit is reached", async () => {
  await withFetchStub(rig(20), async () => {
    const r = await post({ message: "מה זול?" });
    assertEquals(r.status, 429);
  });
});

// ── agent routing: graceful degradation, never hard-fails ───────────────────────

Deno.test("with every provider down the customer still gets a 200 reply (hard fallback)", async () => {
  await withFetchStub(rig(), async () => {
    const r = await post({ message: "מה הכי זול בסלולר?" });
    assertEquals(r.status, 200);
    const body = await r.json();
    assert(typeof body.reply === "string" && body.reply.length > 0, "customer always gets a reply");
  });
});

Deno.test("offerLead fires on a genuine switch intent (and not on a pure info question)", async () => {
  await withFetchStub(rig(), async () => {
    const want = await post({ message: "אני רוצה לעבור לספק אחר" });
    const wantBody = await want.json();
    assertEquals(wantBody.offerLead, true);

    const info = await post({ message: "מה ההבדל בין 4G ל-5G?" });
    const infoBody = await info.json();
    assertFalse(infoBody.offerLead === true);
  });
});

// ── memory: sessionId round-trips + the unified session is persisted ────────────

Deno.test("a valid sessionId echoes back and the ai_sessions upsert is attempted", async () => {
  const writes: string[] = [];
  await withFetchStub(rig(0, writes), async () => {
    const r = await post({ message: "שלום", sessionId: "sess-abcdef123" });
    const body = await r.json();
    assertEquals(body.sessionId, "sess-abcdef123");
    // The unified session.saveSession writes to ai_sessions (best-effort).
    assert(writes.some((u) => u.includes("/rest/v1/ai_sessions")), "session persisted via ai_sessions");
  });
});

Deno.test("an invalid sessionId is dropped (no echo, no session write)", async () => {
  const writes: string[] = [];
  await withFetchStub(rig(0, writes), async () => {
    const r = await post({ message: "שלום", sessionId: "short" }); // < 6 chars ⇒ rejected
    const body = await r.json();
    assertEquals(body.sessionId, undefined);
    assertFalse(writes.some((u) => u.includes("/rest/v1/ai_sessions")));
  });
});

// ── consent-gated client lead capture (the §30A / §11 gate) ─────────────────────

Deno.test("a client-posted lead WITHOUT consent is never captured", async () => {
  const writes: string[] = [];
  await withFetchStub(rig(0, writes), async () => {
    const r = await post({
      message: "תחזרו אלי",
      lead: { name: "דנה כהן", phone: "0501234567", consent: false },
    });
    const body = await r.json();
    assertFalse(body.leadCaptured === true);
    // No leads insert attempted (captureAiLead returns "incomplete" before any write).
    assertFalse(writes.some((u) => u.includes("/rest/v1/leads")));
  });
});

Deno.test("a client-posted lead WITH consent is captured and suppresses the offer", async () => {
  const writes: string[] = [];
  await withFetchStub(rig(0, writes), async () => {
    const r = await post({
      message: "תחזרו אלי עם הצעה",
      lead: { name: "דנה כהן", phone: "0501234567", consent: true, category: "cellular" },
    });
    const body = await r.json();
    assertEquals(body.leadCaptured, true);
    assertFalse(body.offerLead === true, "offer suppressed after a capture");
    assert(writes.some((u) => u.includes("/rest/v1/leads")), "lead row written with consent");
  });
});
