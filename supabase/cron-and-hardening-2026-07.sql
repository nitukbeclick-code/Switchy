-- ═══════════════════════════════════════════════════════════════════════════
-- cron-and-hardening — 2026-07-03
-- Registers the THREE renewal-reminders schedules that schema.sql documented as
-- "run these once in the SQL editor" but were never applied in prod (only the
-- daily digest is live). Their absence means the booker confirmation / T-24h
-- reminder emails, the 10-minute lead-delivery sweep, and the weekly report
-- NEVER fire on schedule. Plus one tiny function-hardening lint.
--
-- ⚠️ APPLY MANUALLY (owner-gated). Verify pg_cron is enabled first; the daily
--    digest job already runs this exact net.http_post pattern, so the plumbing
--    (vault secret, pg_net) is proven. cron.schedule UPSERTS by name, so this is
--    idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Missing renewal-reminders schedules ───────────────────────────────────
-- All POST to the renewal-reminders edge fn with a `mode`; the shared secret is
-- read from Vault (identical to the live 'renewal-reminders-daily' job).

-- (a) SLA escalations + booker confirmation/T-24h emails — HOURLY at :05.
--     This is the one that carries the meeting booker emails (mode follow-up →
--     runFollowUp → meeting_followup planner). Its absence is why a customer who
--     books a Zoom slot never gets a confirmation/reminder on schedule.
select cron.schedule(
  'lead-followup-hourly',
  '5 * * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"follow-up"}'::jsonb
    )
  $$
);

-- (b) Unnotified-lead delivery sweep — every 10 minutes. A lead whose insert-time
--     Telegram ping failed is otherwise never retried until the next daily run.
select cron.schedule(
  'lead-sweep-10min',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"sweep"}'::jsonb
    )
  $$
);

-- (c) Weekly business digest — Sunday 07:00 UTC (start of the Israeli work week).
select cron.schedule(
  'weekly-digest',
  '0 7 * * 0',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"weekly"}'::jsonb
    )
  $$
);

-- ── 2. Function hardening (advisor 0011) ─────────────────────────────────────
-- leads_consent_stamp is a BEFORE-INSERT/UPDATE trigger with a role-mutable
-- search_path. It only calls now() (pg_catalog) and touches NEW columns — no
-- unqualified object refs — so an empty search_path is the strict, safe fix and
-- closes the "mutable search_path" lint without changing behavior.
alter function public.leads_consent_stamp() set search_path = '';

-- NOT included on purpose:
--   • increment_savings — the advisor flags it SECURITY DEFINER + authenticated-
--     callable, but the body is self-guarded (id = uid AND id = auth.uid()), so a
--     caller can only ever touch their OWN row. Revoking EXECUTE would break the
--     app's savings increment (supabase_backend.dart:297). Left as-is by design.
--   • pg_net in public — moving the extension would break the net.http_post calls
--     in every cron command above. The lint is cosmetic; the risk of moving it
--     outweighs it. Accepted.
