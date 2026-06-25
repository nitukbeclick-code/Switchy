-- WhatsApp ⇄ Telegram thread link (2026-06).
-- Adds telegram_thread_id to whatsapp_conversations so the Telegram team chat can
-- pin a reply card to a specific conversation: when a rep replies in Telegram as a
-- reply_to that card, telegram-webhook can match the thread back to the customer
-- and relay the text to their WhatsApp. Nullable + idempotent; existing rows stay
-- untouched (the rep-relay also falls back to assigned_tg_id when unset).
--
-- Re-runnable. No new grants needed — service_role already has full DML on
-- whatsapp_conversations (see whatsapp-2026-06.sql §grants).

alter table public.whatsapp_conversations
  add column if not exists telegram_thread_id bigint;
