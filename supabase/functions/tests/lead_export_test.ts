// Unit tests for lead-export — the sellable-lead EXPORT feed (the monetization
// endpoint). The business SELLS leads, so the tests center on the ONE rule that
// must never break: a lead without an explicit third-party-sharing consent
// (consent_share_at) must NEVER appear in the feed. Plus dedup, the fail-CLOSED
// secret gate, dryRun, and query parsing.
//
// Run from supabase/functions/:  deno task test  (or, for this file alone:
//   deno test --allow-env --allow-net --allow-read --allow-import tests/lead_export_test.ts)

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, stubFetch, withFetchStub } from "./_capture_handler.ts";
import type { Lead } from "../_shared/types.ts";
import {
  buildExportRow,
  buyerSheetCells,
  buyerTabFor,
  dedupeFeed,
  type ExportRow,
  exportFeed,
  filterSellable,
  isSellable,
  parseExportQuery,
  SELLABLE_STATUSES,
} from "../lead-export/lib.ts";

// A lead row with arbitrary extra fields (consent_share_at isn't on the Lead type).
function lead(over: Record<string, unknown>): Lead {
  return over as unknown as Lead;
}

const CONSENTED = "2026-06-20T08:00:00.000Z";

// ── HARD LEGAL GATE: only sellable (consented) leads ─────────────────────────

Deno.test("isSellable: ONLY a non-empty consent_share_at marks a lead sellable", () => {
  assert(isSellable(lead({ name: "דנה", phone: "0501234567", consent_share_at: CONSENTED })));
  // null / absent / blank → not sellable (the safe, honest default)
  assertFalse(isSellable(lead({ name: "דנה", phone: "0501234567" })));
  assertFalse(isSellable(lead({ name: "דנה", phone: "0501234567", consent_share_at: null })));
  assertFalse(isSellable(lead({ name: "דנה", phone: "0501234567", consent_share_at: "   " })));
  // §30A service consent (terms/privacy) WITHOUT share consent is NOT sellable.
  assertFalse(isSellable(lead({
    name: "דנה",
    phone: "0501234567",
    terms_accepted_at: CONSENTED,
    privacy_accepted_at: CONSENTED,
    consent_share_at: null,
  })));
});

Deno.test("filterSellable drops every non-consented lead (a non-consented lead is excluded)", () => {
  const rows = [
    lead({ id: "a", name: "אורי", phone: "0521112222", consent_share_at: CONSENTED }),
    lead({ id: "b", name: "נועה", phone: "0533334444" }), // no share consent → excluded
    lead({ id: "c", name: "טל", phone: "0544445555", consent_share_at: null }), // excluded
    lead({ id: "d", name: "גיא", phone: "0555556666", consent_share_at: CONSENTED }),
  ];
  const kept = filterSellable(rows);
  assertEquals(kept.map((l) => l.id), ["a", "d"]);
});

Deno.test("exportFeed: a lead WITHOUT consent_share_at NEVER reaches the feed", () => {
  const rows = [
    lead({ id: "ok", name: "דנה כהן", phone: "0501234567", consent_share_at: CONSENTED }),
    lead({ id: "no", name: "אבי לוי", phone: "0507654321" }), // unconsented
  ];
  const feed = exportFeed(rows);
  assertEquals(feed.length, 1);
  assertEquals(feed[0].id, "ok");
  // Every emitted row is, by contract, sellable.
  assert(feed.every((r: ExportRow) => r.sellable === true));
});

// ── Dedup: collapse same person+category, never drop a distinct lead ─────────

Deno.test("dedupeFeed collapses the SAME person+category to ONE row", () => {
  const a = lead({ id: "1", name: "דנה כהן", phone: "0501234567", plan_id: "partner-cellular-100", consent_share_at: CONSENTED, created_at: "2026-06-20T08:00:00.000Z" });
  // same phone (different spelling) + same derived category (cellular) → same key
  const b = lead({ id: "2", name: "דנה", phone: "+972-50-123-4567", plan_id: "cellcom-cellular-50", consent_share_at: CONSENTED, created_at: "2026-06-21T08:00:00.000Z" });
  const out = dedupeFeed([a, b]);
  assertEquals(out.length, 1);
});

Deno.test("dedupeFeed keeps the richer instance (higher completeness score wins)", () => {
  // Sparse: phone + share consent only.
  const sparse = lead({ id: "sparse", name: "ד", phone: "0501234567", plan_id: "partner-cellular-100", consent_share_at: CONSENTED });
  // Rich: full name + email + provider + §30A consent + notes → higher score.
  const rich = lead({
    id: "rich",
    name: "דנה כהן",
    phone: "0501234567",
    email: "dana@example.com",
    provider: "פרטנר",
    plan_id: "partner-cellular-100",
    notes: "רוצה לעבור",
    terms_accepted_at: CONSENTED,
    privacy_accepted_at: CONSENTED,
    consent_share_at: CONSENTED,
  });
  // Order shouldn't matter: the richer one wins either way.
  assertEquals(dedupeFeed([sparse, rich])[0].id, "rich");
  assertEquals(dedupeFeed([rich, sparse])[0].id, "rich");
});

