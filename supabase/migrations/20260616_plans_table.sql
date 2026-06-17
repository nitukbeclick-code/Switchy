-- ─────────────────────────────────────────────────────────────────────────────
-- Plans table + seed data
-- Generated: 2026-06-16
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.plans (
  id               text        primary key,
  provider         text        not null,
  category         text        not null check (category in ('cellular','internet','tv','triple','abroad')),
  price            numeric(10,2) not null,
  price_exact      numeric(10,2),
  title            text        not null,
  subtitle         text,
  specs            jsonb       not null default '{}',
  highlight        text,
  kind             text,
  price_unit       text        not null default 'month' check (price_unit in ('month','package','day','minute')),
  fees             jsonb,
  terms            text,
  rating           numeric(3,1) default 4.0,
  review_count     integer      default 0,
  is_featured      boolean      default false,
  is_flash_deal    boolean      default false,
  flash_deal_expires_at timestamptz,
  created_at       timestamptz  default now(),
  updated_at       timestamptz  default now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.plans enable row level security;

create policy "Plans are publicly readable"
  on public.plans for select using (true);

create policy "Only admins can modify plans"
  on public.plans for all
  using (auth.jwt()->>'role' = 'admin');

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger plans_updated_at
  before update on public.plans
  for each row execute procedure update_updated_at();

-- ── Seed: 8 real plans from the app catalogue ────────────────────────────────
-- Cellular — סלקום
insert into public.plans (id, provider, category, price, price_exact, title, subtitle, specs, kind, price_unit, fees, rating, review_count, is_featured)
values
(
  'cel_cellcom_5gprocare1500',
  'סלקום',
  'cellular',
  70,
  69.9,
  '5G Pro Care 1500GB',
  'נתיב מהיר + שירות תיקונים מורחב',
  '{"נתונים": "1500GB", "דקות": "500 דק׳", "SMS": "5,000"}',
  'regular',
  'month',
  '{"דמי חיבור": "אין"}',
  4.2,
  0,
  true
),
(
  'cel_cellcom_5g800',
  'סלקום',
  'cellular',
  40,
  39.9,
  '5G 800GB',
  'מחיר מבצע לחודשיים',
  '{"נתונים": "800GB", "דקות": "500 דק׳", "SMS": "5,000"}',
  'regular',
  'month',
  '{"דמי חיבור": "אין"}',
  4.2,
  0,
  false
),

-- Internet — בזק
(
  'net_bezeq_bfiber1g',
  'בזק',
  'internet',
  99,
  null,
  'bFiber 1 ג׳יגה',
  'סיב אופטי עד 1000/100Mb',
  '{"מהירות": "עד 1000/100"}',
  'regular',
  'month',
  '{"התקנה": "חינם אם קיימת תשתית; דירה ₪199 / צמוד קרקע ₪499"}',
  4.2,
  0,
  true
),
(
  'net_bezeq_bfiber300',
  'בזק',
  'internet',
  109,
  null,
  'bFiber 300 מגה',
  'סיב אופטי עד 300/100Mb',
  '{"מהירות": "עד 300/100"}',
  'regular',
  'month',
  '{"התקנה": "חינם אם קיימת תשתית; דירה ₪199 / צמוד קרקע ₪499"}',
  4.0,
  0,
  false
),

-- Abroad — Airalo eSIM
(
  'ab_airalo_3g',
  'Airalo eSIM',
  'abroad',
  13,
  null,
  'eSIM אירופה 3GB',
  'eSIM דיגיטלי ל-30+ מדינות אירופה',
  '{"נתונים": "3GB", "סוג": "eSIM", "מדינות": "30+ אירופה"}',
  'regular',
  'package',
  null,
  4.5,
  0,
  true
),
(
  'ab_airalo',
  'Airalo eSIM',
  'abroad',
  25,
  null,
  'eSIM אירופה 10GB',
  'eSIM דיגיטלי ל-30+ מדינות אירופה',
  '{"נתונים": "10GB", "סוג": "eSIM", "מדינות": "30+ אירופה"}',
  'regular',
  'package',
  null,
  4.5,
  0,
  false
),

-- Abroad — פרטנר
(
  'ab_partner',
  'פרטנר',
  'abroad',
  29,
  null,
  'World Pack 1GB חודשי',
  '1GB גלישה + 60 דקות ב-90+ מדינות',
  '{"נתונים": "1GB", "דקות": "60 דק׳", "מדינות": "90+"}',
  'regular',
  'month',
  null,
  4.1,
  0,
  false
),

-- Abroad — גולן טלקום
(
  'ab_golan',
  'גולן טלקום',
  'abroad',
  10,
  9.9,
  '₪9.90/יום — כל אירופה',
  'גלישה + שיחות ביום בכל אירופה',
  '{"תעריף": "₪9.90/יום", "כיסוי": "כל אירופה"}',
  'regular',
  'day',
  null,
  4.2,
  0,
  false
)
on conflict (id) do nothing;
