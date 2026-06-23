-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING (2026-06). DRAFT — do NOT auto-apply.
--
-- Defence-in-depth over the audit/observability + agent-platform + push surfaces
-- that already exist (audit-observability-2026-06.sql, agent-platform-2026-06.sql,
-- site-push-notify-2026-06.sql). It adds NO new tables and grants NO new client
-- access — it only *narrows* what already-trusted writers can put in, and adds a
-- retention sweep for the audit trail. Four additive, idempotent, grant-gap-safe
-- pieces:
--
--   (1) public.security_audit_log .... bound the `detail` jsonb (object-shape +
--        a serialized-size ceiling) and the `event` length, so a buggy/abusive
--        edge-fn writer can never balloon a row or smuggle a giant blob into the
--        Reg.13 trail. CHECKs are added NOT VALID first, then VALIDATEd, so the
--        statement never long-locks an existing (large) table.
--
--   (2) public.agent_tool_calls ...... bound `preview` (<=120 chars; code already
--        clips to 80 — this is the DB backstop), plus light bounds on `channel`,
--        `tool`, `conversation_id`. Same NOT VALID → VALIDATE staging.
--
--   (3) public.push_subscriptions .... ensure a SAFE UPSERT posture: a UNIQUE
--        constraint on `endpoint` (so `on conflict (endpoint)` is well-defined and
--        a re-subscribe re-points the SAME row instead of duplicating), an
--        updated_at touch trigger, and bounds on the Web-Push key/UA fields so a
--        client can't store oversized junk through its own-row RLS.
--
--   (4) public.purge_security_audit_log(p_days) .... retention sweep that deletes
--        security_audit_log rows older than p_days (default 180), writes ONE
--        counts-only row recording the sweep, and returns the delete count.
--        SECURITY DEFINER, service_role only, pinned search_path. A pg_cron
--        schedule is DRAFTED BELOW BUT COMMENTED OUT — it is NOT auto-scheduled;
--        the owner enables it deliberately (it would otherwise start trimming the
--        legal audit trail the moment this file is applied).
--
-- GRANT-GAP RULE (2026-06, documented incident): this project's default
-- privileges do NOT grant to service_role, so every NEW function needs an explicit
-- service_role grant or the edge fns silently 403. See schema.sql §grants,
-- audit-observability-2026-06.sql, agent-platform-2026-06.sql for the same
-- pattern. The grant on the new function below is therefore spelled out.
--
-- EVERY block is GUARDED on the target object existing, so this file is safe to
-- apply in ANY order relative to the files it hardens, and is fully re-runnable.
--
-- ⚠️  Apply MANUALLY after review (psql / Supabase SQL editor / `supabase db
-- push`). Nothing here is destructive: it adds constraints (validated against
-- existing rows — see the note at the end if a legacy row violates a bound),
-- one trigger, and one function. It does NOT drop data or loosen any grant.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- (1) security_audit_log — bound detail (shape + size) and event length
-- ════════════════════════════════════════════════════════════════════════════
-- Canonical shape (legal-consent-2026-06.sql / audit-observability-2026-06.sql):
--   (id, user_id, event text, detail jsonb default '{}', ip inet, created_at).
-- The `detail` column is meant to hold a small, PII-light object (actor + entity
-- ids + a clipped preview). These CHECKs make "small object" enforceable:
--   • detail must be a JSON OBJECT (not an array/scalar/string) — keeps the shape
--     the readers expect and blocks a giant top-level string/array.
--   • the serialized detail must be <= 8 KB — a generous ceiling for legitimate
--     audit context that still caps a runaway/abusive writer.
--   • event must be 1..160 chars — a label, never a payload.
-- Added NOT VALID then VALIDATEd separately so the ADD takes only a short lock and
-- the (potentially large) full-table scan happens under a gentler ShareUpdate lock.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'security_audit_log'
  ) then
    raise notice 'security-hardening: skipping security_audit_log bounds (table not present yet)';
    return;
  end if;

  -- detail must be a JSON object.
  if not exists (
    select 1 from pg_constraint
    where conname = 'security_audit_log_detail_is_object'
      and conrelid = 'public.security_audit_log'::regclass
  ) then
    alter table public.security_audit_log
      add constraint security_audit_log_detail_is_object
      check (jsonb_typeof(detail) = 'object') not valid;
  end if;

  -- detail serialized size ceiling (~8 KB of JSON text).
  if not exists (
    select 1 from pg_constraint
    where conname = 'security_audit_log_detail_size'
      and conrelid = 'public.security_audit_log'::regclass
  ) then
    alter table public.security_audit_log
      add constraint security_audit_log_detail_size
      check (octet_length(detail::text) <= 8192) not valid;
  end if;

  -- event is a label, not a payload.
  if not exists (
    select 1 from pg_constraint
    where conname = 'security_audit_log_event_len'
      and conrelid = 'public.security_audit_log'::regclass
  ) then
    alter table public.security_audit_log
      add constraint security_audit_log_event_len
      check (char_length(event) between 1 and 160) not valid;
  end if;

  -- VALIDATE separately (no-op if already validated; gentle lock). Wrapped so a
  -- single legacy violating row surfaces a clear notice instead of aborting the
  -- whole file — the constraint stays NOT VALID and still enforces NEW rows.
  begin
    alter table public.security_audit_log validate constraint security_audit_log_detail_is_object;
  exception when check_violation then
    raise notice 'security-hardening: security_audit_log_detail_is_object left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.security_audit_log validate constraint security_audit_log_detail_size;
  exception when check_violation then
    raise notice 'security-hardening: security_audit_log_detail_size left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.security_audit_log validate constraint security_audit_log_event_len;
  exception when check_violation then
    raise notice 'security-hardening: security_audit_log_event_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;

  raise notice 'security-hardening: security_audit_log bounds ensured.';
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- (2) agent_tool_calls — bound preview + the small label columns
-- ════════════════════════════════════════════════════════════════════════════
-- The agent clips preview to 80 chars in code (_shared/agent.ts:
-- res.note?.slice(0, 80)). This is the DB backstop should a future writer forget.
-- channel is a tiny enum-like label; tool is an identifier; conversation_id is an
-- id/uuid string. All get sane ceilings. Same NOT VALID → VALIDATE staging.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'agent_tool_calls'
  ) then
    raise notice 'security-hardening: skipping agent_tool_calls bounds (table not present yet)';
    return;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tool_calls_preview_len'
      and conrelid = 'public.agent_tool_calls'::regclass
  ) then
    alter table public.agent_tool_calls
      add constraint agent_tool_calls_preview_len
      check (preview is null or char_length(preview) <= 120) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tool_calls_channel_len'
      and conrelid = 'public.agent_tool_calls'::regclass
  ) then
    alter table public.agent_tool_calls
      add constraint agent_tool_calls_channel_len
      check (char_length(channel) between 1 and 32) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tool_calls_tool_len'
      and conrelid = 'public.agent_tool_calls'::regclass
  ) then
    alter table public.agent_tool_calls
      add constraint agent_tool_calls_tool_len
      check (char_length(tool) between 1 and 64) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_tool_calls_conversation_len'
      and conrelid = 'public.agent_tool_calls'::regclass
  ) then
    alter table public.agent_tool_calls
      add constraint agent_tool_calls_conversation_len
      check (conversation_id is null or char_length(conversation_id) <= 128) not valid;
  end if;

  begin
    alter table public.agent_tool_calls validate constraint agent_tool_calls_preview_len;
  exception when check_violation then
    raise notice 'security-hardening: agent_tool_calls_preview_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.agent_tool_calls validate constraint agent_tool_calls_channel_len;
  exception when check_violation then
    raise notice 'security-hardening: agent_tool_calls_channel_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.agent_tool_calls validate constraint agent_tool_calls_tool_len;
  exception when check_violation then
    raise notice 'security-hardening: agent_tool_calls_tool_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.agent_tool_calls validate constraint agent_tool_calls_conversation_len;
  exception when check_violation then
    raise notice 'security-hardening: agent_tool_calls_conversation_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;

  raise notice 'security-hardening: agent_tool_calls bounds ensured.';
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- (3) push_subscriptions — safe UPSERT posture + bounded client-writable fields
-- ════════════════════════════════════════════════════════════════════════════
-- The base table (agent-platform-2026-06.sql) declares `endpoint text not null
-- unique` inline, which already gives a UNIQUE index. This block makes that UPSERT
-- posture EXPLICIT and ROBUST regardless of how the base table was created:
--   • guarantee a UNIQUE constraint/index on (endpoint) so `insert ... on conflict
--     (endpoint) do update` is always well-defined → a re-subscribe re-points the
--     SAME row (keeps prefs/categories) instead of duplicating or erroring.
--   • an updated_at touch trigger so every upsert/update stamps updated_at.
--   • bounds on the client-writable fields (endpoint / p256dh / auth / user_agent
--     / categories) so a signed-in user can't store oversized junk via own-row RLS.
do $$
declare
  has_unique boolean;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'push_subscriptions'
  ) then
    raise notice 'security-hardening: skipping push_subscriptions hardening (table not present yet)';
    return;
  end if;

  -- (3a) Ensure (endpoint) is UNIQUE so on-conflict upsert is well-defined.
  -- True if ANY unique constraint OR unique index covers exactly (endpoint).
  select exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where c.relname = 'push_subscriptions'
      and n.nspname = 'public'
      and i.indisunique
      and i.indnatts = 1
      and (i.indkey::int2[])[0] = (
        select attnum from pg_attribute
        where attrelid = 'public.push_subscriptions'::regclass
          and attname = 'endpoint'
      )
  ) into has_unique;

  if not has_unique then
    -- Use a plain unique index (idempotent name) so on-conflict (endpoint) works
    -- even on a table created without the inline UNIQUE.
    create unique index if not exists push_subscriptions_endpoint_key
      on public.push_subscriptions (endpoint);
    raise notice 'security-hardening: added UNIQUE(endpoint) on push_subscriptions for safe upsert.';
  end if;

  -- (3b) updated_at touch trigger (set-returning function is locked down).
  create or replace function public.touch_push_subscriptions_updated_at()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $body$
  begin
    NEW.updated_at := now();
    return NEW;
  end;
  $body$;
  revoke all on function public.touch_push_subscriptions_updated_at() from public, anon, authenticated;

  drop trigger if exists trg_push_subscriptions_touch on public.push_subscriptions;
  create trigger trg_push_subscriptions_touch
    before update on public.push_subscriptions
    for each row execute function public.touch_push_subscriptions_updated_at();

  -- (3c) Bound the client-writable fields (defence behind own-row RLS).
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_endpoint_len'
      and conrelid = 'public.push_subscriptions'::regclass
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_endpoint_len
      check (char_length(endpoint) between 1 and 2048) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_keys_len'
      and conrelid = 'public.push_subscriptions'::regclass
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_keys_len
      check (char_length(p256dh) <= 256 and char_length(auth) <= 256) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_ua_len'
      and conrelid = 'public.push_subscriptions'::regclass
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_ua_len
      check (user_agent is null or char_length(user_agent) <= 512) not valid;
  end if;

  -- categories is a small opt-in set (cellular/internet/tv/triple/abroad); cap the
  -- array length so a client can't push a huge array through its own-row policy.
  if not exists (
    select 1 from pg_constraint
    where conname = 'push_subscriptions_categories_card'
      and conrelid = 'public.push_subscriptions'::regclass
  ) then
    alter table public.push_subscriptions
      add constraint push_subscriptions_categories_card
      check (cardinality(categories) <= 16) not valid;
  end if;

  begin
    alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_len;
  exception when check_violation then
    raise notice 'security-hardening: push_subscriptions_endpoint_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.push_subscriptions validate constraint push_subscriptions_keys_len;
  exception when check_violation then
    raise notice 'security-hardening: push_subscriptions_keys_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.push_subscriptions validate constraint push_subscriptions_ua_len;
  exception when check_violation then
    raise notice 'security-hardening: push_subscriptions_ua_len left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;
  begin
    alter table public.push_subscriptions validate constraint push_subscriptions_categories_card;
  exception when check_violation then
    raise notice 'security-hardening: push_subscriptions_categories_card left NOT VALID (a legacy row violates it; new rows are still enforced)';
  end;

  raise notice 'security-hardening: push_subscriptions safe-upsert posture + bounds ensured.';
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- (4) purge_security_audit_log(p_days) — 180-day retention sweep
-- ════════════════════════════════════════════════════════════════════════════
-- The Reg.13 audit trail should not grow unbounded. This deletes rows older than
-- p_days (default 180), returns how many it removed, and writes ONE counts-only
-- 'security_audit_purge' row (no PII) so the sweep is itself auditable. The
-- counts-only row it writes is, by construction, newer than the cutoff, so it is
-- never deleted by the same run. SECURITY DEFINER (reaches the service-role-only
-- table) with a pinned search_path; service_role only. Re-runnable.
--
-- Guarded: a complete no-op (skips the CREATE) until security_audit_log exists.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'security_audit_log'
  ) then
    raise notice 'security-hardening: skipping purge_security_audit_log (security_audit_log not present yet)';
    return;
  end if;

  execute $fn$
    create or replace function public.purge_security_audit_log(
      p_days integer default 180
    ) returns integer
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_days    integer := greatest(30, coalesce(p_days, 180));  -- never trim below 30 days
      v_deleted integer := 0;
    begin
      delete from public.security_audit_log
        where created_at < now() - make_interval(days => v_days)
          and event <> 'security_audit_purge';  -- keep the purge-trail rows themselves
      get diagnostics v_deleted = row_count;

      -- One counts-only row per run (mirrors purge_analytics_events / retention_purge).
      insert into public.security_audit_log (user_id, event, detail)
      values (
        null,
        'security_audit_purge',
        jsonb_build_object('rows_deleted', v_deleted, 'days', v_days)
      );

      return v_deleted;
    end;
    $body$;
  $fn$;

  revoke all on function public.purge_security_audit_log(integer)
    from public, anon, authenticated;
  grant execute on function public.purge_security_audit_log(integer) to service_role;

  comment on function public.purge_security_audit_log(integer) is
    'Reg.13 audit retention sweep: deletes public.security_audit_log rows older than p_days (default 180, floored at 30) — excluding its own security_audit_purge rows — and writes one counts-only row recording the sweep. SECURITY DEFINER, service_role only. NOT auto-scheduled: enable the drafted pg_cron job in security-hardening-2026-06.sql deliberately.';

  raise notice 'security-hardening: purge_security_audit_log(integer) ensured (NOT scheduled).';
