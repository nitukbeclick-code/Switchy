-- CRM lead work queue: explicit priority, next follow-up and closing reason.
-- These fields are service-role managed. They are intentionally absent from the
-- anon/authenticated INSERT and SELECT column grants used by public lead capture.

alter table public.leads
  add column if not exists priority text not null default 'normal',
  add column if not exists follow_up_at timestamptz,
  add column if not exists follow_up_note text,
  add column if not exists lost_reason text;

do $$ begin
  alter table public.leads
    add constraint leads_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.leads
    add constraint leads_follow_up_note_length_check
    check (follow_up_note is null or char_length(follow_up_note) <= 500);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.leads
    add constraint leads_lost_reason_length_check
    check (lost_reason is null or char_length(lost_reason) <= 240);
exception when duplicate_object then null;
end $$;

create index if not exists leads_follow_up_due_idx
  on public.leads (follow_up_at)
  where follow_up_at is not null and status in ('new', 'contacted');

create index if not exists leads_open_priority_idx
  on public.leads (priority, created_at)
  where status in ('new', 'contacted');

revoke select (priority, follow_up_at, follow_up_note, lost_reason)
  on public.leads from anon, authenticated;
revoke insert (priority, follow_up_at, follow_up_note, lost_reason)
  on public.leads from anon, authenticated;
revoke update (priority, follow_up_at, follow_up_note, lost_reason)
  on public.leads from anon, authenticated;
revoke references (priority, follow_up_at, follow_up_note, lost_reason)
  on public.leads from anon, authenticated;

comment on column public.leads.priority is
  'CRM-only work priority: low/normal/high/urgent. Managed through the access-gated crm-api.';
comment on column public.leads.follow_up_at is
  'CRM-only next-action timestamp. Open leads due at/before now belong in the work queue.';
comment on column public.leads.follow_up_note is
  'CRM-only short context for the next follow-up; max 500 characters.';
comment on column public.leads.lost_reason is
  'CRM-only disposition reason when a lead is closed as lost; max 240 characters.';
