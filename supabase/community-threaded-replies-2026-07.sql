-- ─────────────────────────────────────────────────────────────────────────────
-- community-threaded-replies-2026-07.sql  (2026-07-06)  — Social wave 1b.
--
-- Reply-to-reply threading, Facebook-style, capped at 2 visual levels (root ->
-- children; a reply to a child re-parents to the top-level ancestor so the tree
-- never nests deeper). Additive: parent_reply_id is nullable, so every existing
-- flat reply + query keeps working unchanged. The moderation + reply-notify
-- triggers keep firing. Gated on owner "מאשר פריסה"; ⚠️ web reads parent_reply_id,
-- so APPLY AT MERGE. Apply as MCP migration: community_threaded_replies_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.community_replies
  add column if not exists parent_reply_id uuid references public.community_replies(id) on delete cascade;
comment on column public.community_replies.parent_reply_id is
  'Nullable: the reply this one answers (same post). Depth is capped at 1 by community_replies_cap_depth — a reply to a child re-parents to the top-level ancestor.';

create index if not exists community_replies_parent_idx
  on public.community_replies (parent_reply_id) where parent_reply_id is not null;

-- Depth cap + same-post integrity, enforced in the DB (can't be bypassed by any
-- client). Runs BEFORE INSERT so it rewrites NEW.parent_reply_id in place.
create or replace function public.community_replies_cap_depth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_post   uuid;
  v_grandparent   uuid;
begin
  if new.parent_reply_id is null then
    return new;
  end if;
  select post_id, parent_reply_id into v_parent_post, v_grandparent
    from public.community_replies where id = new.parent_reply_id;
  if v_parent_post is null then
    -- Parent vanished → treat as a top-level reply.
    new.parent_reply_id := null;
    return new;
  end if;
  if v_parent_post <> new.post_id then
    -- Cross-post parent is invalid → drop the link (keep it as a top-level reply).
    new.parent_reply_id := null;
    return new;
  end if;
  if v_grandparent is not null then
    -- Parent is itself a child → re-parent to the top-level ancestor (cap depth=1).
    new.parent_reply_id := v_grandparent;
  end if;
  return new;
end;
$$;
revoke execute on function public.community_replies_cap_depth() from public, anon, authenticated;

drop trigger if exists community_replies_cap_depth_trg on public.community_replies;
create trigger community_replies_cap_depth_trg
  before insert on public.community_replies
  for each row execute function public.community_replies_cap_depth();

-- Notify the PARENT-REPLY author too (kind='reply'). The existing
-- notify_post_author_on_reply already pings the POST author, so skip the parent
-- ping when the parent author IS the post author (no duplicate) or is the actor.
create or replace function public.notify_reply_author_on_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_author uuid;
  v_post_author   uuid;
  v_optout        boolean;
begin
  if new.parent_reply_id is null then
    return new;
  end if;
  select user_id into v_parent_author from public.community_replies where id = new.parent_reply_id;
  select user_id into v_post_author   from public.community_posts   where id = new.post_id;

  if v_parent_author is null
     or v_parent_author = new.user_id       -- replying to your own reply
     or v_parent_author = v_post_author then -- post author already notified
    return new;
  end if;

  select community_notify_opt_out into v_optout from public.profiles where id = v_parent_author;
  if coalesce(v_optout, false) then
    return new; -- §30A opt-out
  end if;

  insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
  values (v_parent_author, 'reply', new.post_id, new.id, new.author);
  return new;
exception when others then
  return new;
end;
$$;
revoke execute on function public.notify_reply_author_on_reply() from public, anon, authenticated;

drop trigger if exists community_replies_notify_parent on public.community_replies;
create trigger community_replies_notify_parent
  after insert on public.community_replies
  for each row execute function public.notify_reply_author_on_reply();

-- Rollback: drop the two triggers + functions; drop index; alter table drop column
-- parent_reply_id (cascades away nothing — column is additive).
