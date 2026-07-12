-- street-price-kanonymity-2026-07.sql
-- Privacy hardening for the crowd-sourced street-price feature.
--
-- get_street_price() aggregates community-reported plan prices. To prevent any
-- single crowd-sourced report from being inferred from the published figures,
-- the aggregates (median / min / max / avg / first_at / last_at) are gated
-- behind a k-anonymity threshold: they are only disclosed once at least
-- v_min_reports DISTINCT reporter_hash values back a given plan/provider.
--
-- This migration raises that threshold from 5 to 10 (a stronger k-anonymity
-- floor). report_count and meets_threshold stay always-returned — a bare count
-- discloses no individual price. The RETURNS TABLE shape is unchanged, so the
-- /api/street-price route and the Flutter/site consumers keep working as-is.
--
-- Tunable: if long-tail plans stay hidden once real data accrues, lower
-- v_min_reports toward 8. Never below 5.
--
-- ✅ CANONICAL get_street_price() — supersedes the k=5 copy in
-- street-prices-2026-06.sql §3 (banner added there).
--
-- ── The TWO street-price RPCs now have DIFFERENT k-anonymity floors — BY
-- DESIGN. Do not "fix" either one blindly:
--   • get_street_price (THIS file)            → floor 10 (v_min_reports below).
--     It answers for a SINGLE plan / provider cohort — the narrowest published
--     aggregate, where a min/max can come within inference distance of one
--     person's real bill. 10 distinct reporters is the deliberate floor here.
--   • get_street_prices_by_category
--     (street-prices-web-2026-06.sql)         → floor 5 (p_min_reports default,
--     the web lib passes STREET_PRICE_MIN_REPORTS = 5).
--     It aggregates a WHOLE CATEGORY — many plans and providers pooled — so
--     each reporter hides in a much larger, coarser crowd; 5 remains the
--     intended threshold there. Its header comment claiming the gate is "kept
--     == the plan/provider RPC's gate" predates this file and is stale — the
--     per-RPC floors above are canonical.
--   • The edge fn constant STREET_PRICE_MIN_REPORTS (street-price/lib.ts) is
--     still 5: it drives the category RPC + the "need N more reports" UI copy.
--     A plan/provider cohort with 5–9 reporters therefore shows as "collected"
--     by the messaging while the DB (correctly) still withholds its figures.
--     If that mismatch bites, raise the constant — never lower this floor.

CREATE OR REPLACE FUNCTION public.get_street_price(p_plan_id text DEFAULT NULL::text, p_provider text DEFAULT NULL::text)
 RETURNS TABLE(report_count bigint, typical_price integer, median_price integer, min_price integer, max_price integer, avg_price integer, meets_threshold boolean, first_at timestamp with time zone, last_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_min_reports constant integer := 10;
begin
  return query
  with matched as (
    select sp.reported_price, sp.reporter_hash, sp.created_at
    from public.street_prices sp
    where sp.status = 'approved'
      and (
        (p_plan_id is not null and sp.plan_id = p_plan_id)
        or
        (p_plan_id is null and p_provider is not null and sp.provider = p_provider)
      )
  ),
  agg as (
    select
      count(distinct reporter_hash) as n_reporters,
      round(percentile_cont(0.5) within group (order by reported_price))::int as med,
      min(reported_price)::int as lo,
      max(reported_price)::int as hi,
      round(avg(reported_price))::int as mean,
      min(created_at) as f_at,
      max(created_at) as l_at
    from matched
  )
  select
    coalesce(a.n_reporters, 0)                                   as report_count,
    case when a.n_reporters >= v_min_reports then a.med  end     as typical_price,
    case when a.n_reporters >= v_min_reports then a.med  end     as median_price,
    case when a.n_reporters >= v_min_reports then a.lo   end     as min_price,
    case when a.n_reporters >= v_min_reports then a.hi   end     as max_price,
    case when a.n_reporters >= v_min_reports then a.mean end     as avg_price,
    coalesce(a.n_reporters, 0) >= v_min_reports                  as meets_threshold,
    case when a.n_reporters >= v_min_reports then a.f_at end     as first_at,
    case when a.n_reporters >= v_min_reports then a.l_at end     as last_at
  from agg a;
end;
$function$;
