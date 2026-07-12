// Handler-body tests for the crm-api action modules — the mutations' honesty
// contract and the PII-read audit trail, driven over a stubbed PostgREST:
//
//   • the six once-blind mutations answer an HONEST 404 on a missing id and
//     write NO phantom lead_events/meeting_events/audit rows (patchCount+404).
//   • recordSaving clamps/rounds into 0..100000 and refuses junk BEFORE any PATCH.
//   • validation is fail-closed: an invalid status / non-UUID id / bad sort is a
//     400 with zero network calls.
//   • sendReply VERIFIES the implicit-takeover PATCH and reports the additive
//     takeoverApplied flag — the bot can no longer keep answering over a rep
//     silently.
//   • event-trail completeness: old_status + the REAL actor name (the caller's
//     own profile) instead of 'CRM'; setContactStatus lands on crm_events.
//   • PII-heavy reads are audited (crm_lead_view / crm_thread_view), ids only.
//   • listSellableLeads re-filters with the exporter's isSellable gate + audits.
//   • lists: additive limit/offset+hasMore (defaults unchanged), search never
//     interpolated into the query string; getThread caps at THREAD_MSG_CAP.
//   • honest failures: a failed count/events read is 502; a failed profiles
//     join in listMembers is REPORTED (profilesDegraded), not silent blanks.
//
// No server boot: the handlers are called directly (the gate is covered by
// crm_api_gate_test.ts). Env is set inside each test and restored — test files
// share the process. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import { jsonResponse, withFetchStub } from "./_capture_handler.ts";
import { MAX_NOTE_LEN, THREAD_MSG_CAP } from "../crm-api/crm_logic.ts";
import {
  actAddNote,
  actClaimLead,
  actGetLeadDetail,
  actListLeads,
  actListSellableLeads,
  actRecordSaving,
  actSetLeadNote,
  actSetLeadStatus,
} from "../crm-api/actions_leads.ts";
import { actGetThread, actSendReply, actSetContactStatus } from "../crm-api/actions_conversations.ts";
import { actSetMeetingStatus } from "../crm-api/actions_meetings.ts";
import { actOverview } from "../crm-api/actions_overview.ts";
import { actListMembers, actSetMemberRole } from "../crm-api/actions_members.ts";

const ACTOR = "9d8f2c44-1111-4222-8333-444455556666";
const LEAD = "a3bb189e-8bf9-3888-9912-ace4e6543002";
const CONV = "b4cc290f-9c0a-4999-aa23-bdf5f7654113";
const CONTACT = "c5dd3a10-ad1b-4aaa-bb34-ce06f8765224";
const MEETING = "d6ee4b21-be2c-4bbb-cc45-df17f9876335";
const MEMBER = "e7ff5c32-cf3d-4ccc-dd56-e028fa987446";

function withEnv<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  return fn().finally(() => {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  });
}

// Every stubbed call, with method + body — withFetchStub's `calls` only carries
// URLs, and these tests assert on WHAT was written, not just where.
type Call = { url: string; method: string; body: string };
type Route = Parameters<typeof withFetchStub>[0][number];

function route(
  rec: Call[],
  match: (u: string, init?: RequestInit) => boolean,
  respond: (u: string, init?: RequestInit) => Response,
): Route {
  return {
    match,
    respond: (u, init) => {
      rec.push({ url: u, method: String(init?.method ?? "GET"), body: String(init?.body ?? "") });
      return respond(u, init);
    },
  };
}

const isPatch = (init?: RequestInit) => init?.method === "PATCH";
const isGet = (init?: RequestInit) => init?.method === "GET";

// The caller's own profile — actorName() resolves the REAL trail name from it.
function profileRoute(rec: Call[]): Route {
  return route(
    rec,
    (u, i) => u.includes("/rest/v1/profiles") && u.includes("select=name,email") && isGet(i),
    () => jsonResponse([{ name: "דנה לוי", email: "d@x.com" }]),
  );
}

