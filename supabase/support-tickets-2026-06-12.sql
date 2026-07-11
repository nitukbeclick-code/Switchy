-- ═══════════════════════════════════════════════════════════════════════════
-- support-tickets-2026-06-12.sql — in-app support tickets + message threads
-- (the Flutter app's advisor/sales support chat with human escalation).
--
-- ⚠️ NOT auto-applied. One-time delta, applied to prod 2026-06-12. Review, then
--    run manually (Supabase SQL editor / psql). ⚠️ NOT fully idempotent, unlike
--    the other dated deltas: the CREATE POLICY / CREATE INDEX / CREATE TRIGGER
--    statements have no IF-NOT-EXISTS/drop-first guards, so a re-run against a
--    database that already has them ERRORS (42710/42P07). That is fail-safe
--    (nothing regresses) but means this file is NOT safe to blind-re-run.
--
-- SECURITY / GRANT POSTURE (documented 2026-07 hygiene pass; SQL unchanged):
--   • RLS ON both tables. support_tickets: owner-scoped SELECT/INSERT/UPDATE
--     (auth.uid() = user_id); UPDATE is additionally COLUMN-scoped to `status`
--     only (see the revoke/grant below) so workflow columns (agent_type,
--     escalated_at, human_assigned_to, telegram_group_id) stay server-managed.
--   • support_messages: owner-of-ticket SELECT; INSERT is service_role-only by
--     POLICY (the agent/edge fn writes both user and agent turns server-side).
--   • Client base-table grants (authenticated SELECT/INSERT on both + UPDATE
--     (status) on tickets) are applied by schema.sql §(A3) "grant gap" block —
--     this file predates the grant-gap discovery and carries only the
--     column-scope revoke/grant pair.
--   • service_role access comes from schema.sql §(A5) "grant all … to
--     service_role" (this project's default privileges do NOT grant to
--     service_role — the documented 2026-06 incident).
--
-- KNOWN DEVIATIONS (kept as-applied; do not "fix" without a new dated delta):
--   • update_support_tickets_timestamp() duplicates public.set_updated_at()
--     byte-for-byte (and update_updated_at() — three identical one-liners in
--     prod). It also lacks the `set search_path` pin the advisor flags; the
--     body only touches NEW + now(), so the lint is cosmetic. Consolidating the
--     three into set_updated_at() is a candidate future migration.
--   • Policy names are ad-hoc sentence-style ("Users can view their own
--     tickets") instead of the house snake_case ("tickets_select_own").
--     Renaming live policies is churn without a security win — left as-is.
-- ═══════════════════════════════════════════════════════════════════════════

-- Create support_tickets table
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null check (status in ('open', 'agent_active', 'human_assigned', 'resolved')) default 'agent_active',
  agent_type text check (agent_type in ('advisor', 'sales')) default 'advisor',
  escalated_at timestamp with time zone,
  human_assigned_to text,
  telegram_group_id text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- Create support_messages table
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets on delete cascade,
  role text not null check (role in ('user', 'agent', 'human')),
  message_text text not null,
  metadata jsonb,
  created_at timestamp with time zone not null default now()
);

-- Enable RLS
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- RLS policies for support_tickets
create policy "Users can view their own tickets"
  on public.support_tickets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own tickets"
  on public.support_tickets
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own tickets"
  on public.support_tickets
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Column-scope authenticated UPDATE to `status` only (mirrors leads/meetings).
-- The RLS policy above still row-scopes updates to the owner, but it does not
-- restrict WHICH columns may change. Without this, an authenticated user could
-- mutate workflow columns (agent_type/escalated_at/human_assigned_to/
-- telegram_group_id) — e.g. clear an assignment or hijack a Telegram group,
-- corrupting the escalation workflow. The Flutter app's closeTicket only needs
-- to set status='resolved'. Revoking the table-wide UPDATE and re-granting just
-- the `status` column makes every other column server-managed (service_role
-- only) while leaving closeTicket working. Idempotent / re-runnable.
revoke update on public.support_tickets from authenticated;
grant update (status) on public.support_tickets to authenticated;

-- RLS policies for support_messages
create policy "Users can view messages in their own tickets"
  on public.support_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.support_tickets
      where id = ticket_id
      and user_id = (select auth.uid())
    )
  );

create policy "Service role can insert messages"
  on public.support_messages
  for insert
  to service_role
  with check (true);

-- Create indexes for performance
create index idx_support_tickets_user_id on public.support_tickets(user_id);
create index idx_support_tickets_status on public.support_tickets(status);
create index idx_support_messages_ticket_id on public.support_messages(ticket_id);
create index idx_support_messages_created_at on public.support_messages(created_at);

-- Create trigger to update updated_at timestamp
create or replace function public.update_support_tickets_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_support_tickets_timestamp_trigger
  before update on public.support_tickets
  for each row
  execute function public.update_support_tickets_timestamp();
