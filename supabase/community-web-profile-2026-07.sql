-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-profile-2026-07.sql  (2026-07-06)  — Social wave 5.
--
-- Richer member profile: an optional self-written bio + expose member-since to the
-- public profile. Additive, idempotent. ⚠️ web reads created_at/bio via
-- public_profiles → apply at merge. MCP migration: community_richer_profile_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- Optional short bio (own-write; escaped + length-capped in the UI, hard-capped here).
alter table public.profiles add column if not exists bio text;
comment on column public.profiles.bio is 'Optional self-written community bio (≤280 chars, enforced in UI + the check below).';
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_bio_len' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_bio_len check (bio is null or char_length(bio) <= 280);
  end if;
end $$;

-- Re-assert the FIX-1 column-scoped UPDATE grant WITH bio added (keeps the privileged
-- columns is_admin/is_verified_customer/consent/... OUT — same discipline as
-- community-web-hardening-2026-07.sql FIX 1). REVOKE first so the set is exact.
revoke update on public.profiles from authenticated;
grant update (
  name, avatar_url, community_notify_opt_out, phone, email,
  bills, quiz, renewal_reminders, updated_at, bio
) on public.profiles to authenticated;

-- Expose member-since + bio on the public profile (no PII — created_at is the
-- account age, bio is self-written public text).
create or replace view public.public_profiles as
  select id, name, avatar_url, is_verified_customer, is_admin, verified_customer_at,
         created_at, bio
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- Rollback: recreate public_profiles without created_at/bio; restore the FIX-1 grant
-- without bio; drop constraint profiles_bio_len; alter table drop column bio.