Deno.test("dedupeFeed NEVER drops a distinct lead (different person, or same person different category)", () => {
  const danaCellular = lead({ id: "d-cell", name: "דנה", phone: "0501234567", plan_id: "partner-cellular-100", consent_share_at: CONSENTED });
  // same person, DIFFERENT category (tv) → distinct billable lead, must survive
  const danaTv = lead({ id: "d-tv", name: "דנה", phone: "0501234567", plan_id: "yes-tv-200", consent_share_at: CONSENTED });
  // different person → distinct
  const avi = lead({ id: "avi", name: "אבי", phone: "0539998888", plan_id: "partner-cellular-100", consent_share_at: CONSENTED });
  const out = dedupeFeed([danaCellular, danaTv, avi]);
  assertEquals(new Set(out.map((l) => l.id)), new Set(["d-cell", "d-tv", "avi"]));
});

Deno.test("dedupeFeed keeps un-dedupable rows (empty key: no phone, no name) rather than collapsing all blanks", () => {
  const blank1 = lead({ id: "b1", phone: "not-a-phone", consent_share_at: CONSENTED });
  const blank2 = lead({ id: "b2", phone: "garbage", consent_share_at: CONSENTED });
  const out = dedupeFeed([blank1, blank2]);
  assertEquals(out.length, 2);
});

// ── buildExportRow: real fields only, sellable contract ──────────────────────

Deno.test("buildExportRow maps real fields, E.164 phone, derived category, quality, sellable:true", () => {
  const row = buildExportRow(lead({
    id: "x",
    name: "דנה כהן",
    phone: "050-123 4567",
    email: "dana@example.com",
    provider: "פרטנר",
    plan_id: "partner-cellular-100",
    source: "form",
    status: "new",
    notes: "רוצה לעבור",
    consent_share_at: CONSENTED,
    created_at: CONSENTED,
  }));
  assertEquals(row.id, "x");
  assertEquals(row.phone, "+972501234567"); // dedup-grade E.164
  assertEquals(row.category, "cellular"); // derived from plan_id
  assertEquals(row.email, "dana@example.com");
  assertEquals(row.status, "new");
  assertEquals(row.consent_share_at, CONSENTED);
  assertEquals(row.sellable, true);
  assert(Number.isFinite(row.quality) && row.quality >= 0 && row.quality <= 100);
});

Deno.test("buildExportRow emits null/empty for missing fields (never fabricated)", () => {
  const row = buildExportRow(lead({ name: "טל", phone: "0501234567", consent_share_at: CONSENTED }));
  assertEquals(row.email, null);
  assertEquals(row.provider, null);
  assertEquals(row.plan_id, null);
  assertEquals(row.category, ""); // nothing to derive → "" (honest)
  assertEquals(row.notes, null);
});

// ── Buyer-sheet mapping (per-category tabs) ──────────────────────────────────

Deno.test("buyerTabFor routes by category; unknown category lands in 'other' (never dropped)", () => {
  const cellRow = buildExportRow(lead({ name: "דנה", phone: "0501234567", plan_id: "partner-cellular-100", consent_share_at: CONSENTED }));
  assertEquals(buyerTabFor(cellRow), "cellular!A:K");
  const unknownRow = buildExportRow(lead({ name: "טל", phone: "0501234567", consent_share_at: CONSENTED }));
  assertEquals(buyerTabFor(unknownRow), "other!A:K"); // category "" → other
});

Deno.test("buyerSheetCells is a stable 11-column row (notes omitted) with the E.164 phone", () => {
  const row = buildExportRow(lead({
    id: "x", name: "דנה כהן", phone: "0501234567", email: "d@e.com",
    provider: "פרטנר", plan_id: "partner-cellular-100", source: "form", status: "won",
    notes: "secret context", consent_share_at: CONSENTED, created_at: CONSENTED,
  }));
  const cells = buyerSheetCells(row);
  assertEquals(cells.length, 11);
  assertEquals(cells[0], "x");
  assertEquals(cells[3], "+972501234567");
  assertEquals(cells[7], "cellular");
  assertEquals(cells[9], "won");
  // notes is intentionally NOT in the buyer sheet
  assertFalse(cells.includes("secret context"));
});

