-- Telegram customer→team HUMAN handoff / live-relay state (2026-06).
-- ─────────────────────────────────────────────────────────────────────────────
-- The PUBLIC, customer-facing Telegram bot (functions/telegram-user-webhook)
-- normally answers with the grounded agent. When a customer asks for a human, we
-- PAUSE the agent for that chat and relay the live conversation to the team — the
-- exact mirror of the WhatsApp human-takeover (see whatsapp-relay-2026-06.sql),
-- but for the Telegram customer channel.
--
-- The unified per-chat session already lives in public.ai_sessions (one row per
-- session_id; the customer-facing Telegram bot keys it "tg-u-<chatId>"). This
-- migration adds the two pieces of relay state to that SAME row — the Telegram
-- analog of whatsapp_conversations.bot_enabled + relay_tg_chat_id:
--
--   • bot_enabled         boolean — true (default) = the agent answers this chat;
--                         a human takeover sets it FALSE (the agent is paused).
--   • relay_team_chat_id  text    — the TEAM Telegram chat id the customer's live
--                         messages are forwarded to while paused. Set on take-over,
--                         cleared (NULL) on hand-back.
--
-- RELAY-ACTIVE = (bot_enabled = false AND relay_team_chat_id IS NOT NULL).
-- NULL relay_team_chat_id (or bot_enabled still true) = no relay (default for
-- every existing/new row — the agent keeps answering exactly as before).
--
-- The two relay halves share ONLY these columns + the chat id encoded in the
-- session key:
--   • telegram-user-webhook (customer→team): when RELAY-ACTIVE, an inbound
--     customer message is forwarded to relay_team_chat_id via the TEAM bot
--     (_shared/telegram.ts sendTelegram). The guard-chain ORDER is UNTOUCHED —
--     the §30A STOP gate still runs FIRST and wins, then the relay gate, then the
--     agent. The agent never runs while bot_enabled=false.
--   • notify-lead (team→customer): a rep reply to the takeover card is relayed
--     back to the CUSTOMER's Telegram chat (tg-u-<chatId>) via the customer-facing
--     USER bot token (TELEGRAM_USER_BOT_TOKEN). TAKE-OVER sets bot_enabled=false +
--     relay_team_chat_id=<team chat>; HAND-BACK sets bot_enabled=true +
--     relay_team_chat_id=NULL. The §30A suppression check (marketing_suppression
--     channel='telegram', contact='tg:<chatId>') still WINS before any relay send.
--
-- bot_enabled mirrors whatsapp_conversations.bot_enabled semantics: code FAILS
-- OPEN only when the column is genuinely absent/undefined (a row written before
-- this migration) so the bot keeps answering pre-migration; an explicit FALSE
-- always pauses it. relay_team_chat_id is TEXT (not bigint) for the same reason
-- whatsapp_conversations.relay_tg_chat_id is: Telegram supergroup ids can be very
-- negative and we pass the value straight through to sendTelegram's chat_id, which
-- Telegram accepts as a string — text avoids any numeric-precision surprise.
--
-- GRANT-GAP NOTE (2026-06): no new grants needed — service_role already has
-- select/insert/update on public.ai_sessions (see ai-sessions-2026-06.sql §RLS).
-- These are pure additive columns on an already-granted table; RLS stays deny-all
-- to clients (the edge fns reach the row only via the service role).
--
-- ⚠️  DRAFT — NOT auto-applied. Review, then apply MANUALLY:
--       psql "$DATABASE_URL" -f supabase/telegram-handoff-2026-06.sql
--     (or paste into the Supabase SQL editor). Idempotent / re-runnable.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ai_sessions
  add column if not exists bot_enabled boolean not null default true;

alter table public.ai_sessions
  add column if not exists relay_team_chat_id text;

comment on column public.ai_sessions.bot_enabled is
  'Telegram customer-bot human-takeover gate (mirrors whatsapp_conversations.bot_enabled): true (default) = the grounded agent answers this chat; a human takeover sets it false (the agent is PAUSED) until hand-back. Only meaningful for "tg-u-<chatId>" sessions.';

comment on column public.ai_sessions.relay_team_chat_id is
  'Telegram live human-takeover relay target: the TEAM chat id the customer''s live messages are forwarded to while paused. Set by the notify-lead take-over; cleared (NULL) by hand-back. RELAY-ACTIVE = bot_enabled=false AND relay_team_chat_id IS NOT NULL. NULL = no relay (default).';

-- The take-over / hand-back flip and the webhook relay-gate read filter on these,
-- so a partial index over the (rare) RELAY-ACTIVE rows keeps the lookups cheap.
create index if not exists ai_sessions_relay_active_idx
  on public.ai_sessions (relay_team_chat_id)
  where bot_enabled = false and relay_team_chat_id is not null;

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). Without it, the handoff fails SOFT: the
--   webhook's relay-state read returns no takeover columns, so the agent keeps
--   answering (the bot still works, it just never pauses for a human), and the
--   take-over PATCH no-ops (0 rows changed → the team is told to retry). Nothing
--   errors; the feature is simply dark until the columns exist.
-- • The §30A STOP path is unchanged: opt-out still writes marketing_suppression
--   (channel='telegram', contact='tg:<chatId>') + the audit row, and that
--   suppression WINS over any relay send.
