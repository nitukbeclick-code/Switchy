-- Rich, owner-editable detail columns on public.plans (2026-06).
--
-- WHY: the site/app plan-detail surface ("מידע נוסף") and the WhatsApp bot want
--   the full benefit list + small-print that the app catalogue carries, but
--   public.plans only had the structured flags (plans-enrich-2026-06.sql) and the
--   curation columns (providers-2026-06.sql). This adds the three remaining
--   owner-editable detail columns so the OWNER can curate them directly in the
--   Supabase dashboard and have every reading surface pick them up live:
--     feats      jsonb  — array of benefit strings ("what is included")
--     fine_lines jsonb  — array of small-print strings
--     notes      text   — free-text editor note
--   (terms text, specs jsonb, fees jsonb already exist — reused, not re-added.)
--
-- READ MODEL (unchanged): public.plans is "publicly readable" (schema.sql §grants:
--   grant select on public.plans to anon, authenticated;). Adding columns to an
--   already-granted table keeps that SELECT privilege. There is NO anon/auth write
--   grant — the owner edits via the dashboard (service_role / dashboard bypasses
--   RLS), so anon can read the curated detail but never write it. This block only
--   REAFFIRMS the public-read policy + SELECT grant; it does not widen writes.
--
-- REALTIME: public.plans joins the `supabase_realtime` publication (guarded add,
--   mirroring plan-price-history-realtime-2026-06.sql) with REPLICA IDENTITY FULL
--   so the app receives the OWNER's dashboard edits live (and UPDATE/DELETE events
--   carry the full old row, not just the PK). Realtime honours RLS, so subscribers
--   only ever see change events for rows they may already read (everyone — public).
--
-- CACHE-BUSTING: public.plans carries updated_at (plans-enrich-2026-06.sql). This
--   file ensures a BEFORE UPDATE touch trigger stamps it on every edit, so caches
--   keyed on updated_at invalidate the moment the owner saves in the dashboard.
--
-- Idempotent / re-runnable: add-column-if-not-exists, guarded publication add,
--   drop-then-create policy, create-or-replace function, drop-then-create trigger.
--   Apply manually (reviewed + applied via MCP); do NOT auto-apply.

-- ── (1) owner-editable detail columns ───────────────────────────────────────
alter table public.plans
  add column if not exists feats      jsonb,
  add column if not exists fine_lines jsonb,
  add column if not exists notes      text;

comment on column public.plans.feats      is 'Owner-editable array of benefit strings ("what is included"). Curated in the Supabase dashboard; read live by the site/app/bot. null = not curated.';
comment on column public.plans.fine_lines is 'Owner-editable array of small-print strings (the full "פרטים נוספים" bullets). Curated in the dashboard. null = not curated.';
comment on column public.plans.notes      is 'Owner-editable free-text note shown on the plan-detail surface. Curated in the dashboard. null/empty = no note.';

-- ── (2) reaffirm public-read RLS + SELECT grant (NO write surface) ──────────
-- Mirrors "providers public read" (providers-2026-06.sql). RLS-on + a public
-- select policy + the anon/auth SELECT grant make the catalogue readable by
-- everyone; there is deliberately no insert/update/delete policy or grant for
-- anon/authenticated, so all writes are owner-only (dashboard / service_role,
-- which bypass RLS).
alter table public.plans enable row level security;

drop policy if exists "plans public read" on public.plans;
create policy "plans public read" on public.plans
  for select to anon, authenticated using (true);

grant select on public.plans to anon, authenticated;  -- "publicly readable" catalogue (reaffirm)

-- ── (3) Realtime: publication membership (guarded) + REPLICA IDENTITY FULL ──
-- Only add when the table exists and is not already published, so a re-run is a
-- no-op and never errors (mirrors plan-price-history-realtime-2026-06.sql).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plans'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plans'
  ) then
    alter publication supabase_realtime add table public.plans;
    raise notice 'plans-rich-fields: added public.plans to supabase_realtime.';
  else
    raise notice 'plans-rich-fields: publication add skipped (table missing or already published).';
  end if;
end $$;

-- REPLICA IDENTITY FULL so UPDATE/DELETE realtime events ship the full old row
-- (needed for the app to diff curated detail changes, not just the PK). Safe to
-- set unconditionally; only runs when the table exists.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plans'
  ) then
    alter table public.plans replica identity full;
    raise notice 'plans-rich-fields: set REPLICA IDENTITY FULL on public.plans.';
  end if;
end $$;

-- ── (4) updated_at touch trigger (cache-busting) ────────────────────────────
-- Reuse the canonical public.set_updated_at() (schema.sql). Guard on the column
-- existing (plans-enrich-2026-06.sql adds it) so this file is safe standalone.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plans' and column_name = 'updated_at'
  ) then
    drop trigger if exists plans_set_updated_at on public.plans;
    create trigger plans_set_updated_at before update on public.plans
      for each row execute function public.set_updated_at();
    raise notice 'plans-rich-fields: ensured plans_set_updated_at touch trigger.';
  else
    raise notice 'plans-rich-fields: skipped touch trigger (plans.updated_at missing — run plans-enrich-2026-06.sql first).';
  end if;
end $$;
