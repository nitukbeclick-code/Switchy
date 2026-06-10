-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  חוסך (Chosech) — Supabase schema                                        ║
-- ║  Paste this whole file into the Supabase SQL Editor and run it.          ║
-- ║  It is idempotent-ish (uses `if not exists`) and enables RLS on every    ║
-- ║  table, matching your "Enable automatic RLS" choice at project creation. ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Keep updated_at fresh on UPDATE.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ── profiles  (1:1 with auth.users) ──────────────────────────────────────────
-- Public-facing user record + a few app preferences that benefit from syncing.
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  name               text,
  phone              text,
  email              text,
  total_savings      integer not null default 0,   -- ₪ realised via leads
  renewal_reminders  boolean not null default false,
  bills              jsonb   not null default '{}'::jsonb, -- {"cellular":119,...}
  quiz               jsonb   not null default '{}'::jsonb, -- budget/priority/lines/needs
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── leads  (sales pipeline) ──────────────────────────────────────────────────
-- A customer can submit a lead before signing in (user_id null). The sales team
-- reads these with the service_role key (which bypasses RLS) — never the anon key.
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  name          text not null,
  phone         text not null,
  email         text,
  provider      text,
  plan_id       text,
  callback_time text,                        -- now / noon / evening / tomorrow
  status        text not null default 'new', -- new / contacted / won / lost
  source        text,                        -- form / plan / compare / advisor / callback / porting
  notes         text,                        -- free-text context for the rep
  notified_at   timestamptz,                 -- stamped by notify-lead once the team was pinged
  -- bot workflow columns (server-managed; the insert gate nulls client values)
  claimed_by        text,                    -- Telegram display name of the rep who claimed it
  claimed_by_tg_id  bigint,
  claimed_at        timestamptz,
  contacted_at      timestamptz,             -- first transition to 'contacted' (speed-to-lead KPI)
  nudged_at         timestamptz,             -- last SLA escalation ping
  callback_pinged_at timestamptz,            -- "the customer asked for evening" reminder sent
  actual_saving     integer,                 -- ₪/year captured by the won-flow reply
  source_ip         text,                    -- set by the insert gate for per-IP rate limiting
  created_at    timestamptz not null default now()
);

-- Reruns on a pre-existing database: add the notification stamp.
-- One-time after adding the column, mark historical leads as handled so the
-- daily sweep doesn't replay them:
--   update public.leads set notified_at = created_at where notified_at is null;
alter table public.leads add column if not exists notified_at timestamptz;
alter table public.leads add column if not exists claimed_by text;
alter table public.leads add column if not exists claimed_by_tg_id bigint;
alter table public.leads add column if not exists claimed_at timestamptz;
alter table public.leads add column if not exists contacted_at timestamptz;
alter table public.leads add column if not exists nudged_at timestamptz;
alter table public.leads add column if not exists callback_pinged_at timestamptz;
alter table public.leads add column if not exists actual_saving integer;
alter table public.leads add column if not exists source_ip text;

alter table public.leads enable row level security;

drop policy if exists "leads_insert_anyone" on public.leads;
create policy "leads_insert_anyone" on public.leads
  for insert with check (true);
drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own" on public.leads
  for select using (auth.uid() = user_id);

create index if not exists leads_user_idx on public.leads (user_id);
create index if not exists leads_created_idx on public.leads (created_at desc);
-- partial index for the renewal-reminders unnotified-leads sweep
create index if not exists leads_unnotified_idx on public.leads (created_at)
  where notified_at is null;