function sinkRoutes(rec: Call[]): Route[] {
  return [
    route(rec, (u) => u.includes("/rest/v1/lead_events"), () => new Response("", { status: 201 })),
    route(rec, (u) => u.includes("/rest/v1/meeting_events"), () => new Response("", { status: 201 })),
    route(rec, (u) => u.includes("/rest/v1/crm_events"), () => new Response("", { status: 201 })),
    route(rec, (u) => u.includes("/rest/v1/security_audit_log"), () => new Response("", { status: 201 })),
  ];
}

const of = (rec: Call[], substr: string, method?: string): Call[] =>
  rec.filter((c) => c.url.includes(substr) && (!method || c.method === method));

// ── recordSaving: clamp + honest 404 ─────────────────────────────────────────

Deno.test("recordSaving clamps a fat-finger into 100000, closes as won, real actor name", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isPatch(i), () => jsonResponse([{ id: LEAD }])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actRecordSaving({ leadId: LEAD, annualSaving: 250000 }, ACTOR);
      assertEquals(r.status, 200);
      assertEquals(await r.json(), { ok: true });
      const patch = of(rec, "/rest/v1/leads?id=eq.", "PATCH");
      assertEquals(JSON.parse(patch[0].body), { actual_saving: 100000, status: "won" });
      // Trail: the real actor's name from their own profile — not 'CRM'.
      const ev = JSON.parse(of(rec, "/rest/v1/lead_events", "POST")[0].body);
      assertEquals(ev.actor_name, "דנה לוי");
      assertEquals(ev.event, "saving");
      assertEquals(ev.new_status, "won");
      // Reg.13 audit carries the CLAMPED figure + ids only.
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.event, "crm_lead_saving");
      assertEquals(audit.detail.saving, 100000);
      assertEquals(audit.detail.lead_id, LEAD);
    });
  });
});

Deno.test("recordSaving rounds a fractional saving to a whole shekel figure", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isPatch(i), () => jsonResponse([{ id: LEAD }])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actRecordSaving({ leadId: LEAD, annualSaving: 499.6 }, ACTOR);
      assertEquals(r.status, 200);
      assertEquals(JSON.parse(of(rec, "?id=eq.", "PATCH")[0].body).actual_saving, 500);
    });
  });
});

Deno.test("recordSaving refuses zero/negative/junk with 400 and ZERO network calls", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([route(rec, () => true, () => jsonResponse([]))], async () => {
      for (const bad of [0, -12, "junk", null, Infinity]) {
        const r = await actRecordSaving({ leadId: LEAD, annualSaving: bad }, ACTOR);
        assertEquals(r.status, 400);
        assertEquals((await r.json()).code, "bad_request");
      }
      assertEquals(rec.length, 0, "an invalid saving must never reach the DB");
    });
  });
});

Deno.test("recordSaving on a missing lead → honest 404, NO phantom trail/audit", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isPatch(i), () => jsonResponse([])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actRecordSaving({ leadId: LEAD, annualSaving: 480 }, ACTOR);
      assertEquals(r.status, 404);
      assertEquals(await r.json(), { error: "הליד לא נמצא", code: "not_found" });
      assertEquals(of(rec, "/rest/v1/lead_events").length, 0, "no phantom lead_events");
      assertEquals(of(rec, "/rest/v1/security_audit_log").length, 0, "no phantom audit");
    });
  });
});

// ── setLeadStatus: validation, 404, old_status, contacted_at only-if-null ────

Deno.test("setLeadStatus refuses an invalid status / non-UUID id with 400, zero calls", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([route(rec, () => true, () => jsonResponse([]))], async () => {
      const bad = await actSetLeadStatus({ leadId: LEAD, status: "vip" }, ACTOR);
      assertEquals(bad.status, 400);
      assertEquals((await bad.json()).code, "invalid_status");
      const badId = await actSetLeadStatus({ leadId: "not-a-uuid", status: "won" }, ACTOR);
      assertEquals(badId.status, 400);
      assertEquals((await badId.json()).code, "bad_request");
      assertEquals(rec.length, 0, "invalid input must never reach the DB");
    });
  });
});

Deno.test("setLeadStatus on a missing lead → 404 from the pre-read, no PATCH, no trail", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isGet(i), () => jsonResponse([])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actSetLeadStatus({ leadId: LEAD, status: "won" }, ACTOR);
      assertEquals(r.status, 404);
      assertEquals((await r.json()).code, "not_found");
      assertEquals(of(rec, "?id=eq.", "PATCH").length, 0, "no blind PATCH on a missing row");
      assertEquals(of(rec, "/rest/v1/lead_events").length, 0);
      assertEquals(of(rec, "/rest/v1/security_audit_log").length, 0);
    });
  });
});

