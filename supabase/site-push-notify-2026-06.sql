-- ════════════════════════════════════════════════════════════════════════════
-- SITE-PUSH-NOTIFY — deal-feed Web Push support (2026-06). DRAFT — do NOT auto-apply.
--
-- Backs the NEW edge function supabase/functions/site-push-notify, which turns
-- REAL price drops (public.plan_price_history) into encrypted Web Push
-- notifications to opted-in browser/PWA subscribers (public.push_subscriptions,
-- created by agent-platform-2026-06.sql).
--
-- Two additive, idempotent, grant-gap-safe pieces:
--
--   (1) push_subscriptions PREFS .......... add opt-out + quiet-hours +
--        last_notified_at columns so a subscriber can mute the feed or silence
--        it overnight (23:00–08:00 Israel, enforced in the edge fn). The base
--        table already carries `categories text[]` (deal-category prefs).
--
--   (2) public.push_deliveries ............ a small dedupe ledger: one row per
--        (subscription, drop) actually delivered, so the same price drop is never
--        pushed to the same browser twice. service_role only; pruned by age.
--
-- GRANT-GAP RULE (2026-06, documented incident): this project's default
-- privileges do NOT grant to service_role, so every NEW table needs an explicit
-- service_role grant or the edge fn silently 403s. See schema.sql §grants,
-- agent-platform-2026-06.sql, plan-price-history-2026-06.sql for the same
-- pattern. The grant below is therefore spelled out.
--
-- ⚠️  Apply MANUALLY after review (psql / Supabase SQL editor / `supabase db
-- push`). Safe to run before or after agent-platform-2026-06.sql. Re-runnable.
-- VAPID keys for the sender are owner-set secrets (env/Vault), NOT in this file.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- (1) push_subscriptions PREFS — opt-out + quiet hours + last-notified
-- ════════════════════════════════════════════════════════════════════════════
-- These are additive columns on the table from agent-platform-2026-06.sql. The
-- whole block is a guarded no-op until that table exists, so this file is safe to
-- apply in any order (or in a project that hasn't provisioned push yet).
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'push_subscriptions'
  ) then
    raise notice 'site-push-notify: skipping prefs (push_subscriptions not present yet)';
    return;
  end if;

  -- Hard mute: the subscriber opted out of the deal feed entirely.
  alter table public.push_subscriptions
    add column if not exists opted_out boolean not null default false;

  -- Silence 23:00–08:00 Israel (the edge fn computes the Israel wall-clock hour,
  -- DST-aware). Default true = respect quiet hours unless the user turns it off.
  alter table public.push_subscriptions
    add column if not exists quiet_hours boolean not null default true;

  -- When we last pushed to this subscription (ops/analytics; the per-drop dedupe
  -- ledger below is the real "don't re-send" guard).
  alter table public.push_subscriptions
    add column if not exists last_notified_at timestamptz;

  comment on column public.push_subscriptions.opted_out is
    'Hard mute: the subscriber opted out of deal-feed push notifications.';
  comment on column public.push_subscriptions.quiet_hours is
    'When true, suppress pushes during 23:00–08:00 Israel time (enforced in the site-push-notify edge fn).';
  comment on column public.push_subscriptions.last_notified_at is
    'Most recent successful push to this subscription (ops/analytics).';

  -- A signed-in subscriber may toggle these via the existing own-row UPDATE
  -- policy (auth.uid() = user_id) created in agent-platform-2026-06.sql — no new
  -- policy needed; the columns are covered by the table-level grant.
  raise notice 'site-push-notify: push_subscriptions prefs columns ensured.';
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- (2) push_deliveries — per-(subscription, drop) dedupe ledger
-- ════════════════════════════════════════════════════════════════════════════
-- One row per price-drop notification actually delivered. `dedupe_key` is the
-- edge fn's stable id `<subId>|<planId>|<dropCapturedAt>`, so a *further* drop on
-- the same plan (new captured_at) is a new, distinct notification. The sender
-- reads recent keys before a fan-out and skips any already present.
--
-- service_role ONLY: the edge fn writes; an admin rollup may read. No client
-- access (no policy = deny; belt-and-braces revoke). Pruned by age.
create table if not exists public.push_deliveries (
  id              bigint generated always as identity primary key,
  dedupe_key      text not null unique,                 -- "<subId>|<planId>|<capturedAt>"
  subscription_id uuid,                                  -- push_subscriptions.id (no FK: survive prune)
  plan_id         text,                                  -- catalogue plan id the drop is for
  created_at      timestamptz not null default now()
);

comment on table public.push_deliveries is
  'Dedupe ledger for the deal-feed Web Push sender: one row per (subscription, price-drop) delivered, so the same drop is never pushed to the same browser twice. service_role only; written by the site-push-notify edge fn. Prune rows older than ~30 days.';
comment on column public.push_deliveries.dedupe_key is
  'Stable per-notification key "<subId>|<planId>|<dropCapturedAt>". UNIQUE so a concurrent run cannot double-insert.';

create index if not exists push_deliveries_created_idx on public.push_deliveries (created_at desc);

alter table public.push_deliveries enable row level security;

-- Deny-all to clients (no policy = no client access); belt-and-braces revoke.
revoke all on public.push_deliveries from anon, authenticated;

-- Grant-gap: explicit service_role grant (the edge fn is the only reader/writer).
grant insert, select, delete on public.push_deliveries to service_role;


-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). It is additive to agent-platform-2026-06.sql
--   (which creates public.push_subscriptions) and plan-price-history-2026-06.sql
--   (which the deal-feed reads). Order-independent; re-runnable.
-- • VAPID keys are NOT here. Set them as edge-fn secrets the sender reads:
--     VAPID_PUBLIC_KEY   = base64url of the 65-byte uncompressed P-256 point
--     VAPID_PRIVATE_KEY  = base64url of the 32-byte private scalar
--     VAPID_SUBJECT      = mailto:hello@switchy-ai.com  (or an https: contact)
--   Generate once with the standard web-push tooling; the PUBLIC key is also the
--   `applicationServerKey` the browser registers with. Until both keys are set
--   the sender fail-soft returns 503 "web push not configured" and sends nothing.
-- • Schedule the sender from pg_cron (authenticated with the shared
--   x-webhook-secret), e.g. a few times a day OUTSIDE quiet hours; the fn also
--   self-enforces per-subscription quiet hours. Dry-run a pass with
--   POST {"dryRun": true} to see drop/candidate counts without sending.
-- • Retention: prune push_deliveries older than 30 days, e.g. piggyback on the
--   weekly job:  delete from public.push_deliveries where created_at < now() - interval '30 days';
