-- Plan price history → Realtime publication (2026-06).
--
-- The Flutter app's real-time **Deals feed** (lib/pages/deals/) subscribes to
-- INSERTs on public.plan_price_history so it can surface a fresh price drop the
-- moment the catalogue-sync snapshots a new price. That subscription only
-- delivers events if the table is a member of the `supabase_realtime`
-- publication — the base table DDL (plan-price-history-2026-06.sql) creates the
-- table + RLS + grants but does NOT add it to the publication, so this file
-- closes that gap, mirroring crm_events (crm-takeover-2026-06.sql) and meetings
-- (meetings-2026-06.sql).
--
-- READ MODEL is unchanged: anon + authenticated may SELECT (public Market Pulse
-- trend, already granted). Realtime honours the same RLS, so the app only ever
-- receives change events for rows it is already allowed to read. There is still
-- NO client write policy — only the catalogue-sync (service_role) inserts
-- snapshots — so this does not widen the write surface.
--
-- Idempotent / re-runnable: the DO block only adds the table when it isn't
-- already in the publication, so a second apply is a no-op. Apply manually
-- against the prod project once (do NOT auto-apply); it is safe to apply before
-- or after the base table exists (it guards on table existence).

do $$
begin
  -- Only act when the table exists (so this is safe to apply standalone) and is
  -- not already published (so re-running is a no-op and never errors).
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plan_price_history'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'plan_price_history'
  ) then
    alter publication supabase_realtime add table public.plan_price_history;
    raise notice 'plan-price-history-realtime: added public.plan_price_history to supabase_realtime.';
  else
    raise notice 'plan-price-history-realtime: nothing to do (table missing or already published).';
  end if;
end $$;
