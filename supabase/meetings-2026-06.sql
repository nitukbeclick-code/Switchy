-- ═══════════════════════════════════════════════════════════════════════════
-- Video meetings (Zoom) — one-time delta, 2026-06.
-- Run AFTER schema.sql / upgrade-2026-06-10.sql / legal-consent-2026-06.sql.
-- Everything here is also mirrored into schema.sql for fresh installs.
--
-- Flow: app INSERTs a meeting request → meetings_guard validates schedule +
-- rate limits and computes the authoritative starts_at (Israel tz, DST-safe)
-- → AFTER INSERT trigger POSTs the row to the notify-lead edge function →
-- a Telegram card reaches the rep team → a rep confirms (auto-creates a Zoom
-- meeting via the API, or replies with a link) → the service-role PATCH flows
-- back to the app via Realtime.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. meetings table ────────────────────────────────────────────────────────
create table if not exists public.meetings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  name             text not null,
  phone            text not null,
  email            text,
  provider         text,
  plan_id          text,
  meeting_date     date not null,            -- Israel-local calendar date
  slot             text not null,            -- 'HH:MM' on the 30-minute grid
  starts_at        timestamptz,              -- SERVER-computed (meetings_guard)
  status           text not null default 'pending',
      -- pending / confirmed / no_rep / cancelled / expired / completed
  join_url         text,                     -- Zoom link (server-managed)
  zoom_meeting_id  text,                     -- server-managed
  notes            text,
  source           text,                     -- plan / callback / home / form
  -- Legal consent (re-stamped server-side, same as leads)
  terms_accepted_at      timestamptz,
  privacy_accepted_at    timestamptz,
  marketing_accepted_at  timestamptz,
  -- Bot workflow (server-managed; the insert gate nulls client values)
  notified_at      timestamptz,
  claimed_by       text,
  claimed_by_tg_id bigint,
  claimed_at       timestamptz,
  confirmed_at     timestamptz,
  reminded_rep_at  timestamptz,
  source_ip        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

-- ── 2. RLS — leads' insert-anyone / select-own / column-limited pattern ──────
alter table public.meetings enable row level security;

drop policy if exists "meetings_insert_anyone" on public.meetings;
create policy "meetings_insert_anyone" on public.meetings
  for insert with check (true);
drop policy if exists "meetings_select_own" on public.meetings;
create policy "meetings_select_own" on public.meetings
  for select using (auth.uid() = user_id);

-- Column-scope the SELECT: the app only ever reads status + schedule + the
-- join link back (see SupabaseBackend.fetchLatestMeeting / meetingStream).
-- Rep identity, notes and the source IP never reach a client session. No
-- UPDATE/DELETE policies — every transition goes through the service-role bot.
revoke select on public.meetings from anon, authenticated;
grant select (id, status, provider, meeting_date, slot, starts_at, join_url, created_at, user_id)
  on public.meetings to authenticated;

-- Realtime: the app's meetingStream() listens for UPDATEs on this table —
-- without publication membership no event ever reaches the client.
do $$ begin
  alter publication supabase_realtime add table public.meetings;
exception when duplicate_object then null;
end $$;

create index if not exists meetings_user_idx on public.meetings (user_id);
create index if not exists meetings_created_idx on public.meetings (created_at desc);
-- partial index for the renewal-reminders unnotified sweep
create index if not exists meetings_unnotified_idx on public.meetings (created_at)
  where notified_at is null;
-- open meetings by start time (follow-up planner + /meetings command)
create index if not exists meetings_open_idx on public.meetings (starts_at)
  where status in ('pending', 'confirmed');
-- normalized per-phone lookups for the rate limit + one-open-meeting gate
create index if not exists meetings_phone_norm_idx
  on public.meetings (regexp_replace(phone, '\D', '', 'g'), created_at desc);