// ── parseExportQuery: validate/coerce, drop unknowns, sane defaults ──────────

Deno.test("parseExportQuery defaults: all sellable statuses, default limit, no window, dryRun false", () => {
  const q = parseExportQuery(undefined);
  assertEquals(q.statuses, [...SELLABLE_STATUSES]);
  assertEquals(q.category, null);
  assertEquals(q.since, null);
  assertEquals(q.until, null);
  assertEquals(q.dryRun, false);
  assert(q.limit > 0 && q.limit <= 1000);
});

Deno.test("parseExportQuery: 'lost' and unknown statuses are dropped; empty list falls back to all sellable", () => {
  // 'lost' is never sold → dropped; with nothing valid left, fall back to all.
  assertEquals(parseExportQuery({ status: "lost" }).statuses, [...SELLABLE_STATUSES]);
  assertEquals(parseExportQuery({ status: ["lost", "bogus"] }).statuses, [...SELLABLE_STATUSES]);
  // a valid subset is honoured (and de-duplicated)
  assertEquals(parseExportQuery({ status: ["new", "new", "contacted"] }).statuses, ["new", "contacted"]);
});

Deno.test("parseExportQuery: unknown category → null; a known one is canonicalized", () => {
  assertEquals(parseExportQuery({ category: "totally-made-up" }).category, null);
  assertEquals(parseExportQuery({ category: "cellular" }).category, "cellular");
  assertEquals(parseExportQuery({ category: "סלולר" }).category, "cellular"); // Hebrew cue normalized
});

Deno.test("parseExportQuery: invalid dates → null; valid ISO → canonical instant; limit clamped", () => {
  const q = parseExportQuery({ since: "not-a-date", until: "2026-06-01", limit: 99999 });
  assertEquals(q.since, null);
  assertEquals(q.until, new Date("2026-06-01").toISOString());
  assertEquals(q.limit, 1000); // clamped to MAX_EXPORT_LIMIT
  assertEquals(parseExportQuery({ limit: 0 }).limit > 0, true); // 0 → default, not 0
  assertEquals(parseExportQuery({ limit: -5 }).limit > 0, true);
});

Deno.test("parseExportQuery: dryRun is true ONLY for an explicit boolean true", () => {
  assertEquals(parseExportQuery({ dryRun: true }).dryRun, true);
  assertEquals(parseExportQuery({ dryRun: "true" }).dryRun, false); // not a boolean true
  assertEquals(parseExportQuery({ dryRun: 1 }).dryRun, false);
  assertEquals(parseExportQuery({}).dryRun, false);
});

// ── Handler integration: fail-CLOSED auth, sellable-only feed, dryRun ─────────
// Capture the REAL handler (no port, no network) and drive it with synthetic
// Requests + a stubbed fetch (mirrors lead_digest_test.ts). Env is set + the
// handler captured ONCE at module load, BEFORE any test, with a single consistent
// secret — resolveCfgCached memoizes for 60s, so per-test secret swaps would not
// take effect (hence one secret throughout; the 401 test proves fail-CLOSED).
const SECRET = "lead-export-test-secret";
const SUPA = "https://stub.supabase.co";
Deno.env.set("LEAD_WEBHOOK_SECRET", SECRET);
Deno.env.set("SUPABASE_URL", SUPA);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
// No buyer sheet + no Google service account in this rig → the append path stays
// dark, so the JSON-feed assertions are isolated from any Sheets call.
Deno.env.delete("BUYER_SPREADSHEET_ID");
Deno.env.delete("LEAD_BUYER_SPREADSHEET_ID");

// A default stub so the module-load config resolution (vaultConfig over fetch)
// never touches the network; replaced per-test by withFetchStub.
const baseStub = stubFetch([{ match: () => true, respond: () => jsonResponse({}) }]);
const handler = await captureServeHandler("../lead-export/index.ts");
baseStub.restore();

function post(secret: string | null, body: unknown): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-webhook-secret"] = secret;
  return Promise.resolve(
    handler(new Request("https://edge/lead-export", { method: "POST", body: JSON.stringify(body), headers })),
  );
}

// PostgREST leads sink. `rows` is what the leads read returns; `fail` makes it 500.
// Records every requested URL so a test can assert the query shape (the consent
// gate in particular).
function leadsSink(opts: { rows?: unknown[]; fail?: boolean } = {}) {
  const urls: string[] = [];
  const route = {
    match: (u: string) => u.startsWith(SUPA + "/rest/v1/"),
    respond: (u: string) => {
      urls.push(u);
      if (opts.fail) return jsonResponse({ message: "boom" }, 500);
      return jsonResponse(opts.rows ?? []);
    },
  };
  return { urls, route };
}

