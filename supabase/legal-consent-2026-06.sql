-- ════════════════════════════════════════════════════════════════════════════
-- Legal consent + security audit — Israeli compliance
--   • Privacy Protection Regulations (Information Security), 2017 — "Regulation 13"
--     style controls: access control (RLS), encryption in transit, audit logging.
--   • Communications Law (Bezeq & Broadcasts), §30A — the "Spam Law": marketing
--     contact requires PRIOR, EXPLICIT, OPT-IN consent (never pre-checked).
--
-- DEPLOY: this is NOT applied automatically. Run it against the live project
-- (psql / Supabase SQL editor / `supabase db push`) AFTER reviewing. It is
-- idempotent (add-column-if-not-exists, create-or-replace). See README §security.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Consent columns — legal proof of consent (Reg.13: keep the record) ─────
-- On profiles (registered users). marketing_accepted_at is NULLABLE: it is set
-- only when the user actively opted in, and stays null otherwise (Spam Law).
alter table public.profiles
  add column if not exists terms_accepted_at     timestamptz,
  add column if not exists privacy_accepted_at   timestamptz,
  add column if not exists marketing_accepted_at timestamptz,
  add column if not exists registration_ip       inet,
  add column if not exists consent_version       text;

comment on column public.profiles.terms_accepted_at     is 'When the user accepted the Terms of Service (server-stamped, legal proof).';
comment on column public.profiles.privacy_accepted_at   is 'When the user accepted the Privacy Policy (server-stamped, legal proof).';
comment on column public.profiles.marketing_accepted_at is 'When the user OPTED IN to marketing (Spam Law) — null = no consent.';
comment on column public.profiles.registration_ip       is 'IP the consent was given from (legal proof of who/where).';

-- On leads (the site/app callback form — a contact request the team will act on).
alter table public.leads
  add column if not exists terms_accepted_at     timestamptz,
  add column if not exists privacy_accepted_at   timestamptz,
  add column if not exists marketing_accepted_at timestamptz;

