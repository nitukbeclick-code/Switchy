import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// lead-export — the SELLABLE-lead export feed (the monetization endpoint).
//
// The business SELLS leads to relevant providers. This secret-gated POST endpoint
// is how a configured buyer destination (or an operator dry-run) pulls the feed of
// leads that may LAWFULLY be sold — and ONLY those.
//
//   POST  { category?, status?|status[], since?, until?, limit?, dryRun? }
//         -> { ok, count, total_before_dedup, feed:[…], appended? }
//
// HARD LEGAL GATE (no exception): a lead appears in the feed ONLY when it carries
// an explicit third-party-sharing consent — a non-null public.leads.consent_share_at
// (see lead-consent-share-2026-06.sql). The §30A service consent (terms/privacy)
// and the marketing opt-ins do NOT make a lead sellable; passing a person's data
// to a third party for that party's own use needs its own informed, SEPARATE
// consent under the Privacy Law. The gate is enforced TWICE — defence in depth:
//   1. the PostgREST query filters `consent_share_at=not.is.null`, and
//   2. lib.filterSellable() re-drops any non-consented row before it can reach a
//      buyer (so a query change can never leak one).
//
// What it does:
//   (a) reads sellable leads (status in {new,contacted,won} by default; 'lost' is
//       never sold; optionally narrowed by category / created_at window), via the
//       service role (RLS-bypassing) — the consent PII lives server-side only;
//   (b) DEDUPES the feed with the shared dedupKey (same person+category collapses
//       to ONE billable row, keeping the richest/freshest; a distinct lead is
//       never dropped);
//   (c) returns a clean JSON feed AND, when a buyer destination is configured
//       (a buyer_spreadsheet_id from env; dark when unset), appends each row to a
//       per-category tab via the existing _shared/google_sheets appendRow.
//   { dryRun: true } builds + returns the feed but appends NOTHING.
//
// Auth: fail-CLOSED on the shared webhook secret (x-webhook-secret header) — the
// same contract as notify-lead / lead-digest / community-notify. No secret
// configured, or a mismatch → 503 / 401 and nothing is read or returned.
//
// Fail-soft everywhere else: a failed query yields a logged 503 (never a confident
// "no leads"); a Sheets append miss is logged and degrades `appended` but never
// fails the JSON feed (the feed is the source of truth, the sheet is convenience).
// Truth-only: every field comes from a real lead row; nothing is fabricated.
//
// Deploy: supabase functions deploy lead-export --no-verify-jwt
// Schedule/buyer-config: see supabase/lead-export-2026-06.sql (optional cron + the
// buyer_spreadsheet_id env note) — a DRAFT, not applied.
// ─────────────────────────────────────────────────────────────────────────────

import type { Cfg, Lead } from "../_shared/types.ts";
import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { fetchRows } from "../_shared/db.ts";
import { rateLimit, secretFingerprint } from "../_shared/ratelimit.ts";
import { appendRow, getSheetsToken } from "../_shared/google_sheets.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";
import {
  buildExportRow,
  buyerSheetCells,
  buyerTabFor,
  dedupeFeed,
  type ExportQuery,
  type ExportRow,
  filterSellable,
  parseExportQuery,
} from "./lib.ts";

const enc = encodeURIComponent;

// Authenticated POST traffic here is an operator dry-run or a scheduled buyer pull
// — a handful per minute at most. The cap sits far above that so real pulls pass
// and only a runaway loop / leaked-secret flood gets a 429.
const RL_LIMIT = 60;
const RL_WINDOW_MS = 60_000;

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      ...(extraHeaders ?? {}),
    },
  });
}

// The buyer destination spreadsheet id. DARK unless explicitly configured — when
// unset the feed is still returned (JSON), it just isn't appended anywhere. Read
// from env only (a buyer sheet is distinct from the internal leads-log spreadsheet
// in Cfg.googleSpreadsheetId). The SQL draft documents the env/Vault name.
function buyerSpreadsheetId(): string {
  return (Deno.env.get("BUYER_SPREADSHEET_ID") ?? Deno.env.get("LEAD_BUYER_SPREADSHEET_ID") ?? "").trim();
}

// Build the PostgREST query for sellable leads. The consent gate is in the query
// itself (`consent_share_at=not.is.null`) AND re-checked in lib.filterSellable.
// status is constrained to the requested sellable subset; 'lost' is never sold.
function buildLeadsPath(q: ExportQuery): string {
  const params: string[] = [
    "select=id,name,phone,email,provider,plan_id,source,status,notes,consent_share_at,created_at",
    // HARD GATE: only rows with an explicit third-party-sharing consent.
    "consent_share_at=not.is.null",
    // status ∈ the requested sellable subset (PostgREST in.(…) list).
    `status=in.(${q.statuses.map((s) => enc(s)).join(",")})`,
    "order=created_at.desc",
    `limit=${q.limit}`,
  ];
  if (q.since) params.push(`created_at=gte.${enc(q.since)}`);
  if (q.until) params.push(`created_at=lt.${enc(q.until)}`);
  return `/rest/v1/leads?${params.join("&")}`;
}

