-- ════════════════════════════════════════════════════════════════════════════
-- SAVINGS-WATCH — Proactive Savings Watcher support (2026-06). DRAFT — do NOT auto-apply.
--
-- Backs the NEW edge function supabase/functions/savings-watch, which proactively
-- alerts a user when a plan they OPTED IN to watch (public.tracked_plans) has a
-- real, grounded saving — either a recorded price DROP for the exact plan
-- (public.plan_price_history) or a catalogue plan that genuinely beats what they
-- pay. Alerts go out as Web Push (public.push_subscriptions) and/or WhatsApp.
--
-- Three additive, idempotent, grant-gap-safe pieces:
--
--   (1) tracked_plans.plan_id ........ link a watched row to the EXACT catalogue
--        plan id, so plan_price_history (keyed by plan_id) can be matched for a
--        real per-plan price-drop signal. Nullable (older rows have no link →
--        the watcher falls back to the catalogue "better plan" signal by category).
--
--   (2) tracked_plans.watch_opt_in ... §30A consent flag. A PROACTIVE saving
--        alert is a marketing message, so it requires PRIOR, EXPLICIT opt-in.
--        default FALSE = no proactive alerts without consent (the safe default).
--        + a partial index so the watcher's "who opted in?" scan stays cheap.
--
--   (3) public.savings_watch_alerts .. a small dedupe ledger: one row per
--        (tracked plan, opportunity) actually alerted, so the same saving is never
--        re-sent to the same user. service_role only; pruned by age.
--
-- COMPLIANCE (Communications Law §30A — the "Spam Law"): the watcher sends a
-- proactive alert ONLY when watch_opt_in = true (this file's consent flag), the
-- contact is NOT on public.marketing_suppression for the channel (marketing-
-- consent-2026-06.sql — the WhatsApp STOP handler writes there), and it is OUTSIDE
-- quiet hours (23:00–08:00 Israel, enforced in the edge fn). This file adds the
-- opt-in + the dedupe ledger; the suppression registry is the separate migration.
--
-- GRANT-GAP RULE (2026-06, documented incident): this project's default
-- privileges do NOT grant to service_role, so every NEW table needs an explicit
-- service_role grant or the edge fn silently 403s. See schema.sql §grants,
-- site-push-notify-2026-06.sql, marketing-consent-2026-06.sql for the same pattern.
--
-- ⚠️  Apply MANUALLY after review (psql / Supabase SQL editor / `supabase db
-- push`). Order-independent vs the other 2026-06 migrations; re-runnable. The edge
-- fn is DEPLOY-SAFE before this runs: the watch_opt_in filter 400s → fetchRows
-- returns null → the whole pass is a logged no-op until the columns exist.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- (1)+(2) tracked_plans — plan_id link + watch_opt_in consent + partial index
-- ════════════════════════════════════════════════════════════════════════════
-- Guarded no-op until public.tracked_plans exists (schema.sql), so this file is
-- safe to apply in any order / in a project that hasn't provisioned it yet.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tracked_plans'
  ) then
    raise notice 'savings-watch: skipping tracked_plans columns (table not present yet)';
    return;
  end if;

  -- Catalogue plan id this row tracks → lets the watcher match a real price drop
  -- in plan_price_history for the EXACT plan. Nullable: older rows fall back to
  -- the category-level "a cheaper catalogue plan exists" signal.
  alter table public.tracked_plans
    add column if not exists plan_id text;

  -- §30A consent: explicit opt-in to PROACTIVE saving alerts. default false →
  -- a tracked plan with no explicit opt-in is, and stays, "no proactive alerts".
  alter table public.tracked_plans
    add column if not exists watch_opt_in boolean not null default false;

  comment on column public.tracked_plans.plan_id is
    'Catalogue plan id (public.plans.id) this watched row tracks. Lets savings-watch match a real per-plan price drop in plan_price_history. Nullable — older rows use the category-level "cheaper plan exists" signal.';
  comment on column public.tracked_plans.watch_opt_in is
    'Spam-Law §30A: explicit opt-in to PROACTIVE saving alerts (price drop / better plan) for this tracked row. Default false — no proactive alert without consent. The savings-watch edge fn only ever fetches rows where this is true.';

  -- Partial index for the watcher's candidate scan: only the opted-in rows.
  create index if not exists tracked_plans_watch_optin_idx
    on public.tracked_plans (user_id)
    where watch_opt_in = true;

  raise notice 'savings-watch: tracked_plans plan_id + watch_opt_in ensured.';
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- (3) savings_watch_alerts — per-(tracked plan, opportunity) dedupe ledger
-- ════════════════════════════════════════════════════════════════════════════
-- One row per proactive saving alert actually delivered. `dedupe_key` is the edge
-- fn's stable id (see lib.ts opportunityDedupeKey):
--   "<trackedId>|<source>|<newPrice>|<tail>"  where tail = the snapshot
--   captured_at for a price_drop, or the catalogue plan id for a better_plan —
-- so a FURTHER drop / a NEW cheaper plan is a distinct, fresh alert. The watcher
-- reads recent keys before a pass and skips any already present.
--
-- service_role ONLY: the edge fn writes; an admin rollup may read. No client
-- access (no policy = deny; belt-and-braces revoke). Pruned by age.
create table if not exists public.savings_watch_alerts (
  id             bigint generated always as identity primary key,
  dedupe_key     text not null unique,            -- "<trackedId>|<source>|<newPrice>|<tail>"
  tracked_id     uuid,                             -- tracked_plans.id (no FK: survive prune/delete)
  user_id        uuid,                             -- auth.users.id the alert went to
  source         text,                             -- 'price_drop' | 'better_plan'
  channels       text,                             -- comma list actually delivered: 'push' / 'whatsapp'
  monthly_saving numeric,                          -- the real ₪/month saving quoted in the alert
  created_at     timestamptz not null default now()
);

