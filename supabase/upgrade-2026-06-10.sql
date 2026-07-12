-- ─────────────────────────────────────────────────────────────────────────────
-- upgrade-2026-06-10 — one-time delta for the interactive bot v2 + security.
-- Paste into the Supabase SQL Editor (project orzitfqmlvopujsoyigr) and run once.
-- Everything here is also reflected in schema.sql for fresh installs.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Lead delivery safety net + bot workflow columns
alter table public.leads add column if not exists notified_at timestamptz;
alter table public.leads add column if not exists claimed_by text;
alter table public.leads add column if not exists claimed_by_tg_id bigint;
alter table public.leads add column if not exists claimed_at timestamptz;
alter table public.leads add column if not exists contacted_at timestamptz;
alter table public.leads add column if not exists nudged_at timestamptz;
alter table public.leads add column if not exists callback_pinged_at timestamptz;
alter table public.leads add column if not exists actual_saving integer;
alter table public.leads add column if not exists source_ip text;

create index if not exists leads_unnotified_idx on public.leads (created_at)
  where notified_at is null;
create index if not exists leads_open_idx on public.leads (created_at)
  where status = 'new';
create index if not exists leads_phone_norm_idx
  on public.leads (regexp_replace(phone, '\D', '', 'g'), created_at desc);
create index if not exists leads_source_ip_idx on public.leads (source_ip, created_at desc)
  where source_ip is not null;

-- one-time backfill: pre-feature leads were already handled — without this the
-- sweep would replay history into the Telegram chat
update public.leads set notified_at = created_at where notified_at is null;

-- 2. lead_events audit trail (service_role only: RLS on, no client policies)
create table if not exists public.lead_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  event       text not null,               -- status_change / claim / note / undo / saving
  old_status  text,
  new_status  text,
  actor_tg_id bigint,
  actor_name  text,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.lead_events enable row level security;
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at desc);

-- 3. increment_savings ─ pin to caller, bound delta, revoke from anon
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

-- 4. PII / bot functions ─ service_role only
revoke execute on function public.get_upcoming_renewals(integer) from public, anon, authenticated;
grant execute on function public.get_upcoming_renewals(integer) to service_role;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- 5. Analytics views ─ owner-executed (RLS-bypassing), block client roles
revoke select on public.leads_by_source, public.top_plans_30d, public.top_providers_30d
  from anon, authenticated;

-- 6. search_leads ─ bot /search command (service_role only)
create or replace function public.search_leads(q text)
returns setof public.leads
language sql
stable
security definer
set search_path = public
as $$
  select * from public.leads
  where case
    -- digit-ish query with no actual digits ("++", "- -") must match nothing,
    -- not everything
    when q ~ '^[0-9+\-\s]+$' and regexp_replace(q, '\D', '', 'g') = '' then false
    when q ~ '^[0-9+\-\s]+$'
      then regexp_replace(phone, '\D', '', 'g') like '%' || regexp_replace(q, '\D', '', 'g') || '%'
    else name ilike '%' || q || '%'
  end
  order by created_at desc
  limit 5;
$$;
revoke execute on function public.search_leads(text) from public, anon, authenticated;
grant execute on function public.search_leads(text) to service_role;

