-- ════════════════════════════════════════════════════════════════════════════
-- Referral codes data layer (2026-06)
--   Backs the agent's generate_referral_code tool (_shared/referrals.ts →
--   issueReferralCode). A referral code is a REAL, persisted, attributable token:
--   the agent mints it locally (Web Crypto) and inserts a row here so a future
--   signup can be credited to the referrer.
--
-- TRUTH-ONLY / E-E-A-T:
--   • Attribution only — the row records WHO shared the code (channel + contact/
--     conversation), nothing more. No PII beyond the contact handle the
--     conversation already holds.
--   • NO advertised monetary reward. We do NOT store or promise a cash payout.
--     If the owner ever defines a reward program, that is a separate, explicit
--     config change — the agent never invents one. The default framing is
--     share-the-tool ("help a friend save"), value-based, not cash-based.
--   • Spam-Law §30A: issuing a SHARE code is not marketing TO anyone — the
--     referrer chooses to share it. A code only becomes a contact event if/when a
--     referee redeems it, at which point the normal consent/suppression gates
--     (public.leads + public.marketing_suppression) apply to that NEW contact.
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role, so a new table is silently inaccessible (403) until granted
-- explicitly. We grant service_role and deny anon/authenticated outright (mirrors
-- marketing-consent-2026-06.sql / whatsapp-2026-06.sql / analytics-events-2026-06.sql).
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`). Idempotent / re-runnable:
-- create-table-if-not-exists, create-index-if-not-exists, drop-then-create policy.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. The referral_codes table ───────────────────────────────────────────────
-- One row per issued code. `code` is the unique, human-readable token
-- (e.g. 'SW-7KQ4M9'); the unique index turns a (vanishingly rare) collision into
-- an insert failure → the agent fail-softly retries / mints a fresh one.
create table if not exists public.referral_codes (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,                  -- 'SW-XXXXXX' — the shareable token
  channel          text not null check (channel in ('whatsapp','site','app')),
  referrer_contact text,                           -- referrer's handle (phone for whatsapp) — attribution only, nullable
  referrer_name    text,                           -- referrer display name, if known — nullable
  conversation_id  text,                           -- unified-session id, for attribution — nullable
  source           text not null default 'agent',  -- always 'agent' for codes the bot issues
  -- Redemption attribution (filled in later when/if a referee signs up). NULL =
  -- not yet redeemed. No reward column on purpose — see the header (no cash promise).
  redeemed_at      timestamptz,
  redeemed_lead_id uuid references public.leads(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- One canonical row per code (case-normalized upstream to UPPERCASE in
-- _shared/referrals.ts). Makes issuing idempotent-on-collision and lookups fast.
create unique index if not exists referral_codes_code_uidx
  on public.referral_codes (code);

-- Fast "how many codes did this contact share / did any convert?" attribution.
create index if not exists referral_codes_referrer_contact_idx
  on public.referral_codes (referrer_contact);
create index if not exists referral_codes_conversation_idx
  on public.referral_codes (conversation_id);

comment on table  public.referral_codes is 'Referral codes the agent issues for share-the-tool invites. Attribution only — NO advertised monetary reward (default share-the-tool framing). service_role only.';
comment on column public.referral_codes.code             is 'The shareable token, e.g. SW-7KQ4M9 (UPPERCASE, unambiguous alphabet). Unique.';
comment on column public.referral_codes.referrer_contact is 'Referrer handle (phone for whatsapp) — attribution only; nullable for anonymous site visitors.';
comment on column public.referral_codes.redeemed_at      is 'When a referee redeemed this code (NULL = not yet). Redemption of a NEW contact still goes through the normal §30A consent + suppression gates.';
comment on column public.referral_codes.redeemed_lead_id is 'The leads row created when the code was redeemed (attribution link). No reward column — reward, if ever, is separate owner-defined config.';

-- ── 2. RLS: deny-all to clients; explicit service_role grants (grant-gap rule) ──
-- RLS ON + no anon/authenticated policy → clients get nothing (referral
-- attribution is operational PII). service_role bypasses RLS but STILL needs
-- explicit table grants here (default privileges don't grant).
alter table public.referral_codes enable row level security;

revoke all on public.referral_codes from anon, authenticated;

-- The agent (edge functions running as service_role) inserts new codes and reads
-- them back for attribution / redemption. No update/delete granted — codes are
-- append-mostly; a redemption is a controlled PATCH the rep tooling can add later
-- with an explicit grant when that flow ships.
grant select, insert on public.referral_codes to service_role;

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Wiring (separate change, not SQL): pass an issueReferral sink into the agent's
--   ToolContext in the callers (site-ai-chat/index.ts buildAgentToolContext and
--   whatsapp-webhook/agent_runner.ts), e.g.:
--     issueReferral: (i) => issueReferralCode(i)   // from _shared/referrals.ts
--   When the sink is absent the tool still returns a real (unpersisted) code, so
--   nothing breaks before this is wired — wiring just turns ON attribution.
-- • Reward program: there is intentionally NO reward column / amount. If the owner
--   defines a reward later, add it as an explicit column + a documented policy and
--   only THEN may any surface mention it (E-E-A-T: never advertise an unfunded reward).
-- • Redemption flow (future): when a referee signs up with a code, set redeemed_at
--   + redeemed_lead_id (needs an UPDATE grant added then). That redemption is a NEW
--   contact → it must pass the normal consent gate (public.leads) and be checked
--   against public.marketing_suppression like any other lead.
