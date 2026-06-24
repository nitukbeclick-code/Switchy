-- ════════════════════════════════════════════════════════════════════════════
-- Telegram channel for the marketing suppression registry (2026-06)
--   Communications Law (Bezeq & Broadcasts), §30A — the "Spam Law".
--
--   The public, customer-facing Telegram bot (supabase/functions/
--   telegram-user-webhook) is a NEW marketing-capable surface. §30A is per-channel,
--   so a Telegram opt-out ("STOP") needs its OWN row in the durable
--   public.marketing_suppression registry (added in marketing-consent-2026-06.sql),
--   exactly like the WhatsApp STOP handler inserts a ('whatsapp', <phone>) row.
--
--   marketing_suppression today constrains channel to ('sms','email','whatsapp').
--   This migration widens that CHECK to also allow 'telegram' so the Telegram STOP
--   handler can insert ('telegram', 'tg:<chat_id>', 'telegram_stop'). Telegram has
--   no phone/email identifier we can rely on, so the contact key is the namespaced
--   chat id ("tg:<chat_id>") — opaque, stable, and unique to that conversation.
--
-- GRANT-GAP RULE (2026-06): no NEW table here — marketing_suppression already
-- grants (select, insert) to service_role (marketing-consent-2026-06.sql), which
-- is all the Telegram STOP handler needs. Nothing else to grant.
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`), AND ONLY AFTER marketing-consent-2026-06.sql
-- has been applied (this migration assumes that table exists). Idempotent /
-- re-runnable: drop-then-add the named CHECK constraint.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Widen the channel CHECK to include 'telegram' ─────────────────────────────
-- The original table created an inline (unnamed) check constraint. Postgres names
-- inline column/table checks deterministically, but to stay portable + idempotent
-- we DROP whatever constraint currently bounds `channel` by its conventional name
-- and re-ADD a NAMED one that includes 'telegram'. If your database named the
-- original constraint differently, adjust the DROP target once (see the note below).
do $$
declare
  conname text;
begin
  -- Find the existing CHECK constraint on marketing_suppression that references
  -- the `channel` column (the original `channel in (...)` guard), whatever its
  -- generated name is, and drop it.
  select c.conname
    into conname
  from pg_constraint c
  join pg_class      t on t.oid = c.conrelid
  join pg_namespace  n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'marketing_suppression'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%channel%'
  limit 1;

  if conname is not null then
    execute format(
      'alter table public.marketing_suppression drop constraint %I',
      conname
    );
  end if;
end$$;

-- Re-add a NAMED check that now also permits 'telegram'. Named so future
-- migrations (e.g. adding another channel) can target it directly + idempotently.
alter table public.marketing_suppression
  drop constraint if exists marketing_suppression_channel_check;

alter table public.marketing_suppression
  add constraint marketing_suppression_channel_check
  check (channel in ('sms','email','whatsapp','telegram'));

comment on column public.marketing_suppression.channel is
  'sms | email | whatsapp | telegram — the channel the opt-out applies to (§30A is per-channel). Telegram added 2026-06 for the public Telegram user bot.';

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • The Telegram STOP handler (functions/telegram-user-webhook/index.ts
--   handleOptOut) inserts:
--     insert into public.marketing_suppression (channel, contact, reason)
--     values ('telegram', 'tg:<chat_id>', 'telegram_stop')
--     on conflict (channel, contact) do nothing;
--   (PostgREST: POST ?on_conflict=channel,contact with
--    Prefer: resolution=ignore-duplicates — a repeat STOP is a harmless no-op.)
-- • Any future Telegram campaign sender (a proactive better-deal / renewal blast)
--   MUST left-anti-join recipients against this table for channel='telegram'
--   BEFORE sending, AND honour quiet hours 23:00-08:00 IL — exactly as the other
--   proactive senders do. Sending after a STOP is the §30A violation.
-- • No new grants needed: service_role already has (select, insert) on this table
--   from marketing-consent-2026-06.sql.
