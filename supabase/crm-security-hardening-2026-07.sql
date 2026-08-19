-- CRM security hardening (2026-07) — defense-in-depth for the customer-PII
-- tables the admin CRM reads, plus the schedule for the new security-watch
-- anomaly alerter.
--
-- Context: crm-api masks phone/email by DEFAULT and serves the raw value only
-- through the audited `revealContact` action; it now also rate-limits per caller
-- and answers an allowlisted Origin (not `*`). This migration closes the loop at
-- the DB + ops layer:
--   (1) FORCE row level security on the PII tables, so even the table OWNER obeys
--       RLS. The edge functions use the service_role, which bypasses RLS by
--       design (that is how crm-api reads them) — FORCE only removes the
--       owner-bypass foot-gun, it does NOT change how the functions work.
--   (2) Schedule security-watch every 15 min (pg_cron → net.http_post, gated on
--       the same lead_webhook_secret Vault secret the other internal jobs use).
--
-- Re-runnable and order-independent vs the other migrations. No table shape
-- changes; RLS is already ENABLED on all of these (this only adds FORCE).

-- ── (1) FORCE RLS on the customer-PII tables ────────────────────────────────
-- `enable` already set elsewhere; `force` additionally subjects the owner role
-- to the policies. service_role still bypasses RLS (unchanged), so crm-api /
-- whatsapp-webhook keep working; a stray owner-context query no longer sees raw
-- rows without a policy.
alter table public.security_audit_log     force row level security;
alter table public.whatsapp_contacts      force row level security;
alter table public.whatsapp_conversations force row level security;
alter table public.whatsapp_messages      force row level security;
alter table public.leads                  force row level security;
alter table public.meetings               force row level security;

-- ── (2) security-watch schedule (every 15 minutes) ──────────────────────────
-- cron.schedule UPSERTS by name, so re-running this file re-points the job.
-- To DISABLE later:  select cron.unschedule('security-watch-15min');
select cron.schedule(
  'security-watch-15min',
  '*/15 * * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/security-watch',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{}'::jsonb
    )
  $$
);


-- ── Notes the owner must verify in the live project ──────────────────────────
-- • Deploy the function first:  supabase functions deploy security-watch --no-verify-jwt
--   (it fail-CLOSES on the secret, so it is safe to schedule before/after deploy;
--    a call without the secret is a logged 401 no-op).
-- • Reuses the existing 'lead_webhook_secret' + telegram_bot_token/chat_id Vault
--   secrets — nothing new to provision. Missing secret ⇒ 503/no-op (safe).
-- • FORCE RLS does NOT affect the service_role edge functions (they bypass RLS).
--   If a future admin SQL script runs as the table owner and expects to read
--   these tables, it must add an explicit policy or use the service role.
-- • Manual dry-run (no Telegram post; shows what WOULD alert):
--     select net.http_post(
--       url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/security-watch',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--       ),
--       body    := '{"dryRun": true}'::jsonb
--     );
-- • Inspect runs:  select * from cron.job where jobname = 'security-watch-15min';
--                  select * from cron.job_run_details
--                    where jobid = (select jobid from cron.job where jobname = 'security-watch-15min')
--                    order by start_time desc limit 10;
