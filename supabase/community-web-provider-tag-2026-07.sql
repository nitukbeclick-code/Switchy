-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-provider-tag-2026-07.sql  (2026-07-06)  — Social wave 6 / item #4.
--
-- A durable "this post is about provider X" tag on community_posts, so a post can
-- link to the catalogue provider page and (later) be deep-linked FROM it. Additive,
-- idempotent, RLS-safe (author sets it on their own row via the existing insert
-- policy; a URL-safe slug check). ⚠️ web reads provider_slug via community_feed →
-- apply at merge. MCP migration: community_provider_tag_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.community_posts
  add column if not exists provider_slug text;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'community_posts_provider_slug_fmt' and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_provider_slug_fmt
      check (provider_slug is null or provider_slug ~ '^[a-z0-9-]+$');
  end if;
end $$;

-- Surface it in the feed view (explicit column list — a bare ADD COLUMN won't appear).
create or replace view public.community_feed as
  select
    p.id, p.user_id, p.author, p.avatar, p.channel, p.body,
    p.media_type, p.media_url, p.media_duration_ms, p.created_at,
    coalesce(l.cnt, 0::bigint) as like_count,
    coalesce(r.cnt, 0::bigint) as reply_count,
    p.is_flagged, p.moderation_note, p.is_pinned, p.edited_at,
    p.provider_slug
  from community_posts p
    left join (select post_id, count(*) as cnt from post_likes group by post_id) l on l.post_id = p.id
    left join (select post_id, count(*) as cnt from community_replies group by post_id) r on r.post_id = p.id;
grant select on public.community_feed to anon, authenticated;

-- No new grant/RLS: provider_slug is written by the author on their own row via the
-- existing posts_insert_own policy; the community_posts_guard_update trigger already
-- lets an owner change body-side columns (provider_slug included) but NOT pin/mod
-- columns. Read is via the already-granted community_feed view.

-- Rollback: recreate community_feed without provider_slug; drop constraint
-- community_posts_provider_slug_fmt; alter table drop column provider_slug.
