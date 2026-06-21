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
  for update using (auth.uid() = id) with check (auth.uid() = id);

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

-- COLUMN-SCOPE the SELECT (defence in depth on top of the row-scoping above).
-- leads_select_own restricts WHICH ROWS a session sees (only its own leads),
-- but PostgREST's default table-level SELECT grant still lets that session read
-- EVERY column on those rows via `select=*` — including internal ops/PII columns
-- (notes, source_ip, claimed_by*, *_at stamps, actual_saving). The app (and the
-- anonymous/site session that submitted the lead) only ever needs the lead's
-- STATUS back (see fetchLeadStep: select('status') filtered by user_id, ordered
-- by created_at). So drop the broad table grant and re-grant SELECT on only the
-- safe columns. The pure `anon`/site role only INSERTs leads, so it gets no
-- SELECT at all; the app's anonymous users hold the `authenticated` role.
-- INSERT stays untouched (the anon lead-capture path and the rate-limit trigger
-- are unaffected). The sales team still reads everything via the service_role
-- key, which bypasses RLS and column grants entirely.
revoke select on public.leads from anon, authenticated;
grant select (id, status, created_at, user_id) on public.leads to authenticated;

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
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
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
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
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

drop policy if exists "plan_views_insert_anyone" on public.plan_views;
create policy "plan_views_insert_anyone" on public.plan_views
  for insert with check (true);

-- ── plan_views anti-abuse gate ───────────────────────────────────────────────
-- plan_views_insert_anyone is deliberate (anonymous page-view analytics), but
-- `with check (true)` accepts ANY row. Two risks, both fixed at the door:
--   • user_id spoofing — get_hot_browsers() joins plan_views.user_id to
--     profiles(name, phone), so a forged user_id could surface a victim's
--     profile in the hot-browser feed and poison the demand analytics. Pin
--     user_id to the authenticated caller (null for anon inserts, which is the
--     legitimate site case — see trackPlanView, which only sends user_id when
--     signed in and always sets it to its own uid).
--   • unbounded volume / oversized strings — bound the free-text fields and add
--     a coarse global per-hour circuit breaker. The ceiling is high enough that
--     real traffic is never blocked; it only caps a flood. No IP column is
--     stored (keeping the table shape — and the analytics views over it —
--     unchanged), so this stays a lightweight global guard, simpler than the
--     per-IP/per-phone logic in leads_rate_limit.
create or replace function public.plan_views_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- never accept a caller-supplied user_id for someone else; anon stays null
  new.user_id := case when new.user_id = auth.uid() then new.user_id else null end;
  -- bound the identifier strings (plan_id/provider are short ids; category is a
  -- fixed enum-ish set) so a flood can't write multi-KB rows
  if length(coalesce(new.plan_id, ''))  > 120
     or length(coalesce(new.provider, '')) > 120
     or length(coalesce(new.category, '')) > 40 then
    raise exception 'field too long';
  end if;
  -- coarse global circuit breaker: caps worst-case insert volume per hour
  if (select count(*) from public.plan_views
      where viewed_at > now() - interval '1 hour') >= 5000 then
    raise exception 'rate limit exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists plan_views_guard_before_insert on public.plan_views;
create trigger plan_views_guard_before_insert
  before insert on public.plan_views
  for each row execute function public.plan_views_guard();

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


