-- meetings-guard-allow-multiple-2026-07.sql
-- Owner directive (2026-07-05): "open access so a customer can book as many
-- meetings as they want as long as they verified by email, because a customer
-- may want to book a meeting for every carrier and the old rule blocked them."
--
-- BEFORE: meetings_guard rejected any second open meeting for the same phone
-- ("meeting already pending"), so a visitor who booked one consultation could
-- not book another for a different carrier — the reported bug.
--
-- AFTER: the one-open-meeting-per-phone block is REMOVED. A verified visitor may
-- book multiple consultations. We keep an anti-double-submit guard that rejects
-- only an EXACT duplicate (same phone + provider + date + slot), and we raise the
-- rate ceilings so booking every eligible carrier stays under the limits:
--   per-phone 3/24h → 12/24h · per-IP 5/h → 12/h · global 30/h unchanged.
-- Email verification (OTP) + these rate limits remain the anti-spam gate.
--
-- Idempotent: CREATE OR REPLACE only; the meetings_before_insert trigger that
-- calls this function is unchanged (see meetings-2026-06.sql). Everything else in
-- the guard (field validation, provider eligibility whitelist, Israel-tz schedule
-- rules, 4-hour lead time, consent re-stamp) is preserved verbatim.

CREATE OR REPLACE FUNCTION public.meetings_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  req_headers json;
  req_ip text;
  xff text[];
  il_today date;
  dow int;
begin
  -- serialize same-phone inserts so the dup check + rate limits can't be raced
  perform pg_advisory_xact_lock(hashtext(regexp_replace(new.phone, '\D', '', 'g')));

  if new.user_id is distinct from auth.uid() then
    new.user_id := auth.uid();
  end if;

  new.status := 'pending';
  new.join_url := null;        new.zoom_meeting_id := null;
  new.notified_at := null;     new.claimed_by := null;
  new.claimed_by_tg_id := null; new.claimed_at := null;
  new.confirmed_at := null;    new.reminded_rep_at := null;
  new.gcal_event_id := null;

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

  -- provider gate: a meeting may only be booked for an eligible carrier.
  if coalesce(new.provider, '') not in ('HOT','yes','פרטנר','סלקום','STING TV','בזק','הוט מובייל') then
    raise exception 'provider not eligible for a meeting';
  end if;

  -- schedule rules: Israel wall clock is the only clock that matters here.
  il_today := (now() at time zone 'Asia/Jerusalem')::date;
  if new.meeting_date > il_today + 30 then
    raise exception 'meeting too far ahead';
  end if;
  dow := extract(isodow from new.meeting_date); -- 1=Mon … 7=Sun
  if dow = 6 then
    raise exception 'no meetings on Saturday';
  end if;
  if dow = 5 then
    if new.slot !~ '^(09|1[0-2]):(00|30)$' or new.slot > '12:30' then
      raise exception 'invalid slot for Friday';
    end if;
  else
    if new.slot !~ '^(09|1[0-9]|20):(00|30)$' then
      raise exception 'invalid slot';
    end if;
  end if;

  new.starts_at := ((new.meeting_date::text || ' ' || new.slot)::timestamp)
                     at time zone 'Asia/Jerusalem';

  if new.starts_at < now() + interval '4 hours' then
    raise exception 'meeting must be booked at least 4 hours ahead';
  end if;

  -- CHANGED 2026-07 (owner): a verified visitor may book MULTIPLE consultations
  -- (e.g. one per carrier they're weighing) — the old one-open-meeting-per-phone
  -- block was REMOVED. We only reject an ACCIDENTAL EXACT duplicate (same phone +
  -- provider + date + slot) to swallow a double-submit; email verification + the
  -- rate limits below remain the anti-spam gate.
  if (select count(*) from public.meetings
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and provider = new.provider
        and meeting_date = new.meeting_date
        and slot = new.slot
        and status in ('pending', 'confirmed')) >= 1 then
    raise exception 'duplicate meeting';
  end if;

  -- rate limits (raised to accommodate booking for every eligible carrier):
  --   per-phone 12/24h · per-IP 12/h · global 30/h circuit breaker
  if (select count(*) from public.meetings
      where regexp_replace(phone, '\D', '', 'g') = regexp_replace(new.phone, '\D', '', 'g')
        and created_at > now() - interval '1 day') >= 12 then
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
          and created_at > now() - interval '1 hour') >= 12 then
      raise exception 'rate limit exceeded';
    end if;
  end if;
  if (select count(*) from public.meetings
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limit exceeded';
  end if;

  -- consent re-stamp (server-authoritative)
  new.terms_accepted_at     := case when new.terms_accepted_at     is not null then now() else null end;
  new.privacy_accepted_at   := case when new.privacy_accepted_at   is not null then now() else null end;
  new.marketing_accepted_at := case when new.marketing_accepted_at is not null then now() else null end;

  return new;
end;
$function$;
