-- ─────────────────────────────────────────────────────────────────────────────
-- leads-phone-canonical-2026-07.sql  (2026-07-29)  — DATA REPAIR, format only.
--
-- ⚠️  DRAFT — do NOT auto-apply. Apply by hand, AFTER the code deploy is verified
--     live (see "SEQUENCING" below). Nothing in the accompanying PR runs this.
--
-- WHY
--
-- public.leads.phone held the SAME person under up to three different spellings,
-- because two functions named normalizeLeadPhone disagreed:
--
--   _shared/leads.ts            → national, validated  "0547342005"
--   whatsapp-webhook/index.ts   → `+${digits}`         "+972547342005"   (deleted)
--
-- The webhook's copy was file-private, so it SHADOWED the shared one inside
-- createHandoffLead and deno check never saw a collision. Result in this project on
-- 2026-07-29, before the fix:
--
--   • 32 lead rows for 16 distinct humans.
--   • one customer held THIRTEEN rows: 0547342005 ×9 (web/advisor),
--     972547342005 ×3 and +972547342005 ×1 (whatsapp).
--   • 18/18 source='whatsapp' rows in a 972/+972 shape; every web/advisor row in 05…
--   • only 9 of 29 whatsapp_contacts↔leads joins matched on an exact phone.
--
-- The code fix unifies every edge-function writer on the national form, so NEW rows
-- are consistent. This file repairs the rows already stored.
--
-- WHY IT IS NEEDED AND NOT MERELY TIDY
--
-- _shared/leadlookup.ts leadPhoneCandidates makes READS work by generating all three
-- shapes. But three things compare the stored digit string directly and cannot be
-- fixed from the client:
--
--   1. public.search_leads(q) — `regexp_replace(phone,'\D','','g') LIKE '%'||digits||'%'`.
--      "972547342005" does not contain "0547342005", so notify-lead's returningLineFor
--      fails to recognise a returning customer across the two formats.
--   2. leads_rate_limit()'s per-phone 5-per-24h cap compares digit strings for
--      EQUALITY, so the two formats count as different phones and the cap is
--      format-bypassable.
--   3. Any group-by-phone report — i.e. the owner seeing one human instead of thirteen.
--
-- Unifying the column makes all three work, including retroactively.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
-- It changes NO row's identity: nothing is deleted, merged, or re-statused.
--   • public.lead_events.lead_id is `references public.leads(id) ON DELETE CASCADE`
--     (schema.sql:288) — deleting any duplicate destroys that row's audit trail.
--   • Marking duplicates status='lost' would distort win-rate with a fiction.
-- Deciding what to do about a duplicate CLUSTER is a human call. Section 3 prints the
-- clusters read-only; it writes nothing.
--
-- whatsapp_contacts.wa_phone is NOT touched. It is Meta's wa_id (bare "972…"), the
-- onConflict upsert key (whatsapp-webhook/index.ts:620), the Graph send address, and
-- the lookup key in account-delete + _shared/compliance.ts.
--
-- SEQUENCING (matters)
--
-- Deploy the code FIRST (whatsapp-webhook + notify-lead), confirm one real hand-off
-- writes 05…, and only then apply this. Run it before the deploy lands and new rows
-- keep arriving in +972…, so you would have to migrate twice. It is idempotent, so a
-- second run is harmless — but a second run should not be NEEDED.
--
-- PRE-FLIGHT ALREADY VERIFIED (2026-07-29, this project)
--
-- The one real hazard was a phone UPDATE re-firing the Telegram rep card for all 18
-- WhatsApp leads. The rep-card trigger is not defined in this repo's SQL, so it was
-- read from production directly. It is AFTER **INSERT** only:
--
--     leads_notify_after_insert   AFTER INSERT   → notify_lead_on_insert()
--
-- and the only UPDATE triggers cannot fire on a phone-only change either:
--
--     leads_realized_saving_after_update  AFTER UPDATE **OF status, actual_saving**
--     leads_verify_customer               AFTER UPDATE, body guarded on
--                                         (new.status='won' and old.status<>'won')
--
-- The three BEFORE INSERT triggers (anon_write_guard, consent_stamp, rate_limit) are
-- INSERT-scoped and so are irrelevant to an UPDATE — in particular this migration
-- CANNOT trip the rate-limit gate or re-stamp anybody's consent.
--
-- Re-run section 1 anyway before applying: it is cheap, and a trigger added since
-- would invalidate the paragraph above.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. PRE-FLIGHT (read-only) ────────────────────────────────────────────────
-- (a) Confirm the rep-card trigger is still INSERT-only. If anything here is an
--     UPDATE trigger that is not column-scoped away from `phone`, STOP.
select tgname,
       case when (tgtype & 2) > 0 then 'BEFORE' else 'AFTER' end as timing,
       case when (tgtype & 4) > 0 then 'INSERT ' else '' end ||
       case when (tgtype & 8) > 0 then 'DELETE ' else '' end ||
       case when (tgtype & 16) > 0 then 'UPDATE ' else '' end as events,
       pg_get_triggerdef(oid) as def
  from pg_trigger
 where tgrelid = 'public.leads'::regclass and not tgisinternal
 order by tgname;

