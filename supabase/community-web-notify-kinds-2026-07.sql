-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-notify-kinds-2026-07.sql  (2026-07-06)  — Social wave 2.
--
-- Closes the notification loop + fixes a LIVE §30A gap:
--  (1) a shared is_notifiable(uid) DEFINER helper (opt-out is honored in ONE place);
--  (2) RETROFIT notify_post_author_on_reply to honor community_notify_opt_out — today
--      it ignores it (only the mention/reaction paths check it), a shipped §30A gap;
--  (3) kind='like'   — a DEFINER trigger on post_likes INSERT pings the post author
--      (self-excluded, opt-out honored, deduped so unlike+relike never double-pings);
--  (4) kind='pinned' — a DEFINER trigger on community_posts UPDATE (is_pinned f->t)
--      pings the post author when an admin pins their post.
--
-- Additive, idempotent. Depends on community-reactions (kind CHECK already includes
-- 'reaction') + community-web-pinned (is_pinned). ⚠️ web reads the new kinds → apply
-- at merge. MCP migration: community_notify_kinds_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- (1) Single source of truth for "may I send this user an in-app community notice?"
create or replace function public.is_notifiable(p_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_uid is not null
     and exists (
       select 1 from public.profiles
        where id = p_uid and coalesce(community_notify_opt_out, false) = false
     );
$$;
revoke execute on function public.is_notifiable(uuid) from public, anon, authenticated;

-- (Widen the kind CHECK to the full social set — idempotent, name-agnostic drop.)
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
    check (kind in ('reply','mention','flag','reaction','like','pinned'));
end $$;

-- (2) Retrofit the reply trigger to honor opt-out (the live §30A fix).
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
  if not public.is_notifiable(post_author_id) then
    return new; -- §30A opt-out
  end if;
  insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
  values (post_author_id, 'reply', new.post_id, new.id, new.author);
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.notify_post_author_on_reply() from public, anon, authenticated;

-- (3) "someone liked your post" — deduped against an existing UNREAD like from the
-- same actor for the same post, so unlike+relike (a fresh INSERT on the PK) never
-- re-pings while the first is still unread.
create or replace function public.notify_post_author_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_actor  text;
begin
  select user_id into v_author from public.community_posts where id = new.post_id;
  if v_author is null or v_author = new.user_id then
    return new; -- post gone, or liking your own post
  end if;
  if not public.is_notifiable(v_author) then
    return new;
  end if;
  select name into v_actor from public.profiles where id = new.user_id;
  if exists (
    select 1 from public.community_notifications
     where user_id = v_author and kind = 'like' and post_id = new.post_id
       and actor is not distinct from coalesce(v_actor, 'משתמש') and read_at is null
  ) then
    return new; -- already an unread like from this actor on this post
  end if;
  insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
  values (v_author, 'like', new.post_id, null, coalesce(v_actor, 'משתמש'));
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.notify_post_author_on_like() from public, anon, authenticated;

drop trigger if exists post_likes_notify_author on public.post_likes;
create trigger post_likes_notify_author
  after insert on public.post_likes
  for each row execute function public.notify_post_author_on_like();

-- (4) "your post was pinned" — fires only on the false->true transition. actor is
-- left null (the UI reads "הפוסט שלך הוצמד לראש הפיד" without an actor name).
create or replace function public.notify_post_author_on_pin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.is_pinned, false) = false and new.is_pinned = true then
    if new.user_id is not null and public.is_notifiable(new.user_id) then
      insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
      values (new.user_id, 'pinned', new.id, null, null);
    end if;
  end if;
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.notify_post_author_on_pin() from public, anon, authenticated;

drop trigger if exists community_posts_notify_pin on public.community_posts;
create trigger community_posts_notify_pin
  after update of is_pinned on public.community_posts
  for each row execute function public.notify_post_author_on_pin();

-- Rollback: drop the two new triggers + notify_post_author_on_like/pin + is_notifiable;
-- restore notify_post_author_on_reply without the is_notifiable guard; narrow the
-- kind CHECK back to ('reply','mention','flag','reaction').