comment on table public.savings_watch_alerts is
  'Dedupe ledger for the savings-watch proactive saving alerts: one row per (tracked plan, opportunity) delivered, so the same saving is never re-alerted to the same user. service_role only; written by the savings-watch edge fn. Prune rows older than ~60 days.';
comment on column public.savings_watch_alerts.dedupe_key is
  'Stable per-opportunity key "<trackedId>|<source>|<newPrice>|<tail>". UNIQUE so a concurrent run cannot double-insert.';
comment on column public.savings_watch_alerts.channels is
  'Which channels actually delivered this alert (comma list): push / whatsapp.';

create index if not exists savings_watch_alerts_created_idx
  on public.savings_watch_alerts (created_at desc);

alter table public.savings_watch_alerts enable row level security;

-- Deny-all to clients (no policy = no client access); belt-and-braces revoke.
revoke all on public.savings_watch_alerts from anon, authenticated;

-- Grant-gap: explicit service_role grant (the edge fn is the only reader/writer).
grant insert, select, delete on public.savings_watch_alerts to service_role;


-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). It is additive to schema.sql (tracked_plans),
--   plan-price-history-2026-06.sql (the drop signal), agent-platform-2026-06.sql
--   (push_subscriptions), and marketing-consent-2026-06.sql (the suppression
--   registry the WhatsApp STOP handler writes). Order-independent; re-runnable.
-- • The watcher reuses the deal-feed's VAPID keys for Web Push (env/Vault):
--     VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
--   and WHATSAPP_TOKEN (+ WHATSAPP_PHONE_ID) for the WhatsApp channel. Each is
--   independent — with only one set, the watcher uses just that channel; with
--   neither, a real run returns 503 (a dry run still works and sends nothing).
-- • Schedule from pg_cron (authenticated with the shared x-webhook-secret), e.g.
--   a few times a day OUTSIDE 23:00–08:00 Israel; the fn also self-enforces quiet
--   hours. Dry-run a pass first:  POST {"dryRun": true}  to see opportunity /
--   candidate counts without sending.
-- • Retention: prune savings_watch_alerts older than 60 days, e.g. piggyback on a
--   weekly job:
--     delete from public.savings_watch_alerts where created_at < now() - interval '60 days';
-- • §30A: a proactive alert is sent ONLY to watch_opt_in = true rows whose contact
--   is NOT on marketing_suppression for the channel, and never during quiet hours.
--   The WhatsApp STOP handler (whatsapp-webhook) inserts the opt-out; the watcher
--   left-anti-joins against it before every WhatsApp send.
