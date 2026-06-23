-- WhatsApp LIVE HUMAN TAKEOVER control layer (2026-06).
-- Single authoritative gate for the AI bot: whatsapp_conversations.bot_enabled.
-- The whatsapp-webhook bot auto-replies ONLY when bot_enabled = true. A human
-- "takes over" (via the Flutter CRM, a WhatsApp human-request button, or a
-- Telegram rep reply) → bot_enabled = false: the bot goes SILENT and only
-- stores the customer's inbound messages. "Return to bot" → bot_enabled = true.
--
-- Also adds a lightweight, append-only CRM activity feed (crm_events) the admin
-- CRM screen can stream in realtime. It carries NO PII beyond a <=80-char text
-- preview. RLS gates SELECT to admins (profiles.is_admin); only the service_role
-- (whatsapp-webhook + crm-api edge fns) inserts.
--
-- IMPORTANT: this project's default privileges do NOT grant to service_role, so
-- relying on them silently 403s (see schema.sql §grants / whatsapp-2026-06.sql /
-- analytics-events-2026-06.sql for the same documented gap). Grant explicitly.
-- Idempotent / re-runnable. Apply manually (do NOT auto-apply).

-- ── 1. The gate + human-takeover bookkeeping on the conversation row ──────────
alter table public.whatsapp_conversations
  add column if not exists bot_enabled        boolean not null default true,
  add column if not exists human_active_at    timestamptz,
  add column if not exists assigned_rep        text,
  add column if not exists assigned_rep_tg_id  bigint;

comment on column public.whatsapp_conversations.bot_enabled is
  'Single authoritative gate: AI bot auto-replies ONLY when true. Human takeover sets it false (bot stores inbound but stays silent); return-to-bot sets it true.';

-- ── 2. CRM activity feed (append-only; no PII beyond an <=80-char preview) ─────
create table if not exists public.crm_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid,                                -- public.whatsapp_conversations(id), no FK (keep the feed durable)
  contact_id      uuid,                                -- public.whatsapp_contacts(id)
  kind            text not null,                       -- inbound / rep_reply / human_requested …
  preview         text,                                -- <=80-char text snippet, NEVER bytes/PII
  created_at      timestamptz not null default now()
);

create index if not exists crm_events_created_idx on public.crm_events (created_at desc);

alter table public.crm_events enable row level security;

-- Admins (profiles.is_admin) may read the feed; the CRM screen streams it.
drop policy if exists "crm_events_admin_select" on public.crm_events;
create policy "crm_events_admin_select" on public.crm_events
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.is_admin
    )
  );

-- Explicit grants (default privileges do NOT grant here). The service_role (the
-- whatsapp-webhook bot + crm-api edge fn) inserts/reads; authenticated gets
-- SELECT but RLS above still gates it to admins. No anon access.
grant select, insert on public.crm_events to service_role;
grant select on public.crm_events to authenticated;

-- Realtime: the admin CRM screen subscribes to the feed. Without publication
-- membership no INSERT event ever reaches the client. Wrap so a re-run (table
-- already a member) and a missing publication are both no-ops.
do $$ begin
  alter publication supabase_realtime add table public.crm_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
