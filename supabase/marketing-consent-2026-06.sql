-- ════════════════════════════════════════════════════════════════════════════
-- Marketing consent + suppression data layer (2026-06)
--   Communications Law (Bezeq & Broadcasts), §30A — the "Spam Law": a marketing
--   message (SMS / email / advertisement) requires PRIOR, EXPLICIT, OPT-IN
--   consent, given separately and never pre-checked. §30A also requires that
--   (a) the recipient can withdraw consent at any time ("STOP"), and
--   (b) the sender keep PROOF of the consent and honour every opt-out.
--
-- This migration adds the storage that makes both provable:
--   1. GRANULAR per-channel opt-in flags on public.leads — the LeadForm /api/lead
--      writes them; default FALSE = no marketing consent (Spam-Law safe default).
--   2. public.marketing_suppression — the durable cross-channel opt-out / "do not
--      contact" list. ANY future campaign sender (SMS / email / WhatsApp blast)
--      MUST check this list before sending; the WhatsApp STOP handler
--      (functions/whatsapp-webhook) inserts into it on opt-out.
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role, so a new table is silently inaccessible (403) until granted
-- explicitly. We grant service_role and deny anon/authenticated outright (see the
-- same documented gap in whatsapp-2026-06.sql / whatsapp-control-2026-06.sql /
-- analytics-events-2026-06.sql).
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`). Idempotent / re-runnable:
-- add-column-if-not-exists, create-table-if-not-exists, drop-then-create policy.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Granular per-channel marketing opt-in on leads (Spam-Law §30A consent) ──
-- One flag PER channel: consent to SMS is NOT consent to email is NOT consent to
-- WhatsApp (§30A treats each as a separate advertisement channel). The LeadForm
-- consent gate / /api/lead writes these. default false → a lead with no explicit
-- opt-in is, and stays, "no marketing consent" — the legally safe default.
-- These complement the existing marketing_accepted_at timestamp (legal-consent-
-- 2026-06.sql): that proves WHEN any consent was given; these prove WHICH channels.
alter table public.leads
  add column if not exists consent_marketing_sms      boolean not null default false,
  add column if not exists consent_marketing_email    boolean not null default false,
  add column if not exists consent_marketing_whatsapp boolean not null default false;

comment on column public.leads.consent_marketing_sms      is 'Spam-Law §30A: explicit opt-in to MARKETING by SMS. false = no consent (safe default). Per-channel — distinct from email/whatsapp.';
comment on column public.leads.consent_marketing_email    is 'Spam-Law §30A: explicit opt-in to MARKETING by email. false = no consent (safe default). Per-channel — distinct from sms/whatsapp.';
comment on column public.leads.consent_marketing_whatsapp is 'Spam-Law §30A: explicit opt-in to MARKETING by WhatsApp. false = no consent (safe default). Per-channel — distinct from sms/email.';

-- ── 2. Suppression list — the Spam-Law opt-out registry every sender must check ─
-- Append-mostly "do not contact" registry. A row here means: do NOT send marketing
-- on this (channel, contact) — full stop. This is the authoritative §30A opt-out
-- proof: any campaign sender (a future SMS/email/WhatsApp blast) MUST filter
-- recipients against this table, and the WhatsApp STOP handler (whatsapp-webhook)
-- inserts a ('whatsapp', <phone>) row when a customer texts STOP.
--   • contact = the phone (E.164) for sms/whatsapp, or the email for email.
--   • unique (channel, contact) → re-opting-out is a harmless no-op (idempotent;
--     the inserter uses ON CONFLICT DO NOTHING).
create table if not exists public.marketing_suppression (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null check (channel in ('sms','email','whatsapp')),
  contact      text not null,                 -- phone (E.164) for sms/whatsapp, email for email
  reason       text,                          -- e.g. 'whatsapp_stop' / 'email_unsubscribe' / 'manual'
  opted_out_at timestamptz not null default now()
);

-- One suppression row per channel+contact; lets senders upsert opt-outs safely.
create unique index if not exists marketing_suppression_channel_contact_uidx
  on public.marketing_suppression (channel, contact);

-- Fast "is this contact suppressed anywhere?" lookups for cross-channel checks.
create index if not exists marketing_suppression_contact_idx
  on public.marketing_suppression (contact);

comment on table  public.marketing_suppression          is 'Spam-Law §30A opt-out / do-not-contact registry. Every marketing sender MUST check this before sending; the WhatsApp STOP handler inserts here. service_role only.';
comment on column public.marketing_suppression.channel  is 'sms | email | whatsapp — the channel the opt-out applies to (§30A is per-channel).';
comment on column public.marketing_suppression.contact  is 'Phone (E.164) for sms/whatsapp, or email for email — the suppressed recipient identifier.';
comment on column public.marketing_suppression.reason   is 'Why suppressed: whatsapp_stop / email_unsubscribe / sms_stop / manual — audit context for the opt-out.';

-- ── 3. RLS: deny-all to clients; explicit service_role grants (grant-gap rule) ──
-- RLS ON + no anon/authenticated policy → clients get nothing (suppression data
-- is operational PII: who asked not to be contacted). service_role bypasses RLS
-- but STILL needs explicit table grants here (default privileges don't grant).
alter table public.marketing_suppression enable row level security;

revoke all on public.marketing_suppression from anon, authenticated;

-- The WhatsApp STOP handler + any future campaign sender (edge functions running
-- as service_role) insert opt-outs and read the list to filter recipients.
grant select, insert on public.marketing_suppression to service_role;

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Wiring (separate change, not SQL): the WhatsApp STOP handler in
--   functions/whatsapp-webhook/index.ts (handleOptOut) should, in addition to
--   flipping the contact to opted_out, insert into marketing_suppression:
--     insert into public.marketing_suppression (channel, contact, reason)
--     values ('whatsapp', <wa_phone>, 'whatsapp_stop')
--     on conflict (channel, contact) do nothing;
-- • Any future SMS/email/WhatsApp campaign sender MUST left-anti-join recipients
--   against this table per channel before sending (Spam-Law §30A — honouring the
--   opt-out is mandatory; sending after an opt-out is the violation).
-- • The per-channel lead flags above are the inbound consent PROOF; this table is
--   the outbound opt-out PROOF. Together they satisfy §30A's keep-the-record duty.