Deno.test("setLeadStatus → contacted stamps contacted_at ONLY-IF-NULL + full trail", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(
        rec,
        (u, i) => u.includes("/rest/v1/leads?id=eq.") && isGet(i),
        () => jsonResponse([{ id: LEAD, status: "new", contacted_at: null }]),
      ),
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isPatch(i), () => jsonResponse([{ id: LEAD }])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actSetLeadStatus({ leadId: LEAD, status: "contacted" }, ACTOR);
      assertEquals(r.status, 200);
      // Two PATCHes: the status, then the is.null-guarded first-touch stamp.
      const patches = of(rec, "?id=eq.", "PATCH");
      assertEquals(patches.length, 2);
      assertEquals(JSON.parse(patches[0].body), { status: "contacted" });
      assert(patches[1].url.includes("contacted_at=is.null"), "the stamp PATCH must be guarded");
      assert(JSON.parse(patches[1].body).contacted_at, "stamps a real timestamp");
      // The trail carries old_status AND the real actor name.
      const ev = JSON.parse(of(rec, "/rest/v1/lead_events", "POST")[0].body);
      assertEquals(ev.old_status, "new");
      assertEquals(ev.new_status, "contacted");
      assertEquals(ev.actor_name, "דנה לוי");
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.detail.old_status, "new");
    });
  });
});

Deno.test("setLeadStatus NEVER re-stamps an existing contacted_at (first touch wins)", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(
        rec,
        (u, i) => u.includes("/rest/v1/leads?id=eq.") && isGet(i),
        () => jsonResponse([{ id: LEAD, status: "contacted", contacted_at: "2026-07-01T08:00:00Z" }]),
      ),
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isPatch(i), () => jsonResponse([{ id: LEAD }])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actSetLeadStatus({ leadId: LEAD, status: "contacted" }, ACTOR);
      assertEquals(r.status, 200);
      assertEquals(of(rec, "?id=eq.", "PATCH").length, 1, "no second stamp PATCH");
    });
  });
});

// ── the remaining once-blind mutations: honest 404s ──────────────────────────

Deno.test("setLeadNote / claimLead on a missing lead → 404, no phantom trail", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u, i) => u.includes("/rest/v1/leads?id=eq.") && isPatch(i), () => jsonResponse([])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const note = await actSetLeadNote({ leadId: LEAD, note: "הערה" }, ACTOR);
      assertEquals(note.status, 404);
      const claim = await actClaimLead({ leadId: LEAD, rep: "רון" }, ACTOR);
      assertEquals(claim.status, 404);
      assertEquals(of(rec, "/rest/v1/lead_events").length, 0);
      assertEquals(of(rec, "/rest/v1/security_audit_log").length, 0);
    });
  });
});

Deno.test("setContactStatus: honest 404 on a missing contact; crm_events on success", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    let exists = false;
    return withFetchStub([
      route(
        rec,
        (u, i) => u.includes("/rest/v1/whatsapp_contacts?id=eq.") && isGet(i),
        () => jsonResponse(exists ? [{ id: CONTACT, status: "new" }] : []),
      ),
      route(
        rec,
        (u, i) => u.includes("/rest/v1/whatsapp_contacts?id=eq.") && isPatch(i),
        () => jsonResponse([{ id: CONTACT }]),
      ),
      ...sinkRoutes(rec),
    ], async () => {
      const miss = await actSetContactStatus({ contactId: CONTACT, status: "qualified" }, ACTOR);
      assertEquals(miss.status, 404);
      assertEquals((await miss.json()).code, "not_found");
      assertEquals(of(rec, "whatsapp_contacts?id=eq.", "PATCH").length, 0);
      assertEquals(of(rec, "/rest/v1/crm_events").length, 0);

      exists = true;
      const ok = await actSetContactStatus({ contactId: CONTACT, status: "qualified" }, ACTOR);
      assertEquals(ok.status, 200);
      // The lifecycle move lands on the console's activity feed — statuses only.
      const ev = JSON.parse(of(rec, "/rest/v1/crm_events", "POST")[0].body);
      assertEquals(ev.event, "contact_status");
      assertEquals(ev.contact_id, CONTACT);
      assert(String(ev.preview).includes("new") && String(ev.preview).includes("qualified"));
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.detail.old_status, "new");
    });
  });
});

