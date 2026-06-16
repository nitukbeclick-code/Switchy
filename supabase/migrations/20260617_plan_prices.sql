-- ─────────────────────────────────────────────────────────────────────────────
-- Plan price ledger — real per-plan price history for the sparkline + drop alerts
-- Generated: 2026-06-17
-- ─────────────────────────────────────────────────────────────────────────────
-- An append-only ledger: one row each time a plan's price changes (plus one on
-- insert). The app reads it for the price-history sparkline and to detect real
-- price drops for watched plans. When empty (table not yet populated), the
-- client falls back to a deterministic synthetic series — see plan_history.dart.

create table if not exists public.plan_prices (
  id          bigint generated always as identity primary key,
  plan_id     text          not null references public.plans(id) on delete cascade,
  price       numeric(10,2) not null,
  captured_at timestamptz   not null default now()
);

create index if not exists plan_prices_plan_time_idx
  on public.plan_prices (plan_id, captured_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.plan_prices enable row level security;

create policy "Price history is publicly readable"
  on public.plan_prices for select using (true);

create policy "Only admins/service can write price history"
  on public.plan_prices for all
  using (auth.jwt()->>'role' = 'admin')
  with check (auth.jwt()->>'role' = 'admin');

-- ── Auto-log price changes ───────────────────────────────────────────────────
-- Append a ledger row on insert and whenever the price actually changes, so the
-- history grows automatically as the catalogue is edited (no app code needed).
create or replace function public.log_plan_price()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') or (new.price is distinct from old.price) then
    insert into public.plan_prices (plan_id, price) values (new.id, new.price);
  end if;
  return new;
end;
$$;

drop trigger if exists plans_price_log on public.plans;
create trigger plans_price_log
  after insert or update of price on public.plans
  for each row execute procedure public.log_plan_price();

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Seed one initial point per existing plan so the sparkline has a baseline even
-- before any price edits. Idempotent: only seeds plans with no ledger rows yet.
insert into public.plan_prices (plan_id, price, captured_at)
select p.id, p.price, p.created_at
from public.plans p
where not exists (select 1 from public.plan_prices pp where pp.plan_id = p.id);
