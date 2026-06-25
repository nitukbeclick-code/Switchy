// ────────────────────────────────────────────────────────────────────────────
// GET /api/wallet-stats — the REAL aggregate behind the site's honest "social
// proof" block (<SocialProof>). Reads public.get_savings_stats() (an aggregate of
// public.leads.actual_saving — the ₪/year reps actually recorded in the won-flow;
// see supabase/wallet-stats-2026-06.sql) via the service-role key, and returns a
// publish decision + rounded figures shaped by lib/wallet-stats.
//
// E-E-A-T / HONESTY (ABSOLUTE): this route NEVER fabricates a "X users saved ₪Y".
//   • The numbers are a genuine aggregate of recorded savings — nothing invented.
//   • `published` is true ONLY when the real sample clears the publish threshold
//     (SOCIAL_PROOF_MIN_MEMBERS). Below it the client renders NOTHING / a neutral
//     fallback — a tiny, non-representative sample is never paraded as proof.
//   • Realized savings are "מבוסס דיווח" (based on reports), labeled honestly by
//     the UI — never a guaranteed promise.
//
// READ MODEL: the RPC is service_role-only (no PII leaves it — only counts +
// shekel aggregates). We use the service-role key, which lives ONLY in
// SUPABASE_SERVICE_ROLE_KEY and never reaches the browser (same posture as
// /api/lead, /api/rights, /api/price-history). When the key is absent OR the RPC
// errors, we degrade to an UNPUBLISHED (but well-formed) 200 payload so the block
// simply renders nothing rather than the page erroring — social proof is an
// enhancement, never load-bearing.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import {
  EMPTY_RAW_STATS,
  normalizeRawStats,
  summarizeStats,
  SOCIAL_PROOF_MIN_MEMBERS,
  type SavingsSummary,
} from "@/lib/wallet-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface WalletStatsResponse {
  ok: boolean;
  /** The honesty-gated summary. `published` is false → render nothing. */
  summary: SavingsSummary;
}

/** The safe, UNPUBLISHED summary used whenever we can't read real figures. */
const EMPTY_SUMMARY: SavingsSummary = summarizeStats(EMPTY_RAW_STATS);

function json(body: WalletStatsResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The aggregate moves slowly (a won lead is recorded occasionally); a short
      // cache keeps this read off the DB for repeat / concurrent views while
      // staying fresh enough. A stale-but-honest figure is harmless.
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export async function GET(): Promise<Response> {
  // No service-role key configured → degrade to UNPUBLISHED (200), so the social
  // proof block renders nothing rather than the page erroring.
  if (!SERVICE_ROLE_KEY) return json({ ok: true, summary: EMPTY_SUMMARY });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("get_savings_stats");

  // On any RPC error, degrade to UNPUBLISHED (200) — the block is non-load-bearing
  // and must never break the page. We deliberately do not leak the error.
  if (error || !data) return json({ ok: true, summary: EMPTY_SUMMARY });

  // get_savings_stats() returns a single aggregate row; PostgREST surfaces it as
  // a one-element array (or, for a scalar RPC, the object directly). Take the
  // first row defensively.
  const row = Array.isArray(data) ? data[0] : data;
  const raw = normalizeRawStats(row);
  const summary = summarizeStats(raw, SOCIAL_PROOF_MIN_MEMBERS);

  return json({ ok: true, summary });
}
