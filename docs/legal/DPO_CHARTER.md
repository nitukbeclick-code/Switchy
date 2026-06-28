# כתב מינוי ותפקיד הממונה על הגנת הפרטיות / DPO Charter

> **DRAFT — for lawyer review.** Defines the role, duties, independence and
> reporting of the **ממונה על הגנת הפרטיות (DPO)** for Switch AI (חוסך). Under
> Amendment 13, certain database holders must appoint a DPO; whether this
> operator is **legally required** to appoint one — and who is eligible — is a
> determination for the owner's lawyer. `[[OWNER + lawyer: confirm obligation]]`.

---

## 1. מינוי / Appointment

- **ממונה / DPO:** `[[OWNER: name]]`
- **יצירת קשר ישירה / Direct contact:** `[[OWNER: email/phone for the DPO]]`
  (public-facing privacy contact remains hello@chosech.co.il · WhatsApp
  050-503-7537 — routed to the DPO).
- **מאשר/ממנה / Appointed by:** אריאל תקשורת,
  ח.פ/ע.מ 322253618.
- **תאריך מינוי / Appointment date:** `[[OWNER: date]]`.

## 2. תחומי אחריות / Duties

The DPO is the single accountable owner of the privacy program:

- **תיעוד וממשל / Documentation & governance:** maintain and keep current the
  database-definitions document, this charter, the security policy, the processor
  register, the incident-response plan, and the PIA process (all in
  `docs/legal/`).
- **ציות / Compliance oversight:** monitor compliance with the Privacy Protection
  Law (incl. Amendment 13), the 2017 Security Regulations, and the Spam Law
  (§30A) consent rules; advise the owner/engineering.
- **זכויות נושאי מידע / Data-subject rights:** own the intake and timely handling
  of access / correction / deletion / marketing-opt-out requests
  (hello@chosech.co.il).
- **תסקירי השפעה / PIAs:** ensure a PIA is completed for every new data feature
  before launch (see [`PIA_TEMPLATE.md`](./PIA_TEMPLATE.md)) and gate high-risk
  items.
- **אבטחת מידע / Security:** oversee the controls in
  [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) (RLS/grants, secret handling,
  rate-limits, encryption, logging, retention/auto-purge) with engineering; own
  the **annual review** and the **backup-restore test**.
- **אירועים / Incidents:** act as incident lead per
  [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md); prepare the Authority and
  data-subject notification decisions for the owner/lawyer.
- **מעבדים / Processors:** ensure each processor has a signed DPA and that
  cross-border transfer has a lawful basis (see
  [`PROCESSOR_REGISTER.md`](./PROCESSOR_REGISTER.md)).
- **הדרכה / Training & awareness:** ensure anyone with data access (incl. ops/
  sales reps using Telegram + `crm-api`) understands least-privilege and consent
  rules.
- **קשר עם הרשות / Liaison:** point of contact with הרשות להגנת הפרטיות.

## 3. עצמאות, סמכות ומשאבים / Independence, authority & resources

- **דיווח ישיר / Reports directly** to the owner/founder (top management); is not
  instructed on *how* to perform the privacy role.
- **גישה / Access** to the systems, logs, and people needed to do the job.
- **סמכות לעצור / Authority to halt** a launch that fails its PIA or creates
  unacceptable privacy risk, pending owner/lawyer resolution.
- **ללא ניגוד עניינים / No conflict of interest:** the DPO should not also own a
  function whose decisions they must independently oversee
  `[[OWNER + lawyer: confirm the appointee has no disqualifying conflict]]`.
- **משאבים / Resources** to maintain the program (time, budget for legal review,
  DPAs).

## 4. סקירה / Review

- This charter and the DPO's standing are reviewed at least **annually** with the
  rest of the governance docs.
- Last review: `[[OWNER: date]]` · Next due: `[[OWNER: date]]`.

---
_Draft — confirm the legal obligation to appoint, eligibility, and conflict-of-
interest with the owner's lawyer before finalizing._
