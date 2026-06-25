// ────────────────────────────────────────────────────────────────────────────
// GET /api/price-history?plan_id=<id>[&plan_id=<id>…] — REAL price movement for
// one or more catalogue plans, read from public.plan_price_history (the append-only
// daily-snapshot ledger; see supabase/plan-price-history-2026-06.sql).
//
// E-E-A-T / HONESTY: this route NEVER fabricates a price drop. It returns, per
// requested plan, only the snapshots that actually exist, plus a server-computed
// `drop` summary that is non-null ONLY when a genuine week-over-week decrease
// clears the threshold (≥ ₪5 OR ≥ 10%). When there's no history, or no real
// qualifying drop, `drop` is null and the badge renders nothing. No invented
// trends, no manufactured urgency.
//
// READ MODEL: plan_price_history is PUBLIC (anon/authenticated SELECT granted), so
// this is a pure read. We use the service-role key when present (same server-only
// posture as /api/lead and /api/rights — it lives ONLY in SUPABASE_SERVICE_ROLE_KEY
// and never reaches the browser). When the key is absent the route returns an empty
// (but well-formed) payload with 200 so the UI degrades to "no badge" rather than
// erroring — the badge is an enhancement, never load-bearing.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import {
  DROP_MIN_ABS,
  DROP_MIN_PCT,
  computeWeeklyDrop,
  type PricePoint,
  type PriceDrop,
} from "@/lib/price-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cap how many distinct plans one request may ask about — a comparison table has
// a handful of rows, so this is generous while bounding the IN(...) query size.
const MAX_PLAN_IDS = 24;
// How far back a "weekly" drop may be measured from (days). Snapshots are daily,
// but a plan might miss a day; we look back a little past 7 to find the baseline.
const LOOKBACK_DAYS = 14;

/** One plan's history slice + its (possibly null) honest weekly-drop summary. */
export interface PlanPriceHistory {
  planId: string;
  /** Ascending-by-time snapshots within the lookback window (may be empty). */
  points: PricePoint[];
  /** Non-null ONLY when a real qualifying week-over-week drop exists. */
  drop: PriceDrop | null;
}

export interface PriceHistoryResponse {
  ok: boolean;
  /** Keyed by plan id → its history + drop summary. Missing plans are omitted. */
  plans: Record<string, PlanPriceHistory>;
  /** The thresholds applied, echoed so the client can label honestly. */
  thresholds: { minAbs: number; minPct: number };
}

/**
 * Read every requested plan_id from the URL, de-duped + capped. Accepts both the
 * repeated form (?plan_id=a&plan_id=b) and a single comma-separated list
 * (?plan_id=a,b,c) — each param is split on commas so the two forms are
 * interchangeable and mixable.
 */
function parsePlanIds(req: Request): string[] {
  const url = new URL(req.url);
  const ids = new Set<string>();
  for (const param of url.searchParams.getAll("plan_id")) {
    for (const piece of param.split(",")) {
      const id = piece.trim();
      if (id) ids.add(id);
      if (ids.size >= MAX_PLAN_IDS) return [...ids];
    }
  }
  return [...ids];
}

const EMPTY: PriceHistoryResponse = {
  ok: true,
  plans: {},
  thresholds: { minAbs: DROP_MIN_ABS, minPct: DROP_MIN_PCT },
};

function json(body: PriceHistoryResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Short cache: snapshots refresh at most daily, and a stale badge is
      // harmless; this keeps the read off the DB for repeat views.
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export async function GET(req: Request) {
  const planIds = parsePlanIds(req);
  if (planIds.length === 0) return json(EMPTY);

  // No service-role key configured → degrade gracefully to "no history" (200),
  // so the badge simply renders nothing rather than the page erroring.
  if (!SERVICE_ROLE_KEY) return json(EMPTY);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sinceIso = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("plan_price_history")
    .select("plan_id, price, captured_at")
    .in("plan_id", planIds)
    .gte("captured_at", sinceIso)
    .order("captured_at", { ascending: true });

  // On any DB error, degrade to empty (200) — the badge is non-load-bearing and
  // must never break the page. We deliberately do not leak the error to clients.
  if (error || !data) return json(EMPTY);

  // Group snapshots by plan, then compute each plan's honest weekly drop.
  const byPlan = new Map<string, PricePoint[]>();
  for (const row of data) {
    const id = typeof row.plan_id === "string" ? row.plan_id : "";
    const price = typeof row.price === "number" ? row.price : Number(row.price);
    const at =
      typeof row.captured_at === "string" ? row.captured_at : "";
    if (!id || !at || !Number.isFinite(price)) continue;
    const list = byPlan.get(id) ?? [];
    list.push({ price, capturedAt: at });
    byPlan.set(id, list);
  }

  const plans: Record<string, PlanPriceHistory> = {};
  for (const [planId, points] of byPlan) {
    plans[planId] = { planId, points, drop: computeWeeklyDrop(points) };
  }

  return json({
    ok: true,
    plans,
    thresholds: { minAbs: DROP_MIN_ABS, minPct: DROP_MIN_PCT },
  });
}
