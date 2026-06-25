-- ════════════════════════════════════════════════════════════════════════════
-- LEAD-DIGEST CRON — proactive morning digest + stale-lead SLA nudge (2026-06).
-- DRAFT — do NOT auto-apply. Review, then run once in the SQL editor / psql.
--
-- Schedules the NEW edge function supabase/functions/lead-digest to fire each
-- morning. The function:
--   (a) pushes the daily executive digest (REUSES buildDailyDigest) to the team
--       Telegram chat, and
--   (b) posts a short "X לידים ללא מענה, הוותיק Yש׳" SLA nudge for new leads that
--       were never contacted and have waited past the 2h response SLA.
--
-- Auth: the function is fail-CLOSED on the shared `lead_webhook_secret` (sent in
-- the `x-webhook-secret` header). This job reads that secret from Vault and passes
-- it through pg_net — exactly the pattern the meetings INSERT trigger and the
-- commented renewal-reminders schedules in schema.sql already use.
--
-- Idempotent / re-runnable:
--   • the `do $$ … $$` guard no-ops cleanly if pg_cron / pg_net are not installed;
--   • cron.schedule UPSERTS by job name, so re-running this file just re-points
--     the existing 'lead-digest-morning' job (no duplicate jobs).
--
-- The edge fn is DEPLOY-SAFE before this runs (nothing calls it until the job
-- exists) and SAFE if the secret is missing (it 503s and posts nothing).
-- ════════════════════════════════════════════════════════════════════════════


-- ── Prereqs: pg_cron (scheduler) + pg_net (outbound HTTP) ────────────────────
-- Both ship with Supabase; enable once. Guarded so this file is safe to run even
-- where a platform restriction blocks creating them (it just raises a notice).
do $$
begin
  begin
    create extension if not exists pg_cron schema cron;
  exception when others then
    raise notice 'lead-digest-cron: could not ensure pg_cron (%) — enable it in the dashboard, then re-run', sqlerrm;
  end;
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'lead-digest-cron: could not ensure pg_net (%) — enable it in the dashboard, then re-run', sqlerrm;
  end;
end $$;


-- ── Schedule: 05:30 UTC daily  ≈ 08:30 Israel ───────────────────────────────
-- EXACT cron expression:  '30 5 * * *'  (minute=30, hour=05 UTC, every day).
--
-- Israel observes DST, so the 05:30 UTC slot lands at:
--   • 08:30  during Israel Daylight Time (IDT, UTC+3 — late Mar → late Oct), and
--   • 07:30  during Israel Standard Time (IST, UTC+2 — late Oct → late Mar).
-- pg_cron has no timezone support (it runs in UTC), so a fixed UTC hour is the
-- honest, simplest choice — 07:30–08:30 is the intended "start of the work-day"
-- window either way, comfortably OUTSIDE quiet hours. If you want a hard 08:30
-- year-round, run two seasonal jobs ('30 5 …' for summer, '30 6 …' for winter)
-- and re-point them at each DST switch — NOT done here to keep one job.
--
-- cron.schedule upserts by name, so re-running this file re-points the job.
-- To DISABLE later:  select cron.unschedule('lead-digest-morning');
select cron.schedule(
  'lead-digest-morning',
  '30 5 * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/lead-digest',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);


-- ── Notes the owner must verify in the live project ──────────────────────────
-- • Apply this file (review first). Re-runnable; order-independent vs the other
--   2026-06 migrations. It only touches the cron schedule — no table changes.
-- • The 'lead_webhook_secret' Vault secret MUST be set (it already backs
--   notify-lead / community-notify / renewal-reminders). Without it the function
--   returns 503 and posts nothing — a safe, logged no-op.
-- • Telegram must be configured (telegram_bot_token + telegram_chat_id in Vault),
--   or sendTelegram is a no-op and the run reports sent:false (still 200).
-- • Manual dry-run (no posts; shows what WOULD send):
--     select net.http_post(
--       url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/lead-digest',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--       ),
--       body    := '{"dryRun": true}'::jsonb
--     );
-- • Inspect runs:   select * from cron.job where jobname = 'lead-digest-morning';
--                   select * from cron.job_run_details
--                     where jobid = (select jobid from cron.job where jobname = 'lead-digest-morning')
--                     order by start_time desc limit 10;
-- ════════════════════════════════════════════════════════════════════════════
