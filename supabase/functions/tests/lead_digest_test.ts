// Tests for the lead-digest edge function (lead-digest/index.ts) — the cron-
// driven proactive push that (a) posts the daily executive digest (reusing
// buildDailyDigest) and (b) posts a stale-lead SLA nudge to the team Telegram.
//
// Two layers:
//   • PURE helpers — selectStaleLeads / buildStaleNudge over (rows, now) with no
//     network: SLA windowing, the new/uncontacted filters, the oldest-first sort,
//     the "no stale ⇒ no nudge" contract, and HTML-safe count-led copy.
//   • INTEGRATION — capture the REAL handler (no port, no network) and drive it
//     with a stubbed fetch that serves PostgREST reads + a Telegram sink. We pin:
//     the fail-CLOSED secret gate (401/503/405, zero sends), the stale-lead QUERY
//     SHAPE (status=eq.new + contacted_at=is.null + created_at=lt.<cutoff>), the
//     digest build + dual send, the honest "query failed ⇒ no digest" path, and
//     dryRun (builds, never sends).
//
// Run from supabase/functions/:  deno task test
//
// NOTE: this file sets process-wide env + a default fetch stub at module load
// BEFORE the single handler capture, mirroring community_notify_test.ts. Per-test
// fetch stubs (withFetchStub) layer on top and are always restored.

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, stubFetch, withFetchStub } from "./_capture_handler.ts";
import {
  buildStaleNudge,
  selectStaleLeads,
  SLA_HOURS,
  type StaleLead,
} from "../lead-digest/lib.ts";

// Fixed "now": 2026-06-16T12:00 Israel (09:00Z, summer UTC+3).
const NOW = Date.parse("2026-06-16T09:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const staleLead = (over: Partial<StaleLead> = {}): StaleLead => ({
  id: crypto.randomUUID(),
  name: "יוסי לוי",
  phone: "052-7654321",
  status: "new",
  contacted_at: null,
  created_at: hoursAgo(5),
  ...over,
});

// ── selectStaleLeads ──────────────────────────────────────────────────────────

Deno.test("selectStaleLeads keeps only new + uncontacted leads past the SLA", () => {
  const rows: StaleLead[] = [
    staleLead({ name: "ותיק", created_at: hoursAgo(6) }), // stale
    staleLead({ name: "טרי", created_at: hoursAgo(1) }), // under SLA → out
    staleLead({ name: "טופל", created_at: hoursAgo(8), contacted_at: hoursAgo(2) }), // contacted → out
    staleLead({ name: "סגור", created_at: hoursAgo(8), status: "contacted" }), // not new → out
  ];
  const out = selectStaleLeads(rows, NOW);
  assertEquals(out.map((l) => l.name), ["ותיק"]);
});

Deno.test("selectStaleLeads treats a lead created exactly at the SLA boundary as stale", () => {
  const out = selectStaleLeads([staleLead({ created_at: hoursAgo(SLA_HOURS) })], NOW);
  assertEquals(out.length, 1);
});

Deno.test("selectStaleLeads sorts oldest-waiting first", () => {
  const rows: StaleLead[] = [
    staleLead({ name: "צעיר", created_at: hoursAgo(3) }),
    staleLead({ name: "זקן", created_at: hoursAgo(9) }),
    staleLead({ name: "אמצע", created_at: hoursAgo(5) }),
  ];
  assertEquals(selectStaleLeads(rows, NOW).map((l) => l.name), ["זקן", "אמצע", "צעיר"]);
});

Deno.test("selectStaleLeads drops rows with an unparseable created_at", () => {
  assertEquals(selectStaleLeads([staleLead({ created_at: "not-a-date" })], NOW).length, 0);
});

// ── buildStaleNudge ────────────────────────────────────────────────────────────

Deno.test("buildStaleNudge returns '' when nothing is stale (no all-clear spam)", () => {
  assertEquals(buildStaleNudge([], NOW), "");
});

