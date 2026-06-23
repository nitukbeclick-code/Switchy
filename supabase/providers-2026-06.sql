-- Providers (ספקים) entity (2026-06).
--
-- Until now the app/site carried providers only implicitly — as the `provider`
-- text column on every plan (public.plans) and as the per-carrier brand tuples
-- in lib/data.dart. There was no first-class provider row to hang a logo,
-- rating, summary, or curation flag (featured / editor's choice) off of. This
-- migration adds public.providers as that single source of truth, seeded from
-- the distinct providers found in site/data/plans.json.
--
-- READ MODEL: the provider directory is PUBLIC (the site's /compare and the app's
-- Provider screen render it), so anon + authenticated may SELECT. Writes are
-- service_role only (the owner curates rating/featured/editor_choice out of band,
-- via the dashboard / an admin tool) — there is NO client insert/update/delete
-- policy, so RLS denies those for anon/authenticated by default.
--
-- GRANTS: this project's default privileges do NOT grant to service_role (see
-- schema.sql §grants and analytics-events-2026-06.sql / whatsapp-2026-06.sql for
-- the same documented gap), so the service_role grant is spelled out explicitly
-- below alongside the public SELECT grant.
--
-- CURATION TRANSPARENCY: featured / editor_choice / sponsored all default FALSE.
-- The owner turns them on deliberately, and `methodology_note` is meant to carry
-- the human-readable "why" (kept honest for users — never auto-set).
--
-- Idempotent / re-runnable (create table / add column / policy drop+create are
-- all guarded). Apply manually against the prod project once; do NOT auto-apply.

