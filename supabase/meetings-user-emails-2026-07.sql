-- ═══════════════════════════════════════════════════════════════════════════
-- meetings-user-emails — 2026-07
-- Booker-facing email stamps (confirmation + T-24h reminder) and a JWT-email
-- SELECT policy for public.meetings — closes the "web booking is invisible
-- in-app and the booker never gets an email reminder" gap.
--
-- ⚠️ APPLY MANUALLY — draft migration, review and apply by the owner:
--   supabase db execute --file supabase/meetings-user-emails-2026-07.sql
-- (Do NOT auto-apply. The code is deploy-safe before this runs: the hourly
--  booker-email sweep in renewal-reminders (mode "follow-up") claims each
--  stamp column with a guarded PATCH — pre-migration that PATCH names an
--  unknown column → 400 → 0 rows claimed → nothing is sent, nothing throws.)
--
-- COMPLIANCE (Spam-Law §30A): both emails are TRANSACTIONAL service mail for a
-- meeting the user explicitly booked with a verified (OTP'd) email address —
-- not marketing. Copy is strictly transactional (details + Zoom link only);
-- sender is the same "Switchy AI" identity as the OTP mail.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Idempotency stamps ────────────────────────────────────────────────────
-- confirmation_emailed_at: the booker was emailed their confirmed meeting
--   (details + join link). Stamped by the confirm-time email paths
--   (notify-lead meeting_callbacks/console) on a successful send, and by the
--   hourly safety-net sweep (claim-before-send) when the confirm-time email
--   failed or never fired.
-- reminded_user_at: the booker got the T-24h reminder email (sweep only).
alter table public.meetings
  add column if not exists confirmation_emailed_at timestamptz,
  add column if not exists reminded_user_at        timestamptz;

-- ── 2. Backfill — prevent duplicate mail at rollout ──────────────────────────
-- Every already-confirmed meeting with a join link got (or was offered) its
-- confirmation email at confirm time via the Telegram/console flows; without
-- this stamp the sweep would re-mail every future confirmed meeting once.
-- Rows without an email address are unmailable anyway but stamped for
-- consistency. New confirms after this migration stamp themselves.
update public.meetings
   set confirmation_emailed_at = coalesce(confirmed_at, updated_at, created_at)
 where status = 'confirmed'
   and join_url is not null
   and confirmation_emailed_at is null;

-- ── 3. RLS — let a signed-in user read their OWN meetings by VERIFIED email ──
-- Web/edge-fn bookings insert with user_id NULL, so meetings_select_own
-- (auth.uid() = user_id) can never match them and the booking is invisible to
-- the very user who made it. The booker's email on the row IS verified (the
-- meeting-book OTP flow), and auth.jwt()->>'email' is the caller's own
-- Supabase-verified identity — so matching the two is safe:
--   • a user can only ever match rows carrying THEIR OWN jwt email;
--   • anonymous sessions have no email claim (->> yields NULL, matches nothing);
--   • policies OR together, so meetings_select_own keeps working unchanged;
--   • the existing column-scoped GRANT (id, status, provider, meeting_date,
--     slot, starts_at, join_url, created_at, user_id — meetings-2026-06.sql §2)
--     still bounds WHAT can be read; this only widens WHICH rows qualify.
drop policy if exists "meetings_select_by_jwt_email" on public.meetings;
create policy "meetings_select_by_jwt_email" on public.meetings
  for select to authenticated
  using (
    email is not null
    and email = (auth.jwt() ->> 'email')
  );

-- Case-insensitive addresses are NOT normalized here on purpose: both the
-- OTP form and Supabase auth lowercase-trim their emails before storage, so a
-- strict equality is the least-surprising (and index-friendly) match.

-- ── 4. Index for the hourly sweep ────────────────────────────────────────────
-- meetings_open_idx (starts_at where status in pending/confirmed —
-- meetings-2026-06.sql §2) already serves the sweep's
--   status = 'confirmed' and starts_at > now()
-- probe; no new index is needed for the stamp columns (the claim PATCH is a
-- single-row id lookup on the primary key).
