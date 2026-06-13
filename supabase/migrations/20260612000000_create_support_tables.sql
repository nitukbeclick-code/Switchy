-- Digital agent / human-escalation support chat.
--
-- Backs:
--   - lib/services/support_ticket_service.dart
--   - lib/pages/support_ticket/support_ticket_widget.dart
--   - lib/widgets/digital_agent_fab.dart
--   - supabase/functions/support-agent/index.ts

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'agent_active' check (status in ('open','agent_active','human_assigned','resolved')),
  agent_type text not null default 'advisor' check (agent_type in ('advisor','sales')),
  escalated_at timestamptz,
  human_assigned_to text,
  telegram_group_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_user_id_idx on public.support_tickets (user_id);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  role text not null check (role in ('user','agent','human')),
  message_text text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index support_messages_ticket_id_idx on public.support_messages (ticket_id);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Users manage only their own tickets
create policy "Users can view their own support tickets"
  on public.support_tickets for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "Users can create their own support tickets"
  on public.support_tickets for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "Users can update their own support tickets"
  on public.support_tickets for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

-- Users can read messages on their own tickets; writes happen via the
-- support-agent Edge Function (service role bypasses RLS)
create policy "Users can view messages on their own tickets"
  on public.support_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id
        and t.user_id = (select auth.uid())
    )
  );

-- Real-time sync for SupportTicketService.messageStream/ticketStream
alter publication supabase_realtime add table public.support_tickets;
alter publication supabase_realtime add table public.support_messages;
