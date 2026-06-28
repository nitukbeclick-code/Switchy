-- ═══════════════════════════════════════════════════════════════════════════
-- meeting-book OTP hardening ROUND 3 — close the read-then-insert TOCTOU, 2026-06.
--
-- ⚠️ OWNER-APPLIED, NOT AUTO-APPLIED. Like the other meeting-otp deltas
-- (meeting-email-otp / meeting-otp-rate-limit / meeting-otp-hardening), this file
-- is intentionally left OUT of any auto-migration runner. Apply it by hand
-- (Supabase SQL editor or psql) AFTER those three. It is fully idempotent —
-- re-running is safe.
--
-- WHY: the durable per-address OTP send cap was enforced in TWO separate steps —
-- request-code READ the recent public.meeting_email_otps rows (recentOtpTimestamps)
-- and, only if under the limit, INSERTed a new row (insertRow) in a later
-- statement. Between the read and the insert there is a window: N concurrent
-- request-code calls for the same mailbox can each read the SAME under-limit count
-- and then EACH insert + send, blowing past the cap (a classic check-then-act /
-- TOCTOU race). On serverless Edge, where many isolates run in parallel, this is
-- the realistic way to email-bomb a victim despite the cap.
--
-- FIX: move the count-and-insert into ONE serialized DB operation. This SECURITY
-- DEFINER function takes a per-mailbox transaction-scoped advisory lock keyed on
-- the CANONICAL address (so all Gmail aliases of one inbox serialize together),
-- RE-COUNTS inside the lock, and inserts the new OTP row ONLY if still under every
-- limit — returning true on insert, false on any limit hit (with NO insert and NO
-- send). The lock auto-releases at COMMIT/ROLLBACK (xact-scoped), so there is no
-- leak path. The raw `email` column still stores the original address (we SEND
-- there); `email_canon` is the alias-collapsed rate-limit key, exactly as before.
--
-- This supersedes the read-then-insert sequence in meeting-book/index.ts; the
-- pure evaluateOtpRateLimit logic is re-implemented here in SQL so the decision is
-- atomic with the insert. The two limiters (in-memory pre-filter + this RPC) keep
-- the same conservative DEFAULT_OTP_RATE_LIMITS thresholds.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Atomic check-and-insert RPC ───────────────────────────────────────────
-- Returns boolean: true  → a new OTP row was inserted (caller SHOULD send the mail);
--                  false → a limit was hit (caller sends NOTHING, inserts NOTHING).
--
-- Parameters mirror the edge function's DEFAULT_OTP_RATE_LIMITS (all windows in
-- SECONDS so the wire format is integer-clean). p_email is the raw normalized
-- address (stored + mailed); p_email_canon is the alias-collapsed key the lock and
-- the per-address counts use; p_ip is the requester IP (per-IP cap + forensics).
--
-- SECURITY DEFINER + a pinned search_path so the service-role grant is the only
-- caller surface; the body only ever touches public.meeting_email_otps.
create or replace function public.meeting_otp_try_send(
  p_email                text,
  p_email_canon          text,
  p_ip                   text,
  p_code_hash            text,
  p_ttl_seconds          int,
  p_cooldown_seconds     int,
  p_email_window_seconds int,
  p_email_max            int,
  p_email_day_max        int,
  p_ip_window_seconds    int,
  p_ip_max               int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now            timestamptz := now();
  v_newest         timestamptz;
  v_email_window   int;
  v_email_day      int;
  v_ip_window      int;
begin
  -- Serialize all concurrent request-code calls for THIS mailbox. Transaction-
  -- scoped, so it auto-releases at COMMIT/ROLLBACK — no manual unlock, no leak.
  -- Keyed on hashtext(canonical) so every alias of one inbox shares the lock and
  -- the re-count below sees every concurrent peer's committed insert in order.
  perform pg_advisory_xact_lock(hashtext(p_email_canon));

  -- ── Re-count INSIDE the lock (this is what makes the cap race-free) ──────────
  -- Cooldown: the most recent send to this canonical address.
  select max(created_at) into v_newest
    from public.meeting_email_otps
   where email_canon = p_email_canon;

  if v_newest is not null
     and v_now - v_newest < make_interval(secs => p_cooldown_seconds) then
    return false; -- too soon after the last send
  end if;

  -- Per-address burst window (e.g. ≤4 / 15 min).
  select count(*) into v_email_window
    from public.meeting_email_otps
   where email_canon = p_email_canon
     and created_at > v_now - make_interval(secs => p_email_window_seconds);
  if v_email_window >= p_email_max then
    return false;
  end if;

  -- Per-address daily cap (e.g. ≤12 / 24h).
  select count(*) into v_email_day
    from public.meeting_email_otps
   where email_canon = p_email_canon
     and created_at > v_now - make_interval(secs => 86400);
  if v_email_day >= p_email_day_max then
    return false;
  end if;

  -- Per-IP cap (only when we actually know the IP) — the backstop against bombing
  -- one mailbox via many aliases (each alias is a new address but shares the IP).
  if p_ip is not null and p_ip <> '' then
    select count(*) into v_ip_window
      from public.meeting_email_otps
     where ip = p_ip
       and created_at > v_now - make_interval(secs => p_ip_window_seconds);
    if v_ip_window >= p_ip_max then
      return false;
    end if;
  end if;

  -- ── Under every limit → INSERT the row (the send is implied by returning true) ─
  insert into public.meeting_email_otps (email, email_canon, ip, code_hash, expires_at)
  values (
    p_email,
    p_email_canon,
    nullif(p_ip, ''),
    p_code_hash,
    v_now + make_interval(secs => p_ttl_seconds)
  );

  return true;
end;
$$;

-- Service-role only: the edge function (which bypasses RLS) is the sole caller.
revoke execute on function public.meeting_otp_try_send(
  text, text, text, text, int, int, int, int, int, int, int
) from public, anon, authenticated;
grant execute on function public.meeting_otp_try_send(
  text, text, text, text, int, int, int, int, int, int, int
) to service_role;


-- ── 2. Retention — keep the ledger (and the window scans) bounded ─────────────
-- The OTP ledger is append-only and every send writes a row; without pruning it
-- grows forever and the windowed counts above scan an ever-larger table. A daily
-- job deletes rows older than 30 days — far beyond every window here (max 24h) and
-- beyond BOOK_OTP_MAX_AGE_MS (30 min), so it can never drop a row any live path
-- still needs.
--
-- Guarded so this file stays safe to run even where pg_cron is unavailable (it
-- just raises a notice). cron.schedule UPSERTS by name → re-running re-points the
-- one job, never duplicates it. To DISABLE later:
--   select cron.unschedule('meeting-email-otps-retention');
do $$
begin
  begin
    create extension if not exists pg_cron schema cron;
  exception when others then
    raise notice 'meeting-otp-atomic: could not ensure pg_cron (%) — enable it in the dashboard, then re-run the cron.schedule below', sqlerrm;
  end;

  begin
    perform cron.schedule(
      'meeting-email-otps-retention',
      '17 3 * * *', -- 03:17 UTC daily (off-peak; exact minute is arbitrary)
      $job$
        delete from public.meeting_email_otps
         where created_at < now() - interval '30 days'
      $job$
    );
  exception when others then
    raise notice 'meeting-otp-atomic: could not schedule retention job (%) — run the one-off delete below by hand on a timer', sqlerrm;
  end;
end $$;

-- One-off / manual fallback if pg_cron is not available in this project. Safe to
-- run by hand any time; it only removes rows no live path references (max live
-- window is 24h; book consumes within 30 min):
--   delete from public.meeting_email_otps where created_at < now() - interval '30 days';
-- ═══════════════════════════════════════════════════════════════════════════