Deno.test("buildStaleNudge is count-led and reports the oldest wait in whole hours", () => {
  const txt = buildStaleNudge(selectStaleLeads([
    staleLead({ created_at: hoursAgo(7) }),
    staleLead({ created_at: hoursAgo(3) }),
  ], NOW), NOW);
  assertStringIncludes(txt, "2 לידים ללא מענה");
  assertStringIncludes(txt, "7ש׳"); // oldest wait
  assertStringIncludes(txt, `${SLA_HOURS}ש׳`); // the SLA threshold
});

Deno.test("buildStaleNudge floors the oldest wait to at least 1 hour at the boundary", () => {
  const txt = buildStaleNudge(selectStaleLeads([staleLead({ created_at: hoursAgo(SLA_HOURS) })], NOW), NOW);
  // 2h exactly → reported as 2ש׳ (>= 1, no "0ש׳")
  assertFalse(txt.includes("0ש׳"));
  assertStringIncludes(txt, "1 לידים ללא מענה");
});

// ── Integration rig ─────────────────────────────────────────────────────────────
// fetchRows / serviceFetch require SUPABASE_URL + service-role key; set them so
// the PostgREST reads are stub-routable. The secret comes from env (Vault is
// skipped because the default fetch stub does not serve get_lead_notify_config,
// so vaultConfig() fails soft to {} and the env secret wins).
const SECRET = "lead-digest-test-secret";
const SUPA = "https://stub.supabase.co";
Deno.env.set("LEAD_WEBHOOK_SECRET", SECRET);
Deno.env.set("TELEGRAM_BOT_TOKEN", "test-token");
Deno.env.set("TELEGRAM_CHAT_ID", "-1001234567890");
Deno.env.set("SUPABASE_URL", SUPA);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");

// A default stub so the module-load config resolution (vaultConfig over fetch)
// never touches the network; replaced per-test by withFetchStub.
const baseStub = stubFetch([
  { match: () => true, respond: () => jsonResponse({}) },
]);
const handler = await captureServeHandler("../lead-digest/index.ts");
baseStub.restore();

function post(secret: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-webhook-secret"] = secret;
  return Promise.resolve(
    handler(new Request("https://edge/lead-digest", { method: "POST", body: JSON.stringify(body), headers })),
  );
}

// Telegram sink — records every text the function tries to send.
function telegramSink(sent: string[]) {
  return {
    match: (u: string) => u.includes("api.telegram.org"),
    respond: (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sent.push(String(body.text ?? ""));
      return jsonResponse({ ok: true, result: {} });
    },
  };
}

// PostgREST sink — serves the three agenda reads + the stale-lead read. Records
// every requested URL so a test can assert the query shape. `staleRows` controls
// what the stale-lead read returns; `agendaFail` makes the agenda reads 500.
function restSink(opts: { staleRows?: unknown[]; uncontacted?: unknown[]; agendaFail?: boolean } = {}) {
  const urls: string[] = [];
  const route = {
    match: (u: string) => u.startsWith(SUPA + "/rest/v1/"),
    respond: (u: string) => {
      urls.push(u);
      if (u.includes("/leads?") && u.includes("contacted_at=is.null")) {
        return jsonResponse(opts.staleRows ?? []);
      }
      if (u.includes("/leads?")) {
        return jsonResponse(opts.uncontacted ?? []);
      }
      // meetings (confirmed / pending)
      if (opts.agendaFail) return jsonResponse({ message: "boom" }, 500);
      return jsonResponse([]);
    },
  };
  return { urls, route };
}

// ── method + secret gate (fail-closed) ──────────────────────────────────────────

Deno.test("lead-digest rejects non-POST with 405", async () => {
  await withFetchStub([telegramSink([])], async () => {
    const r = await Promise.resolve(handler(new Request("https://edge/lead-digest", { method: "GET" })));
    assertEquals(r.status, 405);
  });
});

Deno.test("lead-digest fails CLOSED (401) on a missing/wrong secret and never sends", async () => {
  const sent: string[] = [];
  await withFetchStub([telegramSink(sent)], async () => {
    assertEquals((await post(null, {})).status, 401);
    assertEquals((await post("", {})).status, 401);
    assertEquals((await post("not-the-secret", {})).status, 401);
  });
  assertEquals(sent.length, 0);
});

// ── stale-lead query shape ──────────────────────────────────────────────────────

