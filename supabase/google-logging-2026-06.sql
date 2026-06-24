-- ════════════════════════════════════════════════════════════════════════════
-- google-logging-2026-06.sql
--
-- ⚠️ NOT auto-applied. Review, then run manually against the project
--    (orzitfqmlvopujsoyigr) — e.g. via the Supabase SQL editor or
--    `npx supabase db execute`. Idempotent: safe to re-run.
--
-- Purpose:
--   (1) Un-dark the Google integration keys. The config loader
--       (functions/_shared/config.ts) already reads three Google secrets
--       from the get_lead_notify_config() Vault allow-list —
--         google_service_account_key, google_calendar_id, google_spreadsheet_id
--       — but the RPC's `name in (...)` whitelist never listed them, so the
--       Vault path returned nothing and the loader silently fell back to env.
--       This FULL REPLACEMENT adds the three names to the allow-list.
--   (2) Fix a latent schema bug: notify-lead/meeting_callbacks.ts reads and
--       writes meetings.gcal_event_id (the Google Calendar event id, so a
--       reschedule can PATCH the existing event), but no migration ever added
--       the column. `add column if not exists` makes it exist.
--
-- Canonical copies (schema.sql §8, meetings-2026-06.sql §6) are updated in
-- place in the same change so future deploys stay consistent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Config RPC: add the three Google keys to the Vault allow-list ─────────
-- FULL REPLACEMENT of get_lead_notify_config (mirrors schema.sql §8 — the
-- canonical/latest copy, which already exposes gemini_api_key). The function
-- returns a {name: secret} JSON object consumed by functions/_shared/config.ts.
-- ⚠️ OWNER: before running, confirm the deployed function's whitelist matches
-- the names below (run
--   select prosrc from pg_proc where proname = 'get_lead_notify_config';
-- ) so no existing key is dropped.
-- DROP first: CREATE OR REPLACE aborts (42P13) if the deployed original's
-- return type differs; the revoke/grant below re-applies the permissions.
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
     'zoom_account_id', 'zoom_client_id', 'zoom_client_secret', 'zoom_host_email',
     -- Google integration (Calendar event sync + Sheets lead logging).
     -- config.ts reads these three; without them the loader can only fall
     -- back to the GOOGLE_* env vars.
     'google_service_account_key', 'google_calendar_id', 'google_spreadsheet_id'
   );
$$;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- Owner: store the secrets after creating a Google service account
-- (console.cloud.google.com → IAM & Admin → Service Accounts → keys → JSON),
-- sharing the target Calendar + Spreadsheet with the service-account email:
-- select vault.create_secret('<service-account JSON, single line>', 'google_service_account_key');
-- select vault.create_secret('<calendar id, e.g. primary or ...@group.calendar.google.com>', 'google_calendar_id');
-- select vault.create_secret('<spreadsheet id from the sheet URL>', 'google_spreadsheet_id');

-- ── 2. Latent column: meetings.gcal_event_id ─────────────────────────────────
-- notify-lead/meeting_callbacks.ts writes this on calendar-event create and
-- reads it on reschedule (updateCalendarEventStart). No prior migration added
-- it; this makes the column exist so those reads/writes stop being no-ops.
alter table public.meetings add column if not exists gcal_event_id text;
