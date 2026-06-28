-- ═══════════════════════════════════════════════════════════════════════════
-- meeting-book OTP hardening — alias-collapse for the durable rate-limit, 2026-06.
--
-- ⚠️ OWNER-APPLIED, NOT AUTO-APPLIED. Like meeting-email-otp-2026-06.sql, this
-- delta is intentionally left OUT of any auto-migration runner. Apply it by hand
-- (Supabase SQL editor or psql) AFTER meeting-email-otp-2026-06.sql. It is fully
-- idempotent — re-running is safe.
--
-- WHY: the durable per-address OTP send cap (evaluateOtpRateLimit, fed from
-- public.meeting_email_otps) keyed on the raw normalized email. An adversary can
-- defeat that cap and email-bomb ONE inbox via Gmail alias rotation —
-- victim+1@gmail.com, v.i.c.t.i.m@gmail.com, victim@googlemail.com all deliver to
-- victim@gmail.com but each is a DISTINCT raw key, so each gets its own bucket.
-- The only alias backstop was the per-IP cap, which keys on the attacker-forgeable
-- cf-connecting-ip / x-forwarded-for header. We now ALSO store a canonical form of
-- the address (canonicalizeEmail in meeting-book/lib.ts) and key the per-address
-- durable count on it, so all aliases of one mailbox collapse into a single bucket.
-- The raw `email` column is unchanged — we still SEND to the original address.
--
-- NOTE (future round — out of scope here): this closes the ALIAS vector only, not
-- the read-then-insert TOCTOU race. recentOtpTimestamps() reads recent rows and
-- THEN insertRow() writes a new one as two separate statements, so concurrent
-- requests can each read an under-limit count and both insert. A future delta
-- should add an atomic check-and-insert RPC — e.g. a SECURITY DEFINER function
-- that takes pg_advisory_xact_lock(hashtext(email_canon)) (an advisory lock keyed
-- on the CANONICAL address), re-counts inside the lock, and inserts only if still
-- under the cap — so the count-and-insert is one serialized operation per mailbox.
-- That same round should add a periodic retention delete of rows older than ~30
-- days (e.g. a pg_cron job: delete from public.meeting_email_otps where created_at
-- < now() - interval '30 days') so the ledger — and these window scans — stay bounded.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Canonical address column ──────────────────────────────────────────────
-- Nullable + backfill-free: existing rows keep NULL (they predate the control and
-- never participate in a future window once they age out). New inserts from the
-- edge function always populate it via canonicalizeEmail().
alter table public.meeting_email_otps
  add column if not exists email_canon text;

-- ── 2. Window-scan index on the canonical key ────────────────────────────────
-- The durable per-address count selects created_at for rows where
-- email_canon = $1 within the recent window, newest-first. This composite index
-- (email_canon, created_at desc) serves that exact predicate + ordering.
create index if not exists meeting_email_otps_canon_window_idx
  on public.meeting_email_otps (email_canon, created_at desc);
