-- ─────────────────────────────────────────────────────────────────────────────
-- community-digest-2026-07.sql  (2026-07-06)  — roadmap item #5 (re-engagement email).
--
-- Backs the community-digest edge fn: a WEEKLY email summarising a member's own
-- UNREAD community notifications, sent only to people who EXPLICITLY opted in.
--
-- §30A (Israeli Spam Law) requires PRIOR CONSENT for marketing email, so the
-- preference is opt-IN with a default of FALSE — nobody is emailed until they tick
-- the box themselves. A signed-in user sets their OWN consent (column grant to
-- authenticated, exactly like community_notify_opt_out — a plain preference, never a
-- privileged column); the edge fn (service_role) reads it to pick recipients, and
-- the one-click unsubscribe link in every email flips it back to false.
--
-- Additive + idempotent. Apply as MCP migration: community_digest_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists community_digest_opt_in boolean not null default false;

-- Let a signed-in user set their OWN digest consent. RLS profiles_update_own already
-- scopes the writable row to auth.uid()=id; this column grant is additive to the
-- community-web-hardening whitelist and, like community_notify_opt_out, is a plain
-- preference — NOT a privileged column (is_admin/is_verified_customer stay locked).
grant update (community_digest_opt_in) on public.profiles to authenticated;

-- Recipient lookup is "opted-in members only" — a partial index keeps the weekly
-- scan cheap even as the table grows.
create index if not exists profiles_digest_optin_idx
  on public.profiles (id) where community_digest_opt_in = true;

-- Rollback: drop index profiles_digest_optin_idx; revoke update (community_digest_opt_in)
-- on public.profiles from authenticated; alter table public.profiles drop column
-- community_digest_opt_in.
