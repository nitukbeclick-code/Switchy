# נוהל תגובה לאירוע אבטחת מידע / Security Incident Response Plan

> **DRAFT — for lawyer review.** A working incident-response plan for Switch AI
> (חוסך). The ~72-hour Authority-notification target and the threshold for
> notifying data subjects are **legal determinations the owner's lawyer must
> confirm per Amendment 13 and the 2017 Security Regulations** — this draft sets
> up the operational process, not the legal threshold.

- **מתאם אירוע / Incident lead:** the DPO / security officer `[[OWNER: name + 24/7 contact]]`
- **דיווח לרשות / Authority:** הרשות להגנת הפרטיות (Privacy Protection Authority),
  gov.il — see [`OWNER_ACTIONS.md`](./OWNER_ACTIONS.md) for the contact/complaint path.

---

## 0. מה נחשב אירוע / What counts as an incident

Any actual or suspected: unauthorized access/exfiltration of personal data;
leak of the `service_role` key or a Vault/webhook secret; abuse that defeats the
rate-limit gate; data corruption/ransomware; a processor breach (Supabase/Vercel/
Meta/Google/Resend); or accidental exposure (e.g. an over-broad RLS/grant change).

## 1. גילוי / Detection

**Signals to watch:**
- Edge-function structured logs + the daily `bot-health` workflow.
- Supabase auth logs (spikes in failed logins / anomalous sign-ins).
- `security_audit_log` anomalies (e.g. bursts of denied/sensitive events).
- Rate-limit 429 spikes on `/api/lead` (`leads_rate_limit`).
- Processor breach notices (Supabase/Vercel/Meta/Google/Resend status + email).
- External report → hello@chosech.co.il / WhatsApp 050-503-7537.

**On detection:** open a timestamped incident record (time, reporter, what was
seen). Start the clock — the ~72h Authority window, if applicable, runs from
becoming aware.

## 2. בלימה / Containment (immediate)

- **Rotate the exposed secret first.** If `service_role`/Vault/webhook secret may
  be exposed: rotate per `supabase/README.md` §8 (key matrix + rotation order),
  redeploy edge functions, re-register webhooks.
- Revoke/short-circuit the abused path (tighten RLS/grant, disable a function,
  block an IP/origin, or pull a processor integration).
- Preserve evidence — **do not** wipe logs; snapshot relevant rows/logs.
- If a processor is the source, open a ticket with them and capture their ref.

## 3. הערכה / Assessment

Determine and write down:
- **What data, whose, how many** subjects/records (leads? phones? whatsapp?).
- **Sensitivity** (this DB holds contact PII + marketing consent; **no** ID/
  financial/health data — relevant to severity).
- Root cause and current exposure status (contained? ongoing?).
- **Legal classification** — is this a **חמור / serious** security event
  triggering Authority notification, and does it cross the data-subject
  notification threshold? `[[OWNER + lawyer decision — see OWNER_ACTIONS.md]]`.

## 4. דיווח / Notification

- **לרשות להגנת הפרטיות / To the Privacy Protection Authority:** if classified as
  a serious event, notify **as required (target ~72h from awareness)** via the
  Authority's channel on gov.il. `[[OWNER + lawyer confirm exact form, timing,
  and content per Amendment 13]]`.
- **לנושאי המידע / To affected data subjects:** notify if the event is likely to
  cause them harm / per the legal threshold — in clear Hebrew: what happened,
  what data, what they should do, and our contact. Channel: the phone/email/
  WhatsApp on file.
- **למעבדים/שותפים / Processors & partners:** notify any processor whose system
  is implicated; coordinate a joint statement if needed.
- **Single source of truth for messaging:** all external comms go through the
  incident lead — no ad-hoc statements.

## 5. תיקון ושחזור / Eradication & recovery

- Patch the root cause (code/RLS/grant fix → PR → gates green → deploy).
- Restore from backup if integrity was affected (test the restore — see
  [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) §backup).
- Confirm the abused path is closed and monitor for recurrence.

## 6. הפקת לקחים / Post-mortem

Within ~1 week, a blameless write-up: timeline, root cause, data impact, what
worked, what to fix (controls, monitoring, a new PIA item), and owners/dates.
File it and feed actions into the next security review.

## תפקידים / Roles

| תפקיד / Role | אחריות / Responsibility |
|--------------|--------------------------|
| Incident lead (DPO/security officer) | Runs the response, owns timing + the Authority decision-prep, single comms channel |
| Engineering | Containment, secret rotation, fix + deploy, evidence preservation |
| Owner / legal | Final call on Authority + data-subject notification; signs external statements |
| Processor liaison | Contacts the implicated processor, tracks their ref/timeline |

---
_Grounded in: `supabase/README.md` §8 (secret rotation), `docs/EDGE_FUNCTIONS.md`,
`supabase/legal-consent-2026-06.sql` (`security_audit_log`). Draft — notification
thresholds/timing are legal determinations for the owner's lawyer._