// Append the feed to per-category buyer tabs (best-effort). Returns how many rows
// were appended OK. Fail-soft: a token mint or append miss is logged and counted
// as not-appended, never thrown — the JSON feed is unaffected. We mint the token
// ONCE up front so a configured-but-broken sheet doesn't attempt N appends.
async function appendToBuyerSheet(cfg: Cfg, spreadsheetId: string, rows: ExportRow[]): Promise<{ appended: number; configured: boolean }> {
  if (!spreadsheetId || !cfg.googleServiceAccount || rows.length === 0) {
    return { appended: 0, configured: false };
  }
  // appendRow reads cfg.googleSpreadsheetId, so target the BUYER sheet by passing a
  // cfg clone with the buyer id swapped in (we never mutate the shared cfg).
  const buyerCfg: Cfg = { ...cfg, googleSpreadsheetId: spreadsheetId };
  const token = await getSheetsToken(buyerCfg);
  if (!token) {
    jlog({ at: "lead-export.sheet", ok: false, error: "buyer sheet token mint failed" });
    return { appended: 0, configured: true };
  }
  let appended = 0;
  for (const row of rows) {
    const res = await appendRow(buyerCfg, buyerTabFor(row), buyerSheetCells(row));
    if (res.ok) appended++;
  }
  return { appended, configured: true };
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const cfg = await resolveCfgCached();

  // Fail-CLOSED secret gate — identical contract to the other internal triggers.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  // Post-auth throttle (a forged/unsigned flood is already shed by the 401 above).
  const fp = await secretFingerprint(cfg.webhookSecret);
  const rl = rateLimit(`lead-export:${fp}`, RL_LIMIT, RL_WINDOW_MS);
  if (!rl.allowed) {
    jlog({ at: "rate-limit", fn: "lead-export", secret_fp: fp, retry_after: rl.retryAfterSec });
    return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(rl.retryAfterSec) });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json() as Record<string, unknown>; } catch (_) { /* empty body is fine */ }
  const query = parseExportQuery(body);

  // Read the sellable leads. A null return = a FAILED query → honest 503 (do NOT
  // confidently report an empty feed). [] = genuinely no sellable leads matched.
  const rows = await fetchRows<Lead>(buildLeadsPath(query));
  if (rows === null) {
    jlog({ at: "lead-export", ok: false, error: "leads query failed" });
    return json({ ok: false, error: "temporarily unavailable" }, 503);
  }

  // Defence in depth: re-enforce the sellable gate, THEN dedupe, THEN shape. (The
  // query already filtered consent_share_at, but filterSellable guarantees no
  // unconsented row can ever reach a buyer even if the query is later changed.)
  const sellable = filterSellable(rows);
  const deduped = dedupeFeed(sellable);
  const feed = deduped.map(buildExportRow);

  // Append to the buyer destination unless this is a dry run or the destination is
  // dark. Fully fail-soft — a sheet miss never changes the JSON feed.
  const buyerId = buyerSpreadsheetId();
  let appended: { appended: number; configured: boolean } = { appended: 0, configured: !!buyerId };
  if (!query.dryRun && buyerId) {
    appended = await appendToBuyerSheet(cfg, buyerId, feed);
  }

  jlog({
    at: "lead-export",
    ok: true,
    dryRun: query.dryRun,
    fetched: rows.length,
    sellable: sellable.length,
    feed: feed.length,
    category: query.category,
    statuses: query.statuses,
    buyer_configured: appended.configured,
    appended: appended.appended,
  });

  return json({
    ok: true,
    dryRun: query.dryRun,
    count: feed.length,
    total_before_dedup: sellable.length,
    filters: {
      category: query.category,
      statuses: query.statuses,
      since: query.since,
      until: query.until,
      limit: query.limit,
    },
    feed,
    appended: buyerId
      ? { configured: true, sheet: query.dryRun ? "skipped (dryRun)" : appended.appended }
      : { configured: false },
  });
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is configured).
// An UNEXPECTED throw outside handle's own fail-soft paths is surfaced to
// captureError and degraded to the function's existing 503 { ok:false, error }
// shape (the same "temporarily unavailable" it returns on a failed query) — never
// a new status/body. captureError is NOT awaited and never throws/blocks.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "lead-export", method: req.method });
    jlog({ at: "lead-export", ok: false, error: String(e) });
    return json({ ok: false, error: "temporarily unavailable" }, 503);
  }
});
