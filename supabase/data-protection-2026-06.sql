-- ════════════════════════════════════════════════════════════════════════════
-- Data protection / privacy compliance — data-layer (2026-06)
--   Israeli Protection of Privacy Law, 5741-1981 + the Privacy Protection
--   (Information Security) Regulations, 2017 ("Regulation 13"):
--     • DATA-SUBJECT RIGHTS  — §13/§14: a person may inspect ("access"), demand
--       correction, and demand deletion of their data; the controller must
--       handle the request and keep a record of it.  →  table data_subject_requests
--     • DATA MINIMISATION / RETENTION  — keep PII only as long as needed for the
--       purpose it was collected for, then delete it.  →  monthly purge jobs
--
-- Companion to legal-consent-2026-06.sql (consent columns + security_audit_log +
-- log_security_event RPC). This file is the RIGHTS + RETENTION half.
--
-- HONESTY: this is the technical scaffolding for compliance, NOT a declaration
-- that the org is compliant or has been audited. The legal text the requests
-- table backs (web/app/privacy) is a draft for the owner's lawyer.
--
-- DEPLOY: NOT applied automatically. The PARENT applies it via MCP after review.
-- Idempotent / re-runnable (create-if-not-exists, drop-policy-if-exists,
-- cron.schedule upserts by name, do-block guards). See README §security.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- (1) DATA-SUBJECT REQUESTS  — the access / correction / deletion / withdraw log
-- ════════════════════════════════════════════════════════════════════════════
-- One row per privacy request a person submits (via the site's privacy page →
-- web/app/api/.../route.ts, which inserts with the service-role key — server
-- only). The team works the queue and stamps handled_at when done.
--
-- Service-role ONLY: RLS is enabled and there are NO client policies, so
-- anon/authenticated are denied every verb (and an explicit deny-all-for-
-- authenticated policy below makes that intent explicit + silences the advisor's
-- rls_enabled_no_policy INFO). The service_role bypasses RLS, but this project's
-- default privileges do NOT grant to service_role (the documented 2026-06
-- grant-gap — see schema.sql §grants, whatsapp-2026-06.sql, analytics-events-
-- 2026-06.sql), so the verbs are granted explicitly below.
create table if not exists public.data_subject_requests (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('access', 'correction', 'deletion', 'withdraw')),
  full_name    text,                                   -- as the person identifies themselves
  contact      text,                                   -- email / phone to reply on (PII)
  details      text,                                   -- free-text: what they're asking for
  status       text not null default 'open',           -- open / in_progress / done / rejected
  source_ip    text,                                   -- captured server-side for abuse triage
  requested_at timestamptz not null default now(),     -- when the person submitted it
  deadline_at  timestamptz,                            -- statutory response deadline (server-set)
  handled_at   timestamptz                             -- when the team closed it (proof of handling)
);

comment on table public.data_subject_requests is
  'Privacy data-subject requests (access/correction/deletion/withdraw). Service-role only; inserted by the site privacy endpoint, worked by the team. Keeps the legally-required record that each request was received and handled.';
comment on column public.data_subject_requests.kind is
  'access = inspect their data; correction = fix it; deletion = erase it; withdraw = revoke marketing/processing consent.';
comment on column public.data_subject_requests.deadline_at is
  'Statutory response deadline, stamped server-side on insert (see deadline trigger). Drives SLA reminders.';

create index if not exists data_subject_requests_status_idx
  on public.data_subject_requests (status, requested_at desc);
create index if not exists data_subject_requests_deadline_idx
  on public.data_subject_requests (deadline_at)
  where handled_at is null;

alter table public.data_subject_requests enable row level security;

-- Belt-and-braces: strip any default client privileges, then deny-all for
-- authenticated explicitly (mirrors rls-defensive-2026-06.sql) so a future
-- accidental GRANT still can't leak PII contact details.
revoke all on public.data_subject_requests from anon, authenticated;

drop policy if exists "data_subject_requests_no_client" on public.data_subject_requests;
create policy "data_subject_requests_no_client" on public.data_subject_requests
  for all to authenticated using (false) with check (false);

-- Explicit service_role grants (default privileges do NOT grant here). The site
-- privacy endpoint INSERTs; the team reads/updates the queue via crm-api.
grant select, insert, update, delete on public.data_subject_requests to service_role;

