-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-search-2026-07.sql  (2026-07-06)  — Social wave 6a.
--
-- Hebrew search over community posts + truthful "trending" highlights. Both are
-- SECURITY INVOKER RPCs (inherit the caller's RLS; they also filter is_flagged=false
-- server-side) so they can never leak a flagged/private row. Additive, idempotent.
-- ⚠️ web calls these RPCs → apply at merge. MCP migration: community_search_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- Full-text index over the post body. 'simple' config = language-agnostic (works for
-- Hebrew, which has no Postgres stemmer), token-based; the ILIKE fallback in the RPC
-- covers short / partial / mid-word queries.
alter table public.community_posts
  add column if not exists body_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(body, ''))) stored;
create index if not exists community_posts_body_tsv_idx on public.community_posts using gin (body_tsv);

-- Search: returns community_feed-shaped rows (public columns + aggregates) for
-- non-flagged posts matching q. SECURITY INVOKER — RLS applies on top.
create or replace function public.search_community_posts(
  q text,
  p_channel text default null,
  p_limit int default 20
)
returns setof public.community_feed
language sql
security invoker
stable
set search_path = public
as $$
  select cf.*
  from public.community_feed cf
  join public.community_posts p on p.id = cf.id
  where p.is_flagged = false
    and coalesce(trim(q), '') <> ''
    and (p_channel is null or cf.channel = p_channel)
    and (
      p.body_tsv @@ websearch_to_tsquery('simple', q)
      or (
        char_length(trim(q)) between 1 and 30
        and p.body ilike '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
      )
    )
  order by ts_rank(p.body_tsv, websearch_to_tsquery('simple', q)) desc nulls last,
           cf.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
grant execute on function public.search_community_posts(text, text, int) to anon, authenticated;

-- Trending: real 7-day activity only. Returns empty arrays when there is no activity
-- (the UI then renders nothing — never fabricates). SECURITY INVOKER.
create or replace function public.community_highlights()
returns json
language sql
security invoker
stable
set search_path = public
as $$
  select json_build_object(
    'channels', coalesce((
      select json_agg(t) from (
        select channel, count(*)::int as posts
        from public.community_posts
        where is_flagged = false and created_at > now() - interval '7 days'
        group by channel
        order by count(*) desc, channel
        limit 3
      ) t
    ), '[]'::json),
    'active_posts', coalesce((
      select json_agg(t) from (
        select cf.id, cf.channel, cf.body, cf.reply_count::int as reply_count
        from public.community_feed cf
        where cf.is_flagged = false
          and cf.created_at > now() - interval '7 days'
          and cf.reply_count >= 1
        order by cf.reply_count desc, cf.created_at desc
        limit 3
      ) t
    ), '[]'::json)
  );
$$;
grant execute on function public.community_highlights() to anon, authenticated;

-- Rollback: drop the two functions; drop index community_posts_body_tsv_idx;
-- alter table drop column body_tsv.
