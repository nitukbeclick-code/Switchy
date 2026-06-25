-- ════════════════════════════════════════════════════════════════════════════
-- LEAD-EXPORT — the sellable-lead export feed (the monetization endpoint) (2026-06)
-- DRAFT — do NOT auto-apply. Review, then run once in the SQL editor / psql.
--
-- Backs the NEW edge function supabase/functions/lead-export, which returns the
-- feed of leads that may LAWFULLY be sold to third-party buyers, and (when a buyer
-- destination is configured) appends them to per-category tabs in a buyer
-- spreadsheet.
--
-- HARD LEGAL GATE (enforced in the function, restated here for the operator):
--   A lead is sellable ⇔ it carries an explicit third-party-sharing consent: a
--   NON-NULL public.leads.consent_share_at (added by lead-consent-share-2026-06.sql).
--   The §30A service consent (terms/privacy) and the marketing opt-ins do NOT make
--   a lead sellable — passing a person's data to a third party for that party's own
--   use needs its own informed, SEPARATE consent under the Protection of Privacy
--   Law. A lead WITHOUT consent_share_at MUST NEVER be exported. The function's
--   query filters `consent_share_at IS NOT NULL` and re-checks every row before it
--   can reach a buyer — this file adds nothing that could weaken that.
--
-- This file is OPTIONAL and additive. It does TWO independent, idempotent things:
--   1. (perf, safe) a partial index to make the sellable-lead scan cheap; and
--   2. (optional) a pg_cron schedule that periodically POSTs the function so a
--      configured buyer sheet is topped up automatically. LEAVE THE CRON COMMENTED
--      until a buyer destination is actually configured — the function is harmless
--      without it (it just returns JSON and appends nothing).
--
-- Idempotent / re-runnable:
--   • create index if not exists … (no-op when present);
--   • the cron block is guarded and upserts by job name.
-- ════════════════════════════════════════════════════════════════════════════


-- ── 1. Index the sellable-lead scan (cheap, safe to apply now) ───────────────
-- The export query is: consent_share_at IS NOT NULL AND status IN (…) ORDER BY
-- created_at DESC, optionally windowed by created_at. A partial index over the
-- sellable rows (the small minority that carry share consent), ordered by
-- created_at desc, serves the window + ordering without scanning the whole table.
-- Pre-req: public.leads.consent_share_at must exist (lead-consent-share-2026-06.sql).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'consent_share_at'
  ) then
    create index if not exists leads_sellable_idx
      on public.leads (created_at desc)
      where consent_share_at is not null;
  else
    raise notice 'lead-export: public.leads.consent_share_at is missing — apply lead-consent-share-2026-06.sql first, then re-run for the index';
  end if;
end $$;


-- ── 2. Buyer destination configuration (operator notes — no DB change) ───────
-- The buyer spreadsheet is configured via an EDGE FUNCTION SECRET, not a table:
--
--   • BUYER_SPREADSHEET_ID  (or LEAD_BUYER_SPREADSHEET_ID) — the Google Sheets id
--     of the buyer's destination workbook. When UNSET the function is DARK for
--     appends: it still returns the JSON feed, it just appends nowhere. Set it via
--       supabase secrets set BUYER_SPREADSHEET_ID=<sheet-id>
--     The function appends each lead to a per-category tab in that workbook
--     ("cellular", "internet", "tv", "triple", "abroad", or "other"); create those
--     tabs (or let values:append create rows under existing headers) as needed.
--
--   • The append reuses the EXISTING Google service-account secret already used by
--     the leads-log sheet (google_service_account in Vault / GOOGLE_SERVICE_ACCOUNT
--     env). SHARE the buyer workbook with that service-account's client_email
--     (Editor) or appends will 403 (fail-soft: logged, JSON feed unaffected).
--
-- No buyer_config table is created here on purpose: a single buyer destination is
-- an operator secret, and modelling multiple buyers/quotas is a future concern that
-- should be designed deliberately rather than guessed at now (truth-only: we don't
-- build speculative schema).


-- ── 3. OPTIONAL cron: periodic buyer-sheet top-up (LEAVE COMMENTED until live) ─
-- Uncomment ONLY after a buyer destination (BUYER_SPREADSHEET_ID) is configured
-- AND you have confirmed, with the lawyer, that the consented leads may be sold to
-- that specific buyer. Until then the function is best driven manually / dry-run.
--
-- Auth: fail-CLOSED on the shared lead_webhook_secret (x-webhook-secret header),
-- read from Vault and passed via pg_net — exactly the pattern lead-digest-cron and
-- the meetings INSERT trigger already use.
--
-- The block is guarded so it no-ops cleanly where pg_cron / pg_net aren't enabled;
-- cron.schedule upserts by name, so re-running re-points the job.
--
-- do $$
-- begin
--   begin
--     create extension if not exists pg_cron schema cron;
--   exception when others then
--     raise notice 'lead-export-cron: could not ensure pg_cron (%) — enable it in the dashboard, then re-run', sqlerrm;
--   end;
--   begin
--     create extension if not exists pg_net;
--   exception when others then
--     raise notice 'lead-export-cron: could not ensure pg_net (%) — enable it in the dashboard, then re-run', sqlerrm;
--   end;
-- end $$;
--
-- -- Hourly during business hours (07:00–18:00 UTC) — adjust to the buyer's SLA.
-- select cron.schedule(
--   'lead-export-buyer-feed',
--   '0 7-18 * * *',
--   $$
--     select net.http_post(
--       url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/lead-export',
--       headers := jsonb_build_object(
--         'Content-Type',     'application/json',
--         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--       ),
--       -- Pull the last 2 days of sellable leads each run; the buyer sheet's own
--       -- de-dup (and the function's dedupKey) keep re-pulls from doubling rows.
--       body    := jsonb_build_object(
--         'since', (now() - interval '2 days')
--       )
--     )
--   $$
-- );


-- ── Notes the owner must verify in the live project ──────────────────────────
-- • LEGAL FIRST: confirm with the lawyer that selling a consented lead to the
--   specific buyer is covered by the consent text the user agreed to. The function
--   enforces "explicit share consent exists"; it cannot verify the consent WORDING
--   matched this buyer — that's a human/legal check. §7b commission disclosure and
--   any DPA with the buyer are owner-side obligations.
-- • The 'lead_webhook_secret' Vault secret MUST be set (it already backs notify-lead
--   / lead-digest / community-notify). Without it the function 503s and exports
--   nothing — a safe, logged no-op.
-- • Manual DRY-RUN (returns the feed, appends nothing — safe to run anytime):
--     select net.http_post(
--       url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/lead-export',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')
--       ),
--       body    := '{"dryRun": true}'::jsonb
--     );
-- • Inspect cron runs (once the schedule is uncommented):
--     select * from cron.job where jobname = 'lead-export-buyer-feed';
--     select * from cron.job_run_details
--       where jobid = (select jobid from cron.job where jobname = 'lead-export-buyer-feed')
--       order by start_time desc limit 10;
-- • To DISABLE later:  select cron.unschedule('lead-export-buyer-feed');
-- ════════════════════════════════════════════════════════════════════════════
