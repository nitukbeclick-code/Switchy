-- ═══════════════════════════════════════════════════════════════════════════
-- HOTFIX: restore ALL lead inserts (site form + Flutter app + WhatsApp handoff).
--
-- THE OUTAGE: the `leads_consent_stamp` BEFORE-INSERT trigger (applied via
-- lead-consent-share-2026-06.sql on 2026-06-25 06:09 UTC) writes to FOUR columns:
--     new.terms_accepted_at, new.privacy_accepted_at,
--     new.marketing_accepted_at, new.consent_share_at
-- …but only `consent_share_at` was ever actually added to public.leads. The other
-- three live in legal-consent-2026-06.sql, which was NEVER applied to the live DB.
-- Result: every INSERT into public.leads raises
--     ERROR: record "new" has no field "terms_accepted_at"
-- and rolls back. Confirmed in postgres logs at 01:14:06 and 01:17:20 UTC (the two
-- WhatsApp "אני רוצה נציג" handoffs) and via information_schema (only consent_share_at
-- present). The lead form, the app, and the rep handoff have all been silently
-- failing since 2026-06-25.
--
-- THE FIX: add the three missing columns. Additive, nullable, idempotent — zero
-- risk. Mirrors legal-consent-2026-06.sql §1 (leads block) exactly.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists terms_accepted_at     timestamptz,
  add column if not exists privacy_accepted_at   timestamptz,
  add column if not exists marketing_accepted_at timestamptz;

-- Same gap on public.profiles (record_registration_consent() writes these five).
-- Not biting yet only because auth.users is empty — fix now so the first real
-- registration doesn't fail the same way. Mirrors legal-consent-2026-06.sql §1.
alter table public.profiles
  add column if not exists terms_accepted_at     timestamptz,
  add column if not exists privacy_accepted_at   timestamptz,
  add column if not exists marketing_accepted_at timestamptz,
  add column if not exists registration_ip       inet,
  add column if not exists consent_version       text;

-- Sanity: all four consent columns the trigger touches now exist.
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='leads'
--      and column_name like '%accepted_at' or column_name='consent_share_at';
