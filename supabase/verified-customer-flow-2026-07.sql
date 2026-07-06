-- ─────────────────────────────────────────────────────────────────────────────
-- verified-customer-flow-2026-07.sql  (2026-07-06)
--
-- Makes the community "לקוח מאומת" badge REAL. Today profiles.is_verified_customer
-- exists (default false) and ProfileView renders a badge from it, but NOTHING ever
-- sets it honestly — and until community-web-hardening-2026-07.sql FIX 1 it was even
-- self-settable by any member. This stamps it SERVER-SIDE ONLY, from two genuine,
-- auditable signals that already exist:
--   • a Zoom meeting reaching status 'completed'  (meeting_events status_change)
--   • a lead reaching status 'won'                (a confirmed switch)
-- Mirrors the existing B5 precedent set_review_verified_customer (schema.sql).
--
-- DEPENDS ON community-web-hardening-2026-07.sql FIX 1 (already applied): that removed
-- the client's UPDATE grant on is_verified_customer, so this helper is the ONLY writer.
-- Additive, idempotent, reversible, fail-soft. Gated on owner "מאשר פריסה".
-- Badge criterion (owner-adjustable): completed meeting OR won lead.
-- Apply as MCP migration: verified_customer_flow_2026_07.
-- ─────────────────────────────────────────────────────────────────────────────

-- Honest "since" / "why" for the badge (auditable, reversible). is_verified_customer
-- already exists from community-web-fixes-2026-07.sql (default false).
alter table public.profiles add column if not exists verified_customer_at     timestamptz;
alter table public.profiles add column if not exists verified_customer_source text; -- 'meeting_completed' | 'lead_won'

-- Single writer of is_verified_customer (service_role / internal triggers only).
create or replace function public.mark_verified_customer(p_uid uuid, p_source text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_uid is null then return; end if;
  begin
    update public.profiles
       set is_verified_customer     = true,
           verified_customer_at     = coalesce(verified_customer_at, now()),
           verified_customer_source = coalesce(verified_customer_source, p_source),
           updated_at               = now()
     where id = p_uid and is_verified_customer = false;   -- idempotent: false→true only
  exception when others then null;                        -- fail-soft: never block the caller
  end;
end; $$;
revoke execute on function public.mark_verified_customer(uuid, text) from public, anon, authenticated;

-- Trigger A — a Zoom meeting genuinely completed. meeting_events is written by the
-- rep flow (event='status_change', new_status='completed'); meetings.user_id is
-- server-authoritative (meetings_guard forces it = auth.uid()), so it can't be spoofed.
create or replace function public.verify_customer_on_meeting_complete()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if new.event = 'status_change' and new.new_status = 'completed' then
    begin
      select user_id into v_uid from public.meetings where id = new.meeting_id;
      perform public.mark_verified_customer(v_uid, 'meeting_completed');
    exception when others then null;
    end;
  end if;
  return new;
end; $$;
revoke execute on function public.verify_customer_on_meeting_complete() from public, anon, authenticated;
drop trigger if exists meeting_events_verify_customer on public.meeting_events;
create trigger meeting_events_verify_customer
  after insert on public.meeting_events
  for each row execute function public.verify_customer_on_meeting_complete();

-- Trigger B — a lead reached 'won' (a confirmed switch). leads.user_id is null for
-- pre-signin leads → those correctly don't stamp (no profile to badge).
create or replace function public.verify_customer_on_lead_won()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'won' and coalesce(old.status,'') <> 'won' and new.user_id is not null then
    perform public.mark_verified_customer(new.user_id, 'lead_won');
  end if;
  return new;
end; $$;
revoke execute on function public.verify_customer_on_lead_won() from public, anon, authenticated;
drop trigger if exists leads_verify_customer on public.leads;
create trigger leads_verify_customer
  after update on public.leads
  for each row execute function public.verify_customer_on_lead_won();

-- Expose an honest "since" to the public profile (still no PII).
create or replace view public.public_profiles as
  select id, name, avatar_url, is_verified_customer, is_admin, verified_customer_at
  from public.profiles;
grant select on public.public_profiles to anon, authenticated;

-- One-time backfill of genuine existing customers (idempotent: only false→true).
update public.profiles p
   set is_verified_customer = true, verified_customer_at = now(), verified_customer_source = 'lead_won'
 where p.is_verified_customer = false
   and exists (select 1 from public.leads l where l.user_id = p.id and l.status = 'won');
update public.profiles p
   set is_verified_customer = true, verified_customer_at = now(), verified_customer_source = 'meeting_completed'
 where p.is_verified_customer = false
   and exists (select 1 from public.meetings m where m.user_id = p.id and m.status = 'completed');

-- Rollback: drop triggers + the 3 functions; alter table drop verified_customer_at,
--   verified_customer_source; recreate public_profiles without verified_customer_at.
