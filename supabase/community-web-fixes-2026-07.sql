-- ─────────────────────────────────────────────────────────────────────────────
-- community-web-fixes-2026-07.sql
--
-- Post-deploy fixes for the web community (2026-07-05). Applied to prod via MCP
-- migrations after an end-to-end read/write-path audit found that several grants /
-- RLS settings would make the just-shipped web community non-functional even with a
-- working login. The Flutter app was unaffected because it reads the base tables
-- directly; only the web data layer (web/lib/community.ts) hit these surfaces.
--
-- Applied as two migrations:
--   community_feed_web_read_grant_2026_07
--   community_blocks_grant_and_public_profiles_2026_07
--
-- ⚠️ PARTIALLY SUPERSEDED — DO NOT RE-APPLY AS A WHOLE (2026-07 hygiene pass;
--    banners only, the SQL below was not altered):
--      • community_feed (FIX 1+2) → superseded by the canonical definition in
--        community-accepted-answer-2026-07.sql (which appended is_pinned,
--        edited_at, provider_slug, accepted_reply_id) + the security_invoker
--        ALTER in security-views-hardening-2026-07.sql. Re-running this copy
--        against prod ERRORS (CREATE OR REPLACE VIEW cannot drop columns) —
--        and must not be "fixed" by dropping the view first.
--      • public_profiles (FIX 4) → superseded by
--        security-views-hardening-2026-07.sql, which DROPPED is_admin from the
--        view (admin-account enumeration leak) and added bio /
--        verified_customer_at / created_at. Re-running FIX 4 would re-leak
--        is_admin (it also errors on prod for the same cannot-drop reason).
--    FIX 3a (profiles.is_verified_customer) and FIX 3b (community_blocks
--    grants) are still current.
-- ─────────────────────────────────────────────────────────────────────────────

-- FIX 1+2 — the feed was unreadable on the web:
--   * community_feed had NO SELECT grant for anon/authenticated -> 42501 on every read.
--   * the view lacked is_flagged / moderation_note, which FEED_COLS requests -> would
--     400 on the unknown columns even after the grant.
-- Additive: preserve the existing column list/order, append the two moderation columns
-- (valid for CREATE OR REPLACE VIEW), then grant SELECT.
create or replace view public.community_feed as
  select
    p.id, p.user_id, p.author, p.avatar, p.channel, p.body,
    p.media_type, p.media_url, p.media_duration_ms, p.created_at,
    coalesce(l.cnt, 0::bigint) as like_count,
    coalesce(r.cnt, 0::bigint) as reply_count,
    p.is_flagged, p.moderation_note
  from community_posts p
    left join (select post_id, count(*) as cnt from post_likes group by post_id) l on l.post_id = p.id
    left join (select post_id, count(*) as cnt from community_replies group by post_id) r on r.post_id = p.id;

grant select on public.community_feed to anon, authenticated;

-- FIX 3a — the web references profiles.is_verified_customer (auth-context own-profile
-- load, fetchPublicProfile, the ProfileView "verified" badge) but the column never
-- existed in prod -> both own-profile and public-profile reads 400. Add it; default
-- false means no badge shows until a customer is genuinely verified (truthful).
alter table public.profiles add column if not exists is_verified_customer boolean not null default false;

-- FIX 3b — community_blocks (created this cycle) never got authenticated DML grants, so
-- block/unblock failed the privilege check before RLS. The policy community_blocks_own_all
-- (auth.uid()=blocker_id) already scopes rows to the blocker.
grant select, insert, delete on public.community_blocks to authenticated;

-- FIX 4 — profiles RLS is own-row-only (profiles_select_own = auth.uid()=id), so members
-- cannot view each other's profiles. A blanket profiles grant would leak phone/email/
-- consent/registration_ip. Expose ONLY the public-safe columns via a definer view
-- (bypasses profiles RLS -> returns every row's public fields), granted to anon +
-- authenticated (owner choice 2026-07-05: public profiles visible to everyone). No PII.
--
-- HARDENED 2026-07 — this view must NEVER expose is_admin: leaking which accounts are
-- administrators is account enumeration. An earlier revision of THIS block selected
-- is_admin; it has been REMOVED. This is the FIRST delta to create public_profiles, so
-- it exposes only the columns that exist at this point (name/avatar/verified badge);
-- later deltas append verified_customer_at/created_at/bio, and
-- security-views-hardening-2026-07.sql is the CANONICAL final definition (still no
-- is_admin). Keep is_admin out of EVERY public_profiles definition. drop + recreate
-- (not CREATE OR REPLACE — the latter cannot drop the legacy is_admin column, so a
-- re-apply over the current view would otherwise fail or keep it).
drop view if exists public.public_profiles;
create view public.public_profiles as
  select id, name, avatar_url, is_verified_customer
  from public.profiles;

grant select on public.public_profiles to anon, authenticated;
