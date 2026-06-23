-- Catalogue enrichment for the WhatsApp bot (2026-06).
--
-- The bot grounds its answers in public.plans, but that table lacks the
-- post-promo price + flags the app's catalogue carries (after / 5G / no-commit /
-- abroad). Without them the bot can only DERIVE those from the title/subtitle
-- text (see _shared/catalogue.ts plansFromRows), which is lossy — it misses the
-- "price after the year" (kamaze-parity) on plans whose step-up isn't spelled
-- out in the free text. These columns make the signals explicit so the export
-- tool (tool/export_plans.dart) can UPSERT them straight from lib/data.dart.
--
-- public.plans is already "publicly readable" (schema.sql §grants:
--   grant select on public.plans to anon, authenticated;)
-- so no grant change is needed — adding columns to an already-granted table
-- keeps the existing select privilege.
--
-- Idempotent / re-runnable (add column IF NOT EXISTS). Apply manually against
-- the prod project once; do NOT auto-apply.
alter table public.plans
  add column if not exists after       int,
  add column if not exists after_exact numeric,
  add column if not exists is_5g       boolean default false,
  add column if not exists no_commit   boolean default false,
  add column if not exists has_abroad  boolean default false,
  add column if not exists specs       jsonb   default '{}'::jsonb,
  add column if not exists updated_at  timestamptz default now();

comment on column public.plans.after       is 'Post-promo monthly price (rounded ₪); null when there is no step-up. Drives the bot''s "price after the year" answer.';
comment on column public.plans.after_exact is 'Exact post-promo price when not whole (e.g. 59.90); mirrors after for display.';
comment on column public.plans.is_5g       is 'True for 5G cellular plans (was derived from title text before this column existed).';
comment on column public.plans.no_commit   is 'True for no-commitment plans (ללא התחייבות).';
comment on column public.plans.has_abroad  is 'True when the plan bundles abroad/roaming (כולל חו"ל).';
comment on column public.plans.specs       is 'Structured key specs (label→value) lifted from the app catalogue; data/speed/channels/… for grounding.';
comment on column public.plans.updated_at  is 'When this catalogue row was last refreshed by the export tool.';