Deno.test("setMeetingStatus: honest 404; success carries old_status + real actor", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    let exists = false;
    return withFetchStub([
      route(
        rec,
        (u, i) => u.includes("/rest/v1/meetings?id=eq.") && isGet(i),
        () => jsonResponse(exists ? [{ id: MEETING, status: "pending" }] : []),
      ),
      route(rec, (u, i) => u.includes("/rest/v1/meetings?id=eq.") && isPatch(i), () => jsonResponse([{ id: MEETING }])),
      profileRoute(rec),
      ...sinkRoutes(rec),
    ], async () => {
      const miss = await actSetMeetingStatus({ meetingId: MEETING, status: "confirmed" }, ACTOR);
      assertEquals(miss.status, 404);
      assertEquals(of(rec, "meetings?id=eq.", "PATCH").length, 0);
      assertEquals(of(rec, "/rest/v1/meeting_events").length, 0, "no phantom meeting_events");

      exists = true;
      const ok = await actSetMeetingStatus({ meetingId: MEETING, status: "confirmed" }, ACTOR);
      assertEquals(ok.status, 200);
      const ev = JSON.parse(of(rec, "/rest/v1/meeting_events", "POST")[0].body);
      assertEquals(ev.old_status, "pending");
      assertEquals(ev.new_status, "confirmed");
      assertEquals(ev.actor_name, "דנה לוי");
    });
  });
});

// ── sendReply: the implicit takeover is VERIFIED ──────────────────────────────

function sendReplyRoutes(rec: Call[], takeoverLands: boolean): Route[] {
  return [
    route(
      rec,
      (u, i) => u.includes("/rest/v1/whatsapp_conversations?id=eq.") && isGet(i),
      () => jsonResponse([{ id: CONV, contact_id: CONTACT }]),
    ),
    route(
      rec,
      (u, i) => u.includes("/rest/v1/whatsapp_conversations?id=eq.") && isPatch(i),
      () => jsonResponse(takeoverLands ? [{ id: CONV }] : []),
    ),
    route(
      rec,
      (u, i) => u.includes("/rest/v1/whatsapp_contacts?id=eq.") && isGet(i),
      // No phone on the contact → the Graph send is skipped entirely (no
      // graph.facebook.com traffic from a unit test).
      () => jsonResponse([{ id: CONTACT, wa_phone: "" }]),
    ),
    route(
      rec,
      (u, i) => u.includes("/rest/v1/whatsapp_contacts?id=eq.") && isPatch(i),
      () => new Response(null, { status: 204 }),
    ),
    route(rec, (u) => u.includes("/rest/v1/whatsapp_messages"), () => new Response("", { status: 201 })),
    ...sinkRoutes(rec),
  ];
}

Deno.test("sendReply verifies the implicit takeover PATCH → takeoverApplied:true", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub(sendReplyRoutes(rec, true), async () => {
      const r = await actSendReply({ conversationId: CONV, body: "שלום, כאן נציג" }, ACTOR);
      assertEquals(r.status, 200);
      assertEquals(await r.json(), { ok: true, messageId: null, takeoverApplied: true });
      const patch = JSON.parse(of(rec, "whatsapp_conversations?id=eq.", "PATCH")[0].body);
      assertEquals(patch.bot_enabled, false);
      assertEquals(patch.status, "human");
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.detail.takeover_applied, true);
    });
  });
});

Deno.test("sendReply reports a MISSED takeover honestly → takeoverApplied:false", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub(sendReplyRoutes(rec, false), async () => {
      const r = await actSendReply({ conversationId: CONV, body: "שלום" }, ACTOR);
      assertEquals(r.status, 200);
      const j = await r.json();
      // The message itself was stored (authoritative), but the bot gate did NOT
      // flip — the console can now see it and retry an explicit takeOver.
      assertEquals(j.ok, true);
      assertEquals(j.takeoverApplied, false);
      assertEquals(of(rec, "/rest/v1/whatsapp_messages", "POST").length, 1);
    });
  });
});

