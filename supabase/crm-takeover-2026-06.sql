-- WhatsApp LIVE HUMAN TAKEOVER — control + audit layer (2026-06, Track 2A).
--
-- A human agent can TAKE OVER a live WhatsApp conversation from the AI bot and
-- HAND it back. The single authoritative gate is
-- public.whatsapp_conversations.bot_enabled:
--
--   bot_enabled = true   → the whatsapp-webhook bot auto-replies as usual.
--   bot_enabled = false  → a human is in the loop. The bot goes SILENT: it still
--                          receives + STORES the customer's inbound messages and
--                          still honours STOP/opt-out + the §11 first-contact
--                          notice, but it NEVER generates an AI auto-reply.
--
-- The crm-api takeOver / handBack actions flip this flag (service-role, admin-
-- authd) and every takeover / hand-back / inbound / outbound is appended to the
-- crm_events audit feed so the admin CRM screen can stream the activity timeline.
--
-- RELATIONSHIP TO whatsapp-control-2026-06.sql:
--   That earlier migration already introduced bot_enabled (on the conversation
--   row) and the crm_events table with columns (conversation_id, contact_id,
--   kind, preview, created_at). This file is ADDITIVE and IDEMPOTENT — it is safe
--   to apply whether or not the earlier one ran. It (a) guarantees bot_enabled
--   exists, (b) widens crm_events with the task's canonical (actor, event)
--   columns WITHOUT dropping the existing kind/preview columns, and (c) re-asserts
--   the service_role grants. Re-running either migration is a no-op.
--
-- IMPORTANT (2026-06 grant-gap): this project's default privileges do NOT grant
-- to service_role, so a new table/column silently 403s until granted explicitly
-- (see schema.sql §grants, whatsapp-2026-06.sql, analytics-events-2026-06.sql for
-- the same documented incident). Every grant below is therefore explicit.
--
-- Apply MANUALLY (do NOT auto-apply): psql "$DATABASE_URL" -f supabase/crm-takeover-2026-06.sql
-- (or paste into the Supabase SQL editor).

-- ── 1. The gate on the conversation row ──────────────────────────────────────
-- Authoritative bot on/off switch. Defaults true so every existing + future
-- conversation starts bot-driven; a human takeover flips it to false.
alter table public.whatsapp_conversations
  add column if not exists bot_enabled       boolean not null default true,
  add column if not exists human_active_at   timestamptz,        -- when a human last took over
  add column if not exists assigned_rep      text;               -- display name of the rep in the loop

comment on column public.whatsapp_conversations.bot_enabled is
  'Single authoritative gate: the whatsapp-webhook AI bot auto-replies ONLY when true. A human takeover (crm-api takeOver / a rep reply) sets it false — the bot then stores inbound + honours STOP/§11 but stays silent. handBack sets it true.';

-- ── 2. CRM activity / audit feed ──────────────────────────────────────────────
-- Append-only timeline of control + message events. Carries NO PII beyond an
-- <=80-char text preview (never bytes/base64). The admin CRM screen streams it
-- via Realtime; crm-api + whatsapp-webhook (service_role) are the only writers.
create table if not exists public.crm_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid,                 -- public.whatsapp_conversations(id); no FK so the feed survives a purge
  contact_id      uuid,                 -- public.whatsapp_contacts(id)
  actor           text,                 -- who caused it: 'rep' / 'bot' / 'customer' / 'system'
  event           text not null default 'event',  -- takeover / handback / inbound / outbound / rep_reply …
  preview         text,                 -- <=80-char snippet, NEVER bytes/PII
  created_at      timestamptz not null default now()
);

-- Widen an EXISTING crm_events (from whatsapp-control-2026-06.sql) with the
-- canonical (actor, event) columns. 'kind' there is the same concept as 'event';
-- we keep both so neither migration order breaks. Each add is guarded.
alter table public.crm_events
  add column if not exists actor text,
  add column if not exists event text;

-- If the table pre-existed with only 'kind', backfill 'event' from it so the
-- feed is consistent regardless of which writer populated which column. Guarded
-- so it is a no-op when 'kind' was never created.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_events' and column_name = 'kind'
  ) then
    update public.crm_events set event = coalesce(event, kind) where event is null;
  end if;
end $$;

create index if not exists crm_events_created_idx on public.crm_events (created_at desc);
create index if not exists crm_events_conv_idx    on public.crm_events (conversation_id, created_at desc);

alter table public.crm_events enable row level security;

-- Admins (profiles.is_admin) may read the feed; the CRM dashboard streams it.
-- service_role bypasses RLS for the edge-function writers.
drop policy if exists "crm_events_admin_select" on public.crm_events;
create policy "crm_events_admin_select" on public.crm_events
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.is_admin
    )
  );

-- ── 3. Grants (grant-gap: default privileges do NOT grant here) ───────────────
-- service_role = the whatsapp-webhook bot + the crm-api edge fn (writers).
-- authenticated gets SELECT but the RLS policy above still narrows it to admins.
-- No anon access whatsoever (these rows describe private conversations).
grant select, insert on public.crm_events to service_role;
grant select         on public.crm_events to authenticated;

-- whatsapp-webhook + crm-api flip bot_enabled / human_active_at / assigned_rep,
-- so the conversation table must stay writable by the service_role (re-asserted
-- here in case this migration runs before whatsapp-2026-06.sql).
grant select, insert, update, delete on public.whatsapp_conversations to service_role;

-- ── 4. Realtime ───────────────────────────────────────────────────────────────
-- The admin CRM screen subscribes to crm_events; without publication membership
-- no INSERT ever reaches the client. Wrap so a re-run (already a member) and a
-- missing publication are both no-ops.
do $$
begin
  alter publication supabase_realtime add table public.crm_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
