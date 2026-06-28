-- ════════════════════════════════════════════════════════════════════════════
-- RETENTION — newsletter_subscribers minimisation
--   Companion to data-protection-2026-06.sql. Makes the newsletter data honest
--   with the published privacy policy ("kept while subscribed; unconfirmed /
--   erased rows removed"): double opt-in rows that were NEVER confirmed are
--   abandoned data and get removed, and the anti-abuse source_ip is scrubbed
--   once it is no longer needed.
--
-- WHY a separate function (not folded into purge_expired_personal_data):
--   the core sweep covers leads + whatsapp_*. newsletter_subscribers has its own
--   lifecycle — double opt-in via `confirmed_at`, and NO status column (an
--   unsubscribe / erasure deletes the row outright). It therefore gets its own
--   bounded sweep rather than bloating the proven function.
--
-- WHY profiles are NOT swept here: a registered user's profile (incl.
--   registration_ip + the consent timestamps) is INTENTIONALLY retained as the
--   legal proof of consent for as long as the account exists; deletion happens on
--   account closure / erasure request (account lifecycle), exactly as the privacy
--   policy states. There is no over-retention to fix there.
--
-- DEPLOY: NOT applied automatically. Review, then run against the live project
--   (psql / Supabase SQL editor / `supabase db push`). Idempotent: create-or-
--   replace + cron upsert. Mirrors the SECURITY DEFINER + pinned search_path +
--   counts-only audit pattern of data-protection-2026-06.sql.
--
-- RETENTION POLICY (controller-set; the owner/lawyer can tune the intervals):
--   • Unconfirmed double opt-in (confirmed_at IS NULL) ... deleted after 30 days
--     (the person never confirmed — abandoned data, minimise).
--   • source_ip on confirmed subscribers ................ scrubbed after 12 months
--     (anti-abuse / rate-limit signal only — NOT the consent proof, which is
--     `consent` + `confirmed_at`, both retained).
--   • Confirmed subscribers themselves ................... kept while subscribed;
--     an unsubscribe / erasure request deletes the row (handled elsewhere).
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.purge_expired_newsletter_data(
  p_unconfirmed_days integer default 30,
  p_ip_months        integer default 12
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted     bigint := 0;
  v_ip_scrubbed bigint := 0;
begin
  -- ── abandoned double opt-in: never confirmed, past the grace window ─────────
  with del as (
    delete from public.newsletter_subscribers
     where confirmed_at is null
       and created_at < now() - make_interval(days => p_unconfirmed_days)
     returning 1
  )
  select count(*) into v_deleted from del;

  -- ── scrub the anti-abuse IP on long-confirmed rows (keep the subscription) ──
  with upd as (
    update public.newsletter_subscribers
       set source_ip = null
     where source_ip is not null
       and confirmed_at is not null
       and confirmed_at < now() - make_interval(months => p_ip_months)
     returning 1
  )
  select count(*) into v_ip_scrubbed from upd;

  -- ── audit: one counts-only row per run (never the deleted PII) ──────────────
  insert into public.security_audit_log (user_id, event, detail)
  values (
    null,
    'retention_purge_newsletter',
    jsonb_build_object(
      'unconfirmed_deleted', v_deleted,
      'source_ip_scrubbed',  v_ip_scrubbed,
      'unconfirmed_days',    p_unconfirmed_days,
      'ip_months',           p_ip_months
    )
  );
end;
$$;

comment on function public.purge_expired_newsletter_data(integer, integer) is
  'Newsletter data-minimisation: deletes never-confirmed double-opt-in rows past the grace window and scrubs the anti-abuse source_ip on long-confirmed subscribers; writes a counts-only row to security_audit_log. Called monthly by retention-purge-newsletter-monthly.';

-- Lock the function down: no client may call it (it bypasses RLS on a PII table).
revoke all on function public.purge_expired_newsletter_data(integer, integer)
  from public, anon, authenticated;

-- ── Schedule: 1st of every month, 03:40 UTC (just after the core purge 03:30) ─
-- cron.schedule upserts by name, so re-running this file just re-points the job.
select cron.schedule(
  'retention-purge-newsletter-monthly',
  '40 3 1 * *',
  $$ select public.purge_expired_newsletter_data() $$
);
