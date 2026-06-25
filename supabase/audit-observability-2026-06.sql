-- Audit + Observability layer (2026-06).
-- ─────────────────────────────────────────────────────────────────────────────
-- Three concerns, all idempotent / re-runnable and grant-gap-safe (this project's
-- default privileges do NOT grant to service_role, so every new object is granted
-- explicitly — see schema.sql §grants, whatsapp-2026-06.sql, crm-takeover-2026-06.sql
-- for the same documented incident):
--
--   (1) public.security_audit_log .............. ensure it EXISTS (it may already
--       have been created by legal-consent-2026-06.sql; this file is ADDITIVE and
--       guarantees the table + the service_role insert/select grants the edge
--       functions need — crm-api & whatsapp-webhook append Reg.13 audit rows via
--       the service role). Column shape is the CANONICAL one from
--       legal-consent-2026-06.sql: (id, user_id, event, detail jsonb, ip, created_at).
--       The CRM control actions (takeOver/handBack/sendReply/setContactStatus/
--       setLeadStatus) record the actor + entity inside `detail`, keyed by `event`.
--
--   (2) public.get_analytics_events(p_event, p_days, p_limit) ... a service_role-
--       only SECURITY DEFINER rollup over public.analytics_events
--       (analytics-events-2026-06.sql) for the admin observability dashboard:
--       per-day counts for one event over the trailing N days.
--
--   (3) public.purge_analytics_events(p_days) ... retention sweep that deletes
--       analytics_events older than N days (default 90). SECURITY DEFINER,
--       service_role only, and scheduled monthly via pg_cron (the
--       'analytics-purge-monthly' job, monitored by _shared/cron_health.ts).
--
-- ⚠️  DRAFT — DO NOT AUTO-APPLY. Review, then apply MANUALLY:
--       psql "$DATABASE_URL" -f supabase/audit-observability-2026-06.sql
--     (or paste into the Supabase SQL editor). Safe to run before or after
--     legal-consent-2026-06.sql / data-protection-2026-06.sql / analytics-events-2026-06.sql.


-- ════════════════════════════════════════════════════════════════════════════
-- (1) security_audit_log — ensure it exists + re-assert service_role grants
-- ════════════════════════════════════════════════════════════════════════════
-- CANONICAL shape (mirrors legal-consent-2026-06.sql exactly so the two files
-- never drift — `create table if not exists` is a no-op when that file ran first).
-- Service-role only: RLS on with NO client policy → anon/authenticated get
-- nothing; service_role bypasses RLS. Used by:
--   • crm-api .......... takeOver / handBack / sendReply / setContactStatus /
--                        setLeadStatus  (admin actor inside detail)
--   • whatsapp-webhook . STOP/opt-out + §11 first-contact notices
--   • purge_expired_personal_data() ... one counts-only row per monthly run
create table if not exists public.security_audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,                                  -- the actor's auth uid; null for pre-auth/system events
  event      text        not null,                  -- e.g. crm_takeover / crm_handback / crm_reply / consent_recorded
  detail     jsonb       not null default '{}'::jsonb,  -- actor + entity ids + a PII-light preview; bounded
  ip         inet,
  created_at timestamptz not null default now()
);

create index if not exists security_audit_log_created_idx on public.security_audit_log (created_at desc);
create index if not exists security_audit_log_user_idx    on public.security_audit_log (user_id, created_at desc);
create index if not exists security_audit_log_event_idx   on public.security_audit_log (event, created_at desc);

alter table public.security_audit_log enable row level security;

-- Deny-all to clients (no policy = no client access; this revoke is belt-and-braces
-- against any stray default grant). service_role bypasses RLS regardless.
revoke all on public.security_audit_log from anon, authenticated;

-- Grant-gap: default privileges do NOT grant to service_role here, so the edge
-- functions (crm-api / whatsapp-webhook, service-role) silently 403 on insert
-- without this. SELECT lets get_security_audit-style admin reads work too.
grant insert, select on public.security_audit_log to service_role;

comment on table public.security_audit_log is
  'Reg.13 security audit trail (service-role only; RLS on, no client policy). Edge functions append rows: crm-api logs admin CRM control actions (takeOver/handBack/sendReply/setContactStatus/setLeadStatus) with the actor uid + entity ids + a PII-light preview inside detail; whatsapp-webhook logs STOP/opt-out + §11 notices; purge_expired_personal_data writes one counts-only retention row per run.';


-- ════════════════════════════════════════════════════════════════════════════
-- (2) get_analytics_events(p_event, p_days, p_limit) — admin rollup
-- ════════════════════════════════════════════════════════════════════════════
-- Per-day counts for a single analytics event over the trailing p_days, newest
-- day first, capped at p_limit rows. SECURITY DEFINER so it can read the
-- service-role-only analytics_events table; granted to service_role ONLY (the
-- admin observability surface calls it through an edge fn, never the client).
-- Pure read: no writes, bounded inputs.
create or replace function public.get_analytics_events(
  p_event text,
  p_days  integer default 30,
  p_limit integer default 90
) returns table (day date, events bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', ae.created_at)::date as day,
    count(*)                               as events
  from public.analytics_events ae
  where (p_event is null or ae.event = p_event)
    and ae.created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  group by 1
  order by 1 desc
  limit greatest(1, least(coalesce(p_limit, 90), 366));
$$;

-- Lock down: no client may call it (it bypasses RLS on analytics_events).
revoke all on function public.get_analytics_events(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_analytics_events(text, integer, integer) to service_role;

comment on function public.get_analytics_events(text, integer, integer) is
  'Admin observability rollup: per-day counts for one analytics_events event over the trailing p_days (1..365), capped at p_limit rows (1..366), newest day first. SECURITY DEFINER, service_role only.';


-- ════════════════════════════════════════════════════════════════════════════
-- (3) purge_analytics_events(p_days) — retention sweep (> 90 days)
-- ════════════════════════════════════════════════════════════════════════════
-- analytics_events is high-volume funnel telemetry; it should not accumulate
-- forever. This deletes rows older than p_days (default 90), returns how many it
-- removed, and writes one counts-only audit row (no PII; analytics_events carries
-- none anyway). SECURITY DEFINER (reaches the service-role-only table) with a
-- pinned search_path; service_role only. Re-runnable.
create or replace function public.purge_analytics_events(
  p_days integer default 90
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days    integer := greatest(1, coalesce(p_days, 90));
  v_deleted integer := 0;
begin
  delete from public.analytics_events
    where created_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;

  -- One counts-only Reg.13 row per run (mirrors purge_expired_personal_data).
  insert into public.security_audit_log (user_id, event, detail)
  values (
    null,
    'analytics_purge',
    jsonb_build_object('analytics_events_deleted', v_deleted, 'days', v_days)
  );

  return v_deleted;
end;
$$;

revoke all on function public.purge_analytics_events(integer)
  from public, anon, authenticated;
grant execute on function public.purge_analytics_events(integer) to service_role;

comment on function public.purge_analytics_events(integer) is
  'Analytics retention sweep: deletes public.analytics_events older than p_days (default 90) and writes one counts-only row to security_audit_log. Called monthly by the analytics-purge-monthly pg_cron job.';

-- ── Schedule: 2nd of every month, 03:40 UTC (after retention-purge-monthly at
--    03:30 on the 1st — staggered, low-traffic). cron.schedule upserts by name,
--    so re-running this file just re-points the job. _shared/cron_health.ts
--    watches 'analytics-purge-monthly' (monthly cadence) for silent failure.
select cron.schedule(
  'analytics-purge-monthly',
  '40 3 2 * *',
  $$ select public.purge_analytics_events() $$
);