-- ═══════════════════════════════════════════════════════════════════════════
-- VIDEO MEETINGS (Zoom) — mirrored from meetings-2026-06.sql for fresh installs
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. meetings table ────────────────────────────────────────────────────────
create table if not exists public.meetings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  name             text not null,
  phone            text not null,
  email            text,
  provider         text,
  plan_id          text,
  meeting_date     date not null,            -- Israel-local calendar date
  slot             text not null,            -- 'HH:MM' on the 30-minute grid
  starts_at        timestamptz,              -- SERVER-computed (meetings_guard)
  status           text not null default 'pending',
      -- pending / confirmed / no_rep / cancelled / expired / completed
  join_url         text,                     -- Zoom link (server-managed)
  zoom_meeting_id  text,                     -- server-managed
  notes            text,
  source           text,                     -- plan / callback / home / form
  -- Legal consent (re-stamped server-side, same as leads)
  terms_accepted_at      timestamptz,
  privacy_accepted_at    timestamptz,
  marketing_accepted_at  timestamptz,
  -- Bot workflow (server-managed; the insert gate nulls client values)
  notified_at      timestamptz,
  claimed_by       text,
  claimed_by_tg_id bigint,
  claimed_at       timestamptz,
  confirmed_at     timestamptz,
  reminded_rep_at  timestamptz,
  source_ip        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- ── 2. RLS — leads' insert-anyone / select-own / column-limited pattern ──────
alter table public.meetings enable row level security;

drop policy if exists "meetings_insert_anyone" on public.meetings;
create policy "meetings_insert_anyone" on public.meetings
  for insert with check (true);
drop policy if exists "meetings_select_own" on public.meetings;
create policy "meetings_select_own" on public.meetings
  for select using (auth.uid() = user_id);

-- Column-scope the SELECT: the app only ever reads status + schedule + the
-- join link back (see SupabaseBackend.fetchLatestMeeting / meetingStream).
-- Rep identity, notes and the source IP never reach a client session. No
-- UPDATE/DELETE policies — every transition goes through the service-role bot.
revoke select on public.meetings from anon, authenticated;
grant select (id, status, provider, meeting_date, slot, starts_at, join_url, created_at, user_id)
  on public.meetings to authenticated;
-- The notify-lead bot runs as service_role (bypasses RLS) but STILL needs the
-- explicit base-table grant — default privileges do not grant to service_role on
-- this project (same as chat_messages, README §2026-06 incident). Without this,
-- every service-role meetings read/write 403s and confirming a meeting fails
-- with "העדכון נכשל". Applied live 2026-06-21; kept here so deploys don't regress.
grant select, insert, update, delete on public.meetings to service_role;

-- Realtime: the app's meetingStream() listens for UPDATEs on this table —
-- without publication membership no event ever reaches the client.
do $$ begin
  alter publication supabase_realtime add table public.meetings;
exception when duplicate_object then null;
end $$;

create index if not exists meetings_user_idx on public.meetings (user_id);
create index if not exists meetings_created_idx on public.meetings (created_at desc);
-- partial index for the renewal-reminders unnotified sweep
create index if not exists meetings_unnotified_idx on public.meetings (created_at)
  where notified_at is null;
-- open meetings by start time (follow-up planner + /meetings command)
create index if not exists meetings_open_idx on public.meetings (starts_at)
  where status in ('pending', 'confirmed');
-- normalized per-phone lookups for the rate limit + one-open-meeting gate
create index if not exists meetings_phone_norm_idx
  on public.meetings (regexp_replace(phone, '\D', '', 'g'), created_at desc);

-- ── 3. meetings_guard — validation + rate-limit + DST-safe starts_at ─────────
-- One BEFORE INSERT gate combining the roles of leads_rate_limit +
-- leads_consent_stamp, plus the meeting-specific schedule rules. The Flutter
-- wizard renders exactly these rules (lib/services/meeting_slots.dart); this
-- trigger is the authoritative enforcement.
create or replace function public.meetings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_headers json;
  req_ip text;
  xff text[];
  il_today date;
  dow int;