end $$;


-- ── DRAFTED-BUT-COMMENTED pg_cron schedule (NOT auto-applied) ─────────────────
-- Deliberately left COMMENTED so applying this file does NOT begin trimming the
-- legal audit trail. The owner enables it consciously (after confirming the
-- 180-day window satisfies the org's retention obligations). cron.schedule upserts
-- by name; pg_cron is already this project's scheduler (see data-protection-2026-06
-- / audit-observability-2026-06). Suggested cadence: monthly, staggered AFTER the
-- existing 03:30 (1st) retention purge and the 03:40 (2nd) analytics purge.
--
--   select cron.schedule(
--     'security-audit-purge-monthly',
--     '50 3 3 * *',                           -- 3rd of every month, 03:50 UTC
--     $$ select public.purge_security_audit_log() $$
--   );
--
-- To DISABLE later:  select cron.unschedule('security-audit-purge-monthly');


-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). It is additive/idempotent and grant-gap-safe;
--   safe to run before OR after audit-observability / agent-platform / site-push-
--   notify, and re-runnable.
-- • If any VALIDATE left a constraint NOT VALID, a legacy row violates a bound.
--   Inspect, then either fix/trim the row(s) and re-run VALIDATE, e.g.:
--     -- find oversized audit detail:
--     select id, event, octet_length(detail::text) from public.security_audit_log
--       where octet_length(detail::text) > 8192 order by 3 desc;
--     -- re-validate after remediation:
--     alter table public.security_audit_log validate constraint security_audit_log_detail_size;
--   New rows are enforced regardless; NOT VALID only skips the back-scan.
-- • The retention sweep is provisioned but NOT scheduled. Enable the commented
--   pg_cron job above once the 180-day window is confirmed against retention policy.
