-- ─────────────────────────────────────────────────────────────────────────────
-- plans-price-unit-no-default-2026-07.sql  (2026-07-31)  — CORRECTNESS (money).
--
-- ⚠️  DRAFT — do NOT auto-apply. Apply by hand.
--
-- One line: `public.plans.price_unit` is `not null default 'month'`, and that
-- default turns "the inserter forgot to say" into a confident, expensive lie.
--
-- Today's column definition:
--   price_unit  text  NOT NULL  DEFAULT 'month'::text
--   CHECK (price_unit = ANY (ARRAY['month','package','day','minute']))
--
-- Why the default is the dangerous part, and not a convenience:
--
-- `price_unit` is what the whole savings stack uses to decide whether a price
-- may be multiplied by twelve. The annual-saving rule (duplicated four times —
-- web/lib/recommend.ts, web/lib/switch-kit.ts,
-- supabase/functions/_shared/scoring.ts, and Dart planSaveYear) reads it as:
--
--     unit !== 'month'  ->  saving is 0        (a per-package eSIM is not a
--                                               monthly bill; there is nothing
--                                               to annualise against)
--     unit === 'month'  ->  bill*12 - twelveMonthCost
--
-- So for an `abroad` row, 'month' vs 'package' is the difference between ₪0 and
-- a four-figure headline. A ₪29 per-package eSIM scored against a ₪90 monthly
-- bill claims **₪732/yr** that the customer will never see.
--
-- Every guard in the stack accepts a defaulted row, because 'month' is a
-- perfectly legal value:
--   • NOT NULL          — satisfied, the default filled it in
--   • the CHECK         — satisfied, 'month' is in the allowed set
--   • VALID_PRICE_UNITS — satisfied (site/build.js:329, web/lib/live-catalogue.ts)
--   • the `undefined`/empty-unit fallbacks in recommend.ts / switch-kit.ts /
--     scoring.ts — never fire, because nothing is missing
--
-- That last point is the reason this migration exists. Those code-level
-- fallbacks resolve an ABSENT unit to a per-package default for abroad. They
-- are the right defence at the right boundary, but they are structurally unable
-- to catch this: the schema erases the "absent" signal before any of them sees
-- the row. You cannot defend in code against a database that answers a question
-- nobody asked.
--
-- Is it live today? No — and this is deliberately a trap-closing change, not a
-- bug fix:
--   • all 120 rows in `plans` carry an explicit, correct unit
--     (abroad: 4 month / 3 package / 3 day / 1 minute; every other category is
--     100% 'month')
--   • the only programmatic writer, tool/export_plans.dart (INSERT-ONLY upsert
--     via planToRow), always sends a resolved unit — lib/models.dart:291
--     `String get unit => priceUnit ?? (cat == 'abroad' ? 'package' : 'month')`
--     — pinned by test/data_test.dart:530-538.
--
-- So the default has never once been exercised. It fires only on a hand-written
-- INSERT (SQL console, a CSV import, a future admin form) that omits the
-- column — precisely the path with no code review and no test, and precisely
-- the path a new abroad package would arrive on.
--
-- The fix is to delete the guess. With no default, an INSERT that omits
-- price_unit fails loudly on NOT NULL instead of silently choosing the one
-- value that is both wrong and expensive. Nothing legitimate breaks: the sole
-- writer already names the column in every row it sends.
--
-- A CHECK cannot substitute for this. `abroad` has four legitimately monthly
-- plans, so no constraint can tell "deliberately monthly" from "defaulted to
-- monthly" after the fact — the distinction only exists at INSERT time, which
-- is exactly where dropping the default puts it.
--
-- Reversible in one statement:
--   alter table public.plans alter column price_unit set default 'month';
-- ─────────────────────────────────────────────────────────────────────────────

-- Safety net: fail the migration rather than "fix" anything if the assumption
-- above stopped holding. This must report 0 before the ALTER runs.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.plans
  where price_unit is null or trim(price_unit) = '';

  if v_bad > 0 then
    raise exception
      'plans-price-unit-no-default: % row(s) have a null/blank price_unit; set them explicitly before dropping the default',
      v_bad;
  end if;
end $$;

alter table public.plans alter column price_unit drop default;

comment on column public.plans.price_unit is
  'month | package | day | minute. NOT NULL and deliberately WITHOUT a default: '
  'the whole savings stack multiplies a price by twelve only when this is '
  'month, so guessing it silently converts a per-package abroad plan into a '
  'four-figure annual saving that does not exist. Every INSERT must state it. '
  'See supabase/plans-price-unit-no-default-2026-07.sql.';

-- Verify (expect: column_default is null, and the row counts are unchanged):
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'plans'
--      and column_name = 'price_unit';
--
--   select category, price_unit, count(*)
--     from public.plans group by 1, 2 order by 1, 2;
--
-- And prove the trap is shut (expect: ERROR, null value violates not-null):
--   begin;
--     insert into public.plans (id, provider, category, title, price)
--     values ('_probe', 'probe', 'abroad', 'probe', 29);
--   rollback;
