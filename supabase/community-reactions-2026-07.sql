-- ─────────────────────────────────────────────────────────────────────────────
-- community-reactions-2026-07.sql  (2026-07-06)  — Social wave 1a.
--
-- Multi-emoji reactions (👍 ❤️ 😂 😮) on BOTH posts and replies, via ONE polymorphic
-- table. A reply "like" is just the 👍 reaction on a reply. The existing binary
-- post_likes stays UNTOUCHED (it is load-bearing: community_feed.like_count + the
-- "popular" sort + the post_liked GA4 event + it's already in supabase_realtime).
--
-- Additive, idempotent, reversible. RLS mirrors post_likes exactly. Gated on owner
-- "מאשר פריסה". ⚠️ web code that ships with this reads content_reactions, so APPLY
-- THIS MIGRATION AT MERGE TIME. Apply as MCP migration: community_reactions_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.content_reactions (
  target_type text not null check (target_type in ('post','reply')),
  target_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  emoji       text not null check (emoji in ('👍','❤️','😂','😮')),
  created_at  timestamptz not null default now(),
  primary key (target_type, target_id, user_id)   -- ONE reaction per user per target
);
alter table public.content_reactions enable row level security;

-- RLS mirrors post_likes: public read, own-row write.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_reactions' and policyname='reactions_select_all') then
    create policy reactions_select_all on public.content_reactions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_reactions' and policyname='reactions_insert_own') then
    create policy reactions_insert_own on public.content_reactions for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_reactions' and policyname='reactions_update_own') then
    create policy reactions_update_own on public.content_reactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='content_reactions' and policyname='reactions_delete_own') then
    create policy reactions_delete_own on public.content_reactions for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Grants (this project does NOT default-grant to anon/authenticated — grant explicitly).
grant select on public.content_reactions to anon, authenticated;
grant insert, update, delete on public.content_reactions to authenticated;

create index if not exists content_reactions_target_idx on public.content_reactions (target_type, target_id);

-- Realtime so counts update live (idempotent, same guard as community-web-2026-07 §3).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='content_reactions') then
    execute 'alter publication supabase_realtime add table public.content_reactions';
  end if;
end $$;

-- Widen the notification kind CHECK to include 'reaction' (find + drop the existing
-- kind check by name-agnostic lookup, then re-add the widened set — idempotent).
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'public.community_notifications'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%kind%';
  if cname is not null then
    execute 'alter table public.community_notifications drop constraint ' || quote_ident(cname);
  end if;
  alter table public.community_notifications
    add constraint community_notifications_kind_check
    check (kind in ('reply','mention','flag','reaction'));
end $$;

-- "Someone reacted to your post/reply" — a DEFINER trigger modeled 1:1 on
-- notify_post_author_on_reply, PLUS a §30A opt-out check from day one (so we don't
-- ship another author-notify path that ignores community_notify_opt_out).
create or replace function public.notify_target_author_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author  uuid;
  v_post    uuid;
  v_optout  boolean;
  v_actor   text;
begin
  if new.target_type = 'post' then
    select user_id into v_author from public.community_posts where id = new.target_id;
    v_post := new.target_id;
  else
    select user_id, post_id into v_author, v_post from public.community_replies where id = new.target_id;
  end if;

  if v_author is null or v_author = new.user_id then
    return new; -- target gone, or reacting to your own content
  end if;

  select community_notify_opt_out into v_optout from public.profiles where id = v_author;
  if coalesce(v_optout, false) then
    return new; -- author opted out of in-app community notifications (§30A)
  end if;

  select name into v_actor from public.profiles where id = new.user_id;

  insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
  values (
    v_author, 'reaction', v_post,
    case when new.target_type = 'reply' then new.target_id else null end,
    coalesce(v_actor, 'משתמש')
  );
  return new;
exception when others then
  return new; -- never block the reaction on notification plumbing
end;
$$;
revoke execute on function public.notify_target_author_on_reaction() from public, anon, authenticated;

-- Fire on INSERT only. Switching emoji is an UPDATE (upsert-in-place) → no re-ping.
drop trigger if exists content_reactions_notify_author on public.content_reactions;
create trigger content_reactions_notify_author
  after insert on public.content_reactions
  for each row execute function public.notify_target_author_on_reaction();

-- Rollback: drop trigger + function; drop table content_reactions; restore the
-- kind CHECK to ('reply','mention','flag').
