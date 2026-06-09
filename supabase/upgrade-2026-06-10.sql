-- ─────────────────────────────────────────────────────────────────────────────
-- upgrade-2026-06-10 — one-time delta for the interactive bot + security fixes.
-- Paste into the Supabase SQL Editor (project orzitfqmlvopujsoyigr) and run once.
-- Everything here is also reflected in schema.sql for fresh installs.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Lead delivery safety net ─ notification stamp + sweep index
alter table public.leads add column if not exists notified_at timestamptz;
create index if not exists leads_unnotified_idx on public.leads (created_at)
  where notified_at is null;
-- one-time backfill: pre-feature leads were already handled — without this the
-- daily sweep would replay history into the Telegram chat
update public.leads set notified_at = created_at where notified_at is null;

-- 2. increment_savings ─ pin to caller, bound delta, revoke from anon
create or replace function public.increment_savings(uid uuid, delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set total_savings = total_savings + least(greatest(delta, 0), 100000)
  where id = uid and id = auth.uid();
$$;
revoke execute on function public.increment_savings(uuid, integer) from public, anon;
grant execute on function public.increment_savings(uuid, integer) to authenticated;

-- 3. PII functions ─ service_role only
revoke execute on function public.get_upcoming_renewals(integer) from public, anon, authenticated;
grant execute on function public.get_upcoming_renewals(integer) to service_role;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- 4. Analytics views ─ owner-executed (RLS-bypassing), block client roles
revoke select on public.leads_by_source, public.top_plans_30d, public.top_providers_30d
  from anon, authenticated;

-- 5. leads anti-abuse gate ─ shape validation + rate limiting
--    (per-phone 5/day on normalized digits; global 30/hour)
create or replace function public.leads_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(new.name)) < 2 or length(new.name) > 80 then
    raise exception 'invalid name';
  end if;
  if new.phone !~ '^[+0-9][0-9\-\s]{7,14}$' then
    raise exception 'invalid phone';
  end if;
  if length(coalesce(new.notes, ''))    > 2000
     or length(coalesce(new.email, ''))    > 254
     or length(coalesce(new.provider, '')) > 120
     or length(coalesce(new.plan_id, ''))  > 120 then
    raise exception 'field too long';
  end if;
  if (select count(*) from public.leads
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate limit exceeded';
  end if;
  if (select count(*) from public.leads
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_rate_limit_before_insert on public.leads;
create trigger leads_rate_limit_before_insert
  before insert on public.leads
  for each row execute function public.leads_rate_limit();

create index if not exists leads_phone_norm_idx
  on public.leads (regexp_replace(phone, '\D', '', 'g'), created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- After this SQL, from the repo root (logged into the right Supabase account):
--   supabase link --project-ref orzitfqmlvopujsoyigr
--   supabase functions deploy notify-lead --no-verify-jwt
--   supabase functions deploy renewal-reminders --no-verify-jwt
-- Then register the bot webhook (one curl, see supabase/README.md §8):
--   curl -H "x-webhook-secret: <lead_webhook_secret>" \
--     "https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=set-telegram-webhook"
-- ─────────────────────────────────────────────────────────────────────────────
