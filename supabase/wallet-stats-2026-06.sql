-- ─────────────────────────────────────────────────────────────────────────────
-- wallet-stats-2026-06 — get_savings_stats(): the REAL aggregate behind the
-- web "social proof" block (web/app/api/wallet-stats/route.ts → SocialProof).
--
-- DRAFT — do NOT auto-apply. Paste into the Supabase SQL Editor (project
-- orzitfqmlvopujsoyigr) and run once; it is idempotent / re-runnable. The
-- definition is also intended to be folded into schema.sql for fresh installs.
--
-- HONESTY / E-E-A-T (ABSOLUTE): this function returns a *genuine* aggregate of
-- public.leads.actual_saving — the ₪/year a rep actually recorded via the
-- Telegram won-flow ("כמה חסכנו?"). It NEVER fabricates a "X users saved ₪Y":
--   • `members` counts ONLY won leads that carry a real, positive actual_saving;
--   • `total_saving` / `avg_saving` / `median_saving` are computed from those
--     same rows — nothing is invented or extrapolated;
--   • the web layer renders NOTHING until `members` clears a real publish
--     threshold (SOCIAL_PROOF_MIN_MEMBERS in lib/wallet-stats.ts), so a tiny,
--     non-representative sample is never paraded as proof.
-- The realized savings are "מבוסס דיווח" (based-on-report) — labeled honestly in
-- the UI, never presented as a guaranteed promise.
--
-- SECURITY: security definer + pinned search_path so the Edge/Next service-role
-- caller can read the aggregate without a broad table grant. We do NOT expose any
-- PII — only counts and shekel aggregates leave this function. Execute is granted
-- to service_role ONLY (this project's default privileges do NOT grant to
-- service_role; see schema.sql §grants), and explicitly revoked from
-- public/anon/authenticated so no client can call it directly.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_savings_stats()
returns table(
  members        bigint,   -- # of won leads with a real, positive actual_saving
  total_saving   bigint,   -- Σ actual_saving over those rows (₪/year)
  avg_saving     integer,  -- mean actual_saving, rounded (₪/year)
  median_saving  integer,  -- median actual_saving, rounded (₪/year)
  max_saving     integer,  -- single largest recorded actual_saving (₪/year)
  first_at       timestamptz, -- earliest such lead (how long we've been tracking)
  last_at        timestamptz  -- most recent recorded saving
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)                                                           as members,
    coalesce(sum(actual_saving), 0)                                    as total_saving,
    coalesce(round(avg(actual_saving))::int, 0)                        as avg_saving,
    coalesce(
      round(percentile_cont(0.5) within group (order by actual_saving))::int,
      0
    )                                                                  as median_saving,
    coalesce(max(actual_saving), 0)                                    as max_saving,
    min(created_at)                                                    as first_at,
    max(created_at)                                                    as last_at
  from public.leads
  where status = 'won'
    and actual_saving is not null
    and actual_saving > 0;
$$;

-- service_role only — never callable by clients.
revoke execute on function public.get_savings_stats() from public, anon, authenticated;
grant  execute on function public.get_savings_stats() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- After this SQL (from the repo root, logged into the right Supabase account):
--   supabase link --project-ref orzitfqmlvopujsoyigr
-- No function (re)deploy is needed — the Next route calls this RPC via the REST
-- API using SUPABASE_SERVICE_ROLE_KEY. Verify it returns a single row:
--   select * from public.get_savings_stats();
-- ─────────────────────────────────────────────────────────────────────────────
