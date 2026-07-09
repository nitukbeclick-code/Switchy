-- leads-client-write-read-lockdown-2026-07.sql
-- Lock down what a client holding the public anon key can write to / read from
-- the leads table.
--
-- Context: leads are inserted three ways — the Next.js /api/lead route and CRM
-- tooling use service_role (which bypasses grants AND RLS), while the static
-- site (POST /rest/v1/leads) and the Flutter app insert DIRECTLY with the anon /
-- session key. Before this migration those direct clients had a whole-table
-- INSERT grant plus an `INSERT ... WITH CHECK (true)` policy, so anyone with the
-- (public) anon key could POST arbitrary rows and set server-owned columns:
-- forge pipeline `status`, hijack rep ownership (`claimed_by*`, `claimed_at`),
-- spoof `source_ip`, fabricate `actual_saving`, plant internal `*_at` workflow
-- timestamps, or attribute a lead to another user's `user_id`.
--
-- Fix (three parts, all constraining ONLY anon/authenticated; service_role is
-- unaffected and keeps writing every column server-side):

-- 1) INSERT column allowlist — exactly the fields a lead form legitimately
--    submits. Every excluded (server-owned) column is nullable or defaulted and
--    is never sent by a client, so legitimate inserts are unchanged.
revoke insert on public.leads from anon, authenticated;
grant insert (
  id, user_id, name, phone, email, provider, plan_id, callback_time,
  created_at, source, notes, city, referrer_code,
  consent_marketing_sms, consent_marketing_email, consent_marketing_whatsapp,
  terms_accepted_at, privacy_accepted_at, marketing_accepted_at
) on public.leads to anon, authenticated;

-- 2) SELECT column allowlist — the app only ever reads its own lead's status +
--    created_at (see supabase_backend.dart fetchLeadStep/fetchLeadInfo). Narrow
--    the authenticated grant so a lead owner can no longer read internal CRM
--    fields (claimed_by, notes, actual_saving, source_ip, …) about their own
--    row. anon has no SELECT on leads and keeps none.
revoke select on public.leads from authenticated;
grant select (id, user_id, status, created_at) on public.leads to authenticated;

-- 3) RLS INSERT check — a client can no longer attribute a lead to someone
--    else's user_id. Anonymous inserts (user_id null) and signed-in own-user
--    inserts still pass.
drop policy if exists leads_insert_anyone on public.leads;
create policy leads_insert_anyone on public.leads
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