begin
  -- serialize same-phone inserts so the one-open-meeting check and the
  -- per-phone rate limit can't be raced by concurrent requests
  perform pg_advisory_xact_lock(hashtext(regexp_replace(new.phone, '\D', '', 'g')));

  -- user_id must be the caller's identity — a forged value would plant the
  -- meeting (and its Realtime updates) in another user's app
  if new.user_id is distinct from auth.uid() then
    new.user_id := auth.uid();
  end if;

  -- server-managed columns — never accepted from the inserter
  new.status := 'pending';
  new.join_url := null;        new.zoom_meeting_id := null;
  new.notified_at := null;     new.claimed_by := null;
  new.claimed_by_tg_id := null; new.claimed_at := null;
  new.confirmed_at := null;    new.reminded_rep_at := null;

  -- shape validation (same regexes/bounds as leads_rate_limit)
  if length(trim(new.name)) < 2 or length(new.name) > 80 then
    raise exception 'invalid name';
  end if;
  if new.phone !~ '^[+0-9][0-9\-\s]{7,14}$' then
    raise exception 'invalid phone';
  end if;
  if length(coalesce(new.notes, ''))    > 2000
     or length(coalesce(new.email, ''))    > 254
     or length(coalesce(new.provider, '')) > 120
     or length(coalesce(new.plan_id, ''))  > 120
     or length(coalesce(new.source, ''))   > 40 then
    raise exception 'field too long';
  end if;

  -- schedule rules: Israel wall clock is the only clock that matters here.
  il_today := (now() at time zone 'Asia/Jerusalem')::date;
  if new.meeting_date < il_today + 1 then
    raise exception 'meeting must be booked at least one day ahead';
  end if;
  if new.meeting_date > il_today + 30 then
    raise exception 'meeting too far ahead';
  end if;
  dow := extract(isodow from new.meeting_date); -- 1=Mon … 7=Sun
  if dow = 6 then
    raise exception 'no meetings on Saturday';
  end if;
  if dow = 5 then
    -- Friday: mornings only, 09:00–12:30
    if new.slot !~ '^(09|1[0-2]):(00|30)$' or new.slot > '12:30' then
      raise exception 'invalid slot for Friday';
    end if;
  else
    -- Sunday–Thursday: 09:00–20:30
    if new.slot !~ '^(09|1[0-9]|20):(00|30)$' then
      raise exception 'invalid slot';
    end if;
  end if;

  -- the authoritative UTC instant: resolved through the Postgres tz database,
  -- so Israel DST transitions can never drift the meeting time.
  new.starts_at := ((new.meeting_date::text || ' ' || new.slot)::timestamp)
                     at time zone 'Asia/Jerusalem';

  -- one open meeting per phone (pending/confirmed in the future)
  if (select count(*) from public.meetings
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and status in ('pending', 'confirmed')
        and starts_at > now()) >= 1 then
    raise exception 'meeting already pending';
  end if;

  -- rate limits (tighter than leads — meetings are a heavier commitment):
  --   per-phone 3/24h · per-IP 5/h · global 30/h circuit breaker
  if (select count(*) from public.meetings
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate limit exceeded';
  end if;
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
    if (select count(*) from public.meetings
        where source_ip = new.source_ip
          and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'rate limit exceeded';
    end if;
  end if;
  if (select count(*) from public.meetings
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limit exceeded';
  end if;

  -- consent re-stamp (server-authoritative, like leads_consent_stamp)
  new.terms_accepted_at     := case when new.terms_accepted_at     is not null then now() else null end;
  new.privacy_accepted_at   := case when new.privacy_accepted_at   is not null then now() else null end;
  new.marketing_accepted_at := case when new.marketing_accepted_at is not null then now() else null end;

  return new;
end;
$$;

drop trigger if exists meetings_guard_before_insert on public.meetings;
create trigger meetings_guard_before_insert
  before insert on public.meetings
  for each row execute function public.meetings_guard();

-- ── 4. meeting_events audit trail (service-role only, mirrors lead_events) ───
create table if not exists public.meeting_events (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  event       text not null,    -- status_change / claim / note / link_set / reminder / undo
  old_status  text,
  new_status  text,
  actor_tg_id bigint,
  actor_name  text,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.meeting_events enable row level security;
-- service_role (the bot) needs an explicit base-table grant — see the meetings
-- note above. Without it, logMeetingEvent() silently 403s on every confirm.
grant select, insert, update, delete on public.meeting_events to service_role;
create index if not exists meeting_events_meeting_idx
  on public.meeting_events (meeting_id, created_at desc);

-- ── 5. notify the rep team on INSERT (pg_net → notify-lead function) ─────────
-- Same pattern as the documented notify_lead_on_insert (README §8): SECURITY
-- DEFINER, secret from Vault, fire-and-forget. The edge function tells leads
-- and meetings apart by the payload's `table` field.
create or replace function public.notify_meeting_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  begin
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'lead_webhook_secret';
  exception when others then
    secret := null;
  end;
  if secret is null then return new; end if; -- not configured yet — sweep will retry
  perform net.http_post(
    url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body    := jsonb_build_object('table', 'meetings', 'record', to_jsonb(new))
  );
  return new;
exception when others then
  return new; -- never block the booking on notification plumbing
end;
$$;

drop trigger if exists meetings_notify_after_insert on public.meetings;
create trigger meetings_notify_after_insert
  after insert on public.meetings
  for each row execute function public.notify_meeting_on_insert();

-- ── 6. Config RPC: add the Zoom keys ─────────────────────────────────────────
-- FULL REPLACEMENT of get_lead_notify_config (the deployed original came from
-- a dashboard migration). ⚠️ OWNER: before running, confirm the deployed
-- function's whitelist matches the names below (run
--   select prosrc from pg_proc where proname = 'get_lead_notify_config';
-- ) so no existing key is dropped. The function returns a {name: secret} JSON
-- object consumed by functions/_shared/config.ts.
-- DROP first: CREATE OR REPLACE aborts (42P13) if the deployed original's
-- return type differs; the revoke/grant below re-applies the permissions.
drop function if exists public.get_lead_notify_config();
create function public.get_lead_notify_config()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name in (
     'telegram_bot_token', 'telegram_chat_id', 'telegram_allowed_user_ids',
     'resend_api_key', 'resend_from', 'leads_notify_email',
     'openai_api_key', 'anthropic_api_key', 'lead_webhook_secret',
     -- Zoom Server-to-Server OAuth (optional — the bot falls back to the
     -- reply-with-link flow when these are absent)
     'zoom_account_id', 'zoom_client_id', 'zoom_client_secret', 'zoom_host_email'
   );
$$;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- ── 7. (Optional) Zoom credentials — owner runs after creating a Zoom
--      Server-to-Server OAuth app (marketplace.zoom.us → Develop → Build App):
-- select vault.create_secret('<account id>',    'zoom_account_id');
-- select vault.create_secret('<client id>',     'zoom_client_id');
-- select vault.create_secret('<client secret>', 'zoom_client_secret');

-- ── 8. ai-chat: Gemini key in the config RPC + a tiny rate-limit table ──────
-- Adds 'gemini_api_key' to the same whitelist get_lead_notify_config() already
-- exposes to service_role (see section 6). FULL REPLACEMENT for the same
-- 42P13 reason noted there.
drop function if exists public.get_lead_notify_config();
create function public.get_lead_notify_config()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name in (
     'telegram_bot_token', 'telegram_chat_id', 'telegram_allowed_user_ids',
     'resend_api_key', 'resend_from', 'leads_notify_email',
     'openai_api_key', 'anthropic_api_key', 'gemini_api_key', 'lead_webhook_secret',
     'zoom_account_id', 'zoom_client_id', 'zoom_client_secret', 'zoom_host_email'
   );
$$;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- select vault.create_secret('<your gemini api key>', 'gemini_api_key');

-- chat_messages: write-only counter the ai-chat function uses to throttle
-- itself (max 15/IP/hour — see PER_IP_HOURLY_LIMIT in the edge function).
-- No message text is stored, only the IP + timestamp needed to count; the
-- edge function uses the service_role key so no anon RLS policy is needed.
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_ip_idx on public.chat_messages (ip, created_at desc);
alter table public.chat_messages enable row level security;
-- Deliberately no policies: only service_role (which bypasses RLS) may
-- read/write this table; anon/authenticated get nothing.
-- BYPASSRLS skips the policy check but NOT the base table grant — so the
-- service_role still needs an explicit GRANT here. (This project's default
-- privileges do not grant to service_role, so relying on them silently 403s
-- every insert/select from the edge function — see the 2026-06 incident.)
grant select, insert on public.chat_messages to service_role;

-- Trim old rows daily so the table doesn't grow unbounded (only the last
-- hour is ever queried). Optional — register once if pg_cron is enabled:
-- select cron.schedule('chat-messages-trim', '17 3 * * *',
--   $$ delete from public.chat_messages where created_at < now() - interval '2 days' $$);

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
-- The community-media bucket and its RLS live in supabase/storage.sql — the
-- single source of truth. (The previously inlined policy snippet here was both
-- redundant and weaker than storage.sql: it granted broad `anon` upload and an
-- object-listing `public read` policy that storage.sql deliberately omits per
-- advisor 0025_public_bucket_allows_listing. Do not reintroduce it.)

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-06-21 — DRIFT-HEAL + COMMUNITY MODERATION migration
-- ───────────────────────────────────────────────────────────────────────────
-- (A) DRIFT-HEAL: objects that exist LIVE but were missing from this file, so a
--     fresh install (or a `psql -f schema.sql` re-apply) reproduces production
--     exactly. (B) COMMUNITY moderation/notification contract used by the
--     community-moderate + community-notify Edge Functions. All idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (A1) AI rate-limit tables (advisor / bill-analyzer / newsletter) ─────────
-- Mirror chat_messages: write-mostly throttle tables read only via service_role
-- (which bypasses RLS but STILL needs the explicit base-table grant on this
-- project — see the 2026-06 incident note on chat_messages). RLS on, no policies.
create table if not exists public.advisor_sessions (
  id         bigint generated always as identity primary key,
  ip         text,
  created_at timestamptz not null default now()
);
create index if not exists advisor_sessions_ip_idx
  on public.advisor_sessions (ip, created_at desc);
alter table public.advisor_sessions enable row level security;
grant select, insert on public.advisor_sessions to service_role;

create table if not exists public.bill_analyses (
  id            bigint generated always as identity primary key,
  ip            text,
  provider      text,
  current_spend numeric,
  suggestions   jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists bill_analyses_ip_idx
  on public.bill_analyses (ip, created_at desc);
alter table public.bill_analyses enable row level security;
grant select, insert on public.bill_analyses to service_role;

create table if not exists public.newsletter_subscribers (
  id           bigint generated always as identity primary key,
  email        text not null,
  consent      boolean default false,
  source       text,
  source_ip    text,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now()
);
-- case-insensitive uniqueness on email (double opt-in re-subscribe is an upsert)
create unique index if not exists newsletter_subscribers_email_lower_idx
  on public.newsletter_subscribers (lower(email));
create index if not exists newsletter_subscribers_ip_idx
  on public.newsletter_subscribers (source_ip, created_at desc);
alter table public.newsletter_subscribers enable row level security;
grant select, insert, update on public.newsletter_subscribers to service_role;

-- ── (A2) meetings / meeting_events service_role grants (belt-and-suspenders) ──
-- Already granted inline above; re-stated so a partial re-apply can't regress
-- (default privileges do not grant to service_role on this project).
grant select, insert, update, delete on public.meetings        to service_role;
grant select, insert, update, delete on public.meeting_events  to service_role;

-- ── (A3) HARDEN advisor-flagged updated_at trigger fns: pin search_path ───────
-- The two generic "stamp updated_at" trigger functions were flagged
-- (function_search_path_mutable). Re-declare with `set search_path = public`,
-- preserving their one-line body. set_updated_at already carries it above; this
-- block also creates update_updated_at (live-only — was missing from this file).
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create or replace function public.update_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- ── (A4) community → community-notify webhook (SECURITY DEFINER, fail-soft) ───
-- Mirrors notify_meeting_on_insert: secret from Vault, pg_net fire-and-forget,
-- never blocks the insert. Fires on new posts / replies / reviews so the
-- community-notify function can fan out reply/mention notifications.
create or replace function public.notify_community_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  begin
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'lead_webhook_secret';
  exception when others then
    secret := null;
  end;
  if secret is null then return new; end if; -- not configured yet
  perform net.http_post(
    url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/community-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new)
    )
  );
  return new;
exception when others then
  return new; -- never block the write on notification plumbing
end;
$$;
-- trigger fn: only the trigger (table owner) ever invokes it — clients must not
revoke execute on function public.notify_community_on_insert() from public, anon, authenticated;
-- and the meeting/lead notify trigger fns get the same revoke (drift-heal)
revoke execute on function public.notify_meeting_on_insert() from anon, authenticated;

drop trigger if exists community_posts_notify_after_insert on public.community_posts;
create trigger community_posts_notify_after_insert
  after insert on public.community_posts
  for each row execute function public.notify_community_on_insert();

drop trigger if exists community_replies_notify_after_insert on public.community_replies;
create trigger community_replies_notify_after_insert
  after insert on public.community_replies
  for each row execute function public.notify_community_on_insert();

drop trigger if exists provider_reviews_notify_after_insert on public.provider_reviews;
create trigger provider_reviews_notify_after_insert
  after insert on public.provider_reviews
  for each row execute function public.notify_community_on_insert();

-- ── (A5) Canonical service_role posture (applied live 2026-06-21) ────────────
-- This project's default privileges do NOT grant to service_role, which is why
-- every table above needs an explicit grant. Rather than chase each one, apply
-- the canonical posture: service_role gets everything in `public`, now and for
-- future objects. (service_role is server-side only; it already bypasses RLS.)
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (B) COMMUNITY moderation + notification contract
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (B1) moderation columns on posts / replies ──────────────────────────────
alter table public.community_posts   add column if not exists is_flagged      boolean not null default false;
alter table public.community_posts   add column if not exists moderation_note text;
alter table public.community_posts   add column if not exists flagged_at      timestamptz;
alter table public.community_replies  add column if not exists is_flagged      boolean not null default false;
alter table public.community_replies  add column if not exists moderation_note text;
alter table public.community_replies  add column if not exists flagged_at      timestamptz;

-- ── (B2) provider_reviews: verified-customer badge ───────────────────────────
alter table public.provider_reviews add column if not exists is_verified_customer boolean not null default false;

-- ── (B3) community_reports  (a user flags a post/reply for moderation) ───────
create table if not exists public.community_reports (
  id               uuid primary key default gen_random_uuid(),
  target_type      text check (target_type in ('post','reply')),
  target_id        uuid,
  reporter_user_id uuid,
  reason           text,
  body             text,
  created_at       timestamptz not null default now()
);
alter table public.community_reports enable row level security;

-- a signed-in user may file a report as themselves; nobody reads via the API
-- (the rep/moderation tooling uses service_role, which bypasses RLS).
drop policy if exists "reports_insert_own" on public.community_reports;
create policy "reports_insert_own" on public.community_reports
  for insert with check (auth.uid() = reporter_user_id);
drop policy if exists "reports_service_all" on public.community_reports;
create policy "reports_service_all" on public.community_reports
  for all to service_role using (true) with check (true);

grant insert on public.community_reports to authenticated;
grant select, insert, update, delete on public.community_reports to service_role;

create index if not exists community_reports_target_idx
  on public.community_reports (target_type, target_id, created_at desc);

-- ── (B4) community_notifications  (reply / mention / flag inbox) ─────────────
create table if not exists public.community_notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  kind       text check (kind in ('reply','mention','flag')),
  post_id    uuid,
  reply_id   uuid,
  actor      text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.community_notifications enable row level security;

-- each user reads (and marks read) only their own notifications; rows are
-- written by service_role / SECURITY DEFINER triggers, never by clients.
drop policy if exists "notifications_select_own" on public.community_notifications;
create policy "notifications_select_own" on public.community_notifications
  for select using (auth.uid() = user_id);
drop policy if exists "notifications_update_own" on public.community_notifications;
create policy "notifications_update_own" on public.community_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications_service_all" on public.community_notifications;
create policy "notifications_service_all" on public.community_notifications
  for all to service_role using (true) with check (true);

grant select, update on public.community_notifications to authenticated;
grant select, insert, update, delete on public.community_notifications to service_role;

create index if not exists community_notifications_user_idx
  on public.community_notifications (user_id, created_at desc);
create index if not exists community_notifications_unread_idx
  on public.community_notifications (user_id, created_at desc)
  where read_at is null;

-- ── (B5) is_verified_customer auto-stamp (best-effort, fail-soft) ────────────
-- A review is "verified customer" if the author has a won lead OR a tracked
-- plan. SECURITY DEFINER so it can see leads/tracked_plans regardless of RLS;
-- wrapped fail-soft so a lookup hiccup never blocks a review.
create or replace function public.set_review_verified_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    new.is_verified_customer := exists (
      select 1 from public.leads
      where user_id = new.user_id and status = 'won'
    ) or exists (
      select 1 from public.tracked_plans
      where user_id = new.user_id
    );
  exception when others then
    new.is_verified_customer := coalesce(new.is_verified_customer, false);
  end;
  return new;
end;
$$;
revoke execute on function public.set_review_verified_customer() from public, anon, authenticated;

drop trigger if exists provider_reviews_verify_customer on public.provider_reviews;
create trigger provider_reviews_verify_customer
  before insert or update on public.provider_reviews
  for each row execute function public.set_review_verified_customer();

-- ── (B6) moderation webhook → community-moderate (SECURITY DEFINER, fail-soft) ─
-- Mirrors notify_community_on_insert. The community-moderate function validates
-- the shared secret, classifies the new post/reply, and PATCHes is_flagged when
-- it detects spam/abuse.
create or replace function public.notify_community_moderate_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  begin
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'lead_webhook_secret';
  exception when others then
    secret := null;
  end;
  if secret is null then return new; end if;
  perform net.http_post(
    url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/community-moderate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  tg_table_name,
      'record', to_jsonb(new)
    )
  );
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.notify_community_moderate_on_insert() from public, anon, authenticated;