// ── sellable feed: re-filter + audit ─────────────────────────────────────────

Deno.test("listSellableLeads re-filters with isSellable and audits ids/count only", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?consent_share_at="), () =>
        jsonResponse([
          {
            id: LEAD,
            name: "דנה",
            phone: "0521234567",
            status: "new",
            consent_share_at: "2026-07-01T10:00:00Z",
          },
          // A consent-less row that somehow survived the query filter — the
          // defence-in-depth re-check must drop it.
          { id: MEMBER, name: "חדירה", phone: "0530000000", status: "new", consent_share_at: null },
        ])),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actListSellableLeads({}, ACTOR);
      assertEquals(r.status, 200);
      const j = await r.json();
      assertEquals(j.leads.length, 1);
      assertEquals(j.leads[0].id, LEAD);
      // The audit records WHO saw HOW MANY — never the leads' PII.
      const audit = of(rec, "/rest/v1/security_audit_log", "POST")[0].body;
      const parsed = JSON.parse(audit);
      assertEquals(parsed.event, "crm_lead_export");
      assertEquals(parsed.detail.count, 1);
      assertFalse(audit.includes("0521234567"), "no phone in the audit detail");
    });
  });
});

Deno.test("listSellableLeads audits the APPLIED filter, not the raw ask: a non-sellable status falls back to 'all'", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?consent_share_at="), () =>
        jsonResponse([
          { id: LEAD, name: "דנה", phone: "0521234567", status: "new", consent_share_at: "2026-07-01T10:00:00Z" },
        ])),
      ...sinkRoutes(rec),
    ], async () => {
      // "lost" is NOT a sellable status → the query falls back to the full set and
      // returns everything; the audit must NOT claim the feed was filtered to "lost".
      const r = await actListSellableLeads({ status: "lost" }, ACTOR);
      assertEquals(r.status, 200);
      // The query really applied the full sellable set (new/contacted/won), not "lost".
      const query = of(rec, "/rest/v1/leads?consent_share_at=", "GET")[0].url;
      assert(query.includes("new") && query.includes("contacted") && query.includes("won"));
      assertFalse(query.includes("lost"), "the ignored status never reaches the query");
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.event, "crm_lead_export");
      // The bug: the trail recorded status:"lost" while returning the full set.
      assertEquals(audit.detail.status, "all", "audit records the EFFECTIVE filter");
      assertEquals(audit.detail.statuses, ["new", "contacted", "won"]);
    });
  });
});

Deno.test("listSellableLeads audit records a genuinely-applied status verbatim (won)", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?consent_share_at="), () =>
        jsonResponse([
          { id: LEAD, name: "דנה", phone: "0521234567", status: "won", consent_share_at: "2026-07-01T10:00:00Z" },
        ])),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actListSellableLeads({ status: "won" }, ACTOR);
      assertEquals(r.status, 200);
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.detail.status, "won");
      assertEquals(audit.detail.statuses, ["won"]);
    });
  });
});

// ── setMemberRole: self-change guard (case-insensitive) ──────────────────────

Deno.test("setMemberRole refuses a self-change even when the actor's uid is UPPERCASED (case-insensitive guard)", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      // Any DB call would be a bug — the guard must reject BEFORE touching the DB.
      route(rec, () => true, () => jsonResponse([])),
    ], async () => {
      const r = await actSetMemberRole({ uid: ACTOR.toUpperCase(), role: "rep" }, ACTOR);
      assertEquals(r.status, 400);
      assertEquals((await r.json()).code, "bad_request");
      assertEquals(rec.length, 0, "a self-change must never reach the DB, whatever the uid casing");
    });
  });
});

