-- ═══════════════════════════════════════════════════════════════════════════
-- retention-cron-2026-07.sql — register the written-but-never-scheduled
-- retention sweeps (chat_messages trim + ai_sessions prune) via pg_cron.
--
-- ⚠️⚠️ APPLY MANUALLY — DATA-DELETING RETENTION JOBS. DO NOT AUTO-APPLY. ⚠️⚠️
-- These two jobs permanently DELETE rows on a daily schedule. The owner must
-- review the retention windows below BEFORE running this file against prod
-- (orzitfqmlvopujsoyigr). Nothing in the repo or CI applies this automatically.
--
-- WHY: two retention mechanisms exist in the repo but were never scheduled, so
-- both tables grow unbounded:
--   • public.chat_messages — the site-ai-chat per-IP throttle counter. Only the
--     LAST HOUR is ever queried (PER_IP_HOURLY_LIMIT), yet rows accumulate
--     forever. schema.sql documents a 'chat-messages-trim' job as a comment
--     ("register once if pg_cron is enabled") that was never registered.
--   • public.ai_sessions — the site חוסך-AI rolling chat transcripts.
--     prune_ai_sessions() (ai-sessions-2026-06.sql §3, SECURITY DEFINER,
--     service_role-only EXECUTE) deletes sessions idle > 30 days and was
--     written "to wire to pg_cron later (NOT scheduled here)" — never wired.
--
-- PATTERN: copied from the proven guarded registration in
-- meeting-otp-atomic-2026-06.sql §2 ('meeting-email-otps-retention'): a DO
-- block that (a) best-effort ensures pg_cron, (b) cron.schedule's inside a
-- guarded sub-block, raising a NOTICE instead of failing where pg_cron is
-- unavailable. cron.schedule UPSERTS by job name → re-running this file
-- re-points the jobs, never duplicates them. Idempotent, safe to re-run
-- (but see the APPLY MANUALLY warning above — re-running keeps deleting).
--
-- RETENTION WINDOWS (owner: confirm before applying):
--   chat_messages   → delete rows older than 2 DAYS  (48× the 1-hour window any
--                     code path reads; matches the schema.sql draft comment).
--   ai_sessions     → prune_ai_sessions() deletes sessions idle > 30 DAYS (the
--                     window is inlined in that function, not here).
--
-- DELIBERATELY NOT INCLUDED (separate owner decisions, do not fold in here):
--   • security_audit_log 180-day purge — drafted as a comment in
--     security-hardening-2026-06.sql (~§ line 415) and left unscheduled ON
--     PURPOSE: Reg.13 audit retention is a legal/ops decision for the owner.
--   • advisor_sessions — has NO retention mechanism at all yet (schema.sql
--     §A1); needs its own reviewed window before anything deletes from it.
--
-- To disable later:
--   select cron.unschedule('chat-messages-trim');
--   select cron.unschedule('ai-sessions-prune');
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  begin
    create extension if not exists pg_cron schema cron;
  exception when others then
    raise notice 'retention-cron: could not ensure pg_cron (%) — enable it in the dashboard, then re-run this file', sqlerrm;
  end;

  -- ── 1. chat-messages-trim — daily 03:17 UTC (off-peak; matches the schema.sql
  --      draft). Only the last hour is ever read; 2 days is a generous margin.
  begin
    perform cron.schedule(
      'chat-messages-trim',
      '17 3 * * *',
      $job$
        delete from public.chat_messages
         where created_at < now() - interval '2 days'
      $job$
    );
  exception when others then
    raise notice 'retention-cron: could not schedule chat-messages-trim (%) — see the manual fallback at the bottom of this file', sqlerrm;
  end;

  -- ── 2. ai-sessions-prune — daily 23 minutes later (staggered off-peak).
  --      Delegates the window (30 days idle) + row deletion to the reviewed
  --      SECURITY DEFINER helper, so the cron command carries no delete logic.
  begin
    perform cron.schedule(
      'ai-sessions-prune',
      '40 3 * * *',
      $job$
        select public.prune_ai_sessions()
      $job$
    );
  exception when others then
    raise notice 'retention-cron: could not schedule ai-sessions-prune (%) — see the manual fallback at the bottom of this file', sqlerrm;
  end;
end $$;

-- Manual fallback (no pg_cron): the equivalent one-off statements, safe to run
-- by hand on a timer. Same windows as above:
--   delete from public.chat_messages where created_at < now() - interval '2 days';
--   select public.prune_ai_sessions();
--
-- Verify after applying (both jobs listed, active, with a recent run):
--   select jobname, schedule, active from cron.job
--    where jobname in ('chat-messages-trim', 'ai-sessions-prune');
--   select * from public.get_cron_health();
