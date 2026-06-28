-- ════════════════════════════════════════════════════════════════════════════
-- Harden anonymous direct-writes to public.leads — the "sellable"/§30A bypass
-- (2026-06).
--
-- ⚠️ OWNER-APPLIED, NOT AUTO. Review, then apply manually (psql / Supabase SQL
-- editor / `supabase db push`). Idempotent / re-runnable.
--
-- ── THE HOLE ─────────────────────────────────────────────────────────────────
-- `grant insert on public.leads to anon` (schema.sql §grants, line ~1318) is a
-- FULL-ROW grant, and the RLS insert policy `leads_insert_anyone` is
-- `with check (true)`. So anyone holding the PUBLIC anon key (it ships in the
-- static site's JS) can POST an ARBITRARY body to /rest/v1/leads, setting
-- server-managed columns the inserter should never control:
--     status, user_id, source, source_ip — and crucially consent_share_at.
-- The consent-stamp trigger (lead-consent-share-2026-06.sql) only rewrites a
-- NON-NULL consent_share_at to now(); it does NOT reject one. So an attacker can
-- plant leads stamped third-party-SELLABLE that flow straight into the monetized
-- lead-export buyer feed (_shared/google_sheets.ts buildLeadSheetRow keys
-- "sellable"=yes solely off a non-empty consent_share_at), bypassing the honest
-- consent gate that only the AI advisor + service-role paths enforce.
--
-- The existing leads_rate_limit trigger nulls the bot-workflow columns and
-- re-derives source_ip, but it does NOT touch status / user_id / source /
-- consent_share_at — so those remain attacker-controllable. This migration adds
-- the missing column-forcing for the anon (non-service-role) write path.
--
-- ── THE CONSENT-FLOW FINDING (decides null-vs-preserve for consent_share_at) ──
-- INVESTIGATED the real share-consent flow end-to-end:
--   • Static anon form  — site/script.js sendLead() (the ONLY caller of the anon
--     direct /rest/v1/leads insert) sends EXACTLY: name, phone, source,
--     terms_accepted_at, privacy_accepted_at, marketing_accepted_at, notes
--     (script.js ~lines 401-409). It NEVER sends consent_share_at, and there is
--     no share-consent checkbox on the static form. The AI-chat in-page lead
--     (script.js ~line 826) posts to the service-role /api/lead route, not the
--     anon path, and still sends no consent_share.
--   • Sellable consent is captured ONLY server-side, via service_role: the AI
--     advisor tool create_lead (_shared/tools.ts) asks the separate yes/no
--     question and passes consent_share → _shared/leads.ts buildAiLeadRow stamps
--     consent_share_at only on an explicit yes → insertRow("leads", …) runs as
--     service_role (bypasses RLS). The rep/web /api/lead route uses service_role
--     too and likewise sends no consent_share_at.
-- CONCLUSION: legitimate share-consent NEVER arrives through the anon
-- direct-insert path. Therefore for a NON-service_role insert we FORCE
-- consent_share_at := null. This drops ZERO legitimate consent (the genuine
-- yes/no is never captured on the anon form) while closing the plant-a-sellable-
-- lead bypass. We do NOT try to re-derive it from a client boolean, because the
-- anon form has no such field to honestly derive it from.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────────
-- A BEFORE INSERT trigger on public.leads that, when the caller is NOT
-- service_role, FORCES the server-managed columns to safe server values:
--     status            := 'new'      (the open-lead default the bot workflow expects)
--     user_id           := null       (anon/site leads are unowned; auth users use /api/lead)
--     source_ip         := null       (leads_rate_limit authoritatively re-derives it from headers)
--     consent_share_at  := null       (per the finding above — never sellable from anon)
-- `source` is deliberately LEFT ALONE: the static form sends source = location.pathname
-- (genuine per-page attribution, ≤40 chars, rendered escaped) — client data, not a
-- server-managed column. Forcing it would destroy real lead attribution for ~no security gain.
-- service_role inserts (meeting-book/notify-lead/AI advisor/web /api/lead) are
-- left untouched, so the honest server paths keep setting source/consent_share_at.
--
-- Role check: auth.role() — the Supabase JWT-claims helper that returns
-- 'service_role' for the service-role key, 'authenticated'/'anon' otherwise. This
-- is the same trust boundary meetings_guard relies on (it forces status/user_id
-- for non-rep callers); we make it explicit here for the leads table.
--
-- Ordering: Postgres fires BEFORE INSERT triggers in ALPHABETICAL order by name.
-- This trigger is named leads_anon_write_guard_before_insert so it sorts BEFORE
-- leads_consent_stamp_before_insert and leads_rate_limit_before_insert and runs
-- FIRST — it nulls consent_share_at before the consent stamp can re-stamp it, and
-- before rate_limit's header-derived source_ip (which then authoritatively
-- overrides our null on the anon path). Forcing the columns here is therefore
-- belt-and-suspenders with those existing triggers and never fights them.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The anon-write guard ──────────────────────────────────────────────────
-- security definer + pinned search_path (matches leads_rate_limit / meetings_guard).
create or replace function public.leads_anon_write_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only constrain UNTRUSTED callers. service_role (edge functions: meeting-book,
  -- notify-lead, the AI advisor create_lead path, and the web /api/lead route)
  -- bypasses RLS and is the authoritative server path — it may legitimately set
  -- source and the honest consent_share_at, so we leave its row untouched.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Caller is anon or authenticated → FORCE the server-managed columns. None of
  -- these may be trusted from a client body posted with the public anon key.
  new.status           := 'new';     -- open-lead default the bot workflow expects
  new.user_id          := null;      -- anon/site leads are unowned
  -- NOTE: `source` is intentionally NOT forced. The static form sends
  -- source = location.pathname (real per-page attribution; capped at 40 chars by
  -- leads_rate_limit and only ever rendered escaped) — that's legitimate CLIENT
  -- data, not a server-managed column. Spoofing it is negligible-impact, and
  -- forcing it to a constant would destroy genuine page-level lead attribution.
  new.source_ip        := null;      -- belt-and-suspenders; leads_rate_limit authoritatively re-derives it from cf-connecting-ip / XFF
  -- THE BYPASS-CLOSER: a client posting via the anon key can never mark a lead
  -- sellable. Legitimate share-consent only ever arrives server-side via
  -- service_role (see the consent-flow finding in the header), so null here drops
  -- no genuine consent — the anon form has no share-consent field to derive from.
  new.consent_share_at := null;

  return new;
