-- Lead city tag for local-partner routing (2026-06).
--
-- Adds public.leads.city so a submitted lead can be tagged with the customer's
-- city. The notify pipeline (notify-lead / Telegram fan-out) uses this to route
-- the lead to the right local partner — a regional rep handles their own area
-- instead of every lead landing in one global queue.
--
-- This is an additive, free-form text column (no enum / FK — city names arrive
-- as the customer types them). public.leads' SELECT is column-scoped to the safe
-- set (id, status, created_at, user_id; see schema.sql §leads), so `city` is NOT
-- client-readable — the sales team / notify pipeline reads it via the
-- service_role key, which bypasses RLS and column grants. No grant change needed.
--
-- Idempotent / re-runnable (add column IF NOT EXISTS). Apply manually against the
-- prod project once; do NOT auto-apply.
alter table public.leads add column if not exists city text;

comment on column public.leads.city is 'Customer city (free-form text). Tags the lead for local-partner routing in the notify pipeline; read server-side via service_role, never client-exposed.';
