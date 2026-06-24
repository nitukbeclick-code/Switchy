-- Bill forensics — additive persistence layer (2026-06).
-- ─────────────────────────────────────────────────────────────────────────────
-- Companion to schema.sql §public.bill_analyses and the site-bill-analyzer Edge
-- Function. Pillar-2 "Bill Forensics" adds a truth-only audit on top of the
-- existing photo→suggestions flow: alongside the cheaper-plan suggestions, the
-- analyzer now surfaces concrete, ₪-quantified anomalies (overcharge / expired
-- promo / zombie line) computed by _shared/bill-forensics.ts against the REAL
-- catalogue. This migration lets us persist a PII-LIGHT summary of those findings
-- next to the existing summary row, for product analytics + auditability.
--
-- Two additive columns on public.bill_analyses, both idempotent / re-runnable
-- and grant-gap-safe (this project's default privileges do NOT grant to
-- service_role, so we re-affirm the grant explicitly — mirrors schema.sql
-- §grants, community-moderation-2026-06.sql):
--
--   (1) findings        jsonb  — the forensic findings array the function
--       returned for THIS analysis. PII-light by construction: each element is
--       {kind, severity, certainty, title, detail, impact, line} — the bill is
--       NEVER stored (no image, no base64, no full bill text); `detail`/`line`
--       carry only the short, model-read line label. Default '[]' so old rows
--       and any insert that omits it read as "no findings", not NULL.
--
--   (2) forensic_impact numeric — the de-duplicated total MONTHLY ₪ impact across
--       findings (Σ, never double-counting overcharge+promo on the same line).
--       Default 0.
--
-- TRUTH-ONLY / E-E-A-T: these columns only ever hold what auditBill() derived
-- from the parsed numbers + the real catalogue. We persist a finding solely
-- because the data supported it; we never write a fabricated overcharge/impact.
--
-- BACKWARD-COMPAT: the Edge Function probes for these columns at runtime and
-- falls back to the legacy summary insert if they're absent, so applying this
-- migration is purely additive — nothing breaks before OR after it runs.
--
-- ⚠️  DRAFT — DO NOT AUTO-APPLY. Review, then apply MANUALLY:
--       psql "$DATABASE_URL" -f supabase/bill-forensics-2026-06.sql
--     (or paste into the Supabase SQL editor). Safe to run after schema.sql, and
--     safe to re-run (every statement is IF NOT EXISTS / idempotent).


-- ════════════════════════════════════════════════════════════════════════════
-- (1) additive forensic-summary columns on public.bill_analyses
-- ════════════════════════════════════════════════════════════════════════════
alter table public.bill_analyses
  add column if not exists findings jsonb not null default '[]'::jsonb;

alter table public.bill_analyses
  add column if not exists forensic_impact numeric not null default 0;

comment on column public.bill_analyses.findings is
  'PII-light forensic findings for this analysis: array of {kind, severity, certainty, title, detail, impact, line}. Truth-only — written only when the parsed bill + real catalogue support the flag. The bill image/text is NEVER stored. Default ''[]''.';

comment on column public.bill_analyses.forensic_impact is
  'De-duplicated total monthly ₪ impact across findings (never double-counts overcharge+promo on the same line). Default 0.';


-- ════════════════════════════════════════════════════════════════════════════
-- (2) grant-gap-safe: re-affirm the service_role grant
-- ════════════════════════════════════════════════════════════════════════════
-- The Edge Function uses the service-role key (bypasses RLS). Default privileges
-- in this project do NOT grant to service_role, so re-affirm the existing
-- select+insert grant explicitly. Column-level grants follow the table grant for
-- these additive columns, so no extra column grant is needed; this just keeps
-- the migration self-contained and safe to run standalone.
grant select, insert on public.bill_analyses to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- (3) optional analytics index — rows that actually surfaced an anomaly
-- ════════════════════════════════════════════════════════════════════════════
-- A partial index over analyses where the forensic pass found something, ordered
-- by recency. Keeps "how often do we catch a real overcharge, and how big" style
-- product analytics cheap without scanning the whole table. Partial on a positive
-- impact so it stays small (most analyses find nothing).
create index if not exists bill_analyses_forensic_impact_idx
  on public.bill_analyses (created_at desc)
  where forensic_impact > 0;
