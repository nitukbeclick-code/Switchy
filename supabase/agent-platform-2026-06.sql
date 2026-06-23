-- ════════════════════════════════════════════════════════════════════════════
-- AI AGENT PLATFORM — supporting schema (2026-06). DRAFT — do NOT auto-apply.
--
-- Three additive, idempotent, grant-gap-safe pieces that back the shared AI agent
-- core (_shared/agent.ts + tools.ts + scoring.ts):
--
--   (1) public.push_subscriptions ........ Web-Push endpoints so the agent / the
--        deal-feed can notify a browser/PWA when a better deal appears. RLS:
--        a user manages only their own rows; service_role sends. Grant-gap-safe.
--
--   (2) public.agent_tool_calls .......... OPTIONAL deeper audit of agent tool
--        runs (name + ok + a PII-light preview), complementing the crm_events
--        feed the agent already writes. service_role only.
--
--   (3) plan_price_history POPULATION .... a trigger + fn that snapshots a plan's
--        price into the EXISTING public.plan_price_history table (created by
--        plan-price-history-2026-06.sql) WHENEVER public.plans.price changes.
--        This is what makes the deal-feed real: instead of relying on the
--        catalogue-sync to remember to insert daily rows, the DB records every
--        price move as it happens. Idempotent; guarded so it is a no-op until
--        both public.plans and public.plan_price_history exist.
--
-- GRANT-GAP RULE (2026-06, documented incident): this project's default
-- privileges do NOT grant to service_role, so every NEW table/function needs an
-- explicit service_role grant or the edge functions silently 403. See
-- schema.sql §grants, ai-sessions-2026-06.sql, audit-observability-2026-06.sql,
-- plan-price-history-2026-06.sql for the same pattern. Every grant below is
-- therefore spelled out.
--
-- ⚠️  Apply MANUALLY after review (psql / Supabase SQL editor / `supabase db
-- push`). Safe to run before or after plan-price-history-2026-06.sql. Re-runnable.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- (1) push_subscriptions — Web-Push endpoints for the deal-feed / agent nudges
-- ════════════════════════════════════════════════════════════════════════════
-- One row per browser/PWA push subscription. `endpoint` is the unique push URL;
-- p256dh + auth are the Web-Push encryption keys; `categories` is which deal
-- categories the user opted into (cellular/internet/tv/triple/abroad). user_id
-- links to auth.users when the subscriber is signed in (nullable for anon PWA).
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,  -- nullable: anon PWA installs
  endpoint    text not null unique,                               -- the push service URL (unique key)
  p256dh      text not null,                                      -- Web-Push public key (client)
  auth        text not null,                                      -- Web-Push auth secret (client)
  categories  text[] not null default '{}',                       -- opted-in deal categories
  user_agent  text,                                               -- coarse UA for triage
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web-Push subscriptions for the deal-feed / agent nudges. RLS: a signed-in user manages only their own rows; service_role (the push sender) reads all. Anon PWA installs (user_id null) are written by the service_role edge fn only.';
comment on column public.push_subscriptions.endpoint   is 'Unique push service URL (the dedupe key).';
comment on column public.push_subscriptions.categories is 'Deal categories the subscriber opted into: cellular/internet/tv/triple/abroad.';

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_created_idx on public.push_subscriptions (created_at desc);

alter table public.push_subscriptions enable row level security;

-- RLS: a signed-in user sees/manages ONLY their own subscriptions. Anon rows
-- (user_id null) have no client policy → only the service_role writes them.
drop policy if exists "push_subscriptions own select" on public.push_subscriptions;
create policy "push_subscriptions own select" on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "push_subscriptions own insert" on public.push_subscriptions;
create policy "push_subscriptions own insert" on public.push_subscriptions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions own update" on public.push_subscriptions;
create policy "push_subscriptions own update" on public.push_subscriptions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions own delete" on public.push_subscriptions;
create policy "push_subscriptions own delete" on public.push_subscriptions
  for delete to authenticated using (auth.uid() = user_id);

-- Grant-gap: default privileges do NOT grant to service_role here. The push
-- sender (service_role edge fn) reads every subscription and prunes dead ones;
-- it also writes anon PWA installs. authenticated gets the CRUD the RLS narrows.
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- (2) agent_tool_calls — optional deeper audit of agent tool runs
-- ════════════════════════════════════════════════════════════════════════════
-- The agent already appends a crm_events row per tool run (the activity feed).
-- This is a dedicated, longer-retention audit table for analytics on WHICH tools
-- the agent uses, success rates, and per-channel behavior — without bloating the
-- crm_events feed the CRM streams. NO PII beyond a clipped preview + the
-- conversation id. service_role only (the agent writes; an admin rollup reads).
create table if not exists public.agent_tool_calls (
  id              bigint generated always as identity primary key,
  channel         text not null,                  -- whatsapp | site | app
  conversation_id text,                            -- ai_sessions.session_id OR whatsapp_conversations.id
  tool            text not null,                   -- search_plans / recommend_plans / create_lead / …
  ok              boolean not null default false,  -- did the tool succeed
  preview         text,                            -- <=80-char PII-light note (e.g. "cellular×3")
  created_at      timestamptz not null default now()
);

comment on table public.agent_tool_calls is
  'Optional deeper audit of AI-agent tool runs (name + ok + PII-light preview). Complements the crm_events activity feed. service_role only; written by _shared/agent.ts via the edge fn.';

