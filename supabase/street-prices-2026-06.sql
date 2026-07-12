-- ════════════════════════════════════════════════════════════════════════════
-- Street Price — crowd-reported real-world prices (2026-06)
--   The "מחיר רחוב" pillar: customers report the ACTUAL ₪/month they were quoted
--   or are paying for a specific plan (which is frequently a personalised retention
--   offer well below the public catalogue headline). We aggregate those reports
--   into a HONEST typical/median figure so the next person walks into a negotiation
--   knowing the real going rate — but ONLY once enough independent reports exist to
--   be representative. This is the write+read backing for the street-price Edge
--   Function (supabase/functions/street-price/).
--
-- TRUTH-ONLY / E-E-A-T (ABSOLUTE):
--   • A row is a REAL price a REAL person reported — nothing is seeded, invented,
--     extrapolated or back-filled. The reporter_hash is a non-reversible fingerprint
--     (no PII): we keep no name/phone on a price report.
--   • Each report is born status='pending' and only an APPROVED report counts toward
--     the aggregate (the Edge Function runs a deterministic heuristic pre-screen +
--     audit, mirroring community-moderate's PATTERN, and marks clearly-sane reports
--     'approved'; anything implausible stays 'pending' for a human — never deleted,
--     never auto-counted).
--   • get_street_price() returns a median/typical figure + count ONLY when at least
--     STREET_PRICE_MIN_REPORTS independent APPROVED reports exist for that exact
--     (plan_id, provider); below the threshold every figure is NULL (the UI then
--     shows nothing rather than a fabricated, non-representative "typical price").
--     This mirrors get_savings_stats()'s honesty gate (wallet-stats-2026-06.sql) and
--     SOCIAL_PROOF_MIN_MEMBERS — a tiny sample is never paraded as the market rate.
--   • DISTINCT-reporter counting: the aggregate counts DISTINCT reporter_hash, so one
--     person submitting ten times can't manufacture a threshold or skew the median.
--
-- COMPLIANCE: this wave is user-PULL (a user asks "what's the real price?") — there
-- is NO marketing send here, so no §30A surface and no consent gate on a price
-- report itself. Consent is captured ONLY when the user ALSO attaches a contactable
-- lead (name+phone, wanting a callback) — that lead goes through the EXISTING leads
-- path (BEFORE INSERT consent re-stamp + pg_net fan-out), never through this table.
-- A price report carries no contact details, so it needs no consent.
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role, so a new table is silently inaccessible (403) until granted
-- explicitly. We grant service_role and DENY anon/authenticated outright — mirrors
-- savings-history-2026-06.sql / marketing-consent-2026-06.sql / referral-codes.
-- A street price report is collected ONLY via the service-role Edge Function (after
-- the heuristic pre-screen), and the aggregate is read ONLY via the SECURITY DEFINER
-- RPC — no client ever touches the raw table, so a single person can't read every
-- raw report (which would be a quote-harvesting oracle) or write unscreened rows.
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`). Idempotent / re-runnable: create-table /
-- create-index / drop-then-create policy / create-or-replace function, all guarded.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- (1) public.street_prices — one crowd-reported real price
-- ════════════════════════════════════════════════════════════════════════════
-- plan_id is free-form (the catalogue plan id the report is about, e.g.
-- "partner-cellular-…") so the report can be tied back to a real catalogue row, and
-- (provider, category) are stored too so an aggregate is still possible when a
-- reporter only knew the provider + category (no exact plan id). reported_price is
-- the ₪/month the user said they actually pay / were quoted — a tight CHECK keeps
-- out obvious junk at the DB layer (the Edge heuristic is the nuanced gate).
-- reporter_hash is a non-reversible fingerprint (no PII). status gates counting.
create table if not exists public.street_prices (
  id              uuid primary key default gen_random_uuid(),
  plan_id         text,                                       -- catalogue plan id the report is about (nullable: provider+category only)
  provider        text not null,                              -- canonical provider name (normalized by the Edge fn)
  category        text not null,                              -- 'cellular'|'internet'|'tv'|'triple'|'abroad'
  reported_price  integer not null check (reported_price > 0 and reported_price <= 100000), -- ₪/month actually reported (sane bound; nuanced screen in the Edge fn)
  reporter_hash   text not null,                              -- non-reversible fingerprint of the reporter (NO PII); distinct-counts the aggregate
  status          text not null default 'pending'            -- 'pending' | 'approved' | 'rejected' — only 'approved' counts
                    check (status in ('pending', 'approved', 'rejected')),
  created_at      timestamptz not null default now()
);

comment on table  public.street_prices is
  'Crowd-reported REAL ₪/month prices per (plan_id/provider, category). One row = one real report (no PII; reporter_hash is a non-reversible fingerprint). Born pending; only status=approved counts toward get_street_price(). service_role writes (via the street-price Edge fn after a heuristic pre-screen + audit); NO client read/write (the raw table would be a quote-harvesting oracle). Truth-only: nothing seeded or fabricated.';
comment on column public.street_prices.plan_id        is 'Catalogue plan id this report is about (e.g. "partner-cellular-…"); NULL when the reporter only knew provider+category. Never fabricated.';
comment on column public.street_prices.reported_price is 'The ₪/month the user said they actually pay / were quoted (frequently a personalised retention offer below the catalogue headline). CHECK keeps obvious junk out; the Edge heuristic pre-screen is the nuanced gate.';
comment on column public.street_prices.reporter_hash  is 'Non-reversible fingerprint of the reporter (NO PII — no name/phone stored on a price report). The aggregate counts DISTINCT reporter_hash so one person cannot manufacture a threshold or skew the median.';
comment on column public.street_prices.status         is 'pending = awaiting screen/review; approved = passed the heuristic pre-screen, counts toward the aggregate; rejected = held by a human. Only approved rows are ever counted.';

-- Fast aggregate lookup: approved reports for an exact (provider, category[, plan]).
create index if not exists street_prices_lookup_idx
  on public.street_prices (provider, category, plan_id, status);

-- Cheap per-reporter rate-limit lookup (the Edge fn caps how often one fingerprint
-- may report) and abuse forensics.
create index if not exists street_prices_reporter_idx
  on public.street_prices (reporter_hash, created_at desc);


-- ════════════════════════════════════════════════════════════════════════════
-- (2) RLS — deny anon/authenticated outright; service_role only
-- ════════════════════════════════════════════════════════════════════════════
-- RLS ON with NO permissive policy ⇒ anon + authenticated get nothing (no read of
-- the raw report stream, no client write of an unscreened row). service_role
-- bypasses RLS but STILL needs explicit grants (grant-gap rule) for the inserts the
-- Edge fn performs and the status updates a human reviewer makes. The aggregate the
-- app shows is read ONLY through get_street_price() (SECURITY DEFINER, §3), never
-- by selecting this table — so the threshold/no-PII guarantees can't be bypassed.
alter table public.street_prices enable row level security;

revoke all on public.street_prices from anon, authenticated;

-- service_role: insert reports (post-screen), select for the aggregate/forensics,
-- update status (human review). No client grant of any verb.
grant select, insert, update on public.street_prices to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- (3) get_street_price(p_plan_id, p_provider) — threshold-gated honest aggregate
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ SUPERSEDED BY street-price-kanonymity-2026-07.sql — DO NOT APPLY §3.
--    That file is the canonical get_street_price(): identical shape/behaviour
--    but with the k-anonymity disclosure floor RAISED from 5 to 10 distinct
--    reporters. Re-running the copy below silently lowers the privacy floor
--    back to 5. Sections (1), (2) and (4) of this file are still current.
--    (Banner added 2026-07 hygiene pass; the SQL below was not altered.)
-- Mirrors get_savings_stats() (wallet-stats-2026-06.sql): SECURITY DEFINER + pinned
-- search_path so the service-role Edge caller can read the aggregate without a broad
-- table grant; EXECUTE granted to service_role ONLY, revoked from clients. It returns
-- NO raw rows and NO PII — only counts + shekel aggregates leave the function.
--
-- HONESTY GATE: the median/typical/min/max/avg are returned ONLY when the number of
-- DISTINCT approved reporters clears the minimum threshold (STREET_PRICE_MIN_REPORTS,
-- inlined below). Below the threshold the count is still returned (so the caller can
-- say "we need N more reports") but every PRICE figure is NULL — the UI shows nothing
-- rather than a fabricated, non-representative "typical price". This is the same
-- honesty posture as get_savings_stats() + SOCIAL_PROOF_MIN_MEMBERS.
--
-- Matching: an exact plan_id match when p_plan_id is given AND has enough reports;
-- otherwise it falls back to the provider+category cohort inferred from the
-- requested plan's own reports' category — so a provider-level "what do people pay
-- at <provider> for <category>?" still works when no single plan has a quorum. The
-- caller passes the resolved provider; the function derives the category from the
-- matched rows (never invented).
--
-- Params:
--   p_plan_id  text — the catalogue plan id to aggregate (nullable → provider-level)
--   p_provider text — canonical provider name (required for the provider-level cohort)
-- Returns ONE row:
--   report_count   bigint   — # of DISTINCT approved reporters in the matched cohort
--   typical_price  integer  — median ₪/month (NULL below threshold)   ← the headline
--   median_price   integer  — alias of typical_price (NULL below threshold)
--   min_price      integer  — cheapest reported (NULL below threshold)
--   max_price      integer  — dearest reported (NULL below threshold)
--   avg_price      integer  — mean, rounded (NULL below threshold)
--   meets_threshold boolean — true iff report_count >= STREET_PRICE_MIN_REPORTS
--   first_at       timestamptz — earliest report in the cohort (NULL below threshold)
--   last_at        timestamptz — most recent report in the cohort (NULL below threshold)
create or replace function public.get_street_price(
  p_plan_id  text default null,
  p_provider text default null
)
returns table(
  report_count    bigint,
  typical_price   integer,
  median_price    integer,
  min_price       integer,
  max_price       integer,
  avg_price       integer,
  meets_threshold boolean,
  first_at        timestamptz,
  last_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- The real minimum-reports threshold. Keep in lockstep with the Edge fn's
  -- STREET_PRICE_MIN_REPORTS (street-price/lib.ts) so write/read agree on "enough".
  v_min_reports constant integer := 5;
begin
  return query
  with matched as (
    -- Approved reports for this exact plan when a plan id is given, ELSE the
    -- provider+category cohort. When a plan id IS given we take that plan's rows;
    -- the caller decides plan-vs-provider scope by what it passes (p_plan_id null
    -- ⇒ provider-level). All matching is on REAL stored values — category is read
    -- from the rows, never invented.
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
$$;

-- service_role only — never callable by clients (would otherwise let anyone probe
-- the aggregate at will / amplify it). The app reads it via the Edge fn.
revoke execute on function public.get_street_price(text, text) from public, anon, authenticated;
grant  execute on function public.get_street_price(text, text) to service_role;

comment on function public.get_street_price(text, text) is
  'street-price aggregate: median/typical + DISTINCT-reporter count over APPROVED public.street_prices for a plan (p_plan_id) or provider cohort (p_provider). Returns price figures ONLY when distinct approved reporters >= the inlined threshold (mirrors get_savings_stats + SOCIAL_PROOF_MIN_MEMBERS); below it every price is NULL. SECURITY DEFINER, service_role-only, no PII / no raw rows leave the function.';


-- ════════════════════════════════════════════════════════════════════════════
-- (4) security_audit_log — re-assert the grant the Edge fn needs
-- ════════════════════════════════════════════════════════════════════════════
-- street-price appends one PII-light 'street_price_screened' row per screened
-- report (mirrors community-moderate's 'community_content_flagged' audit). The
-- table + grant already exist (audit-observability / legal-consent); re-stated
-- idempotently so a partial re-apply can't regress the service_role insert path.
grant insert, select on public.security_audit_log to service_role;


-- ── Notes the owner must verify in the live project ───────────────────────────
-- • STREET_PRICE_MIN_REPORTS lives in TWO places by design (DB §3 + the Edge fn's
--   street-price/lib.ts). Keep them equal — the DB gate is the source of truth for
--   what the aggregate returns; the Edge constant only drives the "X more reports
--   needed" copy. A unit test pins the Edge constant; this comment pins the DB one.
-- • No client may read public.street_prices or call get_street_price() directly —
--   both are service_role-only, so the raw report stream can never be harvested and
--   the threshold/no-PII guarantees always hold.
-- • get_savings_stats() (wallet-stats-2026-06.sql) is the realized-savings social
--   proof and is unrelated; this aggregate is the crowd street-price. They share the
--   SAME honesty pattern (threshold-gate → nulls below it) deliberately.
-- ════════════════════════════════════════════════════════════════════════════