-- ── public.providers ────────────────────────────────────────────────────────
create table if not exists public.providers (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,                 -- ASCII handle, mirrors plan-id provider tokens (cellcom/partner/…)
  name_he         text,                                 -- display name in Hebrew (סלקום, פרטנר …)
  name_en         text,                                 -- latin name where one exists (Cellcom, Partner …)
  logo_url        text,                                 -- carrier logo (set later; storage / CDN)
  categories      text[] default '{}',                  -- aggregated plan categories: cellular/internet/tv/triple/abroad
  summary         text,                                 -- short factual Hebrew blurb for the provider card
  rating          numeric,                              -- editorial/aggregate star rating (null until set)
  review_count    int default 0,                        -- number of reviews backing `rating`
  featured        boolean default false,                -- owner-curated "featured" placement (transparent, off by default)
  editor_choice   boolean default false,                -- owner-curated "editor's choice" badge (off by default)
  sponsored       boolean default false,                -- paid placement disclosure flag (off by default)
  methodology_note text,                                -- human "why this is featured/ranked" note (kept honest for users)
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on table public.providers is 'Telecom providers (ספקים) directory — one row per carrier; single source of truth for logo/rating/curation. Seeded from site/data/plans.json.';
comment on column public.providers.slug             is 'ASCII handle, stable id used in routes; mirrors the plan-id provider token (cel_cellcom → cellcom).';
comment on column public.providers.categories       is 'Distinct plan categories this provider offers, aggregated from public.plans / plans.json.';
comment on column public.providers.featured         is 'Owner-curated featured placement. Defaults false; set deliberately and transparently.';
comment on column public.providers.editor_choice    is 'Owner-curated "editor''s choice" badge. Defaults false; set deliberately and transparently.';
comment on column public.providers.sponsored        is 'Paid-placement disclosure flag. Defaults false; must be true wherever placement is paid.';
comment on column public.providers.methodology_note is 'Human-readable explanation for featured/editor_choice/ranking — shown to users; never auto-populated.';

alter table public.providers enable row level security;

-- Public read: the provider directory is shown on the site + app.
drop policy if exists "providers public read" on public.providers;
create policy "providers public read" on public.providers
  for select to anon, authenticated using (true);

-- Public SELECT grant + explicit service_role (default privileges do NOT grant
-- to service_role here — see schema.sql §grants). No anon/authenticated write
-- grants: curation is service_role only.
grant select on public.providers to anon, authenticated;
grant all    on public.providers to service_role;

-- ── Seed (UPSERT by slug) ───────────────────────────────────────────────────
-- Distinct providers enumerated from site/data/plans.json, with categories
-- aggregated across each provider's plans and a short factual Hebrew summary.
-- featured / editor_choice stay FALSE (owner sets them later, transparently).
-- ON CONFLICT refreshes the descriptive fields but PRESERVES owner-set curation
-- (featured / editor_choice / sponsored / rating / methodology_note / logo_url
-- are intentionally NOT overwritten on conflict).
insert into public.providers (slug, name_he, name_en, categories, summary) values
  ('cellcom',    'סלקום',        'Cellcom',     '{cellular,internet,tv,triple,abroad}', 'מפעילה סלולרית ותשתית ותיקה; מציעה חבילות סלולר 4G/5G, אינטרנט בסיב אופטי, טלוויזיה וחבילות משולבות, וכן חבילות גלישה לחו"ל.'),
  ('partner',    'פרטנר',        'Partner',     '{cellular,internet,tv,abroad}',        'קבוצת תקשורת ותיקה; מציעה חבילות סלולר 4G/5G, אינטרנט בסיב אופטי, טלוויזיה וחבילות גלישה לחו"ל.'),
  ('pelephone',  'פלאפון',       'Pelephone',   '{cellular,abroad}',                     'מפעילה סלולרית ותיקה; מציעה חבילות סלולר 4G/5G הכוללות מסלולי Travel לחו"ל.'),
  ('golan',      'גולן טלקום',   'Golan Telecom','{cellular,internet,triple,abroad}',    'מפעילה וירטואלית הידועה במחירים משתלמים; מציעה חבילות סלולר 4G/5G, אינטרנט בסיב אופטי, חבילות משולבות וגלישה לחו"ל.'),
  ('hot-mobile', 'הוט מובייל',   'HOT Mobile',  '{cellular,abroad}',                     'הזרוע הסלולרית של HOT; מציעה חבילות סלולר 4G/5G עם נפחי גלישה גבוהים ודקות לחו"ל.'),
  ('xphone',     'Xphone',       'Xphone',      '{cellular,internet}',                   'מפעילה וירטואלית; מציעה חבילות סלולר במחיר קבוע ("לכל החיים") ואינטרנט ביתי בסיב אופטי.'),
  ('rami-levy',  'רמי לוי',      'Rami Levy',   '{cellular}',                            'מפעילה וירטואלית של רשת השיווק; מציעה חבילות סלולר זולות, כולל מסלולי זוג/משפחה ומסלולים כשרים.'),
  ('wecom',      'WeCom',        'WeCom',       '{cellular}',                            'מפעילה וירטואלית; מציעה חבילות סלולר 4G/5G עם eSIM מיידי ומסלול עם גלישה לחו"ל.'),
  ('019-mobile', '019 מובייל',   '019 Mobile',  '{cellular,abroad}',                     'מפעילה וירטואלית; מציעה חבילות סלולר במחיר קבוע, מסלולי דאטה, מסלולים כשרים וחבילות עם דקות לחו"ל.'),
  ('walla',      'וואלה מובייל', 'Walla Mobile','{cellular}',                            'מפעילה וירטואלית; מציעה חבילות סלולר הכוללות שיחות לחו"ל ומסלולי משפחה.'),
  ('bezeq',      'בזק',          'Bezeq',       '{internet}',                            'חברת התשתית הוותיקה; מציעה אינטרנט ביתי בסיב אופטי (bFiber) ובנחושת (VDSL).'),
  ('hot',        'HOT',          'HOT',         '{internet,tv,triple}',                  'חברת כבלים ותשתית; מציעה אינטרנט בסיב אופטי, טלוויזיה וחבילות משולבות.'),
  ('gilat',      'גילת',         'Gilat',       '{internet}',                            'ספקית אינטרנט; מציעה חבילות אינטרנט ביתי.'),
  ('ccc',        'CCC',          'CCC',         '{internet}',                            'ספקית אינטרנט; מציעה חבילות אינטרנט ביתי.'),
  ('sting-tv',   'STING TV',     'STING TV',    '{tv,triple}',                           'שירות טלוויזיה בהזרמה (OTT); מציע חבילות טלוויזיה וחבילות משולבות.'),
  ('yes',        'yes',          'yes',         '{tv,triple}',                           'ספקית טלוויזיה ותיקה; מציעה חבילות טלוויזיה וחבילות משולבות.'),
  ('nexttv',     'NextTV',       'NextTV',      '{tv,triple}',                           'שירות טלוויזיה בהזרמה (OTT); מציע חבילות טלוויזיה וחבילות משולבות.'),
  ('airalo',     'Airalo eSIM',  'Airalo',      '{abroad}',                              'פלטפורמת eSIM גלובלית; מציעה חבילות גלישה לחו"ל לפי יעד.')
on conflict (slug) do update set
  name_he    = excluded.name_he,
  name_en    = excluded.name_en,
  categories = excluded.categories,
  summary    = excluded.summary,
  updated_at = now();

-- ── (Optional) plans curation columns ───────────────────────────────────────
-- Mirror the provider-level curation onto individual plans so a single plan can
-- be featured / picked / hand-ranked independently of its provider. All default
-- to the un-curated state; editor_rank is null until the owner orders a list.
-- public.plans is already publicly readable (schema.sql §grants:
--   grant select on public.plans to anon, authenticated;)
-- so adding columns to it keeps the existing SELECT privilege — no grant change.
alter table public.plans
  add column if not exists featured      boolean default false,
  add column if not exists editor_choice boolean default false,
  add column if not exists editor_rank   int;

comment on column public.plans.featured      is 'Owner-curated featured plan. Defaults false; set deliberately and transparently.';
comment on column public.plans.editor_choice is 'Owner-curated "editor''s choice" plan badge. Defaults false; set deliberately.';
comment on column public.plans.editor_rank   is 'Manual sort order within a curated list (lower = higher); null when not hand-ranked.';
