# תבנית תסקיר השפעה על הפרטיות (PIA) / Privacy Impact Assessment Template

> **DRAFT TEMPLATE — for lawyer review.** Complete a copy of this for **any new
> data feature** before it ships (a new field collected, a new processor, a new
> use of existing data, a new AI capability, a new sharing path). Keep the
> completed copy with the governance docs. A PIA is a risk tool — escalate
> high-risk findings to the owner + lawyer before building.

**How to use:** copy this file to `docs/legal/pia/<feature>-<date>.md`, fill it
in, get sign-off, and add resulting actions to the processor register / security
policy / retention table.

---

## 0. מטא / Meta
- **שם היוזמה / Feature:** `…`
- **מבקש/בעלים / Requested by · owner:** `…`
- **תאריך / Date:** `…` · **גרסה / Version:** `…`
- **מאשרים / Reviewers (DPO, eng, owner):** `…`

## 1. תיאור / Description
- מה הפיצ'ר עושה ולמה / what it does and why (business goal): `…`
- אילו מסכים/פונקציות/טבלאות מושפעים / surfaces, edge functions, tables touched: `…`

## 2. נתונים / Data
- **נתונים אישיים חדשים שנאספים / new personal data collected:** `…`
- **נתונים קיימים בשימוש חדש / existing data used for a new purpose:** `…`
- **מידע רגיש?** (ת"ז, פיננסי, בריאות, ביומטרי, מיקום מדויק) / special-category? `…`
  *(baseline: this DB intentionally holds none of these — flag hard if that changes.)*
- **מקור / source:** `…` · **מי נושא המידע / data subjects:** `…`

## 3. בסיס משפטי והסכמה / Legal basis & consent
- בסיס לעיבוד / basis (consent / contract / legitimate purpose): `…`
- האם נדרשת הסכמה חדשה? כיצד תיאסף ותתועד (חותמת זמן + IP + גרסה)? / new consent? how stamped? `…`
- שיווק ישיר? אם כן — opt-in מפורש בלבד (§30A) ומנגנון הסרה / direct marketing opt-in + unsubscribe? `…`

## 4. זרימת נתונים / Data flow
- מאיפה לאן (client → API → DB → processors) / end-to-end flow: `…`
- מעבדים חדשים? → להוסיף ל-`PROCESSOR_REGISTER.md` ולחתום DPA / new processors? `…`
- העברה חוצת-גבולות? בסיס חוקי? / cross-border transfer + basis: `…`

## 5. אחסון, שמירה ומחיקה / Storage, retention & deletion
- היכן יישמר / where stored: `…`
- תקופת שמירה ומנגנון מחיקה (auto-purge?) / retention window + purge: `…`
- כיצד תיענה בקשת מחיקה/עיון/תיקון / how access/deletion requests are served: `…`

## 6. גישה ובקרה / Access & controls
- מי יוכל לגשת ובאיזו הרשאה / who can access, at what role: `…`
- RLS + column grants מתוכננים / planned RLS policies + column grants: `…`
- אם נחשפת עמודת PII חדשה — לוודא revoke מ-anon/authenticated / revoke new PII columns from clients? `…`
- סודות/מפתחות — בשרת בלבד / Vault? / secrets server-only / in Vault? `…`

## 7. סיכונים ומיתון / Risks & mitigations
| סיכון / Risk | סבירות/חומרה / L·S | מיתון / Mitigation | סיכון שיורי / Residual |
|--------------|--------------------|--------------------|------------------------|
| `…` | `…` | `…` | `…` |

Common ones to consider: over-collection; new PII leaking via `select=*`;
rate-limit/cost amplification; secret exposure; processor breach; backdated/
spoofed consent; cross-border transfer without basis; storing data that should be
transient (e.g. images).

## 8. החלטה / Decision
- ☐ Approved as-is ☐ Approved with conditions ☐ Needs lawyer review ☐ Rejected
- תנאים/פעולות נדרשות / conditions & follow-up actions (with owners + dates): `…`
- **High-risk → escalate to owner + lawyer before building.**

## 9. מעקב / Follow-up
- עדכון נגזר ל-`DATABASE_DEFINITIONS.md` / `PROCESSOR_REGISTER.md` /
  `SECURITY_POLICY.md` (retention)? / downstream doc updates: `…`
- תאריך סקירה חוזרת / re-review date: `…`

---
_Template — adapt with counsel. Grounded in this project's controls
(`docs/legal/SECURITY_POLICY.md`, `DATABASE_DEFINITIONS.md`)._
