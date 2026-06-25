-- ════════════════════════════════════════════════════════════════════════════
-- observability-sentry-2026-06.sql
--
-- ⚠️ NOT auto-applied. This is a DRAFT. Review, then run manually against the
--    project (orzitfqmlvopujsoyigr) — e.g. via the Supabase SQL editor or
--    `npx supabase db execute`. Idempotent: safe to re-run.
--
-- Purpose:
--   Un-dark edge observability. functions/_shared/config.ts now reads a
--   `sentry_dsn` secret from the get_lead_notify_config() Vault allow-list and
--   hands it to functions/_shared/observability.ts (captureError/captureMessage).
--   Until the RPC whitelists `sentry_dsn`, the Vault path returns nothing and the
--   loader falls back to the SENTRY_DSN env var (also normally unset) — i.e.
--   observability stays a dark no-op. This FULL REPLACEMENT adds `sentry_dsn` to
--   the allow-list so, the moment the owner stores the secret, captures begin
--   POSTing to Sentry with NO code change and NO redeploy of any call site.
--
--   This changes ONLY the whitelist (adds one name). Every previously-listed
--   secret name is preserved verbatim (mirrors schema.sql §8 / google-logging-
--   2026-06.sql — the canonical/latest copy).
--
-- ⚠️ OWNER: before running, confirm the deployed function's whitelist matches the
--   names below so no existing key is dropped — run:
--     select prosrc from pg_proc where proname = 'get_lead_notify_config';
--
-- The function returns a {name: secret} JSON object consumed by config.ts.
-- DROP first: CREATE OR REPLACE aborts (42P13) if the deployed original's return
-- type differs; the revoke/grant below re-applies the permissions.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists public.get_lead_notify_config();
create function public.get_lead_notify_config()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name in (
     'telegram_bot_token', 'telegram_chat_id', 'telegram_allowed_user_ids',
     'resend_api_key', 'resend_from', 'leads_notify_email',
     'openai_api_key', 'anthropic_api_key', 'gemini_api_key', 'lead_webhook_secret',
     -- Zoom Server-to-Server OAuth (optional)
     'zoom_account_id', 'zoom_client_id', 'zoom_client_secret', 'zoom_host_email',
     -- Google integration (Calendar event sync + Sheets lead logging). Keep BOTH
     -- the legacy names AND the owner's ACTUAL Vault names (config.ts reads the
     -- latter: google_service_account / leads_spreadsheet_id / switchy_calendar_id)
     -- so applying this never drops the live Google-logging secrets.
     'google_service_account_key', 'google_calendar_id', 'google_spreadsheet_id',
     'google_service_account', 'leads_spreadsheet_id', 'switchy_calendar_id',
     -- Observability (optional) — Sentry DSN for edge error/message capture.
     -- config.ts reads this; '' / absent keeps _shared/observability.ts dark.
     'sentry_dsn'
   );
$$;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- Owner: store the DSN after creating a Sentry project
-- (sentry.io → Settings → Projects → <project> → Client Keys (DSN)):
-- select vault.create_secret('https://<publicKey>@<host>/<projectId>', 'sentry_dsn');
--
-- To go dark again, delete the secret (the loader falls back to env, then '' ⇒ no-op):
-- select vault.delete_secret('sentry_dsn');