Deno.test("lead-digest queries stale leads with status=new + contacted_at IS NULL + created_at<cutoff", async () => {
  const sent: string[] = [];
  const rest = restSink({ staleRows: [] });
  await withFetchStub([rest.route, telegramSink(sent)], async () => {
    const r = await post(SECRET, {});
    assertEquals(r.status, 200);
  });
  const staleUrl = rest.urls.find((u) => u.includes("contacted_at=is.null"));
  assert(staleUrl, "expected a stale-lead query");
  assertStringIncludes(staleUrl!, "status=eq.new");
  assertStringIncludes(staleUrl!, "contacted_at=is.null");
  assertStringIncludes(staleUrl!, "created_at=lt.");
});

// ── digest + nudge fan-out ──────────────────────────────────────────────────────

Deno.test("lead-digest posts the digest AND a stale nudge when leads are overdue", async () => {
  const sent: string[] = [];
  const stale = [
    { id: "1", name: "ותיק", phone: "0501112222", status: "new", contacted_at: null, created_at: hoursAgo(6) },
    { id: "2", name: "שני", phone: "0503334444", status: "new", contacted_at: null, created_at: hoursAgo(3) },
  ];
  const rest = restSink({ staleRows: stale, uncontacted: stale });
  await withFetchStub([rest.route, telegramSink(sent)], async () => {
    const r = await post(SECRET, {});
    const j = await r.json();
    assertEquals(r.status, 200);
    assert(j.digest.sent);
    assert(j.nudge.sent);
    assertEquals(j.nudge.stale, 2);
  });
  // two messages: the digest, then the nudge
  assertEquals(sent.length, 2);
  assertStringIncludes(sent[0], "דייג'סט יומי"); // buildDailyDigest header
  assertStringIncludes(sent[1], "לידים ללא מענה"); // the nudge
});

Deno.test("lead-digest sends the digest but NO nudge when nothing is stale", async () => {
  const sent: string[] = [];
  // uncontacted but all UNDER the SLA → digest yes, nudge no
  const fresh = [{ id: "9", name: "טרי", phone: "0509998888", status: "new", contacted_at: null, created_at: hoursAgo(1) }];
  const rest = restSink({ staleRows: [], uncontacted: fresh });
  await withFetchStub([rest.route, telegramSink(sent)], async () => {
    const r = await post(SECRET, {});
    const j = await r.json();
    assertEquals(r.status, 200);
    assert(j.digest.sent);
    assertFalse(j.nudge.sent);
    assertEquals(j.nudge.stale, 0);
  });
  assertEquals(sent.length, 1);
  assertStringIncludes(sent[0], "דייג'סט יומי");
});

// ── honest failure: a failed agenda query suppresses the digest ─────────────────

Deno.test("lead-digest does NOT post a digest when the agenda query fails", async () => {
  const sent: string[] = [];
  const rest = restSink({ agendaFail: true, staleRows: [] });
  await withFetchStub([rest.route, telegramSink(sent)], async () => {
    const r = await post(SECRET, {});
    const j = await r.json();
    assertEquals(r.status, 200);
    assertFalse(j.digest.sent);
    assertFalse(j.digest.queryOk);
  });
  // no misleading empty digest pushed to the team
  assertEquals(sent.filter((t) => t.includes("דייג'סט יומי")).length, 0);
});

// ── dryRun: builds everything, sends nothing ────────────────────────────────────

Deno.test("lead-digest dryRun returns the would-send text without any Telegram send", async () => {
  const sent: string[] = [];
  const stale = [{ id: "1", name: "ותיק", phone: "0501112222", status: "new", contacted_at: null, created_at: hoursAgo(6) }];
  const rest = restSink({ staleRows: stale, uncontacted: stale });
  await withFetchStub([rest.route, telegramSink(sent)], async () => {
    const r = await post(SECRET, { dryRun: true });
    const j = await r.json();
    assertEquals(r.status, 200);
    assert(j.dryRun);
    assertStringIncludes(j.digest.text, "דייג'סט יומי");
    assertStringIncludes(j.nudge.text, "לידים ללא מענה");
    assertEquals(j.nudge.stale, 1);
  });
  assertEquals(sent.length, 0); // dryRun never sends
});