-- ── 3. meetings_guard — validation + rate-limit + DST-safe starts_at ─────────
-- One BEFORE INSERT gate combining the roles of leads_rate_limit +
-- leads_consent_stamp, plus the meeting-specific schedule rules. The Flutter
-- wizard renders exactly these rules (lib/services/meeting_slots.dart); this
-- trigger is the authoritative enforcement.
create or replace function public.meetings_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_headers json;
  req_ip text;
  xff text[];
  il_today date;
  dow int;
begin
  -- serialize same-phone inserts so the one-open-meeting check and the
  -- per-phone rate limit can't be raced by concurrent requests
  perform pg_advisory_xact_lock(hashtext(regexp_replace(new.phone, '\D', '', 'g')));

  -- user_id must be the caller's identity — a forged value would plant the
  -- meeting (and its Realtime updates) in another user's app
  if new.user_id is distinct from auth.uid() then
    new.user_id := auth.uid();
  end if;

  -- server-managed columns — never accepted from the inserter
  new.status := 'pending';
  new.join_url := null;        new.zoom_meeting_id := null;
  new.notified_at := null;     new.claimed_by := null;
  new.claimed_by_tg_id := null; new.claimed_at := null;
  new.confirmed_at := null;    new.reminded_rep_at := null;

  -- shape validation (same regexes/bounds as leads_rate_limit)
  if length(trim(new.name)) < 2 or length(new.name) > 80 then
    raise exception 'invalid name';
  end if;
  if new.phone !~ '^[+0-9][0-9\-\s]{7,14}$' then
    raise exception 'invalid phone';
  end if;
  if length(coalesce(new.notes, ''))    > 2000
     or length(coalesce(new.email, ''))    > 254
     or length(coalesce(new.provider, '')) > 120
     or length(coalesce(new.plan_id, ''))  > 120
     or length(coalesce(new.source, ''))   > 40 then
    raise exception 'field too long';
  end if;

  -- schedule rules: Israel wall clock is the only clock that matters here.
  il_today := (now() at time zone 'Asia/Jerusalem')::date;
  if new.meeting_date < il_today + 1 then
    raise exception 'meeting must be booked at least one day ahead';
  end if;
  if new.meeting_date > il_today + 30 then
    raise exception 'meeting too far ahead';
  end if;
  dow := extract(isodow from new.meeting_date); -- 1=Mon … 7=Sun
  if dow = 6 then
    raise exception 'no meetings on Saturday';
  end if;
  if dow = 5 then
    -- Friday: mornings only, 09:00–12:30
    if new.slot !~ '^(09|1[0-2]):(00|30)$' or new.slot > '12:30' then
      raise exception 'invalid slot for Friday';
    end if;
  else
    -- Sunday–Thursday: 09:00–20:30
    if new.slot !~ '^(09|1[0-9]|20):(00|30)$' then
      raise exception 'invalid slot';
    end if;
  end if;

  -- the authoritative UTC instant: resolved through the Postgres tz database,
  -- so Israel DST transitions can never drift the meeting time.
  new.starts_at := ((new.meeting_date::text || ' ' || new.slot)::timestamp)
                     at time zone 'Asia/Jerusalem';

  -- one open meeting per phone (pending/confirmed in the future)
  if (select count(*) from public.meetings
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and status in ('pending', 'confirmed')
        and starts_at > now()) >= 1 then
    raise exception 'meeting already pending';
  end if;

  -- rate limits (tighter than leads — meetings are a heavier commitment):
  --   per-phone 3/24h · per-IP 5/h · global 30/h circuit breaker
  if (select count(*) from public.meetings
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and created_at > now() - interval '1 day') >= 3 then
    raise exception 'rate limit exceeded';
  end if;
  begin
    req_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    req_headers := null;
  end;
  req_ip := req_headers ->> 'cf-connecting-ip';
  if req_ip is null then
    xff := string_to_array(coalesce(req_headers ->> 'x-forwarded-for', ''), ',');
    if coalesce(array_length(xff, 1), 0) >= 1 then
      req_ip := xff[array_length(xff, 1)];
    end if;
  end if;
  new.source_ip := nullif(trim(coalesce(req_ip, '')), '');
  if new.source_ip is not null then
    if (select count(*) from public.meetings
        where source_ip = new.source_ip
          and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'rate limit exceeded';
    end if;
  end if;
  if (select count(*) from public.meetings
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limit exceeded';
  end if;

  -- consent re-stamp (server-authoritative, like leads_consent_stamp)
  new.terms_accepted_at     := case when new.terms_accepted_at     is not null then now() else null end;
  new.privacy_accepted_at   := case when new.privacy_accepted_at   is not null then now() else null end;
  new.marketing_accepted_at := case when new.marketing_accepted_at is not null then now() else null end;

  return new;
end;
$$;

drop trigger if exists meetings_guard_before_insert on public.meetings;
create trigger meetings_guard_before_insert
  before insert on public.meetings
  for each row execute function public.meetings_guard();

-- ── 4. meeting_events audit trail (service-role only, mirrors lead_events) ───
create table if not exists public.meeting_events (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  event       text not null,    -- status_change / claim / note / link_set / reminder / undo
  old_status  text,
  new_status  text,
  actor_tg_id bigint,
  actor_name  text,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.meeting_events enable row level security;
create index if not exists meeting_events_meeting_idx
  on public.meeting_events (meeting_id, created_at desc);

-- ── 5. notify the rep team on INSERT (pg_net → notify-lead function) ─────────
-- Same pattern as the documented notify_lead_on_insert (README §8): SECURITY
-- DEFINER, secret from Vault, fire-and-forget. The edge function tells leads
-- and meetings apart by the payload's `table` field.
create or replace function public.notify_meeting_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  begin
    select decrypted_secret into secret
      from vault.decrypted_secrets where name = 'lead_webhook_secret';
  exception when others then
    secret := null;
  end;
  if secret is null then return new; end if; -- not configured yet — sweep will retry
  perform net.http_post(
    url     := 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body    := jsonb_build_object('table', 'meetings', 'record', to_jsonb(new))
  );
  return new;
exception when others then
  return new; -- never block the booking on notification plumbing
end;
$$;

drop trigger if exists meetings_notify_after_insert on public.meetings;
create trigger meetings_notify_after_insert
  after insert on public.meetings
  for each row execute function public.notify_meeting_on_insert();

-- ── 6. Config RPC: add the Zoom keys ─────────────────────────────────────────
-- FULL REPLACEMENT of get_lead_notify_config (the deployed original came from
-- a dashboard migration). ⚠️ OWNER: before running, confirm the deployed
-- function's whitelist matches the names below (run
--   select prosrc from pg_proc where proname = 'get_lead_notify_config';
-- ) so no existing key is dropped. The function returns a {name: secret} JSON
-- object consumed by functions/_shared/config.ts.
-- DROP first: CREATE OR REPLACE aborts (42P13) if the deployed original's
-- return type differs; the revoke/grant below re-applies the permissions.
drop function if exists public.get_lead_notify_config();
create function public.get_lead_notify_config()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name in (
     'telegram_bot_token', 'telegram_chat_id', 'telegram_allowed_user_ids',
     'resend_api_key', 'resend_from', 'leads_notify_email',
     'openai_api_key', 'anthropic_api_key', 'lead_webhook_secret',
     -- Zoom Server-to-Server OAuth (optional — the bot falls back to the
     -- reply-with-link flow when these are absent)
     'zoom_account_id', 'zoom_client_id', 'zoom_client_secret', 'zoom_host_email'
   );
$$;
revoke execute on function public.get_lead_notify_config() from public, anon, authenticated;
grant execute on function public.get_lead_notify_config() to service_role;

-- ── 7. (Optional) Zoom credentials — owner runs after creating a Zoom
--      Server-to-Server OAuth app (marketplace.zoom.us → Develop → Build App):
-- select vault.create_secret('<account id>',    'zoom_account_id');
-- select vault.create_secret('<client id>',     'zoom_client_id');
-- select vault.create_secret('<client secret>', 'zoom_client_secret');
