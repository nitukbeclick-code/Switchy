-- ─────────────────────────────────────────────────────────────────────────────
-- community-insert-hardening-2026-07.sql  (2026-07-27)  — SECURITY (HIGH) + a
-- correctness fix to community_feed.reply_count.
--
-- PART 1 — THE INSERT HOLE THAT community-posts-update-guard-2026-07 DID NOT CLOSE.
--
-- That migration closed the UPDATE path: a BEFORE-UPDATE trigger forces the pin /
-- moderation / identity columns back to their stored values for a regular member.
-- It is correct and stays. But INSERT was never guarded, and:
--
--     schema.sql:1472  grant insert, update, delete on public.community_posts to authenticated;
--     schema.sql:423   create policy "posts_insert_own" ... with check (auth.uid() = user_id);
--
-- a TABLE-WIDE insert grant plus a policy that checks nothing but user_id. So
-- everything the update guard protects is simply settable at creation time,
-- reachable with the anon key + the member's own JWT:
--
--   insert into community_posts (user_id, channel, body, is_pinned)
--   values (auth.uid(), 'סלולר', '…', true);      -- pinned to the top of everyone's feed
--
-- Three distinct abuses, all self-promotion or moderation evasion:
--   • is_pinned = true                → sit above every other post, bypassing the
--                                       admin-only pin gate the UI enforces.
--   • is_flagged / moderation_note /
--     flagged_at                      → author-controlled moderation state on a
--                                       row the moderator has not seen yet.
--   • created_at = <far future>       → EQUIVALENT TO PINNING. Every feed reads
--                                       `order by created_at desc`
--                                       (web/lib/community.ts:185, site/script.js:3761),
--                                       so a forged date is a permanent top slot
--                                       that no un-pin will clear. The update guard
--                                       already forces created_at back on UPDATE —
--                                       it is treated as sensitive there — which is
--                                       exactly why leaving it open on INSERT is a gap
--                                       and not a design choice.
--
-- THE FIX IS COLUMN-LEVEL GRANTS, NOT ANOTHER TRIGGER. This repo already proved
-- the pattern: community-web-edit-2026-07.sql:24 restricts the replies UPDATE to
-- `(body, edited_at)` the same way. A grant is declarative, needs no auth.uid()
-- lookup per row, cannot be bypassed by a SECURITY DEFINER path, and fails CLOSED —
-- a column nobody granted simply cannot be written. Omitted columns fall back to
-- their DEFAULTs (id → gen_random_uuid(), created_at → now(), is_pinned/is_flagged
-- → false), which is precisely the desired behaviour.
--
-- service_role is unaffected (it bypasses grants), so moderation, the notify
-- functions and every edge function keep working.
--
-- THE GRANT LISTS BELOW ARE EXACTLY WHAT THE CLIENTS INSERT — verified against
-- every insert path in the repo:
--   posts    web/lib/community.ts:330            + lib/services/backend/supabase_backend.dart:851
--   replies  web/lib/community.ts:404            + lib/services/backend/supabase_backend.dart:896
-- If a composer gains a column and this list does not, posting breaks — loudly, at
-- the first insert. web/lib/__tests__/community-insert-grants.test.ts pins the two
-- against each other so that mismatch fails in CI instead of in production.
--
-- PART 2 — reply_count counted replies that moderation had removed. See below.
--
-- Additive, idempotent, safe to re-run. Apply as MCP migration:
--   community_insert_hardening_2026_07
-- ─────────────────────────────────────────────────────────────────────────────

-- ── PART 1a: community_posts ────────────────────────────────────────────────
-- Drop the table-wide INSERT, then re-grant only the author-supplied columns.
-- (REVOKE first is required here — unlike the replies UPDATE case, which had no
-- table-wide grant to displace.)
revoke insert on public.community_posts from authenticated;
grant insert (
  user_id,
  author,
  avatar,
  channel,
  body,
  media_type,
  media_url,
  media_duration_ms,
  provider_slug
) on public.community_posts to authenticated;

-- NOT granted, deliberately — each is either moderator-owned or ordering-critical:
--   is_pinned, is_flagged, moderation_note, flagged_at   (moderation / admin)
--   created_at                                           (feed ordering; see header)
--   edited_at, accepted_reply_id                         (set later, via UPDATE)
--   id                                                   (server default)

-- ── PART 1b: community_replies ──────────────────────────────────────────────
-- Same exposure, smaller blast radius but the same class: replies render
-- `order by created_at asc` (site/script.js:1984), so a forged early timestamp
-- puts a reply at the head of the thread — the position a reader reads as "the
-- answer". is_flagged/moderation_note are moderator-owned here too.
revoke insert on public.community_replies from authenticated;
grant insert (
  post_id,
  user_id,
  author,
  avatar,
  body,
  media_type,
  media_url,
  media_duration_ms,
  parent_reply_id
) on public.community_replies to authenticated;

-- ── PART 2: reply_count must not count removed replies ──────────────────────
-- community_feed's reply lateral had NO is_flagged filter, so a reply that
-- moderation removed still incremented the count. Three visible consequences,
-- the third of which is a public claim:
--
--   1. the card shows "💬 1" over a thread that renders empty (the readers DO
--      filter is_flagged — site/script.js:1984 — so the count and the thread
--      disagreed).
--   2. "ללא מענה" is `reply_count = 0` (web/lib/community.ts:189), so a genuinely
--      unanswered question was HIDDEN from the filter built to surface it — the
--      people most likely to answer it never saw it.
--   3. the public Q&A hub is gated on `reply_count >= 1`
--      (web/app/community/questions/page.tsx:62), so a question whose only answer
--      was moderated away was published, to visitors and to search engines, as an
--      ANSWERED question with an empty thread. That is the same false claim this
--      branch already removed from the JSON-LD, arriving by a different route.
--
-- Column list, order and types are unchanged — only the reply subquery gains its
-- filter — so `create or replace view` is safe and no dependent view/grant breaks.
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
                       from community_replies
                      where community_replies.is_flagged = false   -- ← the fix
                      group by community_replies.post_id) r on r.post_id = p.id;

-- CREATE OR REPLACE VIEW RESETS THIS OPTION. security-views-hardening-2026-07.sql
-- set it so the view respects the caller's RLS; forgetting to re-apply it here
-- would silently widen the view's effective permissions.
alter view public.community_feed set (security_invoker = on);

-- Rollback:
--   grant insert on public.community_posts   to authenticated;
--   grant insert on public.community_replies to authenticated;
--   (and re-create community_feed with the unfiltered reply lateral, then
--    re-apply security_invoker = on)
-- Note the rollback RE-OPENS the hole described above; it exists for operational
-- recovery, not as an equivalent alternative.
