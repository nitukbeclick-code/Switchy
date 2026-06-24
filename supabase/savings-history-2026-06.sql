-- ════════════════════════════════════════════════════════════════════════════
-- Realized-savings history + accumulator (2026-06)
--   The DURABLE, per-lead ledger of money a customer ACTUALLY saved, plus the
--   running per-user total. This is the write-side companion to the read-only
--   aggregate get_savings_stats() (wallet-stats-2026-06.sql, already committed):
--   that RPC SUMS public.leads.actual_saving on the fly for the site's social
--   proof; THIS migration persists each realized saving as an immutable event row
--   (public.savings_history) and folds it into a per-user counter
--   (public.profiles.total_savings_realized) so the user's own /wallet can show a
--   stable, attributable history instead of recomputing from the pipeline.
--
-- TRUTH-ONLY / E-E-A-T (ABSOLUTE):
--   • A history row is written ONLY when a lead is genuinely WON and a rep recorded
--     a real, POSITIVE actual_saving (the Telegram won-flow "כמה חסכנו?" reply →
--     notify-lead/callbacks.ts patches leads.actual_saving). Nothing is invented,
--     extrapolated, or pre-seeded. amount = the exact ₪/year the rep recorded.
--   • EXACTLY ONE history row per lead — a hard unique constraint on source_lead_id
--     makes double-counting structurally impossible (an idempotency check, not a
--     hope). Re-running the won-flow, re-firing the trigger, or a status flip-flop
--     can NEVER inflate the user's total.
--   • The per-user counter is incremented by the SAME amount that was just
--     ledgered, in the SAME statement-set as the insert — they cannot drift.
--   • If actual_saving is later CORRECTED (the rep edits the amount on an
--     already-won lead), the ledger row and the counter are adjusted by the DELTA
--     only — never re-added — so the total stays exactly equal to Σ history.amount.
--
-- COMPLIANCE: this is purely an internal accounting ledger. It sends NOTHING to
-- anyone (no marketing, no §30A surface) — it only records value already
-- delivered. No consent / suppression / quiet-hours gate applies to a write here.
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role, so a new table is silently inaccessible (403) until granted
-- explicitly. We grant service_role and deny anon/authenticated outright (mirrors
-- marketing-consent-2026-06.sql / referral-codes-2026-06.sql / whatsapp-2026-06.sql).
-- The owning user may SELECT only their OWN history rows (RLS), so /wallet can read
-- the ledger with the user's own token — never anyone else's.
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`). Idempotent / re-runnable:
-- add-column-if-not-exists, create-table-if-not-exists, create-index-if-not-exists,
-- drop-then-create policy, create-or-replace function, drop-then-create trigger.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Per-user realized-savings accumulator on profiles ──────────────────────
-- Distinct from the pre-existing profiles.total_savings (schema.sql) — that column
-- is a free-form figure the app may set; total_savings_realized is the
-- TRIGGER-OWNED, ledger-backed sum of won-lead actual_saving and must always equal
-- Σ savings_history.amount for that user. default 0 → a user with no realized
-- savings honestly shows ₪0, never a fabricated number.
alter table public.profiles
  add column if not exists total_savings_realized integer not null default 0;

comment on column public.profiles.total_savings_realized is
  'TRIGGER-OWNED running total (₪/year) of REALIZED savings = Σ public.savings_history.amount for this user. Incremented only by leads_realized_saving() when a lead is won with a positive actual_saving. Never set by clients (column not granted to anon/authenticated). Distinct from total_savings (app-set).';

-- ── 2. The savings_history ledger ─────────────────────────────────────────────
-- One immutable row per realized saving. source_lead_id is UNIQUE → the won-flow /
-- trigger can fire any number of times and still produce exactly one row per lead
-- (the no-double-count guarantee lives in this constraint, not in trigger luck).
-- user_id may be NULL: a lead can be won for a customer who never signed in
-- (leads.user_id null) — we still ledger the realized saving for the honest global
-- aggregate, it just isn't attributed to a profile counter.
create table if not exists public.savings_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users(id) on delete set null,  -- owner (nullable: anon-won lead)
  amount         integer not null check (amount > 0),                -- ₪/year realized (exact rep-recorded figure)
  source_lead_id uuid not null references public.leads(id) on delete cascade, -- the won lead this realized saving came from
  category       text,                                              -- plan category if known ('cellular'|'internet'|'tv'|'triple'|'abroad'); NULL = unknown (leads carry no category — never fabricated)
  realized_at    timestamptz not null default now()                 -- when the saving was recorded (won-flow reply time)
);

-- ONE realized-savings row per lead — the structural no-double-count guarantee.
create unique index if not exists savings_history_source_lead_uidx
  on public.savings_history (source_lead_id);

-- Fast "this user's realized-savings history, newest first" for /wallet.
create index if not exists savings_history_user_idx
  on public.savings_history (user_id, realized_at desc);

comment on table  public.savings_history is
  'Immutable ledger of REALIZED customer savings — one row per won lead with a positive actual_saving. source_lead_id is UNIQUE so it can never double-count. Write-side companion to get_savings_stats(). service_role writes; a user may read only their own rows (RLS).';
comment on column public.savings_history.amount         is 'Exact ₪/year the rep recorded via the Telegram won-flow (leads.actual_saving). Always > 0 — a non-positive saving is never ledgered.';
comment on column public.savings_history.source_lead_id is 'The won lead this saving came from. UNIQUE — the per-lead idempotency key that makes double-counting impossible.';
comment on column public.savings_history.category       is 'Plan category if known; NULL otherwise. Leads carry no category column, so the trigger leaves it NULL rather than guessing (truth-only).';

-- ── 3. RLS: owner-read own rows; deny everyone else; service_role grants ───────
-- RLS ON. A signed-in user may SELECT only the rows attributed to them (their own
-- realized-savings history on /wallet). anon and cross-user reads get nothing —
-- this is the user's own financial history. service_role bypasses RLS but STILL
-- needs explicit table grants (grant-gap rule); it does the inserts/updates via
-- the trigger (SECURITY DEFINER) and any future rep tooling.
alter table public.savings_history enable row level security;

revoke all on public.savings_history from anon, authenticated;

drop policy if exists "savings_history_select_own" on public.savings_history;
create policy "savings_history_select_own" on public.savings_history
  for select using (auth.uid() = user_id);

-- Re-grant SELECT to authenticated so the own-row policy can take effect (RLS
-- filters rows, the grant permits the verb). No INSERT/UPDATE/DELETE to clients —
-- the ledger is written only by the trigger (and, later, explicit rep tooling).
grant select on public.savings_history to authenticated;

-- service_role: full read + the writes the trigger performs (insert; update on a
-- corrected amount). No client ever writes here.
grant select, insert, update on public.savings_history to service_role;

-- ── 4. Trigger fn: ledger + accumulate on a won lead with a positive saving ───
-- Fires AFTER UPDATE on public.leads. The won-flow sets status='won' and patches
-- actual_saving in SEPARATE PostgREST writes (notify-lead/callbacks.ts), and a rep
-- can correct the amount later — so we react whenever the row is currently
-- (status='won' AND actual_saving>0) and either of those just changed, and we make
-- the ledger CONVERGE on the current amount rather than blindly add:
--   • no row yet  → INSERT the history row + add the amount to the user counter.
--   • row exists, amount changed → adjust BOTH the row and the counter by the
--     DELTA only (never re-add) so total_savings_realized stays = Σ history.amount.
-- Idempotent: re-firing with an unchanged amount is a no-op. SECURITY DEFINER so
-- it can write savings_history / profiles regardless of the caller's RLS; pinned
-- search_path; wrapped fail-soft so a ledger hiccup never blocks the lead update
-- itself (the won status must still land even if accounting momentarily fails).
create or replace function public.leads_realized_saving()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_amount integer;
  inserted        boolean := false;
begin
  -- Only act on a genuinely-won lead carrying a real, positive saving.
  if new.status is distinct from 'won'
     or new.actual_saving is null
     or new.actual_saving <= 0 then
    return new;
  end if;

  begin
    -- Try to ledger this lead. The unique source_lead_id + ON CONFLICT DO NOTHING
    -- is the per-lead idempotency primitive: only the row that actually INSERTs
    -- comes back via RETURNING, so under any concurrency exactly one transaction
    -- sees inserted=true and may increment — a lost race increments nothing.
    insert into public.savings_history (user_id, amount, source_lead_id, category, realized_at)
    values (new.user_id, new.actual_saving, new.id, null, now())
    on conflict (source_lead_id) do nothing
    returning true into inserted;

    if inserted then
      -- First realized saving for this lead: fold it into the owner's running
      -- total (only if attributed). This branch runs at most once per lead.
      if new.user_id is not null then
        update public.profiles
           set total_savings_realized = total_savings_realized + new.actual_saving
         where id = new.user_id;
      end if;
      return new;
    end if;

    -- A row already exists for this lead — read it to detect a corrected amount.
    select amount into existing_amount
      from public.savings_history
     where source_lead_id = new.id
     for update;

    if existing_amount is distinct from new.actual_saving then
      -- Amount CORRECTED on an already-won lead: move both by the delta only.
      update public.savings_history
         set amount = new.actual_saving, realized_at = now()
       where source_lead_id = new.id;

      if new.user_id is not null then
        update public.profiles
           set total_savings_realized =
                 greatest(0, total_savings_realized + (new.actual_saving - existing_amount))
         where id = new.user_id;
      end if;
    end if;
    -- existing_amount = new.actual_saving → already ledgered at this amount: no-op.

  exception when others then
    -- Accounting must never block the lead's own update (truth over bookkeeping).
    return new;
  end;

  return new;
end;
$$;

-- service_role only — never callable directly by clients.
revoke execute on function public.leads_realized_saving() from public, anon, authenticated;

-- AFTER UPDATE only: the won transition and the saving patch are both UPDATEs (a
-- lead is INSERTed as status='new' with actual_saving nulled by the insert gate,
-- so it can never be born won-with-saving). Narrow the trigger to the two columns
-- that matter so unrelated lead edits (notes, claims, SLA stamps) don't re-run it.
drop trigger if exists leads_realized_saving_after_update on public.leads;
create trigger leads_realized_saving_after_update
  after update of status, actual_saving on public.leads
  for each row execute function public.leads_realized_saving();

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Backfill (optional, one-time, run AFTER reviewing): historical won leads that
--   predate this trigger can be ledgered without double-counting thanks to the
--   unique source_lead_id + ON CONFLICT DO NOTHING:
--     insert into public.savings_history (user_id, amount, source_lead_id, realized_at)
--     select user_id, actual_saving, id, coalesce(contacted_at, created_at)
--       from public.leads
--      where status = 'won' and actual_saving is not null and actual_saving > 0
--     on conflict (source_lead_id) do nothing;
--   Then reconcile the per-user counter to the ledger (idempotent, exact):
--     update public.profiles p
--        set total_savings_realized = coalesce((
--          select sum(sh.amount) from public.savings_history sh
--           where sh.user_id = p.id), 0);
-- • get_savings_stats() (wallet-stats-2026-06.sql) still reads leads.actual_saving
--   directly for the GLOBAL social-proof aggregate; it is unaffected by this table.
--   This ledger powers the PER-USER /wallet history + counter, not the global stat.
-- • No client may write here or to profiles.total_savings_realized — both are
--   trigger/service_role-owned, so the displayed realized total is always genuine.
-- ════════════════════════════════════════════════════════════════════════════
