-- Plan price history (Market Pulse) — daily snapshots (2026-06).
--
-- The catalogue (public.plans / site/data/plans.json) only ever holds the
-- CURRENT price, so price TRENDS are invisible: we can show what a plan costs
-- today, but not whether it crept up or dropped over the last month. This table
-- is the append-only ledger that makes trends real over time. The catalogue-sync
-- (the export tool / sync job that refreshes public.plans) should INSERT a daily
-- snapshot row per plan here, so the "Market Pulse" view can chart movement.
--
-- READ MODEL: the Market Pulse is PUBLIC (the site + app render the trend), so
-- anon + authenticated may SELECT. There is NO client insert/update/delete
-- policy — only the catalogue-sync (service_role) writes snapshots — so RLS
-- denies writes for anon/authenticated by default.
--
-- GRANTS: this project's default privileges do NOT grant to service_role (see
-- schema.sql §grants and analytics-events-2026-06.sql / providers-2026-06.sql
-- for the same documented gap), so the service_role grant is spelled out
-- explicitly below alongside the public SELECT grant.
--
-- `captured_at` defaults to now() so the sync just inserts the price; `after` is
-- the post-promo price (kamaze-parity "price after the year"), null when there
-- is no step-up. Idempotent / re-runnable. Apply manually against the prod
-- project once; do NOT auto-apply.

create table if not exists public.plan_price_history (
  id          uuid primary key default gen_random_uuid(),
  plan_id     text,                                   -- catalogue plan id (public.plans.id / plans.json id)
  category    text,                                   -- cellular/internet/tv/triple/abroad
  provider    text,                                   -- carrier token (cellcom/partner/…)
  price       numeric,                                -- promo / current monthly price (₪) at capture time
  after       numeric,                                -- post-promo price (₪); null when no step-up
  captured_at timestamptz not null default now()
);

comment on table public.plan_price_history is 'Append-only daily price snapshots per plan — the ledger behind the Market Pulse trends. The catalogue-sync should INSERT one snapshot row per plan per day so price trends become real over time.';
comment on column public.plan_price_history.plan_id     is 'Catalogue plan id (public.plans.id / plans.json id) this snapshot is for.';
comment on column public.plan_price_history.category    is 'Plan category at capture time: cellular/internet/tv/triple/abroad.';
comment on column public.plan_price_history.provider    is 'Provider/carrier token at capture time (cellcom/partner/…).';
comment on column public.plan_price_history.price       is 'Promo / current monthly price (₪) at capture time.';
comment on column public.plan_price_history.after       is 'Post-promo monthly price (₪) at capture time; null when there is no step-up.';
comment on column public.plan_price_history.captured_at is 'When this snapshot was taken; the catalogue-sync inserts one per plan per day.';

create index if not exists plan_price_history_plan_captured_idx
  on public.plan_price_history (plan_id, captured_at desc);

alter table public.plan_price_history enable row level security;

-- Public read: the Market Pulse trend is shown on the site + app.
drop policy if exists "plan_price_history public read" on public.plan_price_history;
create policy "plan_price_history public read" on public.plan_price_history
  for select to anon, authenticated using (true);

-- Public SELECT grant + explicit service_role (default privileges do NOT grant
-- to service_role here — see schema.sql §grants). No anon/authenticated write
-- grants: only the catalogue-sync (service_role) inserts snapshots.
grant select on public.plan_price_history to anon, authenticated;
grant all    on public.plan_price_history to service_role;
