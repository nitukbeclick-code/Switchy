-- ════════════════════════════════════════════════════════════════════════════
-- Provider capabilities (2026-06) — owner-editable per-provider feature flags.
--
-- Single SOURCE OF TRUTH for which providers offer a Zoom video-meeting booking.
-- Read by all three surfaces (Flutter app, Next mobile web /book, static site),
-- so the owner edits ONE place (the Supabase dashboard) and every surface stays
-- in sync. Default false ⇒ a provider must be explicitly opted in.
--
-- Provider ids are the EXACT catalogue ids (public.plans.provider), Hebrew-first.
-- Apply manually after review. Idempotent / re-runnable.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.provider_capabilities (
  provider              text primary key,
  supports_zoom_meeting boolean not null default false,
  updated_at            timestamptz not null default now()
);

comment on table public.provider_capabilities is
  'Owner-editable per-provider capability flags. supports_zoom_meeting gates the Zoom video-meeting booking across the app + web + static site (single source of truth). provider = the exact public.plans.provider id. Edit in the Supabase dashboard.';
comment on column public.provider_capabilities.supports_zoom_meeting is
  'true ⇒ this provider offers a Zoom consultation booking; false/absent ⇒ the booking UI shows "currently does not support Zoom calls". Owner-controlled.';

alter table public.provider_capabilities enable row level security;

-- Public read (the gate list is not secret); writes are service_role / dashboard only.
drop policy if exists "provider_capabilities public read" on public.provider_capabilities;
create policy "provider_capabilities public read" on public.provider_capabilities
  for select to anon, authenticated using (true);

grant select on public.provider_capabilities to anon, authenticated;
grant all on public.provider_capabilities to service_role;

-- ── Seed: the 10 Zoom-supported providers (exact catalogue ids) ───────────────
insert into public.provider_capabilities (provider, supports_zoom_meeting) values
  ('פרטנר', true),
  ('yes', true),
  ('STING TV', true),
  ('HOT', true),
  ('NextTV', true),
  ('סלקום', true),
  ('גולן טלקום', true),
  ('בזק', true),
  ('פלאפון', true),
  ('הוט מובייל', true)
on conflict (provider) do update
  set supports_zoom_meeting = excluded.supports_zoom_meeting,
      updated_at = now();

-- Everyone else (019 מובייל, Xphone, רמי לוי, וואלה מובייל, גילת, CCC, WeCom,
-- Airalo eSIM, electricity suppliers, …) has no row ⇒ supports_zoom_meeting=false
-- by the read-side default, so they show the "not supported" state.
