-- ═══════════════════════════════════════════════════════════════════════════
-- renewal-email-optin — 2026-06
-- Opt-in + idempotency columns for the customer-facing renewal-radar reminder
-- EMAIL (renewal-reminders Edge Function, mode "renewal-emails").
--
-- DRAFT MIGRATION — review and apply manually:
--   supabase db execute --file supabase/renewal-email-optin-2026-06.sql
-- (Do NOT auto-apply. The Edge Function is deploy-safe before this runs: the
--  filtered SELECT 400s on the missing columns → the mode is a logged no-op
--  until these columns exist.)
--
-- COMPLIANCE (Spam-Law §30A): renewal reminder emails are sent ONLY to tracked
-- plans whose owner explicitly opted in (reminder_opt_in = true). The email
-- itself carries a working unsubscribe link + sender identity (handled in the
-- Edge Function template). reminder_email_sent_at gives per-renewal idempotency
-- so we never re-mail the same renewal window.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tracked_plans
  add column if not exists reminder_opt_in boolean not null default false,
  add column if not exists reminder_email_sent_at timestamptz;

comment on column public.tracked_plans.reminder_opt_in is
  'User opted in to receive renewal-radar reminder EMAILS (Spam-Law §30A consent). Default false — no email without explicit opt-in.';
comment on column public.tracked_plans.reminder_email_sent_at is
  'When the last renewal reminder email was sent for this row. Used for per-renewal idempotency (claim-before-send) — a value predating promo_end_date means the next renewal window may be mailed again.';

-- Partial index for the Edge Function''s candidate query: opt-in rows with an
-- upcoming promo_end_date that haven''t been mailed for the current window.
create index if not exists tracked_plans_renewal_email_due_idx
  on public.tracked_plans (promo_end_date)
  where reminder_opt_in = true;

-- ── REST exposure for the service-role Edge Function ─────────────────────────
-- The renewal-emails mode reads tracked_plans (+ embedded profiles) and PATCHes
-- reminder_email_sent_at via PostgREST with the service role. RLS already
-- restricts tracked_plans to its owner; the service role bypasses RLS. No new
-- grant to anon/authenticated — these columns are bot-managed only.
-- (If grants were stripped, re-assert the service_role baseline here.)
grant select, update on public.tracked_plans to service_role;
