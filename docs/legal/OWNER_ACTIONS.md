# פעולות לבעלים בלבד / Owner-Only Action Checklist (Amendment 13)

> **DRAFT — for the owner.** These are the steps **only the owner** (and the
> owner's lawyer) can take to move from "drafted governance docs" toward genuine
> Amendment-13 readiness. The documents in `docs/legal/` are an **honest draft**,
> not legal advice and **not** an assertion of compliance or a completed audit.
> Nothing should be published or relied upon until a qualified Israeli privacy
> lawyer reviews it.
>
> Ordered by **Amendment-13 priority / risk** — do the P0 items first.

---

## P0 — לפני הסתמכות כלשהי / Blocking, do first

1. **בדיקת עורך/ת דין פרטיות / Lawyer review.** Have an Israeli privacy lawyer
   review **all** of `docs/legal/` plus the live `web/app/{privacy,terms,
   accessibility}/page.tsx`. Confirm they reflect actual practice.
2. **מילוי הזהות המשפטית / Fill the legal identity.** Replace every
   `[[OWNER: registered legal entity]]` / `[[OWNER: company number / ח.פ]]` with
   the real registered entity and number (used across all docs + the public
   legal pages).
3. **מינוי ממונה / Appoint the DPO.** Decide whether a DPO is legally required,
   appoint an eligible person with no disqualifying conflict, and fill
   `[[OWNER: name + contact]]` in [`DPO_CHARTER.md`](./DPO_CHARTER.md) and the
   other docs. (Engineering cannot appoint a person.)
4. **סיווג רמת האבטחה / Classify the security tier** (basic/medium/high) of the
   database with the lawyer — it sets which 2017-Regulation obligations apply
   (see [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) §0).
5. **רישום המאגר / Database registration** — determine with the lawyer whether the
   database must be registered with the Privacy Protection Authority and, if so,
   register it.

## P1 — חשיפה משפטית גבוהה / High legal exposure

6. **חתימת DPAs / Sign Data Processing Agreements** with every processor in
   [`PROCESSOR_REGISTER.md`](./PROCESSOR_REGISTER.md): Supabase, Vercel, Google
   (Gemini + GA4), Meta (WhatsApp), Resend, Cloudflare (if it fronts prod), Zoom
   (if meetings are live), and any live AI fallback (Groq/OpenRouter/OpenAI).
   Record signing dates.
7. **בסיס להעברה חוצת-גבולות / Cross-border transfer basis.** Confirm the lawful
   basis for storing data in the EU (Supabase Frankfurt) and processing in the
   US/global (Vercel/Google/Meta/Resend) under the Transfer-of-Data-Abroad
   Regulations.
8. **סף דיווח על אירוע / Set the incident-notification thresholds.** With the
   lawyer, define precisely when an event is "serious" enough to notify the
   Authority (~72h target) and when to notify data subjects; fill those into
   [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).
9. **אישור מסלול תלונה לרשות / Authority complaint/contact path.** Confirm and
   publish the current path for data-subject complaints to **הרשות להגנת הפרטיות**
   on **gov.il** (search "הרשות להגנת הפרטיות" / Privacy Protection Authority →
   "הגשת תלונה"); add it to the public privacy page. `[[OWNER: paste the exact
   current gov.il URL after verifying it]]`.

## P2 — חיזוק תפעולי / Operational hardening (owner-decided, eng-implementable)

10. **הפעלת auto-purge לפי שמירה / Approve & deploy retention auto-purge.** The
    30-day `source_ip` clearing is **already live**; approve a pg_cron job to
    hard-delete `leads`/`whatsapp_*`/`security_audit_log` past their windows
    (proposed 24mo for leads) and confirm each window with the lawyer. Until
    deployed, the table-wide purge stays "planned" in the docs.
11. **גיבוי ושחזור / Backups & restore.** Confirm the Supabase backup tier /
    enable PITR, set RPO/RTO, and run + document a **test restore**.
12. **החלטת הצפנת עמודות PII / Decide column-level PII encryption.** Decide
    whether phone/email need pgsodium/Vault encryption beyond disk-level
    encryption + RLS (deferred today).
13. **קביעת תקופות שמירה חסרות / Fill open retention windows** for `whatsapp_*`
    and `security_audit_log` in [`DATABASE_DEFINITIONS.md`](./DATABASE_DEFINITIONS.md) §6.

## P3 — שגרה מתמשכת / Ongoing routine

14. **PIA לכל פיצ'ר נתונים חדש / Run a PIA** before any new data feature
    ([`PIA_TEMPLATE.md`](./PIA_TEMPLATE.md)).
15. **סקירה שנתית / Annual review** of every doc + RLS/grants + restore test,
    owned by the DPO; record dates.
16. **הדרכת בעלי גישה / Train anyone with data access** (sales/ops reps using the
    Telegram console + `crm-api`) on least-privilege and consent rules.

---

## Placeholders to fill (search for `[[OWNER` across `docs/legal/`)

- Registered legal entity + ח.פ / company number
- DPO name + direct contact
- Security tier classification
- Retention windows for `whatsapp_*` and `security_audit_log`
- Backup tier / PITR / RPO / RTO
- Signed-DPA dates per processor
- Cross-border transfer basis
- Incident notification thresholds + the verified gov.il complaint URL
- Confirmation of which AI fallback keys (Groq/OpenRouter/OpenAI) are live in prod
- Whether Cloudflare fronts production; whether the meetings/Zoom feature is live

---
_Draft checklist — not legal advice. The lawyer review (P0 #1) governs everything
else._
