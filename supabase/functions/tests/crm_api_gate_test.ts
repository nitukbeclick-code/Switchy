// On-the-wire tests for the crm-api gate + router (crm-api/index.ts) — the
// first coverage of the ACTUAL HTTP surface, not just the pure helpers:
//
//   • method gate: OPTIONS preflight ok; anything non-POST → 405 (Hebrew, coded).
//   • the 401-vs-403 split: NO bearer → 401; a bearer that fails GoTrue, or a
//     verified user with no CRM access → 403. Fail-closed, zero data reads.
//   • graded roles (C.2) ON THE WIRE: a viewer reads but a viewer's write is
//     refused BEFORE dispatch — not a single lead-table read/write happens.
//   • body shape: invalid JSON / missing action / unknown action → 400 (coded).
//   • the dispatcher's catch: a corrupt DB payload inside a handler → 500.
//
// The real Deno.serve handler is captured via _capture_handler.ts and driven
// with synthetic Requests over a stubbed fetch — no port, no network, no source
// change. Env is set INSIDE each test and restored (test files share the
// process). Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

const handler = await captureServeHandler("../crm-api/index.ts");

const FN_URL = "https://edge/crm-api";
const UID = "9d8f2c44-1111-4222-8333-444455556666";

function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  return fn().finally(() => {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  });
}

// The three reads the ACCESS GATE makes: GoTrue user resolution + the two
// parallel role reads (profiles.is_admin / crm_members.role). Everything the
// gate needs, nothing a handler needs — so a test that expects the gate to
// refuse can assert NO other URL was ever fetched. `extra` routes (a specific
// test's handler-level stubs) are matched FIRST.
type GateOpts = { uid?: string | null; isAdmin?: boolean; role?: "viewer" | "rep" | null };
type Route = Parameters<typeof withFetchStub>[0][number];

function gateRoutes(opts: GateOpts, extra: Route[] = []): Route[] {
  return [
    ...extra,
    {
      match: (u) => u.includes("/auth/v1/user"),
      respond: () => (opts.uid ? jsonResponse({ id: opts.uid }) : new Response("bad token", { status: 401 })),
    },
    {
      match: (u) => u.includes("/rest/v1/profiles") && u.includes("is_admin"),
      respond: () => jsonResponse(opts.isAdmin === undefined ? [] : [{ is_admin: opts.isAdmin }]),
    },
    {
      match: (u) => u.includes("/rest/v1/crm_members") && u.includes("select=role"),
      respond: () => jsonResponse(opts.role ? [{ role: opts.role }] : []),
    },
  ];
}

// True only for the URLs the access gate itself is allowed to touch.
function isGateUrl(u: string): boolean {
  return u.includes("/auth/v1/user") ||
    (u.includes("/rest/v1/profiles") && u.includes("is_admin")) ||
    (u.includes("/rest/v1/crm_members") && u.includes("select=role"));
}

function post(body: unknown, bearer: string | null = "user.jwt"): Request {
  return new Request(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ── method gate ───────────────────────────────────────────────────────────────

Deno.test("crm-api OPTIONS preflight is allowed", async () => {
  const r = await handler(new Request(FN_URL, { method: "OPTIONS" }));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-methods"), "POST, OPTIONS");
});

Deno.test("crm-api non-POST → 405 in Hebrew with the machine code, before any auth work", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: true }), async (calls) => {
      for (const method of ["GET", "PUT", "DELETE"]) {
        const r = await handler(new Request(FN_URL, { method }));
        assertEquals(r.status, 405);
        assertEquals(await r.json(), { error: "שיטת הבקשה אינה נתמכת", code: "method_not_allowed" });
      }
      assertEquals(calls.length, 0, "405 is answered before any network call");
    })
  );
});

// ── the 401-vs-403 split ──────────────────────────────────────────────────────

Deno.test("crm-api POST with NO bearer → 401 (and no network at all)", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({}), async (calls) => {
      const r = await handler(post({ action: "overview" }, null));
      assertEquals(r.status, 401);
      assertEquals(await r.json(), { error: "נדרשת התחברות", code: "unauthorized" });
      assertEquals(calls.length, 0, "a missing bearer is refused without touching GoTrue/DB");
    })
  );
});