-- ── leads anti-abuse gate ─────────────────────────────────────────────────────
-- leads_insert_anyone is deliberate (anonymous lead capture), but every INSERT
-- fans out to Telegram + Resend + a paid AI-triage call, so an unthrottled
-- anon key is a cost/spam amplifier. Shape-validate and rate-limit at the door:
--   • per-phone: max 5 leads per 24h (a legit customer re-submitting stays under)
--   • per-IP:    max 8 leads per hour (cf-connecting-ip / last XFF hop)
--   • global:    max 60 leads per hour (cost circuit breaker for Telegram/Resend/AI)
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
  -- bot-workflow columns are server-managed — never accepted from the inserter
  new.claimed_by := null;      new.claimed_by_tg_id := null;  new.claimed_at := null;
  new.contacted_at := null;    new.nudged_at := null;         new.callback_pinged_at := null;
  new.actual_saving := null;   new.notified_at := null;
  if length(trim(new.name)) < 2 or length(new.name) > 80 then
    raise exception 'invalid name';
  end if;
  if new.phone !~ '^[+0-9][0-9\-\s]{7,14}$' then
    raise exception 'invalid phone';
  end if;
  -- bound the free-text fields: oversized notes would push the Telegram
  -- message past its 4096-char limit and silently kill the notification
  if length(coalesce(new.notes, ''))    > 2000
     or length(coalesce(new.email, ''))    > 254
     or length(coalesce(new.provider, '')) > 120
     or length(coalesce(new.plan_id, ''))  > 120 then
    raise exception 'field too long';
  end if;
  -- compare on digits only, otherwise 050-1234567 / +972501234567 / 0501234567
  -- count as different phones and the per-phone cap is format-bypassable
  if (select count(*) from public.leads
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and created_at > now() - interval '1 day') >= 5 then
    raise exception 'rate limit exceeded';
  end if;
  -- per-IP cap — stops one attacker without letting them starve everyone via
  -- the global cap. Trust order: cf-connecting-ip (CDN-set, unforgeable), then
  -- the LAST x-forwarded-for hop (appended by infrastructure; the FIRST hop is
  -- client-supplied and spoofable — never trust it).
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
  -- global circuit breaker: bounds worst-case Telegram/Resend/AI spend per hour
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

-- expression index so the normalized per-phone lookup stays cheap
create index if not exists leads_phone_norm_idx
  on public.leads (regexp_replace(phone, '\D', '', 'g'), created_at desc);
-- open-lead scans (SLA nudges, callback pings, /leads) touch only status='new'
create index if not exists leads_open_idx on public.leads (created_at)
  where status = 'new';
create index if not exists leads_source_ip_idx on public.leads (source_ip, created_at desc)
  where source_ip is not null;

-- ── lead_events  (audit trail of bot actions) ────────────────────────────────
-- Every status change / claim / note / undo / saving capture from the Telegram
-- bot lands here: who (Telegram identity), what, when. RLS on with NO client
-- policies — service_role only.
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

-- ── search_leads  (bot /search command; service_role only) ───────────────────
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

-- ── get_hot_browsers  (signed-in users browsing plans with no lead) ──────────
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

-- ── get_cron_health  (cron watchdog; service_role only) ─────────────────────
-- pg_cron failures are silent — this lets the bot and the external prober
-- detect dead schedules. Guarded: only created when pg_cron is installed.
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

-- ── tracked_plans  (renewal radar) ───────────────────────────────────────────
create table if not exists public.tracked_plans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  category       text not null check (category in ('cellular','internet','tv','triple','abroad')),
  provider       text not null,
  plan_name      text not null,
  monthly_price  integer not null,
  promo_end_date date,
  joined_via_us  boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table public.tracked_plans enable row level security;

drop policy if exists "tracked_owner_all" on public.tracked_plans;
create policy "tracked_owner_all" on public.tracked_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists tracked_user_idx on public.tracked_plans (user_id);

-- ── community_posts ──────────────────────────────────────────────────────────
-- Public feed: everyone reads, you only write your own. Prefer Supabase Storage
-- for media and keep the URL here (see media_url); base64 in a column works but
-- bloats the table fast.
create table if not exists public.community_posts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  author            text not null,
  avatar            text,
  channel           text not null,
  body              text not null default '',
  media_type        text check (media_type in ('image','video','audio')),
  media_url         text,
  media_duration_ms integer,
  created_at        timestamptz not null default now()
);

alter table public.community_posts enable row level security;

drop policy if exists "posts_select_all" on public.community_posts;
create policy "posts_select_all" on public.community_posts
  for select using (true);
drop policy if exists "posts_insert_own" on public.community_posts;
create policy "posts_insert_own" on public.community_posts
  for insert with check (auth.uid() = user_id);
drop policy if exists "posts_update_own" on public.community_posts;
create policy "posts_update_own" on public.community_posts
  for update using (auth.uid() = user_id);
