-- ════════════════════════════════════════════════════════════════════════════
-- Third-party-sharing consent on leads — the "sellable" gate (2026-06)
--
--   The business SELLS leads to relevant providers. Under the Protection of
--   Privacy Law, passing a person's personal data to a THIRD PARTY for that
--   party's own use requires the data subject's INFORMED, SEPARATE consent — it
--   is NOT covered by the §30A consent to be contacted by us, nor by any
--   marketing opt-in. So a lead may be lawfully captured and contactable while
--   still NOT being sellable.
--
--   This migration adds public.leads.consent_share_at: a nullable timestamptz that
--   is non-null ONLY when the person explicitly agreed (the advisor asks, at the
--   close, a clear yes/no: "האם תאשר/י להעביר את פרטיך לספקים רלוונטיים לקבלת
--   הצעה?"). It is the SINGLE source of truth for "sellable":
--     • the Google-Sheets lead export (_shared/google_sheets.ts buildLeadSheetRow)
--       writes a "sellable" = yes/no column driven solely by this timestamp;
--     • null / absent  ⇒ NOT sellable (the safe, honest default).
--   Truth-only: nothing else may promote a lead to sellable.
--
-- GRANT/RLS: this only ADDS a column to public.leads. The leads table's RLS +
-- column-scoped SELECT already restrict client reads to the safe set (id, status,
-- created_at, user_id — see schema.sql §leads); consent_share_at is operational
-- consent PII read server-side via service_role (bypasses RLS + column grants).
-- No new grant is required — same as leads-city-2026-06.sql / marketing-consent.
--
-- DEPLOY: this is a DRAFT — NOT applied automatically. Apply manually AFTER review
-- (psql / Supabase SQL editor / `supabase db push`). Idempotent / re-runnable:
-- add-column-if-not-exists + create-or-replace function + drop-then-create trigger.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The sellable-consent timestamp ────────────────────────────────────────
-- Nullable: null = NO third-party-sharing consent (default). A non-null instant is
-- the proof the person agreed to have their details passed to providers. Distinct
-- from terms/privacy (§30A service consent) and from the marketing opt-in flags.
alter table public.leads
  add column if not exists consent_share_at timestamptz;

comment on column public.leads.consent_share_at is
  'Privacy Law: timestamp the person EXPLICITLY consented to share their details with third-party providers (the "sellable" gate). null = no consent (safe default). Separate from §30A terms/privacy consent and from marketing opt-ins; the ONLY signal the lead export uses to mark a row sellable. Server-stamped (cannot be backdated).';

-- ── 2. Re-stamp on insert so the consent time can't be backdated ──────────────
-- ✅ CANONICAL leads_consent_stamp() BODY (supersedes legal-consent-2026-06 §3).
-- ⚠️ CAUTION on re-apply: cron-and-hardening-2026-07.sql §2 later pinned this
-- function's search_path to '' (ALTER FUNCTION). CREATE OR REPLACE resets that
-- setting, so after re-running this section, re-run:
--   alter function public.leads_consent_stamp() set search_path = '';
-- Mirror the existing leads_consent_stamp pattern (legal-consent-2026-06.sql):
-- the client sends a NON-NULL value to INDICATE share consent; the trigger
-- overwrites it with the server now() so the proof is authoritative and can't be
-- backdated. A null stays null (no consent). We extend the SAME trigger function
-- (create or replace) so the existing terms/privacy/marketing stamping is preserved
-- byte-for-byte and the share stamp is just added alongside.
create or replace function public.leads_consent_stamp()
returns trigger
language plpgsql
as $$
begin
  new.terms_accepted_at     := case when new.terms_accepted_at     is not null then now() else null end;
  new.privacy_accepted_at   := case when new.privacy_accepted_at   is not null then now() else null end;
  new.marketing_accepted_at := case when new.marketing_accepted_at is not null then now() else null end;
  -- Third-party-sharing consent: same non-null-sentinel → server now() rule.
  new.consent_share_at      := case when new.consent_share_at      is not null then now() else null end;
  return new;
end;
$$;

drop trigger if exists leads_consent_stamp_before_insert on public.leads;
create trigger leads_consent_stamp_before_insert
  before insert on public.leads
  for each row execute function public.leads_consent_stamp();

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • This column is the sole "sellable" signal. Before selling/exporting any lead,
--   the consuming system MUST treat a null/absent consent_share_at as NOT sellable.
-- • The advisor (_shared/tools.ts create_lead) asks the separate yes/no question
--   and passes consent_share; _shared/leads.ts buildAiLeadRow stamps this column
--   only on an explicit yes. The §30A terms/privacy consent is unchanged and
--   independent — capturing a contactable lead never implies it's sellable.