Deno.test("setMemberRole still grants a role to a DIFFERENT member (guard doesn't over-block)", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u, i) => u.includes("/rest/v1/profiles") && u.includes("id=eq.") && isGet(i), () => jsonResponse([{ id: MEMBER }])),
      route(rec, (u, i) => u.includes("/rest/v1/crm_members") && i?.method === "POST", () => new Response("", { status: 201 })),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actSetMemberRole({ uid: MEMBER, role: "rep" }, ACTOR);
      assertEquals(r.status, 200);
      assertEquals(await r.json(), { ok: true, role: "rep" });
      const audit = JSON.parse(of(rec, "/rest/v1/security_audit_log", "POST")[0].body);
      assertEquals(audit.event, "crm_set_role");
      assertEquals(audit.detail.target_uid, MEMBER);
      assertEquals(audit.detail.role, "rep");
    });
  });
});

// ── listLeads: paging + safe search + sort validation ────────────────────────

Deno.test("listLeads pages with limit/offset and reports hasMore (defaults unchanged)", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    const rows = [
      { id: LEAD, name: "דנה", phone: "0521111111", status: "new" },
      { id: MEMBER, name: "רון", phone: "0522222222", status: "new" },
      { id: CONV, name: "יעל", phone: "0523333333", status: "new" },
    ];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?order="), () => jsonResponse(rows)),
    ], async () => {
      const r = await actListLeads({ limit: 2, offset: 2 });
      assertEquals(r.status, 200);
      const j = await r.json();
      // limit+1 probe row → hasMore, and only `limit` rows are returned.
      assert(rec[0].url.includes("limit=3"), `probe row fetched: ${rec[0].url}`);
      assert(rec[0].url.includes("offset=2"));
      assertEquals(j.leads.length, 2);
      assertEquals(j.hasMore, true);

      // Default window unchanged: no limit → the historical 200 (fetched as 201).
      const def = await actListLeads({});
      assertEquals(def.status, 200);
      assert(rec[1].url.includes("limit=201"), `default window: ${rec[1].url}`);
      assert(rec[1].url.includes("offset=0"));
      assertEquals((await def.json()).hasMore, false); // 3 rows < 200
    });
  });
});

Deno.test("listLeads search is in-memory — NEVER interpolated into the query string", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?order="), () =>
        jsonResponse([
          { id: LEAD, name: "דנה לוי", phone: "0521111111", status: "new" },
          { id: MEMBER, name: "רון כהן", phone: "0529999999", status: "new" },
        ])),
    ], async () => {
      const needle = "דנה,or=1.eq.1";
      const r = await actListLeads({ search: needle });
      assertEquals(r.status, 200);
      assertFalse(rec[0].url.includes("דנה"), "raw search text must not reach the URL");
      assertFalse(rec[0].url.includes(encodeURIComponent("דנה")), "encoded search text either");
      const j = await r.json();
      assertEquals(j.leads.length, 0); // the crafted needle matches nothing, safely in-memory
      const plain = await actListLeads({ search: "דנה" });
      assertEquals((await plain.json()).leads.length, 1);
    });
  });
});

Deno.test("listLeads refuses an unknown sort with 400 and zero calls", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([route(rec, () => true, () => jsonResponse([]))], async () => {
      const r = await actListLeads({ sort: "created_at.asc" });
      assertEquals(r.status, 400);
      assertEquals((await r.json()).code, "bad_request");
      assertEquals(rec.length, 0);
    });
  });
});

// ── getThread: capped read + truncated flag + audited view ───────────────────

