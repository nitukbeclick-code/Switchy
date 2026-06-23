-- Adds the admin flag the CRM endpoint (crm-api) gates on. requireAdmin() in
-- supabase/functions/_shared/admin.ts reads profiles.is_admin for the caller's
-- uid and refuses anyone whose flag isn't true (fail-closed).
--
-- Defaults to false so existing rows stay non-admin; grant individual users by
-- updating their profile row (e.g. update public.profiles set is_admin = true
-- where id = '<uid>';). NOT NULL keeps the gate unambiguous.
--
-- Apply manually (do NOT auto-apply): run against the prod project once.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Grants access to the admin CRM (crm-api edge function). Fail-closed: only true unlocks it.';
