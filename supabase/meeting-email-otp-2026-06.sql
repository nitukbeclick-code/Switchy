-- ═══════════════════════════════════════════════════════════════════════════
-- Email-verified self-serve Zoom booking — OTP store, 2026-06.
--
-- ⚠️ OWNER-APPLIED, NOT AUTO-APPLIED. This delta is intentionally left OUT of
-- any auto-migration runner. Apply it by hand (Supabase SQL editor or psql)
-- AFTER meetings-2026-06.sql. It is fully idempotent — re-running is safe.
--
-- WHY: the meeting-book edge function lets a visitor book a Zoom consultation
-- WITHOUT an app account. To stop drive-by/spam bookings we gate `book` behind
-- a one-time code (OTP) mailed to the visitor's address. This table is the
-- server-only ledger of issued codes: it stores ONLY a SHA-256 hash of each
-- code (never the plaintext), an expiry, an attempt counter, and verification /
-- consumption stamps. It is service-role-only (RLS on, NO policies) so the
-- anon/authenticated roles can never read another visitor's codes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. OTP ledger ────────────────────────────────────────────────────────────
create table if not exists public.meeting_email_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,                 -- normalized (lowercased) address
  code_hash   text not null,                 -- sha-256 hex of the 6-digit code
  expires_at  timestamptz not null,          -- code valid until this instant
  attempts    int not null default 0,        -- verify attempts (cap enforced in fn)
  verified_at timestamptz,                   -- set on the first correct code
  consumed_at timestamptz,                   -- set once a booking uses this row
  ip          text,                          -- requester IP (abuse forensics)
  created_at  timestamptz not null default now()
);

-- Newest-first lookup per address: the verify/book paths fetch the most recent
-- live row for lower(email).
create index if not exists meeting_email_otps_email_created_idx
  on public.meeting_email_otps (lower(email), created_at desc);

-- ── 2. RLS — service-role only (NO policies) ─────────────────────────────────
-- With RLS enabled and zero policies, anon/authenticated get NOTHING; only the
-- service-role key used by the edge function (which bypasses RLS) can touch it.
alter table public.meeting_email_otps enable row level security;

-- ── 3. meetings: record the verified-email proof on the booked row ───────────
alter table public.meetings
  add column if not exists email_verified_at timestamptz;
