-- WhatsApp live-relay target (2026-06).
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds public.whatsapp_conversations.relay_tg_chat_id — the Telegram chat id the
-- live human-takeover relay forwards to. It is the single piece of state the
-- two relay halves share:
--
--   • notify-lead (callbacks.ts) — rep→customer:
--       TAKE-OVER  ("🤝 השתלט ושוחח כאן") sets bot_enabled=false + relay_tg_chat_id
--                  = the pressing rep's Telegram chat id.
--       HAND-BACK  ("🤖 החזר לבוט")        sets bot_enabled=true  + relay_tg_chat_id=NULL.
--       A rep reply to a RELAY-ACTIVE lead card is sent to the customer via the
--       WhatsApp Cloud API (_shared/whatsapp.ts sendText).
--
--   • whatsapp-webhook — customer→rep:
--       When RELAY-ACTIVE (bot_enabled=false AND relay_tg_chat_id IS NOT NULL) the
--       inbound customer message is forwarded to relay_tg_chat_id via
--       _shared/telegram.ts sendTelegram. NULL relay_tg_chat_id = no relay; the
--       webhook's guard chain ORDER (HMAC → dedup → opt-out → bot_enabled →
--       rate-limit) is UNTOUCHED — the §30A STOP gate still runs FIRST and wins.
--
-- RELAY-ACTIVE = (bot_enabled = false AND relay_tg_chat_id IS NOT NULL).
-- NULL relay_tg_chat_id = no relay (the default for every existing/new row).
--
-- Stored as TEXT (not bigint): Telegram chat ids fit in bigint, but supergroup
-- ids can be very negative and we route by passing the value straight through to
-- sendTelegram's chat_id, which Telegram accepts as a string — keeping it text
-- avoids any numeric-precision surprise and matches how the webhook reads it.
--
-- GRANT-GAP NOTE (2026-06): no new grants needed — service_role already has full
-- DML on public.whatsapp_conversations (see whatsapp-2026-06.sql §grants). This is
-- a pure additive column on an already-granted table.
--
-- ⚠️  DRAFT — NOT auto-applied. Review, then apply MANUALLY:
--       psql "$DATABASE_URL" -f supabase/whatsapp-relay-2026-06.sql
--     (or paste into the Supabase SQL editor). Idempotent / re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.whatsapp_conversations
  add column if not exists relay_tg_chat_id text;

comment on column public.whatsapp_conversations.relay_tg_chat_id is
  'Live human-takeover relay target: the Telegram chat id a rep''s reply relays to and customer inbound is forwarded to. Set by notify-lead take-over; cleared (NULL) by hand-back. RELAY-ACTIVE = bot_enabled=false AND relay_tg_chat_id IS NOT NULL. NULL = no relay (default).';
