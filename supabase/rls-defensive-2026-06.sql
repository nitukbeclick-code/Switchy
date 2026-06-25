-- Defensive deny-all RLS policies on service-role-only tables (2026-06).
-- ───────────────────────────────────────────────────────────────────────────
-- whatsapp_contacts / whatsapp_conversations / whatsapp_messages
-- (whatsapp-2026-06.sql) and analytics_events (analytics-events-2026-06.sql)
-- all have RLS ENABLED with NO client policies — they are reached only by the
-- service_role (the whatsapp-webhook / crm-api / analytics-track edge fns),
-- which BYPASSES RLS entirely. The Flutter app / site never query them directly.
--
-- "RLS on + zero policies" already denies anon/authenticated everything, so the
-- Supabase advisor raises `rls_enabled_no_policy` (INFO) for each. This adds an
-- explicit deny-all-for-authenticated policy per table to:
--   1. silence that advisory (the table now has a policy), and
--   2. harden against accidental future grants — if someone later GRANTs a verb
--      to authenticated by mistake, `using (false) with check (false)` still
--      denies every row, so the table can't silently start leaking.
--
-- Because these tables are touched only by service_role (which bypasses RLS),
-- a deny-all for authenticated changes NOTHING functionally — it just makes the
-- linter happy and the security intent explicit. Idempotent / re-runnable:
-- each policy is dropped-if-exists before being (re)created.

drop policy if exists "whatsapp_contacts_no_client" on public.whatsapp_contacts;
create policy "whatsapp_contacts_no_client" on public.whatsapp_contacts
  for all to authenticated using (false) with check (false);

drop policy if exists "whatsapp_conversations_no_client" on public.whatsapp_conversations;
create policy "whatsapp_conversations_no_client" on public.whatsapp_conversations
  for all to authenticated using (false) with check (false);

drop policy if exists "whatsapp_messages_no_client" on public.whatsapp_messages;
create policy "whatsapp_messages_no_client" on public.whatsapp_messages
  for all to authenticated using (false) with check (false);

drop policy if exists "analytics_events_no_client" on public.analytics_events;
create policy "analytics_events_no_client" on public.analytics_events
  for all to authenticated using (false) with check (false);