-- 7. get_hot_browsers ─ signed-in plan browsers with no lead (service_role only)
create or replace function public.get_hot_browsers()
returns table(user_id uuid, name text, phone text, views bigint, top_provider text, last_view timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select pv.user_id, p.name, p.phone, count(*) as views,
         mode() within group (order by pv.provider) as top_provider,
         max(pv.viewed_at) as last_view
  from public.plan_views pv
  join public.profiles p on p.id = pv.user_id
  where pv.user_id is not null
    and pv.viewed_at > now() - interval '7 days'
    and coalesce(p.phone, '') <> ''
    and not exists (select 1 from public.leads l where l.user_id = pv.user_id)
  group by pv.user_id, p.name, p.phone
  having count(*) >= 3
  order by count(*) desc
  limit 10;
$$;
revoke execute on function public.get_hot_browsers() from public, anon, authenticated;
grant execute on function public.get_hot_browsers() to service_role;

-- 7b. get_cron_health ─ cron watchdog (service_role only; needs pg_cron)
do $do$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute $fn$
      create or replace function public.get_cron_health()
      returns table(jobname text, schedule text, active boolean, last_start timestamptz, last_status text)
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select j.jobname, j.schedule, j.active, d.start_time, d.status
        from cron.job j
        left join lateral (
          select start_time, status
          from cron.job_run_details
          where jobid = j.jobid
          order by start_time desc
          limit 1
        ) d on true;
      $body$;
    $fn$;
    execute 'revoke execute on function public.get_cron_health() from public, anon, authenticated';
    execute 'grant execute on function public.get_cron_health() to service_role';
  end if;
end
$do$;

-- 8. leads anti-abuse gate v2 ─ shape validation, server-managed columns,
--    per-phone 5/day (normalized), per-IP 8/hour, global 60/hour breaker
create or replace function public.leads_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_headers json;
  req_ip text;
  xff text[];
begin
  new.claimed_by := null;      new.claimed_by_tg_id := null;  new.claimed_at := null;
  new.contacted_at := null;    new.nudged_at := null;         new.callback_pinged_at := null;
  new.actual_saving := null;   new.notified_at := null;
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
  -- client IP trust order: cf-connecting-ip (CDN-set, unforgeable), then the
  -- LAST x-forwarded-for hop (appended by infrastructure; the FIRST hop is
  -- client-supplied and spoofable — never trust it)
  begin
    req_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    req_headers := null;
  end;
  req_ip := req_headers ->> 'cf-connecting-ip';
  if req_ip is null then
    xff := string_to_array(coalesce(req_headers ->> 'x-forwarded-for', ''), ',');
    if coalesce(array_length(xff, 1), 0) >= 1 then
      req_ip := xff[array_length(xff, 1)];
    end if;
  end if;
  new.source_ip := nullif(trim(coalesce(req_ip, '')), '');
  if new.source_ip is not null then
    if (select count(*) from public.leads
        where source_ip = new.source_ip
          and created_at > now() - interval '1 hour') >= 8 then
      raise exception 'rate limit exceeded';
    end if;
  end if;
  if (select count(*) from public.leads
      where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_rate_limit_before_insert on public.leads;
create trigger leads_rate_limit_before_insert
  before insert on public.leads
  for each row execute function public.leads_rate_limit();

-- 9. pg_cron schedules (cron.schedule upserts by name, so re-running is safe)
--
-- ⚠️ SUPERSEDED (registry moved): cron-and-hardening-2026-07.sql is now the
--    REGISTRY OF RECORD for the renewal-reminders schedules. Three of the four
--    jobs below (lead-sweep-10min, lead-followup-hourly, weekly-digest) are
--    re-registered there; do NOT edit or re-apply them from here — schedule
--    changes made only in one file get silently reverted when the other is
--    re-run (cron.schedule upserts by name). renewal-reminders-daily was
--    registered from HERE and is live; its schedule of record is also
--    documented in cron-and-hardening-2026-07.sql. Any future schedule change
--    belongs in that file (or a newer dated cron file that supersedes it).
--    (Banner added 2026-07 hygiene pass; the SQL below was not altered.)
select cron.schedule(
  'renewal-reminders-daily',
  '0 8 * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"digest","days":14}'::jsonb
    )
  $$
);

select cron.schedule(
  'lead-sweep-10min',
  '*/10 * * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"sweep"}'::jsonb
    )
  $$
);

select cron.schedule(
  'lead-followup-hourly',
  '5 * * * *',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"follow-up"}'::jsonb
    )
  $$
);

select cron.schedule(
  'weekly-digest',
  '0 7 * * 0',
  $$
    select net.http_post(
      url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
      ),
      body    := '{"mode":"weekly"}'::jsonb
    )
  $$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- After this SQL, from the repo root (logged into the right Supabase account):
--   supabase link --project-ref orzitfqmlvopujsoyigr
--   supabase functions deploy notify-lead --no-verify-jwt
--   supabase functions deploy renewal-reminders --no-verify-jwt
-- Then (re-)register the bot webhook — required even if it was set before,
-- because the bot now also subscribes to chat messages and registers its
-- command list:
--   curl -H "x-webhook-secret: <lead_webhook_secret>" \
--     "https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=set-telegram-webhook"
-- Optional: restrict who in the chat may act (comma-separated Telegram user
-- ids; empty = everyone in the team chat):
--   select vault.create_secret('123456789,987654321', 'telegram_allowed_user_ids', 'bot allowlist');
-- ─────────────────────────────────────────────────────────────────────────────