end;
$$;

-- Sort-first name → runs BEFORE leads_consent_stamp_* and leads_rate_limit_*
-- (alphabetical BEFORE-trigger firing order). Drop-then-create = idempotent.
drop trigger if exists leads_anon_write_guard_before_insert on public.leads;
create trigger leads_anon_write_guard_before_insert
  before insert on public.leads
  for each row execute function public.leads_anon_write_guard();

-- Lock the function down to the same trust boundary as the other leads triggers
-- (schema.sql revokes execute on leads_rate_limit from anon/authenticated/public;
-- the trigger still fires because it runs as the table owner, not the caller).
revoke execute on function public.leads_anon_write_guard() from anon, authenticated, public;

-- ── 2. (Optional) defense-in-depth — column-scoped INSERT grant ───────────────
-- The trigger above is the authoritative control. As an extra layer, the full-row
-- `grant insert on public.leads to anon` could be narrowed to ONLY the columns the
-- static form legitimately supplies, so the anon role cannot even NAME the
-- server-managed columns in a request. Left COMMENTED — applying it changes the
-- INSERT privilege surface and must be validated against every anon caller's exact
-- column set first (PostgREST rejects an insert that lists a non-granted column).
-- The site form (script.js sendLead) sends: name, phone, source, terms_accepted_at,
-- privacy_accepted_at, marketing_accepted_at, notes — note `source` would be forced
-- to 'web' by the trigger regardless, but is listed so the existing payload still
-- validates. Re-grant exactly:
--
--   revoke insert on public.leads from anon;
--   grant insert (name, phone, source, terms_accepted_at, privacy_accepted_at,
--                 marketing_accepted_at, notes) on public.leads to anon;
--
-- ════════════════════════════════════════════════════════════════════════════