drop trigger if exists notify_community_moderate_on_insert on public.community_posts;
create trigger notify_community_moderate_on_insert
  after insert on public.community_posts
  for each row execute function public.notify_community_moderate_on_insert();

drop trigger if exists notify_community_moderate_on_insert on public.community_replies;
create trigger notify_community_moderate_on_insert
  after insert on public.community_replies
  for each row execute function public.notify_community_moderate_on_insert();

-- ── (B7) reply → notification fan-out (SECURITY DEFINER; skip self-replies) ──
-- On a new reply, notify the parent post's author (unless they replied to their
-- own post). DEFINER so it can read community_posts.user_id past RLS.
create or replace function public.notify_post_author_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author_id uuid;
begin
  select user_id into post_author_id
    from public.community_posts where id = new.post_id;
  if post_author_id is null or post_author_id = new.user_id then
    return new; -- post gone, or author replying to themselves
  end if;
  insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
  values (post_author_id, 'reply', new.post_id, new.id, new.author);
  return new;
exception when others then
  return new; -- never block the reply on notification plumbing
end;
$$;
revoke execute on function public.notify_post_author_on_reply() from public, anon, authenticated;

drop trigger if exists community_replies_notify_author on public.community_replies;
create trigger community_replies_notify_author
  after insert on public.community_replies
  for each row execute function public.notify_post_author_on_reply();

-- Done. Every table has RLS enabled; the anon/authenticated API can only do
-- what the policies above allow. The service_role key bypasses RLS — keep it
-- server-side only, never in the Flutter app.
