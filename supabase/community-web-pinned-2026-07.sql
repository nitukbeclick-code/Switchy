-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-pinned-2026-07.sql  (2026-07-06)
--
-- Phase-2 #1 mechanism: let admins PIN a community post to the top of the feed
-- (e.g. a "ברוך הבא" welcome post that fights the empty-feed / ghost-town problem).
-- Additive, idempotent, reversible. Gated on owner "מאשר פריסה".
--
-- SEQUENCING: apply AFTER community-web-hardening-2026-07.sql FIX 1 (already applied
-- to prod) — that revoked the client's UPDATE grant on profiles.is_admin, so the
-- admin-pin RLS policy below is trustworthy (a member can't self-grant is_admin).
--
-- The SEED (the actual welcome post + per-channel opening topics) is intentionally
-- NOT here — it needs a real admin auth.users uuid + owner-approved Hebrew copy, and
-- is applied separately once that identity exists.
-- Apply as MCP migration: community_pinned_posts_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.community_posts add column if not exists is_pinned boolean not null default false;
comment on column public.community_posts.is_pinned is
  'Admin-only: TRUE keeps this post at the top of the feed (welcome / announcement). Toggled via RLS posts_admin_update; the client is_admin flag only shows/hides the pin button.';

create index if not exists posts_pinned_idx on public.community_posts (created_at desc) where is_pinned = true;

-- Surface is_pinned through the feed view. The LIVE community_feed is the explicit-
-- column version from community-web-fixes-2026-07.sql (NOT select p.*), so a bare
-- ADD COLUMN does not appear — re-create it with the same column list + is_pinned.
create or replace view public.community_feed as
  select
    p.id, p.user_id, p.author, p.avatar, p.channel, p.body,
    p.media_type, p.media_url, p.media_duration_ms, p.created_at,
    coalesce(l.cnt, 0::bigint) as like_count,
    coalesce(r.cnt, 0::bigint) as reply_count,
    p.is_flagged, p.moderation_note,
    p.is_pinned
  from community_posts p
    left join (select post_id, count(*) as cnt from post_likes group by post_id) l on l.post_id = p.id
    left join (select post_id, count(*) as cnt from community_replies group by post_id) r on r.post_id = p.id;

grant select on public.community_feed to anon, authenticated;

-- Admin-pin authorization lives in the DB, not the client. This SECOND permissive
-- UPDATE policy lets an admin update ANY post (to toggle is_pinned); it coexists
-- (OR) with posts_update_own, so a normal member still updates only their own rows.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and policyname = 'posts_admin_update'
  ) then
    create policy posts_admin_update on public.community_posts
      for update
      using      (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true))
      with check (exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.is_admin = true));
  end if;
end $$;

-- Rollback: drop policy posts_admin_update; drop index posts_pinned_idx;
--   re-create community_feed without is_pinned; alter table drop column is_pinned.
