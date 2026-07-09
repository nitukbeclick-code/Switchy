-- ── security: view + function hardening (2026-07) ───────────────────────────
-- Closes three items surfaced by the Supabase security advisor + a manual audit:
--
--  1. public_profiles leaked every user's `is_admin` flag to anyone holding the
--     public anon key (admin-account enumeration → targeted attacks). The column
--     was fetched by the client but never actually rendered, so we drop it. The
--     view still exposes only deliberately-public community-author fields
--     (name / avatar / verified badge / member-since / bio).
--
--  2. community_feed ran SECURITY DEFINER (advisor ERROR: security_definer_view),
--     bypassing the caller's RLS. Its underlying tables (community_posts,
--     community_replies, post_likes) are all public-read with a SELECT grant to
--     anon+authenticated, so security_invoker is behaviourally identical and
--     correctly respects RLS.
--
--  3. post_media_cap() is a trigger function; it never needs to be callable as a
--     direct PostgREST RPC. Revoke the anon/authenticated EXECUTE grant (advisor
--     WARN: anon/authenticated_security_definer_function_executable).
--
-- NOTE on public_profiles: it stays a definer-style view on purpose — it must
-- read the public columns of OTHER members' rows, which own-row RLS
-- (profiles_select_own) forbids under security_invoker. Exposing only the
-- public-safe column set (no email/phone/consent/is_admin) is the intended,
-- reviewed design.

-- 1. Recreate public_profiles WITHOUT is_admin.
--    (CREATE OR REPLACE VIEW cannot drop a column, so drop + recreate.)
drop view if exists public.public_profiles;
create view public.public_profiles as
  select id,
         name,
         avatar_url,
         is_verified_customer,
         verified_customer_at,
         created_at,
         bio
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- 2. community_feed: respect the caller's RLS (underlying rows are public-read).
alter view public.community_feed set (security_invoker = on);

-- 3. post_media_cap: trigger-only; not a public RPC. Postgres grants EXECUTE to
--    PUBLIC by default, so revoke from PUBLIC (not just anon/authenticated) —
--    the owner + service_role keep their explicit grants.
revoke execute on function public.post_media_cap() from public;
revoke execute on function public.post_media_cap() from anon, authenticated;