Deno.test("getThread caps at THREAD_MSG_CAP newest messages, flags truncated, audits ids only", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    // Newest-first, one past the cap — m0 is the newest message.
    const msgs = Array.from({ length: THREAD_MSG_CAP + 1 }, (_, i) => ({
      id: `m${i}`,
      direction: "in",
      actor: "customer",
      body: `הודעה ${i}`,
      created_at: `2026-07-10T10:00:${String(i % 60).padStart(2, "0")}Z`,
    }));
    return withFetchStub([
      route(
        rec,
        (u, i) => u.includes("/rest/v1/whatsapp_conversations?id=eq.") && isGet(i),
        () => jsonResponse([{ id: CONV, contact_id: CONTACT }]),
      ),
      route(
        rec,
        (u, i) => u.includes("/rest/v1/whatsapp_contacts?id=eq.") && isGet(i),
        () => jsonResponse([{ id: CONTACT, wa_name: "יעל", wa_phone: "0501112233", status: "active", lead_id: null }]),
      ),
      route(rec, (u) => u.includes("/rest/v1/whatsapp_messages"), () => jsonResponse(msgs)),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actGetThread({ conversationId: CONV }, ACTOR);
      assertEquals(r.status, 200);
      const j = await r.json();
      // The read itself is bounded — cap+1 as the truncation probe, newest first.
      const msgUrl = of(rec, "/rest/v1/whatsapp_messages")[0].url;
      assert(msgUrl.includes(`limit=${THREAD_MSG_CAP + 1}`), `bounded read: ${msgUrl}`);
      assert(msgUrl.includes("order=created_at.desc"));
      assertEquals(j.truncated, true);
      assertEquals(j.messages.length, THREAD_MSG_CAP);
      // Chronological order is preserved: oldest kept → newest last.
      assertEquals(j.messages[0].id, `m${THREAD_MSG_CAP - 1}`);
      assertEquals(j.messages[j.messages.length - 1].id, "m0");
      // Reg.13: the thread view is audited — ids only, never message text.
      const audit = of(rec, "/rest/v1/security_audit_log", "POST")[0].body;
      const parsed = JSON.parse(audit);
      assertEquals(parsed.event, "crm_thread_view");
      assertEquals(parsed.detail.conversation_id, CONV);
      assertFalse(audit.includes("הודעה"), "message bodies must never enter the audit trail");
    });
  });
});

Deno.test("getThread under the cap → truncated:false, same shape as before", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(
        rec,
        (u, i) => u.includes("/rest/v1/whatsapp_conversations?id=eq.") && isGet(i),
        () => jsonResponse([{ id: CONV, contact_id: CONTACT }]),
      ),
      route(
        rec,
        (u, i) => u.includes("/rest/v1/whatsapp_contacts?id=eq.") && isGet(i),
        () => jsonResponse([{ id: CONTACT, wa_name: "יעל", wa_phone: "0501112233", status: "active", lead_id: null }]),
      ),
      route(rec, (u) => u.includes("/rest/v1/whatsapp_messages"), () =>
        jsonResponse([
          { id: "m1", direction: "out", actor: "bot", body: "היי", created_at: "2026-07-10T10:00:01Z" },
          { id: "m0", direction: "in", actor: "customer", body: "שלום", created_at: "2026-07-10T10:00:00Z" },
        ])),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actGetThread({ conversationId: CONV }, ACTOR);
      const j = await r.json();
      assertEquals(j.truncated, false);
      assertEquals(j.messages.map((m: { id: string }) => m.id), ["m0", "m1"]); // oldest→newest
      assertEquals(j.contact.name, "יעל");
    });
  });
});

// ── getLeadDetail: honest events failure + audited view ──────────────────────

Deno.test("getLeadDetail: a FAILED events read is a 502 — never an empty timeline", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?id=eq."), () =>
        jsonResponse([{ id: LEAD, name: "דנה", phone: "0521234567", status: "new" }])),
      // First match wins — this 500 shadows the sink's lead_events route.
      route(rec, (u) => u.includes("/rest/v1/lead_events"), () => new Response("boom", { status: 500 })),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actGetLeadDetail({ leadId: LEAD }, ACTOR);
      assertEquals(r.status, 502);
      assertEquals((await r.json()).code, "db_error");
      assertEquals(of(rec, "/rest/v1/security_audit_log").length, 0, "a failed view is not audited");
    });
  });
});

Deno.test("getLeadDetail success is audited as crm_lead_view — ids only", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/leads?id=eq."), () =>
        jsonResponse([{ id: LEAD, name: "דנה", phone: "0521234567", status: "new" }])),
      route(rec, (u) => u.includes("/rest/v1/lead_events"), () => jsonResponse([])),
      ...sinkRoutes(rec),
    ], async () => {
      const r = await actGetLeadDetail({ leadId: LEAD }, ACTOR);
      assertEquals(r.status, 200);
      const audit = of(rec, "/rest/v1/security_audit_log", "POST")[0].body;
      const parsed = JSON.parse(audit);
      assertEquals(parsed.event, "crm_lead_view");
      assertEquals(parsed.detail.lead_id, LEAD);
      assertFalse(audit.includes("0521234567"), "no phone in the audit detail");
    });
  });
});

