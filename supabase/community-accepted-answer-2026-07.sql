-- ─────────────────────────────────────────────────────────────────────────────
-- community-accepted-answer-2026-07.sql  (2026-07-06)  — "best answer" on Q&A posts.
--
-- Lets the POST AUTHOR mark one reply as the helpful answer (StackOverflow-style):
-- it gets a badge + floats to the top, and the SEO permalink promotes it to the
-- QAPage `acceptedAnswer`. Perfect fit for a telecom-advice community.
--
-- Security model (no new grant needed):
--   • community_posts already lets ONLY the author UPDATE their row (RLS
--     posts_update_own = auth.uid()=user_id); the community_posts_guard_update
--     trigger reverts privileged columns for non-admins but does NOT touch
--     accepted_reply_id — so the author can set/clear it, nobody else can.
--   • A dedicated BEFORE UPDATE OF accepted_reply_id trigger validates the target
--     reply actually belongs to THIS post, so the author can't point the mark at an
--     unrelated reply. FK ON DELETE SET NULL clears the mark if the reply is deleted.
--
-- Additive + idempotent. Apply as MCP migration: community_accepted_answer_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.community_posts
  add column if not exists accepted_reply_id uuid
  references public.community_replies(id) on delete set null;

-- Integrity: validates a set/changed non-null accepted_reply_id (clearing to null is
-- always allowed). SECURITY DEFINER so it can read community_replies regardless of the
-- caller. Enforces the full intent AT THE DB (defense-in-depth beyond the UI):
--   (a) AUTHOR-ONLY — even an admin can't pick a "best answer" on someone else's post
--       (admins moderate via the admin dashboard, not by choosing answers for people).
--       auth.uid() is null (service_role/internal) is exempt from the authorship check.
--   (b) the target must be a TOP-LEVEL reply ON this post (an answer to the question,
--       not a nested reply-to-reply) so the thread + permalink surfaces stay in sync.
create or replace function public.community_posts_check_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.accepted_reply_id is not null
     and new.accepted_reply_id is distinct from old.accepted_reply_id then
    if auth.uid() is not null and auth.uid() <> new.user_id then
      raise exception 'only_author_sets_accepted';
    end if;
    if not exists (
      select 1 from public.community_replies
       where id = new.accepted_reply_id
         and post_id = new.id
         and parent_reply_id is null
    ) then
      raise exception 'accepted_reply_not_on_post';
    end if;
  end if;
  return new;
end; $$;
revoke execute on function public.community_posts_check_accepted() from public, anon, authenticated;
drop trigger if exists community_posts_check_accepted on public.community_posts;
create trigger community_posts_check_accepted
  before update of accepted_reply_id on public.community_posts
  for each row execute function public.community_posts_check_accepted();

-- Expose accepted_reply_id on the read view (client feed + SEO permalinks). The view
-- has no reloptions (reloptions=null) and SELECT is granted to anon+authenticated;
-- CREATE OR REPLACE preserves both. New column is appended last (required).
create or replace view public.community_feed as
  select p.id,
         p.user_id,
         p.author,
         p.avatar,
         p.channel,
         p.body,
         p.media_type,
         p.media_url,
         p.media_duration_ms,
         p.created_at,
         coalesce(l.cnt, 0::bigint) as like_count,
         coalesce(r.cnt, 0::bigint) as reply_count,
         p.is_flagged,
         p.moderation_note,
         p.is_pinned,
         p.edited_at,
         p.provider_slug,
         p.accepted_reply_id
    from community_posts p
         left join ( select post_likes.post_id, count(*) as cnt
                       from post_likes group by post_likes.post_id) l on l.post_id = p.id
         left join ( select community_replies.post_id, count(*) as cnt
                       from community_replies group by community_replies.post_id) r on r.post_id = p.id;

-- Rollback: create or replace view community_feed WITHOUT accepted_reply_id; drop
-- trigger community_posts_check_accepted + function community_posts_check_accepted();
-- alter table community_posts drop column accepted_reply_id.
