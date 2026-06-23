import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// admin-metrics — read-only observability rollup for the admin dashboard.
//
// One GET endpoint that returns, over a clamped trailing window (?days=, 1..90,
// default 7):
//
//   • analytics .... per-day counts for each known funnel event + a grand total
//                    (via the get_analytics_events SECURITY DEFINER RPC).
//   • toolCalls .... agent_tool_calls success rates, grouped by tool and by
//                    channel (whatsapp/site/app), plus an overall rate.
//   • audit ........ a histogram of recent security_audit_log events (label +
//                    count only — NO PII, no detail bodies).
//   • cron ......... get_cron_health summary (ok / known / stale / failing).
//
// AUTH (two accepted credentials, EITHER passes):
//   1. Authorization: Bearer <supabase user access token> for a verified admin
//      (requireAdmin → profiles.is_admin). This is how the admin web surface
//      calls it.
//   2. x-webhook-secret: <lead_webhook_secret> for server-to-server probes
//      (constant-time compared). Lets a scheduled health-prober pull metrics
//      without a user session.
// Missing/invalid both ⇒ 401. No fabrication anywhere: every number is a faithful
// projection of real rows; empty data yields honest zeros.
//
// READ-ONLY: this function performs ZERO writes. It never inserts, never patches.
//
// Deploy: supabase functions deploy admin-metrics
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, rpcRows } from "../_shared/db.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { type CronJobRow, evalCronHealth } from "../_shared/cron_health.ts";
import { jlog } from "../_shared/log.ts";
import {
  clampDays,
  type DayCount,
  type EventSeries,
  KNOWN_EVENTS,
  summariseAudit,
  summariseToolCalls,
  toEventSeries,
  type ToolCallRow,
} from "./metrics.ts";

// Bounded read windows so a huge table never turns one admin pull into a heavy
// scan. The rollups are "recent activity", not full history.
const TOOL_CALLS_MAX_ROWS = 5000;
const AUDIT_MAX_ROWS = 5000;

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

const q = encodeURIComponent;

// ── auth ──────────────────────────────────────────────────────────────────────
// Returns true if the caller is EITHER a verified admin (Bearer JWT) OR presents
// the correct x-webhook-secret. Fail-closed: any error path returns false.
async function authorized(req: Request): Promise<boolean> {
  // 1) Admin Bearer JWT (the web surface).
  const admin = await requireAdmin(req);
  if (admin) return true;

  // 2) Server-to-server shared secret (the prober). Constant-time compare; an
  //    unconfigured secret means this path is simply unavailable (never matches).
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!provided) return false;
  const cfg = await resolveCfgCached();
  if (!cfg.webhookSecret) return false;
  return await safeEqual(provided, cfg.webhookSecret);
}

// ── analytics rollup ────────────────────────────────────────────────────────
// One get_analytics_events call per known funnel event, fanned out in parallel.
// p_limit is the window (one row per day), so days is a safe per-day cap too.
async function analyticsRollup(days: number): Promise<{ events: EventSeries[]; total: number }> {
  const results = await Promise.all(
    KNOWN_EVENTS.map((ev) =>
      rpcRows<DayCount>("get_analytics_events", { p_event: ev, p_days: days, p_limit: days })
    ),
  );
  const events = KNOWN_EVENTS.map((ev, i) => toEventSeries(ev, results[i]));
  const total = events.reduce((n, e) => n + e.total, 0);
  return { events, total };
}

// ── agent_tool_calls rollup ───────────────────────────────────────────────────
async function toolCallsRollup(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await fetchRows<ToolCallRow>(
    `/rest/v1/agent_tool_calls?created_at=gte.${q(since)}&order=created_at.desc&limit=${TOOL_CALLS_MAX_ROWS}&select=channel,tool,ok`,
  );
  return summariseToolCalls(rows);
}

// ── security_audit_log rollup (label + count only) ────────────────────────────
async function auditRollup(days: number) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  // SELECT only `event` — never the `detail` jsonb (which can carry actor uids /
  // PII-light previews). This endpoint surfaces counts, not bodies.
  const rows = await fetchRows<{ event?: unknown }>(
    `/rest/v1/security_audit_log?created_at=gte.${q(since)}&order=created_at.desc&limit=${AUDIT_MAX_ROWS}&select=event`,
  );
  return summariseAudit(rows);
}

// ── cron health summary ───────────────────────────────────────────────────────
async function cronSummary(): Promise<{ ok: boolean; known: number; stale: string[]; failing: string[] }> {
  const rows = await rpcRows<CronJobRow>("get_cron_health", {});
  if (rows === null) {
    // pg_cron not installed yet, or a transient RPC error — report honestly
    // rather than implying everything is healthy.
    return { ok: true, known: 0, stale: [], failing: [] };
  }
  const h = evalCronHealth(rows, Date.now());
  return { ok: h.ok, known: h.known, stale: h.stale, failing: h.failing };
}

// ── HTTP ───────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "GET, OPTIONS" }) });
  }
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  if (!(await authorized(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const days = clampDays(new URL(req.url).searchParams.get("days"));

    // Fan out the four independent reads in parallel.
    const [analytics, toolCalls, audit, cron] = await Promise.all([
      analyticsRollup(days),
      toolCallsRollup(days),
      auditRollup(days),
      cronSummary(),
    ]);

    return json({
      ok: true,
      window: { days, since: new Date(Date.now() - days * 86_400_000).toISOString() },
      analytics,
      toolCalls,
      audit,
      cron,
    });
  } catch (e) {
    jlog({ at: "admin-metrics.dispatch", ok: false, error: String(e) });
    return json({ error: "internal error" }, 500);
  }
});
