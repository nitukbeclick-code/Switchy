-- ─────────────────────────────────────────────────────────────────────────────
-- community-posts-update-guard-2026-07.sql  (2026-07-06)  — SECURITY (HIGH).
--
-- Closes a moderation-bypass / self-promotion hole: `authenticated` holds a
-- table-wide UPDATE grant on public.community_posts, and posts_update_own permits a
-- user to update ANY column on their OWN row. So a member could:
--   • update community_posts set is_flagged=false where id=<their flagged post>  -> self-unflag a moderated post (it re-appears in the public feed)
--   • update community_posts set is_pinned=true   where id=<their post>          -> self-pin to the top of everyone's feed (bypasses the admin-only pin gate)
-- Both are reachable directly with the anon key + the user's JWT (the UI gate is
-- cosmetic). This BEFORE-UPDATE guard forces the moderation / pin / identity columns
-- back to their OLD values for a regular authenticated owner, while still allowing:
--   • the moderation edge function (service_role → auth.uid() is null) to set is_flagged
--   • an admin (profiles.is_admin) to toggle is_pinned via posts_admin_update
-- so no legitimate path breaks. Owners keep full control of their post BODY (edits).
--
-- Additive, idempotent. Apply as MCP migration: community_posts_update_guard_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.community_posts_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  -- service_role / SECURITY DEFINER context (no end-user JWT) → allow: this is the
  -- moderation function setting is_flagged, or an internal trigger/RPC.
  if auth.uid() is null then
    return new;
  end if;
  -- Admins may change the pin/moderation columns (posts_admin_update authorizes it).
  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if coalesce(v_is_admin, false) then
    return new;
  end if;
  -- Regular authenticated owner: pin / moderation / identity columns are read-only;
  -- force them back to their stored values. The BODY (and edited_at, when added) is
  -- left untouched, so a user can still edit their own post.
  new.is_pinned       := old.is_pinned;
  new.is_flagged      := old.is_flagged;
  new.moderation_note := old.moderation_note;
  new.flagged_at      := old.flagged_at;
  new.user_id         := old.user_id;
  new.channel         := old.channel;
  new.created_at      := old.created_at;
  return new;
end;
$$;
revoke execute on function public.community_posts_guard_update() from public, anon, authenticated;

drop trigger if exists community_posts_guard_update_trg on public.community_posts;
create trigger community_posts_guard_update_trg
  before update on public.community_posts
  for each row execute function public.community_posts_guard_update();

-- Rollback: drop trigger community_posts_guard_update_trg; drop function
-- community_posts_guard_update(). (This does NOT restore the hole's exploitability
-- beyond the pre-existing grant.)