-- ── 2. Registration consent RPC — backend validation + server-authoritative ───
-- Rejects any registration that did not pass the MANDATORY terms+privacy flags,
-- and stamps the server time + caller IP so the proof can't be backdated/spoofed.
-- SECURITY DEFINER (needs the request IP header) with a pinned search_path.
create or replace function public.record_registration_consent(
  p_terms           boolean,
  p_privacy         boolean,
  p_marketing       boolean default false,
  p_consent_version text    default '2026-06'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ip  inet;
  v_xff text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  -- BACKEND ENFORCEMENT: reject registration missing the mandatory consents.
  if p_terms is not true or p_privacy is not true then
    raise exception 'terms_and_privacy_required';
  end if;

  -- Best-effort caller IP. Prefer cf-connecting-ip (CDN-set, trusted); otherwise
  -- the LAST X-Forwarded-For hop — the one the trusted edge appended — to match
  -- the leads gate and avoid trusting a client-spoofable first hop.
  begin
    v_xff := current_setting('request.headers', true)::json ->> 'x-forwarded-for';
    v_ip := coalesce(
      nullif(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', ''),
      nullif(trim(split_part(v_xff, ',', array_length(string_to_array(v_xff, ','), 1))), '')
    )::inet;
  exception when others then
    v_ip := null;
  end;

  update public.profiles set
    terms_accepted_at     = coalesce(terms_accepted_at, now()),
    privacy_accepted_at   = coalesce(privacy_accepted_at, now()),
    marketing_accepted_at = case when p_marketing then coalesce(marketing_accepted_at, now())
                                 else marketing_accepted_at end,
    registration_ip       = coalesce(registration_ip, v_ip),
    consent_version       = coalesce(consent_version, p_consent_version),
    updated_at            = now()
  where id = v_uid;

  perform public.log_security_event(
    'consent_recorded',
    jsonb_build_object('marketing', p_marketing, 'version', p_consent_version)
  );
end;
$$;

revoke all on function public.record_registration_consent(boolean, boolean, boolean, text) from public, anon;
grant execute on function public.record_registration_consent(boolean, boolean, boolean, text) to authenticated;

-- ── 3. Leads consent stamp — server-authoritative, non-rejecting (compat) ─────
-- ⚠️ SUPERSEDED: leads_consent_stamp() below was REPLACED by
-- lead-consent-share-2026-06.sql (adds the consent_share_at "sellable" stamp)
-- and then hardened by cron-and-hardening-2026-07.sql §2 (search_path = '').
-- Re-running this section drops the consent_share_at re-stamp — leaving the
-- third-party-sharing consent timestamp CLIENT-controlled (backdatable) — and
-- un-pins the search_path. Do not re-apply §3; if you must re-run this file,
-- re-apply lead-consent-share-2026-06.sql + the cron-and-hardening §2 ALTER
-- afterwards. (Banner added 2026-07 hygiene pass; the SQL was not altered.)
-- The site/app lead form sends a non-null value to INDICATE consent; we overwrite
-- it with the server time so it can't be backdated. Marketing stays null unless
-- the user opted in. Mandatory enforcement is client-side on the form (every
-- lead-submitting path would need consent before this could reject server-side).
create or replace function public.leads_consent_stamp()
returns trigger
language plpgsql
as $$
begin
  new.terms_accepted_at     := case when new.terms_accepted_at     is not null then now() else null end;
  new.privacy_accepted_at   := case when new.privacy_accepted_at   is not null then now() else null end;
  new.marketing_accepted_at := case when new.marketing_accepted_at is not null then now() else null end;
  return new;
end;
$$;

drop trigger if exists leads_consent_stamp_before_insert on public.leads;
create trigger leads_consent_stamp_before_insert
  before insert on public.leads
  for each row execute function public.leads_consent_stamp();

-- ── 4. Security audit log (Reg.13: log critical security events) ──────────────
-- Service-role only: no client can read or write it directly (RLS on + no policy
-- → anon/authenticated get nothing; service_role bypasses RLS). The app appends
-- events through the SECURITY DEFINER RPC below.
create table if not exists public.security_audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,                                  -- null for pre-auth events
  event      text        not null,                  -- e.g. consent_recorded / login_failed / unauthorized
  detail     jsonb       not null default '{}'::jsonb,
  ip         inet,
  created_at timestamptz not null default now()
);

alter table public.security_audit_log enable row level security;
revoke all on public.security_audit_log from anon, authenticated;

create index if not exists security_audit_log_created_idx on public.security_audit_log (created_at desc);
create index if not exists security_audit_log_user_idx    on public.security_audit_log (user_id, created_at desc);

-- Append a security event tied to the caller (never trusts a client user_id).
-- Granted to authenticated only — login FAILURES (which are pre-auth/anon) are
-- captured authoritatively by Supabase GoTrue's own auth audit log (dashboard →
-- Authentication → Logs); use this RPC for post-auth app events (consent, denied
-- sensitive actions, etc.).
create or replace function public.log_security_event(
  p_event  text,
  p_detail jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip inet;
begin
  if p_event is null or length(p_event) = 0 or length(p_event) > 64 then
    raise exception 'invalid_event';
  end if;
  -- Bound the payload and throttle per caller so an authenticated (incl. a free
  -- anonymous) JWT can't flood the Reg.13 audit table or bloat storage.
  if pg_column_size(coalesce(p_detail, '{}'::jsonb)) > 2048 then
    raise exception 'detail_too_large';
  end if;
  if (select count(*) from public.security_audit_log
        where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited';
  end if;
  begin
    v_ip := nullif(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', '')::inet;
  exception when others then
    v_ip := null;
  end;
  insert into public.security_audit_log (user_id, event, detail, ip)
  values (auth.uid(), p_event, coalesce(p_detail, '{}'::jsonb), v_ip);
end;
$$;

revoke all on function public.log_security_event(text, jsonb) from public;
grant execute on function public.log_security_event(text, jsonb) to authenticated;

-- ── Notes the owner must verify in the live project ───────────────────────────
-- • RLS already scopes profiles to auth.uid()=id (schema.sql) — users read/write
--   only their own row. The leads internal columns are column-grant restricted
--   (security hardening, e53e3d6).
-- • Encryption in transit: enforce TLS 1.2+ at the edge (Supabase + Netlify do;
--   the site sets HSTS). Encryption at rest: Supabase encrypts storage by default;
--   for column-level PII encryption of phone/email consider pgsodium/Vault
--   (deferred — it complicates the team's service_role reads and is not required
--   for compliance given disk-level encryption + strict RLS).
