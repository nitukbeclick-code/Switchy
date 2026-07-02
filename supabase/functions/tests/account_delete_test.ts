// Tests for the account-delete edge function (account-delete/index.ts + lib.ts):
//
//   • PURE lib helpers — scrub payload shapes (NOT-NULL columns take ''),
//     IL phone normalization, the contactFilters cross-user guard (empty
//     profile contact → NO contact-matched filter), and the plan invariant
//     that deleteUser is ALWAYS the last op.
//   • The REAL request handler (captured via _capture_handler.ts, no port):
//     CORS preflight echo, GET health, fail-closed 401 without a bearer,
//     400 without confirm:"DELETE", per-IP throttle 429, and the execution
//     contract — the admin delete URL is hit LAST, storage failure stays
//     fail-soft ({ ok:true }), a failed auth delete is the ONLY { ok:false }.
//
// Fetch-stub style mirrors community_notify_test.ts (withFetchStub routes,
// always restored). Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";
import {
  contactFilters,
  normalizeIlPhone,
  planAccountDeletion,
  SCRUB_LEAD_PAYLOAD,
  SCRUB_MEETING_PAYLOAD,
  waPhoneFromProfile,
} from "../account-delete/lib.ts";

// Order-independence guard (same as the retry/email test files): a leaked
// SUPABASE_URL/KEY from an earlier test file would arm observability's error
// capture and fire extra PostgREST fetches into our stubs — force it dark.
Deno.env.delete("SUPABASE_URL");
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

const handler = await captureServeHandler("../account-delete/index.ts");

// ── PURE lib ─────────────────────────────────────────────────────────────────

Deno.test("scrub payloads blank NOT-NULL columns to '' and null the nullable ones", () => {
  // leads: name + phone are NOT NULL (schema.sql) — '' not null.
  assertEquals(SCRUB_LEAD_PAYLOAD.name, "");
  assertEquals(SCRUB_LEAD_PAYLOAD.phone, "");
  assertEquals(SCRUB_LEAD_PAYLOAD.email, null);
  assertEquals(SCRUB_LEAD_PAYLOAD.notes, null);
  // meetings mirrors the same nullable-ness (meetings-2026-06.sql).
  assertEquals(SCRUB_MEETING_PAYLOAD.name, "");
  assertEquals(SCRUB_MEETING_PAYLOAD.phone, "");
  assertEquals(SCRUB_MEETING_PAYLOAD.email, null);
  assertEquals(SCRUB_MEETING_PAYLOAD.notes, null);
});

Deno.test("normalizeIlPhone folds every IL spelling to E.164 and rejects junk", () => {
  assertEquals(normalizeIlPhone("052-123 4567"), "+972521234567");
  assertEquals(normalizeIlPhone("+972521234567"), "+972521234567");
  assertEquals(normalizeIlPhone("972521234567"), "+972521234567");
  assertEquals(normalizeIlPhone("not a phone"), "");
  assertEquals(normalizeIlPhone(""), "");
});

Deno.test("waPhoneFromProfile emits the wa_phone digits form (no '+')", () => {
  assertEquals(waPhoneFromProfile({ phone: "052-1234567" }), "972521234567");
  assertEquals(waPhoneFromProfile({ phone: "junk" }), "");
  assertEquals(waPhoneFromProfile({}), "");
});

Deno.test("contactFilters: empty profile contact → NO filter (cross-user guard)", () => {
  assertEquals(contactFilters({}), { phone: null, email: null });
  assertEquals(contactFilters({ phone: "", email: "" }), { phone: null, email: null });
  // Junk phone / non-address email must NEVER become a filter either.
  assertEquals(contactFilters({ phone: "abc", email: "not-an-email" }), { phone: null, email: null });
});

Deno.test("contactFilters: real contacts produce PostgREST in-list filters", () => {
  const f = contactFilters({ phone: "052-1234567", email: "Dana@Example.com" });
  assert(f.phone !== null && f.phone.startsWith("phone=in.("));
  // All three stored spellings of the same number are matched.
  assertStringIncludes(f.phone!, encodeURIComponent('"+972521234567"'));
  assertStringIncludes(f.phone!, encodeURIComponent('"0521234567"'));
  assertStringIncludes(f.phone!, encodeURIComponent('"972521234567"'));
  assert(f.email !== null && f.email.startsWith("email=in.("));
  // As-typed AND lowercased spellings.
  assertStringIncludes(f.email!, encodeURIComponent('"Dana@Example.com"'));
  assertStringIncludes(f.email!, encodeURIComponent('"dana@example.com"'));
});

