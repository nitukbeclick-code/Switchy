# מסמכי ממשל פרטיות ואבטחת מידע — Privacy & Security Governance (Amendment 13)

> **DRAFT — for the owner and the owner's lawyer.** These documents are an
> honest, engineering-grounded **draft** of the governance documents that
> Israel's Privacy Protection Law (Amendment 13 / **תיקון 13**, in force
> Aug 2025) and the Privacy Protection Regulations (Information Security), 2017
> require an operator of a database holding personal data to maintain. They are
> **not legal advice** and **do not assert formal/audited compliance**. Nothing
> here should be published or relied on until reviewed by a qualified Israeli
> privacy lawyer. See [`OWNER_ACTIONS.md`](./OWNER_ACTIONS.md).

## מי אנחנו / Subject of these documents

- **מותג / Brand:** Switch AI (חוסך)
- **אתר קנוני / Canonical site:** https://app.switchy-ai.com
- **יצירת קשר / Contact:** hello@chosech.co.il · WhatsApp 050-503-7537
- **ישות משפטית רשומה / Registered legal entity:** אריאל תקשורת
- **עוסק מורשה / ע.מ / Business reg. no.:** 322253618
- **כתובת רשומה / Registered address:** ליאו בק 64, נהריה
- **ממונה על הגנת הפרטיות / DPO:** `[[OWNER: name + contact]]` — see
  [`DPO_CHARTER.md`](./DPO_CHARTER.md)

## תוכן / Contents

| קובץ / File | מטרה / Purpose |
|-------------|----------------|
| [`DATABASE_DEFINITIONS.md`](./DATABASE_DEFINITIONS.md) | מסמך הגדרות המאגר — database name, purpose, data + subject categories, storage, retention, access, processors, controls |
| [`SECURITY_POLICY.md`](./SECURITY_POLICY.md) | נוהל אבטחת מידע per the 2017 Security Regulations — the real controls in this system |
| [`PROCESSOR_REGISTER.md`](./PROCESSOR_REGISTER.md) | מרשם מעבדי משנה / external processors — who, what data, DPA status |
| [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md) | נוהל תגובה לאירוע אבטחה — detect → contain → assess → notify → post-mortem |
| [`PIA_TEMPLATE.md`](./PIA_TEMPLATE.md) | תבנית תסקיר השפעה על הפרטיות (PIA) for new data features |
| [`DPO_CHARTER.md`](./DPO_CHARTER.md) | כתב מינוי ותפקיד הממונה — role, duties, independence |
| [`OWNER_ACTIONS.md`](./OWNER_ACTIONS.md) | The checklist of things **only the owner** can do, in priority order |

## Authoritative engineering sources these drafts are grounded in

These are descriptions of the **real** system as built; if the code changes, the
documents must be re-derived from it (not the reverse):

- `docs/DATA_MODEL.md` — the Supabase schema + RLS posture.
- `docs/EDGE_FUNCTIONS.md` — the server functions, each function's own auth model.
- `supabase/schema.sql` + `supabase/*-2026-06*.sql` — authoritative DDL/policies.
- `supabase/legal-consent-2026-06.sql` — consent columns, consent RPC,
  `security_audit_log`, `log_security_event`.
- `web/app/api/lead/route.ts`, `web/components/LeadForm.tsx` — the lead capture
  + consent path.
- `supabase/README.md` — backend security model + secret-rotation runbook.

_Last drafted: 2026-06 · consent_version `2026-06`._
