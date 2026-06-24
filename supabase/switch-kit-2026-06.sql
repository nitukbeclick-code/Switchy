-- ════════════════════════════════════════════════════════════════════════════
-- SWITCH-KIT — Switch Autopilot progress tracker (2026-06). DRAFT — do NOT auto-apply.
--
-- Backs the Switch Autopilot (PILLAR 1): the agent tool generate_switch_kit
-- (_shared/tools.ts → _shared/switch.ts buildSwitchKit) builds a complete, honest
-- switch package (cancellation letter to review + portability checklist + steps +
-- key-dates) for a user moving FROM their current provider TO a REAL catalogue
-- plan. THIS table lets a signed-in user PERSIST their progress through that
-- switch — which steps they've completed — so the app/site tracker can resume it.
--
-- ONE additive, idempotent, grant-gap-safe piece:
--
--   public.switch_progress ... one row per (user, switch attempt). `steps` is a
--      jsonb map of { stepKey: 'todo' | 'in_progress' | 'done' } mirroring the
--      SwitchStep.key values from _shared/switch.ts (check_terms, compare_-
--      alternatives, porting, written_notice, equipment_final_bill). `status` is
--      the overall lifecycle ('active' | 'done' | 'abandoned'). The user OWNS the
--      row (RLS own-row select/insert/update); service_role may read/write for
--      support tooling.
--
-- TRUTH-ONLY / E-E-A-T: this table stores the USER'S OWN switch progress only — no
-- fabricated state. The kit content itself (letter/steps) is built at read time by
-- the pure switch.ts from REAL catalogue/provider data; we persist only WHICH step
-- the user has reached. The cancellation letter is NEVER auto-sent — the user
-- reviews + sends it themselves (the edge tool sets autoSent:false). Nothing here
-- is a marketing surface, so NO §30A consent path is involved (user-PULL only).
--
-- COMPLIANCE: switch_progress is the user's OWN data → RLS own-row, exactly like
-- public.savings_history (savings-history-2026-06.sql) and push_subscriptions
-- (agent-platform-2026-06.sql). No proactive send; no contactable lead captured.
--
-- GRANT-GAP RULE (2026-06, documented incident): this project's default privileges
-- do NOT grant to service_role, so every NEW table needs an EXPLICIT service_role
-- grant or an edge fn silently 403s. We also re-grant the verbs to authenticated so
-- the own-row RLS can take effect (RLS filters rows; the grant permits the verb).
-- See schema.sql §grants, savings-watch-2026-06.sql, agent-platform-2026-06.sql.
--
-- ⚠️  Apply MANUALLY after review (psql / Supabase SQL editor / `supabase db push`).
-- Order-independent vs the other 2026-06 migrations; fully re-runnable
-- (create-if-not-exists table, drop-then-create policies, create-or-replace fn,
-- drop-then-create trigger). The edge tool is DEPLOY-SAFE before this runs: it
-- builds + returns the kit in-memory and only the (optional) persistence call would
-- 404 until the table exists.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- public.switch_progress — per-user switch attempt + per-step progress
-- ════════════════════════════════════════════════════════════════════════════
create table if not exists public.switch_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  from_provider text not null,                              -- the provider being left (real, normalized)
  to_plan_id    text,                                       -- target catalogue plan id (public.plans.id); nullable
  status        text not null default 'active'
                  check (status in ('active', 'done', 'abandoned')),
  steps         jsonb not null default '{}'::jsonb,         -- { stepKey: 'todo'|'in_progress'|'done' }
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.switch_progress is
  'Switch Autopilot progress tracker: one row per (user, switch attempt). Persists WHICH steps the user has completed on their way from from_provider to to_plan_id. The kit content (cancellation letter / checklist / steps) is rebuilt at read time by the pure _shared/switch.ts from REAL catalogue data — this table stores only the user-advanced progress. RLS own-row; the user owns it. The cancellation letter is never auto-sent (user reviews + sends). No marketing surface → no §30A consent.';