Deno.test("planAccountDeletion: ordered, contact-gated, and ALWAYS ends with deleteUser", () => {
  const full = planAccountDeletion(
    "u-1",
    { phone: "0521234567", email: "a@b.com" },
    "sess-1",
  );
  const ops = full.map((o) => o.op);
  assertEquals(ops[ops.length - 1], "deleteUser");
  assertEquals(ops.filter((o) => o === "deleteUser").length, 1);
  // Cancel BEFORE scrub BEFORE the rest; storage + audit before deleteUser.
  assert(ops.indexOf("cancelOpenMeetings") < ops.indexOf("scrubMeetings"));
  assert(ops.indexOf("scrubMeetings") < ops.indexOf("scrubLeads"));
  assert(ops.indexOf("scrubLeads") < ops.indexOf("deleteWhatsappContact"));
  assert(ops.indexOf("deleteStorageObjects") < ops.indexOf("auditAndSuppress"));
  assert(ops.indexOf("auditAndSuppress") < ops.indexOf("deleteUser"));
  assert(ops.includes("deleteAiSession") && ops.includes("deleteEmailOtps"));

  // No contacts + no session id → the contact-gated ops are NOT planned.
  const bare = planAccountDeletion("u-1", {}).map((o) => o.op);
  assertEquals(bare[bare.length - 1], "deleteUser");
  assert(!bare.includes("deleteWhatsappContact"));
  assert(!bare.includes("deleteAiSession"));
  assert(!bare.includes("deleteEmailOtps"));
});

// ── Handler rig ──────────────────────────────────────────────────────────────

const BASE = "https://acct-del.test";
const UID = "uid-123";

function withEnv(fn: () => Promise<void>): Promise<void> {
  Deno.env.set("SUPABASE_URL", BASE);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  return fn().finally(() => {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  });
}

// Each test gets its OWN x-forwarded-for so the 3/hour per-IP throttle of one
// test never bleeds into another (the limiter is process-local module state).
function post(ip: string, body: unknown, bearer = ""): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-forwarded-for": ip,
  };
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
  return Promise.resolve(handler(new Request("https://edge/account-delete", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })));
}

type Sink = { waDeletes: string[]; suppressions: Array<Record<string, unknown>>; adminDeletes: string[] };

// The full happy-path PostgREST/GoTrue/Storage surface, in specific-first order.
// Everything under BASE is owned by a route (plus a catch-all) so no request
// ever leaks to the real network.
function routesFor(sink: Sink, opts: { storageFails?: boolean; adminStatus?: number } = {}) {
  const adminStatus = opts.adminStatus ?? 204;
  return [
    {
      match: (u: string) => u.includes("/auth/v1/admin/users/"),
      respond: (u: string) => {
        sink.adminDeletes.push(u);
        return adminStatus === 204
          ? new Response(null, { status: 204 })
          : jsonResponse({ error: "boom" }, adminStatus);
      },
    },
    {
      match: (u: string) => u.includes("/auth/v1/user"),
      respond: () => jsonResponse({ id: UID }),
    },
    {
      match: (u: string) => u.includes("/rest/v1/profiles"),
      respond: () => jsonResponse([{ name: "דנה", phone: "052-1234567", email: "Dana@Example.com" }]),
    },
    {
      match: (u: string, i?: RequestInit) => u.includes("/rest/v1/meetings") && (i?.method ?? "GET") === "GET",
      respond: () => jsonResponse([{ id: "m1", status: "pending" }]),
    },
    {
      match: (u: string, i?: RequestInit) => u.includes("/rest/v1/meetings") && i?.method === "PATCH",
      respond: () => jsonResponse([{ id: "m1" }]),
    },
    {
      match: (u: string) => u.includes("/rest/v1/whatsapp_contacts"),
      respond: (u: string) => {
        sink.waDeletes.push(u);
        return jsonResponse([{ id: "wa1" }]);
      },
    },
    {
      match: (u: string) => u.includes("/rest/v1/marketing_suppression"),
      respond: (_u: string, i?: RequestInit) => {
        try {
          sink.suppressions.push(JSON.parse(String(i?.body ?? "{}")));
        } catch { /* ignore */ }
        return jsonResponse({}, 201);
      },
    },
    {
      match: (u: string) => u.includes("/storage/v1/object/list/community-media"),
      respond: () => opts.storageFails ? jsonResponse({ error: "storage down" }, 500) : jsonResponse([{ name: "a.jpg" }]),
    },
    {
      match: (u: string, i?: RequestInit) => u.includes("/storage/v1/object/community-media") && i?.method === "DELETE",
      respond: () => jsonResponse([{ name: "a.jpg" }]),
    },
    // Catch-all for the rest of the PostgREST surface (leads/ai_sessions/otps/
    // community/meeting_events/security_audit_log): empty representation.
    {
      match: (u: string) => u.startsWith(BASE),
      respond: () => jsonResponse([]),
    },
  ];
}

function freshSink(): Sink {
  return { waDeletes: [], suppressions: [], adminDeletes: [] };
}

// ── CORS + health + gates ────────────────────────────────────────────────────

Deno.test("account-delete OPTIONS echoes the CORS preflight headers", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/account-delete", {
    method: "OPTIONS",
    headers: { "Origin": "https://switchy-ai.com" },
  })));
  assertEquals(r.headers.get("Access-Control-Allow-Origin"), "https://switchy-ai.com");
  assertStringIncludes(r.headers.get("Access-Control-Allow-Headers") ?? "", "authorization");
  assertStringIncludes(r.headers.get("Access-Control-Allow-Headers") ?? "", "apikey");
  await r.text();
});

