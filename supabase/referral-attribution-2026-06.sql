-- ════════════════════════════════════════════════════════════════════════════
-- Referral attribution (2026-06) — close the loop from a shared code to a signup.
--   Companion to supabase/referral-codes-2026-06.sql (the public.referral_codes
--   store the agent + the web /api/referral route both write to). That file mints
--   codes; THIS file records the REDEMPTION: when a referee arrives via a referral
--   link (?ref=SW-XXXXXX) and later leaves details, the lead carries the code, and
--   we credit the original share.
--
-- TRUTH-ONLY / E-E-A-T (ABSOLUTE):
--   • Attribution only — we record WHICH code a lead arrived with, nothing more.
--     No PII beyond what the lead already holds.
--   • NO advertised monetary reward. There is intentionally still NO reward column
--     / amount anywhere. Crediting a referral is operational attribution, not a
--     payout. If the owner ever defines a reward program, that is a separate,
--     explicit, documented change — never invented by a surface.
--   • §30A: the redeeming lead is a NEW contact and still passes the normal
--     consent gate (public.leads consent timestamps) + is checked against
--     public.marketing_suppression like any other lead. A referral does NOT bypass
--     consent or suppression.
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role; new grants are explicit. We follow referral-codes-2026-06.sql.
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`). Idempotent / re-runnable: add-column-if-not-
-- exists, create-index-if-not-exists, create-or-replace function.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. leads.referrer_code — the code a referee arrived with ──────────────────
-- Nullable: the vast majority of leads have no referrer. When present it is the
-- normalized SW-XXXXXX token (UPPERCASE) the /api/lead route should forward from
-- the ?ref= param (see the wiring note at the bottom — a SEPARATE code change).
alter table public.leads
  add column if not exists referrer_code text;

comment on column public.leads.referrer_code is
  'Referral code (SW-XXXXXX) this lead arrived with, from a referral ?ref= link. Attribution only — NO reward implied. Nullable (most leads have none).';

-- Fast "did this code convert? which leads did it bring?" lookups + the redemption
-- backfill below. Partial index keeps it tiny (only referred leads are indexed).
create index if not exists leads_referrer_code_idx
  on public.leads (referrer_code)
  where referrer_code is not null;

-- ── 2. Redemption backfill — credit the code row when a referred lead lands ────
-- public.referral_codes already has redeemed_at + redeemed_lead_id columns
-- (referral-codes-2026-06.sql) reserved for exactly this. A BEFORE-INSERT-style
-- credit on the lead would couple the two tables; instead we expose a small,
-- service_role-only RPC the lead-capture path (or a periodic sweep) can call to
-- stamp the FIRST redemption of a code. First-redemption-wins: we only fill an
-- as-yet-unredeemed code, so a code credits exactly one signup and re-runs are
-- idempotent.
create or replace function public.redeem_referral_code(
  p_code    text,
  p_lead_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.referral_codes rc
     set redeemed_at = now(),
         redeemed_lead_id = p_lead_id
   where rc.code = upper(btrim(p_code))
     and rc.redeemed_at is null          -- first-redemption-wins (idempotent)
     and p_lead_id is not null
  returning true;
$$;

comment on function public.redeem_referral_code(text, uuid) is
  'Stamp the FIRST redemption of a referral code (redeemed_at + redeemed_lead_id) when a referred lead lands. Attribution only — NO reward. service_role only.';

-- ── 3. Grants (grant-gap rule): service_role only; deny clients ───────────────
-- The redemption RPC is operational — only the server (service_role) may call it.
-- Revoke the default PUBLIC execute grant, then grant service_role explicitly.
revoke all on function public.redeem_referral_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_referral_code(text, uuid) to service_role;

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Wiring (SEPARATE code change, not this SQL, and NOT in this agent's owned
--   files): app/api/lead/route.ts should accept an optional `referrer_code` in the
--   body, validate it against the SW-XXXXXX shape (lib/referral.isReferralCode),
--   write it to leads.referrer_code, and — after a successful insert — call
--   public.redeem_referral_code(code, new_lead_id) to credit the share. <LeadForm>
--   should read ?ref= from the URL (lib/referral.referralCodeFromQuery) and submit
--   it. Until that wiring ships, codes are still minted + shareable; only the
--   redemption credit is dormant. Nothing breaks before it.
-- • Reward program: there is STILL intentionally NO reward column / amount. Credit
--   is attribution, not a payout. Any reward is a separate, explicit, documented
--   change — and only THEN may any surface mention it (E-E-A-T: never advertise an
--   unfunded reward).
-- • §30A: a redeeming lead is a NEW contact → the normal consent gate
--   (public.leads consent timestamps) + public.marketing_suppression check apply
--   to it exactly as to any other lead. Referral attribution does NOT bypass them.
