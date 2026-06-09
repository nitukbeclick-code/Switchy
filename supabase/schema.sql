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
  source        text,                        -- form / callback / advisor / porting
  notes         text,                        -- free-text context for the rep
  created_at    timestamptz not null default now()
);

alter table public.leads enable row level security;

drop policy if exists "leads_insert_anyone" on public.leads;
create policy "leads_insert_anyone" on public.leads
  for insert with check (true);
drop policy if exists "leads_select_own" on public.leads;
create policy "leads_select_own" on public.leads
  for select using (auth.uid() = user_id);

create index if not exists leads_user_idx on public.leads (user_id);
create index if not exists leads_created_idx on public.leads (created_at desc);

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

-- Atomically increments a user's total_savings. Called by the Flutter app when
-- the user confirms they switched plans (tracker step 3 → 4).
create or replace function public.increment_savings(uid uuid, delta integer)
returns void
language sql
security definer
as $$
  update public.profiles
  set total_savings = total_savings + delta
  where id = uid;
$$;

-- Done. Every table has RLS enabled; the anon/authenticated API can only do
-- what the policies above allow. The service_role key bypasses RLS — keep it
-- server-side only, never in the Flutter app.
