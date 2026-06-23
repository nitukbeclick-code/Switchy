-- Product analytics event sink (2026-06).
-- One append-only table the `analytics-track` edge function writes to (service
-- role only) when the Flutter app / site fires a funnel event: lead start/submit,
-- quiz complete, compare/plan view, search, WhatsApp click, savings viewed.
--
-- The app NEVER reads or writes this table directly — it goes through the
-- analytics-track edge fn, which inserts via the service role. RLS is enabled
-- with NO client policies, so anon/authenticated can't touch it; only the
-- service_role (granted explicitly below — this project's default privileges do
-- NOT grant to service_role; see schema.sql §grants / whatsapp-2026-06.sql for
-- the same documented gap) can insert and read.
--
-- `props` is a small, free-form jsonb bag (plan id, category, source…); never
-- store PII or bytes there. `ip` is kept only for light rate-limiting/abuse
-- triage. Idempotent / re-runnable.

create table if not exists public.analytics_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,                       -- leadSubmit / searchQuery / savingsViewed …
  props      jsonb not null default '{}'::jsonb,  -- small contextual bag, no PII/bytes
  ip         text,                                -- abuse triage / rate-limit only
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event, created_at desc);

alter table public.analytics_events enable row level security;

-- Explicit service_role grants (default privileges do NOT grant here). Only the
-- analytics-track edge fn reaches this table; no anon/authenticated grants.
grant insert, select on public.analytics_events to service_role;
