-- ════════════════════════════════════════════════════════════════════════════
-- COMMUNITY-DIGEST CRON — weekly re-engagement email (2026-07). Roadmap item #5.
-- DRAFT — do NOT auto-apply. Review, then run once in the SQL editor / psql.
--
-- Schedules the edge function supabase/functions/community-digest to fire once a
-- week (Sunday morning IL). The function emails each OPTED-IN member a summary of
-- their own UNREAD community notifications from the past week, and skips anyone
-- with nothing new (truth-only — never a hollow "nothing happened").
--
-- Auth: the function is fail-CLOSED on the shared `lead_webhook_secret` (sent in
-- the `x-webhook-secret` header) — the SAME secret that already backs lead-digest /
-- notify-lead / community-notify / renewal-reminders. This job reads it from Vault
-- and passes it through pg_net.
--
-- SAFE before opt-in exists: with zero opted-in members the run emails nobody and
-- returns { sent: 0 }. SAFE if email/secret is unset: it 503s / no-ops and logs.
--
-- Idempotent: the do-block no-ops if pg_cron/pg_net are absent; cron.schedule
-- UPSERTS by job name, so re-running just re-points 'community-digest-weekly'.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Prereqs: pg_cron (scheduler) + pg_net (outbound HTTP) ────────────────────
-- Both ship with Supabase (already enabled for lead-digest); guarded so this file
-- is safe to run even where a platform restriction blocks creating them.
do $$
begin
  begin
    create extension if not exists pg_cron schema cron;
  exception when others then
    raise notice 'community-digest-cron: could not ensure pg_cron (%) — enable it in the dashboard, then re-run', sqlerrm;
  end;
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'community-digest-cron: could not ensure pg_net (%) — enable it in the dashboard, then re-run', sqlerrm;
  end;
end $$;

-- ── Schedule: 06:00 UTC every Sunday  ≈ 08:00–09:00 Israel ──────────────────
-- EXACT cron expression:  '0 6 * * 0'  (minute=0, hour=06 UTC, day-of-week 0=Sun).
-- Israel observes DST, so 06:00 UTC lands at 09:00 (IDT, summer) / 08:00 (IST,
-- winter) — a Sunday-morning "week recap" slot, comfortably OUTSIDE quiet hours.
-- pg_cron runs in UTC (no timezone support); a fixed UTC hour is the honest choice.
--
-- cron.schedule upserts by name, so re-running this file re-points the job.
-- To DISABLE later:  select cron.unschedule('community-digest-weekly');
select cron.schedule(
  'community-digest-weekly',
  '0 6 * * 0',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/community-digest',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- ── Notes the owner must verify in the live project ──────────────────────────
-- • Prereq: apply supabase/community-digest-2026-07.sql FIRST (adds the opt-in
--   column the function reads). Then deploy the community-digest edge fn. Then run
--   THIS file. Order matters only in that the column must exist before a real run.
-- • The 'lead_webhook_secret' Vault secret MUST be set (it already backs the other
--   cron jobs). Without it the function 503s and emails nobody — a safe, logged no-op.
-- • Resend must be configured (resend_api_key + resend_from in Vault / env), else
--   the run reports { note: "email-not-configured", sent: 0 } (still 200).
-- • Manual DRY-RUN (builds everything, emails NOBODY, returns what WOULD send):
--     select net.http_post(
--       url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/community-digest',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--       ),
--       body    := '{"dryRun": true}'::jsonb
--     );
-- • Inspect runs:   select * from cron.job where jobname = 'community-digest-weekly';
--                   select * from cron.job_run_details
--                     where jobid = (select jobid from cron.job where jobname = 'community-digest-weekly')
--                     order by start_time desc limit 10;
-- ════════════════════════════════════════════════════════════════════════════