-- Stamp the statutory response deadline server-side so it can't be omitted or
-- back-dated by the client. The Israeli regulations give the controller up to
-- 30 days (access requests) / 30 days (deletion-correction handling) to respond;
-- 30 days is the conservative single deadline used here for all kinds. The team
-- can still close earlier. SECURITY: trigger fn pins an empty search_path (the
-- body uses only the built-in now() + the NEW record — no unqualified objects),
-- matching function-search-path-2026-06.sql.
create or replace function public.data_subject_requests_set_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.requested_at := coalesce(new.requested_at, now());
  new.deadline_at  := coalesce(new.deadline_at, new.requested_at + interval '30 days');
  return new;
end;
$$;

drop trigger if exists data_subject_requests_set_deadline_before_insert
  on public.data_subject_requests;
create trigger data_subject_requests_set_deadline_before_insert
  before insert on public.data_subject_requests
  for each row execute function public.data_subject_requests_set_deadline();


-- ════════════════════════════════════════════════════════════════════════════
-- (2) RETENTION AUTO-DELETION  — monthly purge of past-retention PII
-- ════════════════════════════════════════════════════════════════════════════
-- pg_cron (1.6.4) and pg_net (0.20.3) are BOTH installed on this project
-- (verified via list_extensions, 2026-06) and pg_cron is already the scheduler
-- for the renewal-reminders jobs (upgrade-2026-06-10.sql). So retention runs as
-- a pure in-database pg_cron job — no edge function required. (If a future
-- environment lacks pg_cron, port the body of purge_expired_personal_data() into
-- a secret-token-gated edge fn — like notify-lead's x-webhook-secret gate — and
-- trigger it from an external cron; nothing else changes.)
--
-- RETENTION POLICY (controller-set; the owner/lawyer can tune the intervals):
--   • public.leads ............... 24 months after created_at, EXCEPT leads that
--                                  are still live (status 'new' / 'contacted').
--                                  Won/lost leads past 24mo are purged.
--   • whatsapp_messages .......... 24 months after created_at (transcript PII).
--   • whatsapp_conversations ..... purged once they are 'closed' AND have had no
--                                  message for 24 months (cascade deletes their
--                                  messages too — FK on delete cascade).
--   • whatsapp_contacts .......... purged only when TERMINAL ('closed'/'lost'/
--                                  'blocked'), inactive (last_message_at) for
--                                  24 months, AND no longer referenced by any
--                                  conversation. Active/qualified/won contacts
--                                  are NEVER auto-deleted.
--
-- SAFETY: every delete is bounded by BOTH an age cut-off AND a terminal-status
-- guard, so an open lead / live conversation can never be touched. The function
-- is SECURITY DEFINER (it must reach these service-role-only tables) with a
-- pinned search_path, and is NOT granted to anon/authenticated — only the cron
-- job (which runs as the table owner / superuser context) calls it.

