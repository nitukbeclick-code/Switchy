import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// lead-digest — Switchy AI
// A PROACTIVE, cron-driven push to the team Telegram chat (no user reads it on
// demand — pg_cron fires it). Two parts in one pass:
//
//   (a) MORNING DIGEST — the same count-led executive brief the team can pull
//       with /digest, but pushed automatically each morning. It REUSES the
//       existing buildDailyDigest (over the agenda data) + sendTelegram from
//       notify-lead/_shared — never duplicated here.
//
//   (b) STALE-LEAD SLA NUDGE — a short "X לידים ללא מענה, הוותיק Yש׳" line for
//       leads that breached the response SLA: still status=new, never contacted
//       (contacted_at IS NULL), and created more than SLA_HOURS ago. This is the
//       single most actionable number for a rep, surfaced on its own so it can't
//       hide inside the digest.
//
// Auth: gated on the shared webhook secret (x-webhook-secret header), exactly
// like the other internal triggers (notify-lead, community-notify,
// renewal-reminders). Fail-CLOSED — no secret configured, or a mismatch, → 401/503
// and nothing is posted. The cron job (lead-digest-cron-2026-06.sql) supplies the
// header from Vault.
//
// Fail-soft everywhere else: a failed query / Telegram miss is logged via jlog and
// degrades the response, but never throws to the caller (the cron run just retries
// next tick). Truth-only: every number comes from a real PostgREST read; an
// agenda-query failure suppresses that section rather than inventing "all clear".
//
// POST body (optional): { dryRun?: boolean } — when true, builds everything and
// returns the would-send text WITHOUT posting (for a safe manual check).
//
// Deploy: supabase functions deploy lead-digest --no-verify-jwt
// Schedule: see supabase/lead-digest-cron-2026-06.sql (pg_cron + pg_net, ~08:30 IL).
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { fetchRows } from "../_shared/db.ts";
import { sendTelegram } from "../_shared/telegram.ts";
import { buildDailyDigest, fetchAgenda } from "../_shared/agenda.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";

// Pure SLA helpers live in ./lib.ts so tests can import them WITHOUT loading this
// module — its top-level Deno.serve would otherwise be cached before the capture
// stub installs (see tests/_capture_handler.ts).
import { buildStaleNudge, selectStaleLeads, SLA_HOURS, type StaleLead } from "./lib.ts";

const enc = encodeURIComponent;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
  });
}

// ── agenda fetch ──────────────────────────────────────────────────────────────
// SHARED with notify-lead's /today + /digest (_shared/agenda.ts fetchAgenda).
// The cron reads up to 200 uncontacted leads (vs the commands' interactive 30)
// so the morning digest counts stay honest on a big backlog. A null return
// (failed query) suppresses the digest instead of pushing a hollow "all clear".
const AGENDA_LEAD_LIMIT = 200;

// ── stale-lead fetch ──────────────────────────────────────────────────────────
// Pre-filter DB-side: status=new AND contacted_at IS NULL AND created more than
// SLA_HOURS ago. Returns null on a failed query (so we can stay honest about a
// query miss vs a genuinely empty queue).
async function fetchStaleLeads(nowMs: number): Promise<StaleLead[] | null> {
  const cutoff = enc(new Date(nowMs - SLA_HOURS * 3_600_000).toISOString());
  return await fetchRows<StaleLead>(
    `/rest/v1/leads?select=id,name,phone,status,contacted_at,created_at&status=eq.new&contacted_at=is.null&created_at=lt.${cutoff}&order=created_at.asc&limit=500`,
  );
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" },
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const cfg = await resolveCfgCached();

  // Fail-CLOSED secret gate — identical contract to the other internal triggers.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  let body: { dryRun?: boolean } = {};
  try { body = await req.json() as { dryRun?: boolean }; } catch (_) { /* empty body is fine */ }
  const dryRun = body.dryRun === true;
  const nowMs = Date.now();

  // Build both parts from REAL reads. Each section is independent and fail-soft:
  // a miss on one never blocks the other.
  const [agenda, stale] = await Promise.all([fetchAgenda(AGENDA_LEAD_LIMIT), fetchStaleLeads(nowMs)]);

  const digestText = agenda ? buildDailyDigest(agenda, nowMs) : "";
  const staleSelected = stale ? selectStaleLeads(stale, nowMs) : [];
  const nudgeText = buildStaleNudge(staleSelected, nowMs);

  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      digest: { ready: !!agenda, text: digestText },
      nudge: { stale: staleSelected.length, text: nudgeText },
    });
  }

  // Push: digest first (the full morning brief), then the SLA nudge as its own
  // message so it stands out. Skip a section that has nothing to say — never spam
  // an "all clear". A null agenda means the query failed → say nothing rather than
  // posting a misleading empty digest.
  let digestOk = false;
  if (agenda && digestText) {
    const r = await sendTelegram(cfg, digestText);
    digestOk = r.ok;
  }
  let nudgeOk = false;
  if (nudgeText) {
    const r = await sendTelegram(cfg, nudgeText);
    nudgeOk = r.ok;
  }

  jlog({
    at: "lead-digest",
    digest_sent: digestOk,
    digest_query_ok: !!agenda,
    stale: staleSelected.length,
    nudge_sent: nudgeOk,
    stale_query_ok: stale !== null,
  });

  return json({
    ok: true,
    digest: { sent: digestOk, queryOk: !!agenda },
    nudge: { sent: nudgeOk, stale: staleSelected.length, queryOk: stale !== null },
  });
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is configured).
// An UNEXPECTED throw outside handle's own fail-soft paths is surfaced to
// captureError and degraded to a 503 in the function's existing { ok:false, error }
// shape — never a new body shape. captureError is NOT awaited and never throws/blocks.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "lead-digest", method: req.method });
    jlog({ at: "lead-digest", ok: false, error: String(e) });
    return json({ ok: false, error: "temporarily unavailable" }, 503);
  }
});