drop policy if exists "posts_delete_own" on public.community_posts;
create policy "posts_delete_own" on public.community_posts
  for delete using (auth.uid() = user_id);

create index if not exists posts_channel_idx on public.community_posts (channel);
create index if not exists posts_created_idx on public.community_posts (created_at desc);

-- ── community_replies ────────────────────────────────────────────────────────
create table if not exists public.community_replies (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references public.community_posts(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  author            text not null,
  avatar            text,
  body              text not null default '',
  media_type        text check (media_type in ('image','video','audio')),
  media_url         text,
  media_duration_ms integer,
  created_at        timestamptz not null default now()
);

alter table public.community_replies enable row level security;

drop policy if exists "replies_select_all" on public.community_replies;
create policy "replies_select_all" on public.community_replies
  for select using (true);
drop policy if exists "replies_insert_own" on public.community_replies;
create policy "replies_insert_own" on public.community_replies
  for insert with check (auth.uid() = user_id);
drop policy if exists "replies_delete_own" on public.community_replies;
create policy "replies_delete_own" on public.community_replies
  for delete using (auth.uid() = user_id);

create index if not exists replies_post_idx on public.community_replies (post_id);

-- ── post_likes  (public counts, private toggling) ────────────────────────────
create table if not exists public.post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_likes enable row level security;

drop policy if exists "likes_select_all" on public.post_likes;
create policy "likes_select_all" on public.post_likes
  for select using (true);                       -- so the UI can count likes
drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own" on public.post_likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "likes_delete_own" on public.post_likes;
create policy "likes_delete_own" on public.post_likes
  for delete using (auth.uid() = user_id);

-- ── post_bookmarks  (private to each user) ───────────────────────────────────
create table if not exists public.post_bookmarks (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

alter table public.post_bookmarks enable row level security;

drop policy if exists "bookmarks_own_all" on public.post_bookmarks;
create policy "bookmarks_own_all" on public.post_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── provider_reviews  (public ratings, one per user per provider) ────────────
create table if not exists public.provider_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  provider   text not null,
  overall    smallint not null check (overall between 1 and 5),
  price      smallint check (price between 0 and 5),
  service    smallint check (service between 0 and 5),
  coverage   smallint check (coverage between 0 and 5),
  speed      smallint check (speed between 0 and 5),
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.provider_reviews enable row level security;

drop policy if exists "reviews_select_all" on public.provider_reviews;
create policy "reviews_select_all" on public.provider_reviews
  for select using (true);                       -- ratings are public
drop policy if exists "reviews_insert_own" on public.provider_reviews;
create policy "reviews_insert_own" on public.provider_reviews
  for insert with check (auth.uid() = user_id);
drop policy if exists "reviews_update_own" on public.provider_reviews;
create policy "reviews_update_own" on public.provider_reviews
  for update using (auth.uid() = user_id);
drop policy if exists "reviews_delete_own" on public.provider_reviews;
create policy "reviews_delete_own" on public.provider_reviews
  for delete using (auth.uid() = user_id);

create index if not exists reviews_provider_idx on public.provider_reviews (provider);

drop trigger if exists reviews_set_updated_at on public.provider_reviews;
create trigger reviews_set_updated_at before update on public.provider_reviews
  for each row execute function public.set_updated_at();

-- ── Convenience views ────────────────────────────────────────────────────────
-- Posts with like/reply counts, so the feed is a single query.
create or replace view public.community_feed as
select
  p.*,
  coalesce(l.cnt, 0) as like_count,
  coalesce(r.cnt, 0) as reply_count
from public.community_posts p
left join (select post_id, count(*) cnt from public.post_likes group by post_id) l
  on l.post_id = p.id
left join (select post_id, count(*) cnt from public.community_replies group by post_id) r
  on r.post_id = p.id;

-- Average rating + review count per provider (public).
create or replace view public.provider_rating_summary as
select
  provider,
  round(avg(overall)::numeric, 2) as avg_stars,
  count(*)                        as review_count
from public.provider_reviews
group by provider;

-- ── plan_views  (demand analytics) ──────────────────────────────────────────
-- Written on every plan detail page-open. Lets the team rank plans by interest.
-- RLS: anon insert allowed; no select policy (service_role reads via dashboard).
create table if not exists public.plan_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  plan_id    text not null,
  provider   text not null,
  category   text not null,
  viewed_at  timestamptz not null default now()
);

alter table public.plan_views enable row level security;

create policy "plan_views_insert_anyone" on public.plan_views
  for insert with check (true);

create index if not exists plan_views_plan_idx on public.plan_views (plan_id, viewed_at desc);
create index if not exists plan_views_provider_idx on public.plan_views (provider, viewed_at desc);

-- Atomically increments a user's total_savings. Called by the Flutter app when
-- the user confirms they switched plans (tracker step 3 → 4).
-- SECURITY: definer bypasses RLS, so the function itself must pin the target
-- row to the caller (`id = auth.uid()`) and bound the delta — otherwise any
-- caller could mutate any profile. EXECUTE is revoked from anon below.
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

-- ── Demand analytics views  (service_role reads; no public RLS) ─────────────
-- Top plans / providers by page-view in the last 30 days.
create or replace view public.top_plans_30d as
select plan_id, provider, category,
  count(*)                                        as view_count,
  count(distinct coalesce(user_id::text, 'anon')) as unique_viewers
from public.plan_views
where viewed_at >= now() - interval '30 days'
group by plan_id, provider, category
order by view_count desc;

create or replace view public.top_providers_30d as
select provider,
  count(*)                                        as view_count,
  count(distinct coalesce(user_id::text, 'anon')) as unique_viewers
from public.plan_views
where viewed_at >= now() - interval '30 days'
group by provider
order by view_count desc;

-- Lead funnel by source (all time).
create or replace view public.leads_by_source as
select
  coalesce(source, 'unknown')                          as source,
  count(*)                                             as total,
  count(*) filter (where status = 'new')               as new_leads,
  count(*) filter (where status = 'contacted')         as contacted,
  count(*) filter (where status = 'won')               as won,
  count(*) filter (where status = 'lost')              as lost,
  min(created_at)                                      as first_at,
  max(created_at)                                      as last_at
from public.leads
group by source
order by total desc;

-- SECURITY: views run with the owner's rights (RLS-bypassing) and default
-- privileges grant SELECT to client roles — without an explicit revoke, any
-- signed-in (incl. anonymous) client could read the whole sales pipeline.
-- service_role keeps its grant (the bot's /stats command uses it).
revoke select on public.leads_by_source, public.top_plans_30d, public.top_providers_30d
  from anon, authenticated;

-- ── get_upcoming_renewals  (called by renewal-reminders Edge Function) ───────
-- Returns tracked_plans with promo_end_date within the next N days, joined with
-- the user's profile. security definer so the Edge Function (service_role) can
-- call it via the REST API without needing direct table access.
create or replace function public.get_upcoming_renewals(days integer default 14)
returns table(
  id             uuid,
  user_id        uuid,
  provider       text,
  plan_name      text,
  monthly_price  integer,
  promo_end_date date,
  category       text,
  name           text,
  phone          text,
  email          text
)
language sql
security definer
set search_path = public
as $$
  select
    tp.id, tp.user_id, tp.provider, tp.plan_name,
    tp.monthly_price, tp.promo_end_date, tp.category,
    p.name, p.phone, p.email
  from public.tracked_plans tp
  left join public.profiles p on p.id = tp.user_id
  where tp.promo_end_date is not null
    and tp.promo_end_date between current_date and current_date + (days || ' days')::interval
  order by tp.promo_end_date;
$$;

-- SECURITY: this definer function dumps every customer's name+phone+email —
-- without an explicit revoke, EXECUTE on public-schema functions is granted
-- to PUBLIC, i.e. the anon REST role could exfiltrate the whole list.
-- Only the Edge Functions (service_role) may call it. The same applies to
-- get_lead_notify_config() (created in the lead-notify migration).
revoke execute on function public.get_upcoming_renewals(integer) from public, anon, authenticated;
grant execute on function public.get_upcoming_renewals(integer) to service_role;

-- ── pg_cron schedules  (digest, sweeps, weekly report) ──────────────────────
-- Requires: `create extension if not exists pg_cron schema cron;`
-- To register: run these selects once in the SQL editor. All POST to the
-- renewal-reminders function with a `mode`; the shared secret comes from Vault.
--
--   -- daily renewal digest, 08:00 UTC (11:00 Israel summer / 10:00 winter)
--   select cron.schedule(
--     'renewal-reminders-daily',
--     '0 8 * * *',
--     $$
--       select net.http_post(
--         url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
--         headers := jsonb_build_object(
--           'Content-Type',    'application/json',
--           'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--         ),
--         body    := '{"mode":"digest","days":14}'::jsonb
--       )
--     $$
--   );
--
--   -- unnotified-lead delivery sweep, every 10 minutes (was daily-only)
--   select cron.schedule(
--     'lead-sweep-10min',
--     '*/10 * * * *',
--     $$
--       select net.http_post(
--         url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
--         headers := jsonb_build_object(
--           'Content-Type',    'application/json',
--           'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--         ),
--         body    := '{"mode":"sweep"}'::jsonb
--       )
--     $$
--   );
--
--   -- SLA escalations + callback-time-due pings, hourly at :05
--   select cron.schedule(
--     'lead-followup-hourly',
--     '5 * * * *',
--     $$
--       select net.http_post(
--         url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
--         headers := jsonb_build_object(
--           'Content-Type',    'application/json',
--           'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--         ),
--         body    := '{"mode":"follow-up"}'::jsonb
--       )
--     $$
--   );
--
--   -- weekly business digest, Sunday 07:00 UTC (start of the Israeli work week)
--   select cron.schedule(
--     'weekly-digest',
--     '0 7 * * 0',
--     $$
--       select net.http_post(
--         url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/renewal-reminders',
--         headers := jsonb_build_object(
--           'Content-Type',    'application/json',
--           'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--         ),
--         body    := '{"mode":"weekly"}'::jsonb
--       )
--     $$
--   );

-- ── Storage: community-media cleanup trigger ────────────────────────────────
-- Deletes the Storage object whenever a community_post or community_reply row
-- is deleted, preventing orphaned objects in the community-media bucket.
-- Already live — re-run if the trigger/function is ever dropped.
--
--   create or replace function public.delete_community_storage_object()
--   returns trigger language plpgsql security definer set search_path = public as $$
--   declare obj_path text;
--   begin
--     if old.media_url is not null and old.media_url like '%/community-media/%' then
--       obj_path := substring(old.media_url from '/community%-media/(.+)$');
--       if obj_path is not null then
--         delete from storage.objects where bucket_id = 'community-media' and name = obj_path;
--       end if;
--     end if;
--     return old;
--   end; $$;
--
--   create trigger trg_delete_post_media
--     after delete on public.community_posts
--     for each row execute function public.delete_community_storage_object();
--
--   create trigger trg_delete_reply_media
--     after delete on public.community_replies
--     for each row execute function public.delete_community_storage_object();

-- ── Storage: community-media bucket ─────────────────────────────────────────
-- Public bucket for community post/reply images, audio, and video.
-- Max object size: 50 MB. Already created via Supabase MCP execute_sql;
-- re-run this block if the bucket or policies are missing.
--
--   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
--   values (
--     'community-media', 'community-media', true, 52428800,
--     array['image/jpeg','image/png','image/gif','image/webp',
--           'video/mp4','video/quicktime',
--           'audio/aac','audio/mpeg','audio/wav','audio/x-m4a']
--   ) on conflict (id) do nothing;
--
--   create policy "community media anon upload" on storage.objects
--     for insert to anon, authenticated
--     with check (bucket_id = 'community-media');
--
--   create policy "community media public read" on storage.objects
--     for select to anon, authenticated
--     using (bucket_id = 'community-media');
--
--   create policy "community media owner delete" on storage.objects
--     for delete to authenticated
--     using (bucket_id = 'community-media'
--       and (storage.foldername(name))[1] = auth.uid()::text);

-- Done. Every table has RLS enabled; the anon/authenticated API can only do
-- what the policies above allow. The service_role key bypasses RLS — keep it
-- server-side only, never in the Flutter app.