comment on column public.switch_progress.from_provider is
  'The provider the user is switching away from (real, caller-normalized name).';
comment on column public.switch_progress.to_plan_id is
  'Target catalogue plan id (public.plans.id) the user is switching to. Nullable (no FK — survives a catalogue row prune). The kit is rebuilt from the live plan at read time.';
comment on column public.switch_progress.status is
  'Overall lifecycle of this switch attempt: active | done | abandoned.';
comment on column public.switch_progress.steps is
  'jsonb map { stepKey: state } mirroring SwitchStep.key in _shared/switch.ts (check_terms / compare_alternatives / porting / written_notice / equipment_final_bill). Each state is one of todo | in_progress | done.';

-- One ACTIVE switch attempt per (user, from_provider, target) — keeps a user from
-- accumulating duplicate active trackers for the same move. Partial unique index so
-- a finished/abandoned attempt does NOT block starting a fresh one later.
create unique index if not exists switch_progress_active_uq
  on public.switch_progress (user_id, from_provider, coalesce(to_plan_id, ''))
  where status = 'active';

create index if not exists switch_progress_user_idx
  on public.switch_progress (user_id, updated_at desc);

alter table public.switch_progress enable row level security;

-- ── RLS: own-row only ─────────────────────────────────────────────────────────
-- A signed-in user reads/creates/updates ONLY their own switch progress. No client
-- DELETE policy (abandon via status='abandoned'); the service_role can hard-delete.
drop policy if exists "switch_progress own select" on public.switch_progress;
create policy "switch_progress own select" on public.switch_progress
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "switch_progress own insert" on public.switch_progress;
create policy "switch_progress own insert" on public.switch_progress
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "switch_progress own update" on public.switch_progress;
create policy "switch_progress own update" on public.switch_progress
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Re-grant the verbs to authenticated so the own-row RLS can take effect (RLS
-- filters rows; the grant permits the verb). No DELETE to clients (abandon via
-- status). Grant-gap: explicit service_role grant (support tooling / hard-delete).
grant select, insert, update on public.switch_progress to authenticated;
grant all on public.switch_progress to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- updated_at touch trigger — keep updated_at fresh on every row change
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER + a pinned empty search_path (function-search-path-2026-06.sql
-- hygiene): the trigger fn references only the NEW record, no catalog lookups.
create or replace function public.touch_switch_progress_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_switch_progress_updated_at() is
  'BEFORE UPDATE trigger fn for public.switch_progress: stamps updated_at = now() on every change. SECURITY DEFINER with an empty search_path (no catalog access needed).';

-- Lock the fn down: only the trigger invokes it (no direct client/exec rights).
revoke all on function public.touch_switch_progress_updated_at() from public, anon, authenticated;

drop trigger if exists trg_touch_switch_progress on public.switch_progress;
create trigger trg_touch_switch_progress
  before update on public.switch_progress
  for each row execute function public.touch_switch_progress_updated_at();


-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). It is additive and standalone — it depends only
--   on auth.users (always present) and on gen_random_uuid() (pgcrypto, enabled in
--   schema.sql). Order-independent vs the other 2026-06 migrations; re-runnable.
-- • The `steps` jsonb keys MUST stay in lockstep with SwitchStep.key in
--   _shared/switch.ts (check_terms / compare_alternatives / porting /
--   written_notice / equipment_final_bill). If a step key changes there, an old
--   row's stale key is simply ignored on rebuild (the kit rebuilds the canonical
--   step list; persisted unknown keys are harmless).
-- • This is the user's OWN data (RLS own-row). The cancellation letter is NEVER
--   auto-sent — the Switch Autopilot tool returns autoSent:false and the user
--   reviews + sends it via the provider's official channels. No §30A path here.
-- • Optional retention: prune long-abandoned trackers, e.g.
--     delete from public.switch_progress
--      where status = 'abandoned' and updated_at < now() - interval '180 days';