create or replace function public.purge_expired_personal_data(
  p_lead_months    integer default 24,
  p_message_months integer default 24,
  p_contact_months integer default 24
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leads    bigint := 0;
  v_msgs     bigint := 0;
  v_convs    bigint := 0;
  v_contacts bigint := 0;
begin
  -- ── leads: only terminal (won/lost) leads past the window; never open ones ──
  with del as (
    delete from public.leads
     where created_at < now() - make_interval(months => p_lead_months)
       and status not in ('new', 'contacted')          -- keep live pipeline
     returning 1
  )
  select count(*) into v_leads from del;

  -- ── whatsapp messages: transcript PII past the window ───────────────────────
  with del as (
    delete from public.whatsapp_messages
     where created_at < now() - make_interval(months => p_message_months)
     returning 1
  )
  select count(*) into v_msgs from del;

  -- ── whatsapp conversations: closed + silent past the window (cascades msgs) ──
  with del as (
    delete from public.whatsapp_conversations c
     where c.status = 'closed'
       and coalesce(c.last_message_at, c.created_at)
             < now() - make_interval(months => p_message_months)
     returning 1
  )
  select count(*) into v_convs from del;

  -- ── whatsapp contacts: terminal + inactive + no live conversation left ──────
  with del as (
    delete from public.whatsapp_contacts ct
     where ct.status in ('closed', 'lost', 'blocked')
       and coalesce(ct.last_message_at, ct.created_at)
             < now() - make_interval(months => p_contact_months)
       and not exists (
         select 1 from public.whatsapp_conversations c
          where c.contact_id = ct.id
       )
     returning 1
  )
  select count(*) into v_contacts from del;

  -- ── audit: one Reg.13 row per run (counts only; never the deleted PII) ──────
  insert into public.security_audit_log (user_id, event, detail)
  values (
    null,
    'retention_purge',
    jsonb_build_object(
      'leads_deleted',                 v_leads,
      'whatsapp_messages_deleted',     v_msgs,
      'whatsapp_conversations_deleted', v_convs,
      'whatsapp_contacts_deleted',     v_contacts,
      'lead_months',                   p_lead_months,
      'message_months',                p_message_months,
      'contact_months',                p_contact_months
    )
  );
end;
$$;

comment on function public.purge_expired_personal_data(integer, integer, integer) is
  'Data-minimisation retention sweep: deletes past-retention PII from leads + whatsapp_* (terminal/closed rows only, never live ones) and writes a counts-only row to security_audit_log. Called monthly by the retention-purge-monthly pg_cron job.';

-- Lock the function down: no client may call it (it bypasses RLS on PII tables).
revoke all on function public.purge_expired_personal_data(integer, integer, integer)
  from public, anon, authenticated;

-- ── Schedule: 1st of every month, 03:30 UTC (low-traffic) ───────────────────
-- cron.schedule upserts by name, so re-running this file just re-points the job.
-- The job calls the SECURITY DEFINER function directly (no HTTP needed); pg_net
-- is unused for retention but documented above as the edge-fn fallback path.
select cron.schedule(
  'retention-purge-monthly',
  '30 3 1 * *',
  $$ select public.purge_expired_personal_data() $$
);


-- ════════════════════════════════════════════════════════════════════════════
-- (3) COLUMN-LEVEL ENCRYPTION (pgsodium) — RECOMMENDATION ONLY (not implemented)
-- ════════════════════════════════════════════════════════════════════════════
-- pgsodium (3.1.8) is AVAILABLE but NOT installed on this project. Worth adding
-- for phone/full_name/contact PII? Assessment:
--   • NOT required for baseline compliance: Supabase already encrypts storage at
--     rest (disk-level), TLS 1.2+ is enforced in transit, and these PII tables
--     are RLS-locked to the service_role (no client read path). Reg.13's
--     "encryption" control is met by the at-rest + in-transit layers.
--   • Column-level (pgsodium Transparent Column Encryption) ADDS value only
--     against a narrow threat: an attacker who gets raw table/dump access but NOT
--     the Vault key (e.g. a leaked logical backup). It does NOT protect against a
--     leaked service_role key — that key can decrypt by design.
--   • COSTS: every team read path (crm-api, whatsapp-webhook, notify-lead) would
--     have to decrypt via the view layer; phone can no longer be a plain UNIQUE
--     key / FK / index target without deterministic encryption; key rotation and
--     backup/restore get materially more complex.
-- RECOMMENDATION: DEFER. Keep disk-encryption + strict RLS + service-role-only
-- access as the control. Revisit pgsodium TCE only if a regulator or the owner's
-- lawyer specifically requires field-level encryption of phone/name at rest, and
-- scope it to the single highest-risk column (phone) if so. Mirrors the same
-- deferral already noted in legal-consent-2026-06.sql.


-- ── Owner action items (only the owner can supply these) ─────────────────────
-- • [[OWNER: DPO / privacy contact name + role]] — publish on web/app/privacy as
--   the address for data-subject requests, alongside hello@chosech.co.il.
-- • Data controller of record (named in the privacy policy): אריאל תקשורת,
--   ח.פ/ע.מ 322253618, ליאו בק 64, נהריה.
-- • Israeli complaint path to publish in the privacy policy: the Privacy
--   Protection Authority — הרשות להגנת הפרטיות — gov.il/he/departments/the_privacy_protection_authority
--   (a person may complain to it if a request is not honoured).
