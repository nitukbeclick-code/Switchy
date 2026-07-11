-- ════════════════════════════════════════════════════════════════════════════
-- AI chat multi-turn memory (Track 2E, 2026-06)
--   The site "חוסך AI" chat (functions/site-ai-chat) is stateless per request —
--   the browser replays the recent turns each call. This table gives the chat a
--   DURABLE, server-side memory keyed by an opaque session id so a conversation
--   survives a page reload / tab switch and the model keeps its context across
--   turns. The edge fn (service role) loads the stored turns on each request and
--   appends the new user+bot turn after answering.
--
--   PRIVACY: messages are conversational telecom Q&A, NOT lead PII — when the
--   user supplies name/phone+consent they go to public.leads (the proven consent
--   path), NOT here. We keep only the rolling transcript (capped) + a coarse `ip`
--   for abuse triage. RLS is deny-all to clients; only the service_role edge fn
--   reads/writes it.
--
-- GRANT-GAP RULE (2026-06): this project's default privileges do NOT grant to
-- service_role, so a new table is silently inaccessible (403) until granted
-- explicitly. We grant service_role and deny anon/authenticated outright (same
-- documented gap as analytics-events-2026-06.sql / whatsapp-2026-06.sql /
-- marketing-consent-2026-06.sql).
--
-- DEPLOY: NOT applied automatically. Apply manually AFTER review (psql / Supabase
-- SQL editor / `supabase db push`). Idempotent / re-runnable:
-- create-table-if-not-exists, create-index-if-not-exists, drop-then-create policy.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. ai_sessions — the rolling chat transcript, one row per conversation ─────
-- `session_id` is an opaque client-generated id (the browser stores it; we never
-- mint identity from it). `messages` is the capped rolling transcript as a jsonb
-- array of {role:'user'|'bot', text}. `updated_at` lets the edge fn expire stale
-- sessions and powers a cheap retention sweep.
create table if not exists public.ai_sessions (
  session_id  text primary key,                    -- opaque, client-generated
  messages    jsonb not null default '[]'::jsonb,  -- [{role:'user'|'bot', text}] — capped by the edge fn
  ip          text,                                -- abuse triage / rate-limit only (no other PII)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.ai_sessions             is 'Site חוסך-AI chat multi-turn memory (Track 2E). Rolling capped transcript per opaque session id. service_role only — the edge fn reads/writes it. NOT lead PII (that goes to public.leads with consent).';
comment on column public.ai_sessions.session_id  is 'Opaque client-generated conversation id. Not an identity — only correlates turns of one chat.';
comment on column public.ai_sessions.messages    is 'jsonb array of {role:user|bot, text}, capped by the edge fn (last N turns).';
comment on column public.ai_sessions.ip          is 'Coarse IP for abuse triage / rate-limit only. No other PII stored here.';

-- Retention / stale-session sweeps scan by recency.
create index if not exists ai_sessions_updated_idx
  on public.ai_sessions (updated_at desc);

-- ── 2. RLS: deny-all to clients; explicit service_role grants (grant-gap rule) ─
-- RLS ON + no anon/authenticated policy → clients get nothing. The site chat
-- never touches this table directly; it goes through the site-ai-chat edge fn,
-- which runs as service_role (bypasses RLS) but STILL needs explicit grants here
-- (this project's default privileges don't grant to service_role).
alter table public.ai_sessions enable row level security;

revoke all on public.ai_sessions from anon, authenticated;

-- The site-ai-chat edge fn upserts the transcript and reads it back per turn.
grant select, insert, update on public.ai_sessions to service_role;

-- ── 3. Optional retention helper (service_role only) ───────────────────────────
-- Conversational transcripts shouldn't accumulate forever. This prunes sessions
-- idle for > 30 days; wire it to pg_cron later (NOT scheduled here). Keeping it
-- as a SECURITY DEFINER function lets a future cron job call it without a broad
-- delete grant. Re-runnable.
create or replace function public.prune_ai_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.ai_sessions
    where updated_at < now() - interval '30 days';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

revoke execute on function public.prune_ai_sessions() from public, anon, authenticated;
grant execute on function public.prune_ai_sessions() to service_role;

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • Apply this file (review first). Without it, site-ai-chat's memory load/save
--   is a best-effort no-op (it fails soft — the chat still works statelessly via
--   the browser-replayed history), but cross-reload memory won't persist.
-- • Lead capture from the chat writes to public.leads (existing consent path),
--   NOT here — this table is conversation memory only.
-- • Retention scheduling: the daily 'ai-sessions-prune' pg_cron job that calls
--   prune_ai_sessions() lives in retention-cron-2026-07.sql (data-deleting —
--   owner-gated, APPLY MANUALLY). Register it from there, not here.