create index if not exists agent_tool_calls_created_idx on public.agent_tool_calls (created_at desc);
create index if not exists agent_tool_calls_tool_idx    on public.agent_tool_calls (tool, created_at desc);

alter table public.agent_tool_calls enable row level security;

-- Deny-all to clients (no policy = no client access); belt-and-braces revoke.
revoke all on public.agent_tool_calls from anon, authenticated;

-- Grant-gap: explicit service_role grant (writer + admin rollup reader).
grant insert, select on public.agent_tool_calls to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- (3) plan_price_history POPULATION — snapshot on every public.plans price move
-- ════════════════════════════════════════════════════════════════════════════
-- The Market-Pulse ledger table (public.plan_price_history) is created by
-- plan-price-history-2026-06.sql. THIS block wires the population path: a trigger
-- on public.plans that inserts a snapshot row whenever a plan's price (or its
-- post-promo `after` price) changes — so price TRENDS become real over time
-- without depending on the catalogue-sync to remember a daily INSERT.
--
-- Fully GUARDED: it is a complete no-op unless BOTH public.plans and
-- public.plan_price_history exist (so this file is safe to apply before either,
-- or in a project where the catalogue lives elsewhere). The trigger fn is
-- SECURITY DEFINER with a pinned search_path and granted to nobody public.
do $$
declare
  has_plans   boolean;
  has_history boolean;
  has_after   boolean;
begin
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plans'
  ) into has_plans;
  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'plan_price_history'
  ) into has_history;

  if not (has_plans and has_history) then
    raise notice 'agent-platform: skipping plan_price_history population (plans=% history=%)', has_plans, has_history;
    return;
  end if;

  -- Does public.plans carry an `after` column (post-promo price)? Some catalogues
  -- only have `after_exact`; we snapshot whichever is present, else null.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'plans' and column_name = 'after'
  ) into has_after;

  -- The snapshot function: insert one ledger row from the NEW plan row. We read
  -- the `after` price defensively via to_jsonb so this compiles whether or not
  -- the column exists (no `after`/`after_exact` → null).
  execute $fn$
    create or replace function public.snapshot_plan_price()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_after numeric;
      v_row   jsonb := to_jsonb(NEW);
    begin
      -- Prefer after_exact, then after, else null — without assuming either exists.
      v_after := coalesce(
        nullif(v_row->>'after_exact','')::numeric,
        nullif(v_row->>'after','')::numeric
      );
      insert into public.plan_price_history (plan_id, category, provider, price, after, captured_at)
      values (
        (v_row->>'id'),
        (v_row->>'category'),
        (v_row->>'provider'),
        NEW.price,
        v_after,
        now()
      );
      return NEW;
    end;
    $body$;
  $fn$;

  -- Lock the fn down: only the trigger (which runs as definer) invokes it.
  revoke all on function public.snapshot_plan_price() from public, anon, authenticated;

  -- Snapshot on INSERT (a brand-new plan → its first snapshot) and on any real
  -- price / after movement. A combined INSERT-OR-UPDATE trigger's WHEN clause may
  -- NOT reference OLD (no OLD on INSERT) and `tg_op` is unavailable in WHEN — so
  -- we SPLIT into two triggers: an unconditional AFTER INSERT, and an AFTER UPDATE
  -- whose WHEN (legally referencing OLD) fires only on a genuine change.
  drop trigger if exists trg_snapshot_plan_price on public.plans;       -- legacy single-trigger name
  drop trigger if exists trg_snapshot_plan_price_ins on public.plans;
  drop trigger if exists trg_snapshot_plan_price_upd on public.plans;
  create trigger trg_snapshot_plan_price_ins
    after insert on public.plans
    for each row execute function public.snapshot_plan_price();
  if has_after then
    execute $tg$
      create trigger trg_snapshot_plan_price_upd
        after update of price, after, after_exact on public.plans
        for each row
        when (
          NEW.price is distinct from OLD.price
          or NEW.after is distinct from OLD.after
          or NEW.after_exact is distinct from OLD.after_exact
        )
        execute function public.snapshot_plan_price();
    $tg$;
  else
    -- No `after` column — watch price (+ after_exact).
    execute $tg$
      create trigger trg_snapshot_plan_price_upd
        after update of price, after_exact on public.plans
        for each row
        when (
          NEW.price is distinct from OLD.price
          or NEW.after_exact is distinct from OLD.after_exact
        )
        execute function public.snapshot_plan_price();
    $tg$;
  end if;

  raise notice 'agent-platform: plan_price_history population trigger installed.';
end $$;


-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). It is additive to plan-price-history-2026-06.sql.
-- • After applying, the FIRST catalogue-sync that touches public.plans.price will
--   begin populating public.plan_price_history automatically. To seed a baseline
--   for plans whose price hasn't moved yet, run once:
--       insert into public.plan_price_history (plan_id, category, provider, price, after, captured_at)
--       select id, category, provider, price,
--              coalesce(after_exact, after) /* whichever your plans table has */,
--              now()
--       from public.plans where price is not null;
--   (drop the column from coalesce() that your plans table doesn't have).
-- • push_subscriptions: the Web-Push SENDER edge fn (service_role) is a separate
--   piece of work; this only provisions the table + RLS + grants.
