-- Community moderation + notification contract — additive layer (2026-06).
-- ─────────────────────────────────────────────────────────────────────────────
-- Companion to schema.sql §(B) "COMMUNITY moderation + notification contract".
-- Two concerns the community-moderate / community-notify Edge Functions now rely
-- on, both idempotent / re-runnable and grant-gap-safe (this project's default
-- privileges do NOT grant to service_role, so every new object is granted
-- explicitly — see schema.sql §grants, audit-observability-2026-06.sql):
--
--   (1) profiles.community_notify_opt_out — a per-user switch to STOP receiving
--       in-app community @mention notifications. Default FALSE (opted-in to the
--       transactional, in-app inbox; this is NOT marketing — it's the reply/
--       mention inbox the app already shows). The switch is honoured CENTRALLY,
--       inside resolve_community_mentions, so no caller can bypass it.
--
--   (2) public.resolve_community_mentions(...) — the SECURITY DEFINER RPC that
--       community-notify calls after parsing @mention names from a new post/reply.
--       It resolves names → user_ids via profiles.name (case-insensitive, exact),
--       skips the actor (no self-mention pings), skips opted-out users, de-dupes
--       against any mention row already written for the same (user,post,reply),
--       inserts kind='mention' rows into public.community_notifications, and
--       returns how many were written. service_role-only EXECUTE; clients can't
--       call it (it would otherwise be a username→existence oracle).
--
-- auth.users is empty in this project today, so profiles is empty and the RPC
-- resolves to ZERO rows — perfectly fail-soft. It lights up once the community
-- has seeded users; nothing else needs to change.
--
-- ⚠️  DRAFT — DO NOT AUTO-APPLY. Review, then apply MANUALLY:
--       psql "$DATABASE_URL" -f supabase/community-moderation-2026-06.sql
--     (or paste into the Supabase SQL editor). Safe to run after schema.sql.


-- ════════════════════════════════════════════════════════════════════════════
-- (1) profiles.community_notify_opt_out — in-app community notification opt-out
-- ════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists community_notify_opt_out boolean not null default false;

comment on column public.profiles.community_notify_opt_out is
  'User switch: TRUE = do NOT create in-app community @mention notifications for me. Default FALSE (opted-in to the transactional reply/mention inbox the app shows — NOT marketing). Honoured centrally inside resolve_community_mentions.';


-- ════════════════════════════════════════════════════════════════════════════
-- (2) Idempotency guard for mention rows
-- ════════════════════════════════════════════════════════════════════════════
-- A given user should be notified at most once for the same mention. reply_id is
-- NULL for post-mentions, so a plain unique index over a nullable column won't
-- collapse duplicates reliably; the RPC enforces de-dup with NOT EXISTS instead.
-- This partial index just makes that existence check (and the inbox query) fast.
create index if not exists community_notifications_mention_dedup_idx
  on public.community_notifications (user_id, post_id, reply_id)
  where kind = 'mention';


-- ════════════════════════════════════════════════════════════════════════════
-- (3) resolve_community_mentions — name→user_id resolve + opt-out + insert
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER so it can read profiles + write community_notifications past
-- RLS, but it is service_role-only (EXECUTE revoked from clients) and writes
-- ONLY 'mention' rows for users who (a) match a mentioned name exactly
-- (case-insensitive), (b) are not the actor, (c) have not opted out, and (d)
-- weren't already notified for this exact post/reply. Bounded + fail-soft: any
-- internal error returns 0 rather than raising, so the caller never fails.
--
-- Params:
--   p_names    text[]  — the parsed @mention names (without '@'), already deduped
--   p_post_id  uuid    — the post the activity belongs to (required)
--   p_reply_id uuid    — the reply id when the mention is in a reply, else NULL
--   p_actor_id uuid    — the author's user_id (skipped; no self-mention), may be NULL
--   p_actor    text    — the author's display name, stored on the row for the UI
-- Returns: integer — number of notification rows inserted.
create or replace function public.resolve_community_mentions(
  p_names    text[],
  p_post_id  uuid,
  p_reply_id uuid    default null,
  p_actor_id uuid    default null,
  p_actor    text    default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if p_post_id is null or p_names is null or array_length(p_names, 1) is null then
    return 0;
  end if;

  with wanted as (
    -- distinct, lower-cased, trimmed names (cap defensively at 25)
    select distinct lower(btrim(n)) as name
    from unnest(p_names) as n
    where btrim(n) <> ''
    limit 25
  ),
  targets as (
    select pr.id as user_id
    from public.profiles pr
    join wanted w on lower(btrim(pr.name)) = w.name
    where pr.name is not null
      and pr.community_notify_opt_out = false        -- (c) respect opt-out
      and (p_actor_id is null or pr.id <> p_actor_id) -- (b) no self-mention
  ),
  ins as (
    insert into public.community_notifications (user_id, kind, post_id, reply_id, actor)
    select t.user_id, 'mention', p_post_id, p_reply_id, p_actor
    from targets t
    where not exists (                                -- (d) idempotent re-delivery
      select 1 from public.community_notifications cn
      where cn.user_id = t.user_id
        and cn.kind = 'mention'
        and cn.post_id = p_post_id
        and cn.reply_id is not distinct from p_reply_id
    )
    returning 1
  )
  select count(*) into v_inserted from ins;

  return coalesce(v_inserted, 0);
exception when others then
  return 0; -- fail-soft: a resolve hiccup never fails the webhook
end;
$$;

-- Trigger/RPC posture: service_role only (it bypasses RLS and is server-side).
-- Revoking EXECUTE from clients prevents a username-existence oracle via the API.
revoke execute on function public.resolve_community_mentions(text[], uuid, uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.resolve_community_mentions(text[], uuid, uuid, uuid, text) to service_role;

comment on function public.resolve_community_mentions(text[], uuid, uuid, uuid, text) is
  'community-notify @mention fan-out: resolves mention names to profiles.id (case-insensitive exact), skips the actor + opted-out users (profiles.community_notify_opt_out), de-dupes against existing mention rows, inserts kind=mention community_notifications, returns the count. SECURITY DEFINER, service_role-only, fail-soft (returns 0 on error).';


-- ════════════════════════════════════════════════════════════════════════════
-- (4) security_audit_log — re-assert the grant community-moderate needs
-- ════════════════════════════════════════════════════════════════════════════
-- community-moderate appends one PII-light 'community_content_flagged' row per
-- flag (heuristic or LLM). The table + grant already exist (legal-consent /
-- audit-observability); re-stated idempotently so a partial re-apply can't
-- regress the service_role insert path.
grant insert, select on public.security_audit_log to service_role;

-- Done. profiles gains an opt-out switch, community-notify can fan out @mentions
-- safely, and community-moderate's audit-log insert is guaranteed to land.