// ── overview: honest counts + additive roster totals ─────────────────────────

function countRoute(rec: Call[], substr: string, total: number | null): Route {
  return route(rec, (u) => u.includes(substr), () =>
    total === null ? new Response("boom", { status: 500 }) : new Response("[]", {
      status: 206,
      headers: { "Content-Range": `0-0/${total}`, "Content-Type": "application/json" },
    }));
}

Deno.test("overview returns the pipeline + additive contacts/meetings totals", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      countRoute(rec, "leads?status=eq.new", 5),
      countRoute(rec, "leads?status=eq.contacted", 4),
      countRoute(rec, "leads?status=eq.won", 3),
      countRoute(rec, "leads?status=eq.lost", 2),
      countRoute(rec, "/rest/v1/whatsapp_contacts?select=id", 7),
      countRoute(rec, "/rest/v1/meetings?select=id", 6),
      route(rec, (u) => u.includes("/rest/v1/whatsapp_conversations?order="), () => jsonResponse([])),
    ], async () => {
      const r = await actOverview();
      assertEquals(r.status, 200);
      const j = await r.json();
      assertEquals(j.pipeline, { new: 5, contacted: 4, won: 3, lost: 2 });
      assertEquals(j.recent, []);
      // The two roster totals are ADDITIVE fields (the console may ignore them).
      assertEquals(j.contacts, 7);
      assertEquals(j.meetings, 6);
    });
  });
});

Deno.test("overview answers 502 when ANY count fails — never a confident zero", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([
      countRoute(rec, "leads?status=eq.new", 5),
      countRoute(rec, "leads?status=eq.contacted", null), // ← this count fails
      countRoute(rec, "leads?status=eq.won", 3),
      countRoute(rec, "leads?status=eq.lost", 2),
      countRoute(rec, "/rest/v1/whatsapp_contacts?select=id", 7),
      countRoute(rec, "/rest/v1/meetings?select=id", 6),
      route(rec, (u) => u.includes("/rest/v1/whatsapp_conversations?order="), () => jsonResponse([])),
    ], async () => {
      const r = await actOverview();
      assertEquals(r.status, 502);
      assertEquals((await r.json()).code, "db_error");
    });
  });
});

// ── listMembers: a failed profile join is reported, not silent ───────────────

Deno.test("listMembers reports a failed profiles join via profilesDegraded", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    let profilesUp = false;
    return withFetchStub([
      route(rec, (u) => u.includes("/rest/v1/crm_members?order="), () =>
        jsonResponse([{ uid: MEMBER, role: "rep", granted_at: "2026-07-10T10:00:00Z" }])),
      route(rec, (u) => u.includes("/rest/v1/profiles?id=in."), () =>
        profilesUp
          ? jsonResponse([{ id: MEMBER, name: "רן", email: "r@x.com" }])
          : new Response("boom", { status: 500 })),
    ], async () => {
      const degraded = await actListMembers({});
      assertEquals(degraded.status, 200);
      const dj = await degraded.json();
      assertEquals(dj.profilesDegraded, true);
      assertEquals(dj.members[0].role, "rep"); // roster intact
      assertEquals(dj.members[0].name, null); // names honestly absent
      assertEquals(dj.hasMore, false);

      profilesUp = true;
      const ok = await actListMembers({});
      const oj = await ok.json();
      assertEquals(oj.profilesDegraded, false);
      assertEquals(oj.members[0].name, "רן");
    });
  });
});

// ── addNote: the unified MAX_NOTE_LEN cap ────────────────────────────────────

Deno.test("addNote clamps to the unified MAX_NOTE_LEN and signs the real actor", async () => {
  await withEnv(() => {
    const rec: Call[] = [];
    return withFetchStub([profileRoute(rec), ...sinkRoutes(rec)], async () => {
      const r = await actAddNote({ leadId: LEAD, note: "א".repeat(MAX_NOTE_LEN + 50) }, ACTOR);
      assertEquals(r.status, 200);
      const ev = JSON.parse(of(rec, "/rest/v1/lead_events", "POST")[0].body);
      assertEquals(String(ev.note).length, MAX_NOTE_LEN);
      assertEquals(ev.actor_name, "דנה לוי");
    });
  });
});
