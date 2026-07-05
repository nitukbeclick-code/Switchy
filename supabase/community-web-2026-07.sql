-- ─────────────────────────────────────────────────────────────────────────────
-- Community-on-web enablement — 2026-07-05. Additive + idempotent.
--
-- The community BACKEND already exists in prod and is used by the app:
-- community_posts / community_replies / post_likes / post_bookmarks /
-- community_reports / community_notifications / provider_reviews (all RLS on
-- auth.uid()), the `community-media` storage bucket, and the community-moderate /
-- community-notify edge functions. This migration adds only the few things the
-- WEB community + profiles need. Safe to run more than once.
--
-- Apply in the Supabase SQL editor (or CI) BEFORE the web community goes live.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Profile avatar. Avatars are uploaded to the existing `community-media` bucket
--    under <uid>/… (its RLS already lets a user write their own folder); the
--    resulting public URL is stored here. Nullable → existing rows untouched.
alter table public.profiles add column if not exists avatar_url text;

-- 2) User-level blocking — a viewer hides another user's posts/replies from THEIR
--    OWN feed (client filters the global public feed by this list). Private to the
--    blocker; no one can see who blocked whom.
create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table public.community_blocks enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_blocks'
      and policyname = 'community_blocks_own_all'
  ) then
    create policy community_blocks_own_all on public.community_blocks
      for all using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);
  end if;
end $$;

-- 3) Realtime on the feed tables so the web community updates live as posts /
--    replies / likes arrive. Idempotent (skips a table already in the publication).
do $$
declare t text;
begin
  foreach t in array array['community_posts', 'community_replies', 'post_likes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 4) Anti-spam rate limit — a per-user hourly ceiling on new posts / replies,
--    enforced in the DB so it can't be bypassed from any client. Legit users sit
--    far below it; a flood is rejected (the composer surfaces a friendly error and
--    the moderation function still auto-flags whatever does get through).
create or replace function public.community_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_max int := case tg_table_name when 'community_posts' then 20 else 60 end;
begin
  execute format(
    'select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 hour''',
    tg_table_name
  ) into v_count using new.user_id;
  if v_count >= v_max then
    raise exception 'rate_limit: יותר מדי פרסומים בשעה האחרונה — נסו שוב מאוחר יותר.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_rate_limit on public.community_posts;
create trigger community_posts_rate_limit
  before insert on public.community_posts
  for each row execute function public.community_rate_limit();

drop trigger if exists community_replies_rate_limit on public.community_replies;
create trigger community_replies_rate_limit
  before insert on public.community_replies
  for each row execute function public.community_rate_limit();