Deno.test("account-delete GET returns the health string", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/account-delete", { method: "GET" })));
  assertEquals(r.status, 200);
  assertStringIncludes(await r.text(), "account-delete: ok");
});

Deno.test("account-delete returns 400 without confirm:'DELETE' — nothing runs", async () => {
  await withFetchStub([], async (calls) => {
    const r1 = await post("10.0.0.1", {});
    assertEquals(r1.status, 400);
    assertEquals((await r1.json()).error, "confirm required");
    const r2 = await post("10.0.0.1", { confirm: "delete" }); // case-sensitive on purpose
    assertEquals(r2.status, 400);
    await r2.text().catch(() => {});
    assertEquals(calls.length, 0, "no outbound call before the confirm gate passes");
  });
});

Deno.test("account-delete fails closed (401) without a bearer token", async () => {
  await withFetchStub([], async (calls) => {
    const r = await post("10.0.0.2", { confirm: "DELETE" });
    assertEquals(r.status, 401);
    assertEquals((await r.json()).ok, false);
    assertEquals(calls.length, 0, "an unauthenticated caller must never reach the DB");
  });
});

Deno.test("account-delete throttles the 4th POST from one IP with 429", async () => {
  await withFetchStub([], async () => {
    for (let i = 0; i < 3; i++) {
      const r = await post("10.9.9.9", {}); // burns the budget on the 400 path
      assertEquals(r.status, 400);
      await r.text().catch(() => {});
    }
    const r4 = await post("10.9.9.9", {});
    assertEquals(r4.status, 429);
    assert(Number(r4.headers.get("Retry-After") ?? "0") >= 1);
    assertEquals((await r4.json()).ok, false);
  });
});

// ── Execution contract ───────────────────────────────────────────────────────

Deno.test("account-delete happy path: scrubs run first, admin delete URL is hit LAST", async () => {
  await withEnv(async () => {
    const sink = freshSink();
    await withFetchStub(routesFor(sink), async (calls) => {
      const r = await post("10.0.1.1", { confirm: "DELETE", advisorSessionId: "sess-1" }, "user-jwt");
      assertEquals(r.status, 200);
      assertEquals((await r.json()).ok, true);

      // The point of no return comes strictly last.
      assertEquals(sink.adminDeletes.length, 1);
      assertStringIncludes(sink.adminDeletes[0], `/auth/v1/admin/users/${UID}`);
      assertStringIncludes(calls[calls.length - 1], "/auth/v1/admin/users/");

      // WhatsApp contact removed by the wa_phone digits spelling (cascade FKs).
      assertEquals(sink.waDeletes.length, 1);
      assertStringIncludes(sink.waDeletes[0], "wa_phone=eq.972521234567");

      // Do-not-contact rows for the phone (whatsapp+sms) and the email.
      const channels = sink.suppressions.map((s) => String(s.channel)).sort();
      assertEquals(channels, ["email", "sms", "whatsapp"]);
      for (const s of sink.suppressions) {
        assertEquals(s.reason, "account_deleted");
        assert(s.contact === "+972521234567" || s.contact === "dana@example.com");
      }

      // The advisor session + OTP rows were addressed by the right keys.
      assert(calls.some((u) => u.includes(`ai_sessions?session_id=eq.sess-1`)));
      assert(calls.some((u) => u.includes(`meeting_email_otps?email=eq.${encodeURIComponent("dana@example.com")}`)));
      // Open meeting m1 was cancelled with the idempotency guard in place.
      assert(calls.some((u) => u.includes("meetings?id=eq.m1&status=in.(pending,confirmed)")));
    });
  });
});

Deno.test("account-delete stays ok:true when storage cleanup fails (fail-soft step)", async () => {
  await withEnv(async () => {
    const sink = freshSink();
    await withFetchStub(routesFor(sink, { storageFails: true }), async (calls) => {
      const r = await post("10.0.1.2", { confirm: "DELETE" }, "user-jwt");
      assertEquals(r.status, 200);
      assertEquals((await r.json()).ok, true);
      // The failed storage list must not stop the auth-user deletion.
      assertEquals(sink.adminDeletes.length, 1);
      assertStringIncludes(calls[calls.length - 1], "/auth/v1/admin/users/");
    });
  });
});

Deno.test("account-delete returns ok:false when the auth-user delete itself fails", async () => {
  await withEnv(async () => {
    const sink = freshSink();
    await withFetchStub(routesFor(sink, { adminStatus: 500 }), async () => {
      const r = await post("10.0.1.3", { confirm: "DELETE" }, "user-jwt");
      assertEquals(r.status, 500);
      const body = await r.json();
      assertEquals(body.ok, false);
      assertStringIncludes(String(body.error), "auth delete failed");
      // The delete WAS attempted — steps 3-10 already ran, retry is safe.
      assertEquals(sink.adminDeletes.length, 1);
    });
  });
});
