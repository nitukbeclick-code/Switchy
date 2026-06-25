-- ─────────────────────────────────────────────────────────────────────────────
-- street-prices-web-2026-06 — the WHOLE-CATEGORY street-price aggregate for the
-- public web transparency view (web/app/street-prices/** + GET /api/street-price).
--
-- ADDITIVE companion to street-prices-2026-06.sql (which the street-price Edge
-- Function owns: it defines public.street_prices + the plan/provider-scoped
-- get_street_price(p_plan_id, p_provider) aggregate). That RPC answers "what do
-- people pay for THIS plan / at THIS provider?"; the public /street-prices page
-- instead shows "what do people pay for cellular / internet / … as a whole?" — a
-- per-CATEGORY aggregate. This file adds ONLY that category-scoped read; it does
-- NOT touch the existing table, policies, or the plan/provider RPC.
--
-- TRUTH-ONLY / E-E-A-T (ABSOLUTE — identical posture to get_street_price):
--   • Aggregates ONLY status='approved' rows — nothing pending/rejected counts,
--     nothing is seeded, invented, extrapolated or back-filled.
--   • DISTINCT-reporter counting: the threshold + every figure are computed over
--     COUNT(DISTINCT reporter_hash), so one person reporting ten times cannot
--     manufacture a quorum or skew the median.
--   • HONESTY GATE: a category returns price figures ONLY when its distinct
--     approved reporters clear the threshold (v_min_reports, kept == the Edge fn's
--     STREET_PRICE_MIN_REPORTS = 5 and the plan/provider RPC's gate). Below the
--     threshold a row is STILL returned with the count (so the UI can say "צריך
--     עוד N דיווחים") but every PRICE figure is NULL — the chart then renders
--     NOTHING rather than a fabricated, non-representative "typical price".
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role, so EXECUTE is granted EXPLICITLY to service_role and revoked from
-- public/anon/authenticated — the web GET route calls this via the REST API with
-- the service-role key (the raw table is never client-readable). Mirrors
-- get_street_price() / get_savings_stats().
--
-- DEPLOY: NOT applied automatically. Apply MANUALLY after review, AFTER
-- street-prices-2026-06.sql (it depends on public.street_prices existing):
--   psql "$DATABASE_URL" -f supabase/street-prices-2026-06.sql
--   psql "$DATABASE_URL" -f supabase/street-prices-web-2026-06.sql
-- Idempotent / re-runnable (create-or-replace function + guarded grants).
-- ─────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════════
-- get_street_prices_by_category(p_min_reports) — per-category honest aggregate
-- ════════════════════════════════════════════════════════════════════════════
-- Returns ONE row per category that has at least ONE approved report, with the
-- distinct-reporter count and (above the threshold) the median/avg/min/max. The
-- web GET route asks for ALL categories at once and renders each — published when
-- it clears the gate, an honest empty state otherwise. SECURITY DEFINER + pinned
-- search_path so the service-role caller reads the aggregate without a broad table
-- grant and past RLS; NO PII, NO raw rows leave the function.
--
-- Params:
--   p_min_reports integer — the publish threshold (defaults to 5; the web lib
--                           passes STREET_PRICE_MIN_REPORTS so write/read agree).
-- Returns, per category with >= 1 approved report:
--   category        text       — 'cellular'|'internet'|'tv'|'triple'|'abroad'
--   report_count    bigint     — # of DISTINCT approved reporters in the category
--   meets_threshold boolean    — true iff report_count >= p_min_reports
--   median_price    integer    — median ₪/month (NULL below threshold)  ← headline
--   avg_price       integer    — mean ₪/month, rounded (NULL below threshold)
--   min_price       integer    — cheapest reported (NULL below threshold)
--   max_price       integer    — dearest reported (NULL below threshold)
create or replace function public.get_street_prices_by_category(
  p_min_reports integer default 5
)
returns table(
  category        text,
  report_count    bigint,
  meets_threshold boolean,
  median_price    integer,
  avg_price       integer,
  min_price       integer,
  max_price       integer
)
language sql
stable
security definer
set search_path = public
as $$
  with per_cat as (
    select
      sp.category,
      count(distinct sp.reporter_hash)                                            as n_reporters,
      round(percentile_cont(0.5) within group (order by sp.reported_price))::int  as med,
      round(avg(sp.reported_price))::int                                          as mean,
      min(sp.reported_price)::int                                                 as lo,
      max(sp.reported_price)::int                                                 as hi
    from public.street_prices sp
    where sp.status = 'approved'
    group by sp.category
  )
  select
    pc.category,
    pc.n_reporters                                                  as report_count,
    pc.n_reporters >= greatest(1, coalesce(p_min_reports, 5))       as meets_threshold,
    case when pc.n_reporters >= greatest(1, coalesce(p_min_reports, 5)) then pc.med  end as median_price,
    case when pc.n_reporters >= greatest(1, coalesce(p_min_reports, 5)) then pc.mean end as avg_price,
    case when pc.n_reporters >= greatest(1, coalesce(p_min_reports, 5)) then pc.lo   end as min_price,
    case when pc.n_reporters >= greatest(1, coalesce(p_min_reports, 5)) then pc.hi   end as max_price
  from per_cat pc;
$$;

-- service_role only — never callable by clients (would let anyone probe / amplify
-- the aggregate). The web route reads it via REST with the service-role key.
revoke execute on function public.get_street_prices_by_category(integer) from public, anon, authenticated;
grant  execute on function public.get_street_prices_by_category(integer) to service_role;

comment on function public.get_street_prices_by_category(integer) is
  'Public "מחיר הרחוב" per-CATEGORY aggregate for the /street-prices web view: median/avg/min/max + DISTINCT-reporter count over APPROVED public.street_prices, grouped by category. Price figures returned ONLY when distinct approved reporters >= p_min_reports (kept == STREET_PRICE_MIN_REPORTS); below it the count is returned but every price is NULL. SECURITY DEFINER, service_role-only, no PII / no raw rows leave the function.';

-- ─────────────────────────────────────────────────────────────────────────────
-- After this SQL: the Next GET /api/street-price route calls this RPC via the
-- REST API using SUPABASE_SERVICE_ROLE_KEY. Verify (0 rows until reports seed):
--   select * from public.get_street_prices_by_category(5);
-- ─────────────────────────────────────────────────────────────────────────────
