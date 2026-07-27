-- ─────────────────────────────────────────────────────────────────────────────
-- community-channel-normalise-2026-07.sql  (2026-07-27)  — DATA REPAIR.
--
-- Un-partitions the community. community_posts.channel is a plain TEXT column —
-- the Hebrew label IS the key, nothing constrains it, and every surface filters it
-- with an exact string compare. The abroad channel shipped THREE ways:
--
--     'חו״ל'   U+05D7 U+05D5 U+05F4 U+05DC   gershayim   ← CANONICAL
--     'חו"ל'   U+05D7 U+05D5 U+0022 U+05DC   ASCII quote
--     'חול'    U+05D7 U+05D5 U+05DC          no punctuation
--
-- They render nearly identically in Hebrew and none of them compares equal, so a
-- post written by one client was INVISIBLE inside the other client's channel.
-- Nothing errored — the feed simply said "אין עדיין פוסטים בערוץ הזה".
--
-- The canonical list lives in shared/community-channels.json (mirroring
-- web/lib/community.ts CHANNELS) and is pinned codepoint-for-codepoint by
-- web/lib/__tests__/community-channels.test.ts. This file brings the STORED rows
-- onto that list; the client-side folds (site/script.js normChannel) stay as
-- defence-in-depth for anything written before this runs.
--
-- ⚠️ NO CI APPLIES THIS FILE — run it by hand in the Supabase SQL editor.
-- Safe to run repeatedly: the UPDATE is a fixed-point (the second run matches
-- zero rows), and it only ever REWRITES a variant onto a canonical value that
-- already existed in the list. It invents no rows and deletes none.
--
-- Apply as MCP migration: community_channel_normalise_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 0 (READ-ONLY): what is actually in the column right now? ─────────────
-- Run this FIRST and keep the output — it is the before-picture, and the only
-- record of how many rows step 2 is about to touch. Anything listed here that is
-- NOT one of the 7 canonical channels is drift.
select
  channel,
  count(*) as posts,
  -- the exact codepoints, so two visually identical rows are told apart
  (select string_agg('U+' || upper(lpad(to_hex(ascii(ch)), 4, '0')), ' ')
     from regexp_split_to_table(channel, '') as ch) as codepoints,
  channel in (
    'המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו״ל', 'חבילה משולבת', 'עזרה בניתוק'
  ) as is_canonical
from public.community_posts
group by channel
order by is_canonical, posts desc;

-- ── Step 1: why this UPDATE is allowed to change `channel` at all ─────────────
-- community_posts has a BEFORE UPDATE guard (community-posts-update-guard-2026-07)
-- whose whole job is to force `channel` back to its old value:
--     new.channel := old.channel;
-- It bails out early for a service-role / SQL-editor session:
--     if auth.uid() is null then return new; end if;
-- so this migration passes straight through, while an ordinary member still cannot
-- move their post between channels. DO NOT run this from a client holding an
-- end-user JWT — the guard would silently revert every row and the UPDATE would
-- report success having changed nothing.
-- No other trigger fires: the rate limit is BEFORE INSERT, and the moderation and
-- notify triggers are scoped to `body` / `is_pinned`.

-- ── Step 2: the repair ────────────────────────────────────────────────────────
-- Exact whole-value matches only — never a substring rewrite. 'חול' is a real
-- Hebrew word (and a substring of ordinary words like "יחולו"), so it is
-- normalised ONLY when it is the entire channel value.
update public.community_posts
   set channel = 'חו״ל'                       -- U+05D7 U+05D5 U+05F4 U+05DC
 where channel in (
         'חו"ל',                              -- U+05D7 U+05D5 U+0022 U+05DC
         'חול'                                -- U+05D7 U+05D5 U+05DC
       )
   and channel <> 'חו״ל';                     -- idempotent: no-op on a clean table

-- Stray leading/trailing whitespace is the other way an exact compare fails
-- invisibly. Only trims rows that land ON a canonical channel once trimmed, so a
-- genuinely unknown value is left alone for a human to look at rather than being
-- quietly reshaped.
update public.community_posts
   set channel = btrim(channel)
 where channel <> btrim(channel)
   and btrim(channel) in (
         'המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו״ל', 'חבילה משולבת', 'עזרה בניתוק'
       );

-- ── Step 3 (READ-ONLY): verify, and surface whatever is still off-list ────────
-- EXPECTED: zero rows. Any row that comes back is drift this migration does not
-- know how to map — investigate it, add the mapping to
-- shared/community-channels.json `legacy_variants` + step 2, and re-run. Do NOT
-- blanket-rewrite an unknown channel onto a canonical one; that would move real
-- posts into a channel their author never chose.
select channel, count(*) as posts
from public.community_posts
where channel not in (
  'המלצות', 'סלולר', 'אינטרנט', 'טלוויזיה', 'חו״ל', 'חבילה משולבת', 'עזרה בניתוק'
)
group by channel
order by posts desc;

-- ── Not done here, on purpose ─────────────────────────────────────────────────
-- A CHECK constraint pinning channel to the canonical 7 would stop this drifting
-- again, and is the right eventual fix. It is deliberately NOT in this file: if
-- step 3 returns anything at all the constraint fails to validate, and adding it
-- blind would start rejecting writes from an app version still in the stores. Add
-- it only once step 3 is clean AND every shipped client writes canonical values:
--
--   alter table public.community_posts
--     add constraint community_posts_channel_canonical
--     check (channel in ('המלצות','סלולר','אינטרנט','טלוויזיה','חו״ל','חבילה משולבת','עזרה בניתוק'))
--     not valid;                    -- `not valid` = guard new writes, keep old rows
--   alter table public.community_posts validate constraint community_posts_channel_canonical;

-- ── Rollback ──────────────────────────────────────────────────────────────────
-- There is no exact rollback: this is a lossy normalisation. Once 'חו"ל' and 'חול'
-- have been folded onto 'חו״ל' the column no longer records which spelling a given
-- row started with, and step 0's output is the ONLY copy of that information — so
-- save it before running step 2.
--
-- Reverting is also not something you want: the pre-state is the bug (posts hidden
-- from their own channel). If a revert is genuinely needed, restore
-- public.community_posts from the point-in-time backup taken before the run, or
-- re-apply the old spelling to the specific post ids captured in step 0:
--
--   update public.community_posts set channel = 'חו"ל' where id in (…);
--
-- Nothing else in this file changes schema, policies, grants or triggers, so there
-- is no DDL to undo.