Deno.test("crm-api a bearer GoTrue rejects → 403 (present-but-bad token is not a 401)", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: null }), async (calls) => {
      const r = await handler(post({ action: "overview" }));
      assertEquals(r.status, 403);
      assertEquals(await r.json(), { error: "אין הרשאת גישה למערכת", code: "forbidden" });
      assert(calls.every(isGateUrl), "no data URL may be touched on a refused token");
    })
  );
});

Deno.test("crm-api a verified user with NO CRM access → 403, zero data reads", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: false, role: null }), async (calls) => {
      const r = await handler(post({ action: "listLeads" }));
      assertEquals(r.status, 403);
      assertEquals((await r.json()).code, "forbidden");
      assert(calls.every(isGateUrl), `only gate URLs allowed, got: ${calls.join(", ")}`);
    })
  );
});

// ── graded roles (C.2) on the wire ────────────────────────────────────────────

Deno.test("crm-api viewer: a WRITE action is refused with ZERO DB reads beyond the gate", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: false, role: "viewer" }), async (calls) => {
      const r = await handler(
        post({ action: "setLeadStatus", leadId: "a3bb189e-8bf9-3888-9912-ace4e6543002", status: "won" }),
      );
      assertEquals(r.status, 403);
      assertEquals(await r.json(), { error: "אין הרשאה לפעולה זו", code: "forbidden" });
      // The essence of the gate: the refusal happens BEFORE dispatch — the
      // leads table was never read, never patched, nothing was audited.
      assert(calls.every(isGateUrl), `viewer write leaked a DB call: ${calls.join(", ")}`);
    })
  );
});

Deno.test("crm-api viewer: a READ action is allowed through to its handler", async () => {
  await withEnv(() =>
    withFetchStub(
      gateRoutes({ uid: UID, isAdmin: false, role: "viewer" }, [{
        match: (u) => u.includes("/rest/v1/leads?order="),
        respond: () => jsonResponse([{ id: UID, name: "דנה", phone: "0521", status: "new" }]),
      }]),
      async () => {
        const r = await handler(post({ action: "listLeads" }));
        assertEquals(r.status, 200);
        const j = await r.json();
        assertEquals(j.leads.length, 1);
        assertEquals(j.hasMore, false);
      },
    )
  );
});

Deno.test("crm-api rep: an admin-only action (listMembers) → 403 with zero roster reads", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: false, role: "rep" }), async (calls) => {
      const r = await handler(post({ action: "listMembers" }));
      assertEquals(r.status, 403);
      assertEquals((await r.json()).code, "forbidden");
      assert(
        calls.every(isGateUrl),
        "the crm_members ROSTER read (beyond the gate's role read) must not happen",
      );
    })
  );
});

// ── body shape + dispatch failures ────────────────────────────────────────────

Deno.test("crm-api invalid JSON body → 400 (coded), after the gate", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: true }), async () => {
      const r = await handler(post("{not json"));
      assertEquals(r.status, 400);
      assertEquals(await r.json(), { error: "בקשה לא תקינה", code: "bad_request" });
    })
  );
});

Deno.test("crm-api missing action → 400 (coded)", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: true }), async () => {
      const r = await handler(post({}));
      assertEquals(r.status, 400);
      assertEquals(await r.json(), { error: "action חסר", code: "bad_request" });
    })
  );
});

Deno.test("crm-api unknown action → 400 unknown_action, nothing dispatched", async () => {
  await withEnv(() =>
    withFetchStub(gateRoutes({ uid: UID, isAdmin: true }), async (calls) => {
      const r = await handler(post({ action: "dropEverything" }));
      assertEquals(r.status, 400);
      const j = await r.json();
      assertEquals(j.code, "unknown_action");
      assert(String(j.error).includes("dropEverything"));
      assert(calls.every(isGateUrl), "an unknown action must not reach any table");
    })
  );
});

Deno.test("crm-api a handler blowing up on a corrupt DB payload → 500 server_error", async () => {
  await withEnv(() =>
    withFetchStub(
      gateRoutes({ uid: UID, isAdmin: true }, [{
        // PostgREST "returns" a corrupt row — shapeContact derefs null → throw,
        // which must land in the dispatcher's catch, not leak a stack trace.
        match: (u) => u.includes("/rest/v1/whatsapp_contacts"),
        respond: () => jsonResponse([null]),
      }]),
      async () => {
        const r = await handler(post({ action: "listContacts" }));
        assertEquals(r.status, 500);
        assertEquals(await r.json(), { error: "אירעה שגיאה בשרת", code: "server_error" });
      },
    )
  );
});