// ── method + secret gate (fail-closed) ───────────────────────────────────────

Deno.test("lead-export rejects non-POST with 405", async () => {
  const r = await Promise.resolve(handler(new Request("https://edge/lead-export", { method: "GET" })));
  assertEquals(r.status, 405);
});

Deno.test("lead-export fails CLOSED (401) on a missing/wrong secret and reads NOTHING", async () => {
  const sink = leadsSink({ rows: [] });
  await withFetchStub([sink.route], async () => {
    assertEquals((await post(null, {})).status, 401);
    assertEquals((await post("", {})).status, 401);
    assertEquals((await post("not-the-secret", {})).status, 401);
  });
  // Never read the LEADS table on an unauthorized request. (The config-resolution
  // RPC fetch — /rest/v1/rpc/get_lead_notify_config — runs during resolveCfgCached
  // and is expected; it is not a leads read, so filter the sink to the leads table.)
  assertEquals(sink.urls.filter((u) => u.includes("/leads")).length, 0);
});

// ── the consent gate is in the query AND re-checked in the handler ───────────

Deno.test("lead-export queries leads with consent_share_at NOT NULL and status IN the sellable set", async () => {
  const sink = leadsSink({ rows: [] });
  await withFetchStub([sink.route], async () => {
    const r = await post(SECRET, {});
    assertEquals(r.status, 200);
  });
  const leadsUrl = sink.urls.find((u) => u.includes("/rest/v1/leads"));
  assert(leadsUrl, "expected a leads query");
  // HARD LEGAL GATE in the query itself.
  assertStringIncludes(leadsUrl!, "consent_share_at=not.is.null");
  // status restricted to sellable values; 'lost' is never queried.
  assertStringIncludes(leadsUrl!, "status=in.");
  assertFalse(leadsUrl!.includes("lost"));
});

Deno.test("lead-export NEVER returns an unconsented lead even if the DB hands one back", async () => {
  // Defence in depth: simulate a row WITHOUT consent_share_at slipping through the
  // query — the handler's filterSellable must still drop it.
  const sink = leadsSink({
    rows: [
      { id: "ok", name: "דנה כהן", phone: "0501234567", status: "new", consent_share_at: CONSENTED, created_at: CONSENTED },
      { id: "leak", name: "אבי לוי", phone: "0507654321", status: "new", created_at: CONSENTED }, // no share consent
    ],
  });
  let body: Record<string, unknown> = {};
  await withFetchStub([sink.route], async () => {
    const r = await post(SECRET, { dryRun: true });
    assertEquals(r.status, 200);
    body = await r.json() as Record<string, unknown>;
  });
  assertEquals(body.count, 1);
  const feed = body.feed as ExportRow[];
  assertEquals(feed.map((f) => f.id), ["ok"]);
  assert(feed.every((f) => f.sellable === true));
});

// ── dryRun: builds the feed, appends nothing ─────────────────────────────────

Deno.test("lead-export dryRun returns the deduped sellable feed and appends NOTHING", async () => {
  // Two consented rows that collapse to one (same phone + same cellular category).
  const sink = leadsSink({
    rows: [
      { id: "1", name: "דנה כהן", phone: "0501234567", plan_id: "partner-cellular-100", email: "d@e.com", status: "new", consent_share_at: CONSENTED, created_at: "2026-06-21T08:00:00.000Z" },
      { id: "2", name: "דנה", phone: "+972-50-123-4567", plan_id: "cellcom-cellular-50", status: "new", consent_share_at: CONSENTED, created_at: "2026-06-20T08:00:00.000Z" },
      { id: "3", name: "אבי", phone: "0539998888", plan_id: "partner-cellular-100", status: "contacted", consent_share_at: CONSENTED, created_at: "2026-06-19T08:00:00.000Z" },
    ],
  });
  let body: Record<string, unknown> = {};
  await withFetchStub([sink.route], async () => {
    const r = await post(SECRET, { dryRun: true });
    assertEquals(r.status, 200);
    body = await r.json() as Record<string, unknown>;
  });
  assertEquals(body.ok, true);
  assertEquals(body.dryRun, true);
  assertEquals(body.total_before_dedup, 3);
  assertEquals(body.count, 2); // דנה's two rows collapsed; אבי is distinct
  // No buyer sheet configured in this rig → appended.configured is false.
  const appended = body.appended as Record<string, unknown>;
  assertEquals(appended.configured, false);
});

Deno.test("lead-export honest 503 when the leads query fails (never a confident empty feed)", async () => {
  const sink = leadsSink({ fail: true });
  await withFetchStub([sink.route], async () => {
    const r = await post(SECRET, { dryRun: true });
    assertEquals(r.status, 503);
  });
});