-- (b) Exactly which rows would change, and to what. Writes nothing.
select id, source, status, created_at, phone as before,
       '0' || substring(regexp_replace(phone, '\D', '', 'g') from 4) as after
  from public.leads
 where regexp_replace(phone, '\D', '', 'g') ~ '^972[0-9]{8,9}$'
 order by created_at;


-- ── 2. THE MIGRATION ─────────────────────────────────────────────────────────
-- Idempotent (a second run matches nothing) and Israel-only: the ^972 guard leaves
-- every genuinely foreign number alone, so a legitimate +1… hand-off is never
-- mangled into an IL number.
--
-- Arithmetic, so the output cannot violate the insert gate:
--   "972" + 9 digits → "0" + 9 = 10 chars  (IL mobile)
--   "972" + 8 digits → "0" + 8 =  9 chars  (IL landline)
-- both match _shared/leads.ts's `^0\d{8,9}$` AND the leads_rate_limit shape gate
-- `^[+0-9][0-9\-\s]{7,14}$` (1 leading char + 7..14 ⇒ total length 8..15).
--
-- Run the whole block as ONE transaction and READ THE TWO POST-CHECKS BEFORE
-- COMMITTING. Both must return 0. If either does not, `rollback`.

begin;

update public.leads
   set phone = '0' || substring(regexp_replace(phone, '\D', '', 'g') from 4)
 where regexp_replace(phone, '\D', '', 'g') ~ '^972[0-9]{8,9}$';

-- POST-CHECK 1 — must be 0: no row may violate the BEFORE-INSERT shape gate.
-- (Existing rows are not re-validated by Postgres, so a bad value here would sit
--  silently until some future insert path choked on it.)
select count(*) as must_be_zero_bad_shape
  from public.leads
 where phone is not null
   and phone !~ '^[+0-9][0-9\-\s]{7,14}$';

-- POST-CHECK 2 — must be 0: no Israeli row left in a 972/+972 shape.
select count(*) as must_be_zero_still_972
  from public.leads
 where regexp_replace(phone, '\D', '', 'g') ~ '^972[0-9]{8,9}$';

-- Both zero ⇒
commit;
-- Otherwise ⇒
-- rollback;


-- ── 3. THE OWNER'S DECISION REPORT (read-only, writes nothing) ────────────────
-- After section 2 every spelling of one person collapses to one string, so this
-- finally shows duplicate clusters as they really are. Deciding what to do with each
-- cluster — which row a rep should work, which are dead — is a human call; nothing
-- here changes a row.
select regexp_replace(phone, '\D', '', 'g')      as person_digits,
       count(*)                                  as lead_rows,
       array_agg(distinct source)                as sources,
       array_agg(distinct status)                as statuses,
       min(created_at)                           as first_seen,
       max(created_at)                           as last_seen,
       count(*) filter (where status in ('new', 'contacted')) as still_open
  from public.leads
 where phone is not null
 group by 1
having count(*) > 1
 order by lead_rows desc, last_seen desc;

-- Sanity: how many rows vs how many humans. Before this migration the answer in
-- this project was 32 rows / 16 people.
select count(*)                                                as lead_rows,
       count(distinct regexp_replace(phone, '\D', '', 'g'))     as distinct_people
  from public.leads
 where phone is not null;
