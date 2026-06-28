-- ─────────────────────────────────────────────────────────────────────────────
-- meeting-otp-rate-limit-2026-06 — durable rate-limit support for the OTP send
--
-- WHY: meeting-book's request-code action sends a real verification email per
-- call. The original throttle was in-memory (process-local), which on Supabase
-- Edge only bounds a single hot isolate — a flood spread across isolates (or one
-- surviving a cold-start) could still email-bomb a victim and run up send cost +
-- hurt domain deliverability. The function now enforces a DURABLE limit: before
-- sending, it counts recent public.meeting_email_otps rows for the address (24h)
-- and the source IP (1h). Every sent code already writes a row here (email, ip,
-- created_at), so the count is shared across all isolates.
--
-- This migration adds the two covering indexes those windowed counts need so the
-- check stays fast even under a flood. The existing (lower(email), created_at)
-- index does NOT serve the PostgREST `email=eq.<lowercased>` filter (a functional
-- index needs `lower(email)=…`), and there was no IP index at all.
--
-- Idempotent and non-destructive: CREATE INDEX IF NOT EXISTS only. The table is
-- small/new, so a plain (non-CONCURRENT) build is instant and safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-address windowed count: WHERE email = $1 AND created_at >= $2 (newest-first).
create index if not exists meeting_email_otps_email_window_idx
  on public.meeting_email_otps (email, created_at desc);

-- Per-IP windowed count: WHERE ip = $1 AND created_at >= $2. Partial — rows with
-- a NULL ip (older/non-browser callers) are never counted by the IP rule anyway.
create index if not exists meeting_email_otps_ip_window_idx
  on public.meeting_email_otps (ip, created_at desc)
  where ip is not null;
