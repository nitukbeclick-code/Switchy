# נוהל אבטחת מידע / Information Security Policy

> **DRAFT — engineering-grounded, for lawyer review.** Structured to the
> Privacy Protection Regulations (Information Security), 2017
> (**תקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017**). It describes the **real**
> controls implemented in this system, grounded in the code. It does **not**
> assert a completed external audit or certified compliance. Some items are
> explicitly marked as **planned** or as **owner-to-verify**.

- **בעל המאגר / Holder:** `[[OWNER: registered legal entity]]`, ח.פ `[[OWNER]]`
- **אחראי אבטחת מידע / Security officer:** `[[OWNER: name]]` (may be the DPO)
- **רמת אבטחה / Security tier:** the operator should classify the database tier
  (basic / medium / high) under the Regulations — given lead PII + marketing, a
  **medium** tier is the working assumption `[[OWNER: confirm tier with lawyer]]`.

---

## 1. בקרת גישה / Access control (Reg. 9–13)

- **Row-Level Security (RLS) enabled on every table.** A table with RLS and no
  matching policy is *locked* (Supabase automatic-RLS safe default).
- **Least privilege by role:**
  - `anon` → INSERT-only on `leads`; **no SELECT** anywhere
    (`revoke select on public.leads from anon`).
  - `authenticated` → own rows only (`auth.uid() = user_id`); on `leads`,
    **column-scoped** to `id, status, created_at, user_id`.
  - `service_role` → full access (bypasses RLS), **server-side only**.
- **Column-level grants (defence in depth):** internal/PII columns (`notes`,
  `source_ip`, `city`, `claimed_by*`, `actual_saving`, audit timestamps) are
  revoked from clients and never returned via `select=*`.
- **Locked tables:** `whatsapp_*`, `crm_events`, `security_audit_log`,
  `lead_events`, `meeting_events` have RLS on and **no client policy** → only the
  service-role reads them.
- **Admin gate:** the CRM backend (`crm-api` edge function) requires a signed-in
  user **and** an `is_admin` check (`requireAdmin` → 403 otherwise); DB access is
  service-role.
- **Secrets, server-only:** `SUPABASE_SERVICE_ROLE_KEY` lives only in Vercel env
  + Edge env, never in any client bundle. Operational secrets (Telegram/Resend/
  AI/Zoom keys, the shared webhook secret) live in **Supabase Vault** (with Edge
  env fallback), read by functions via a service-role RPC.

## 2. בקרת תקשורת ושערים / Network, webhooks & API auth (Reg. 13)

- **HTTPS/TLS 1.2+** enforced at the edge (Supabase + Vercel); the site sets
  **HSTS**.
- **Origin allow-list / CSRF:** `/api/lead` rejects cross-origin browser POSTs
  (only our own hosts allowed); same-origin fetches pass; the DB gates remain the
  authoritative abuse control for non-browser callers.
- **Per-webhook authentication** (each function enforces its own — see
  `docs/EDGE_FUNCTIONS.md`):
  - Lead/notification + cron functions: shared **`x-webhook-secret`**
    (= Vault `lead_webhook_secret`); Telegram updates use a `secret_token` =
    SHA-256 of that secret.
  - **WhatsApp webhook: HMAC** — `X-Hub-Signature-256` (HMAC-SHA256 of the raw
    body with the Meta App Secret); GET verification via the verify token.
  - **Telegram webhook:** `secret_token` + strict UUID validation of the
    untrusted `/start` payload (per-chat link cap against harvesting).
- **Constant-time compare** (`safeEqual`) for secret checks to resist timing
  attacks.

## 3. הגבלת קצב ותקינות קלט / Rate-limiting & input validation

On `public.leads` (every insert fans out to Telegram + Resend + a paid AI call,
so it is a cost/spam target). The `leads_rate_limit` BEFORE-INSERT trigger:

- **Shape-validates:** name length 2–80; phone matches `^[+0-9][0-9\-\s]{7,14}$`;
  caps `notes` ≤2000, `email` ≤254, `provider`/`plan_id` ≤120.
- **Nulls server-managed columns** sent by a client (`claimed_*`, `*_at` stamps,
  `actual_saving`, `notified_at`, `status`, `source_ip`).
- **Rate limits:** per-phone (digits-only) ≤5/24h; per-IP ≤8/h; global ≤60/h
  (cost circuit-breaker). IP trust order: `cf-connecting-ip`, then the **last**
  X-Forwarded-For hop (never the spoofable first hop). Surfaced as HTTP 429.
- **`security_audit_log` append RPC** (`log_security_event`) is itself bounded
  (event ≤64 chars, detail ≤2048 bytes) and **throttled** (≤20/min per caller).

## 4. הסכמה ושלמות נתונים / Consent integrity & data integrity

- **Server-authoritative consent stamping** — `leads_consent_stamp` (BEFORE
  INSERT) overwrites `terms_/privacy_/marketing_accepted_at` with `now()` when
  the caller sent a non-null sentinel, so consent proof **can't be backdated or
  spoofed** (Spam Law §30A + Privacy Reg. 13).
- **Mandatory consent gate:** the lead form's consent checkbox is **unchecked by
  default** and required client-side; `/api/lead` **rejects** a submission whose
  `consent !== true`; marketing opt-in is separate and stays null unless actively
  given.
- **Registration consent RPC** (`record_registration_consent`,
  SECURITY DEFINER, pinned `search_path`) rejects registration missing
  terms+privacy and stamps server time + caller IP.

## 5. הצפנה / Encryption (Reg. 13)

- **In transit:** TLS 1.2+ end-to-end (edge-enforced); HSTS on the site.
- **At rest:** Supabase disk-level encryption (default).
- **Column-level PII encryption** of phone/email (pgsodium/Vault) is
  **deferred** — disk-level encryption + strict RLS/column-grants are the current
  posture; revisit with counsel if a higher tier is required
  `[[OWNER: decide with lawyer]]`.

## 6. גיבוי ושחזור / Backup & recovery (Reg. 14)

- Supabase managed backups are the recovery basis.
- `[[OWNER: confirm]]` backup tier + whether **Point-in-Time-Recovery (PITR)** is
  enabled; document **RPO/RTO** targets; **test a restore** at least annually and
  record the result.
- Application sources + SQL migrations are version-controlled in Git (the schema
  itself is reproducible from `supabase/*.sql`).

## 7. תיעוד וניטור גישה / Access logging & monitoring (Reg. 15)

- **`security_audit_log`** (service-role only) records post-auth security events
  (e.g. `consent_recorded`) with `user_id`, `event`, `detail`, `ip`, timestamp,
  via the throttled `log_security_event` RPC.
- **Auth audit:** login successes/failures are captured by Supabase GoTrue's own
  auth log (Dashboard → Authentication → Logs).
- **Structured JSON logs** from every edge function (`_shared/log.ts`) →
  dashboard log explorer.
- **Health monitoring:** `.github/workflows/bot-health.yml` probes deployed
  functions daily and fails loudly if config regresses; `cron_health` surfaces
  stuck scheduled jobs into the weekly report.

## 8. תקופת שמירה / Retention enforcement

- **Live:** `source_ip` cleared to NULL after 30 days (weekly cron in
  `renewal-reminders`).
- **Planned:** a pg_cron purge of `leads`/`whatsapp_*`/`security_audit_log` past
  their retention windows (see [`DATABASE_DEFINITIONS.md`](./DATABASE_DEFINITIONS.md)
  §6 and [`OWNER_ACTIONS.md`](./OWNER_ACTIONS.md)). Not yet deployed — do not
  represent as live.

## 9. אבטחת ספקים / Processor security

External processors and their DPA status are tracked in
[`PROCESSOR_REGISTER.md`](./PROCESSOR_REGISTER.md). Owner must ensure each
processor is bound by a **Data Processing Agreement** and that cross-border
transfer to the EU (Frankfurt) has a lawful basis.

## 10. אירועי אבטחה / Incident handling

Detection, containment, assessment, notification (data subjects + the Privacy
Protection Authority, target ~72h), and post-mortem are defined in
[`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md).

## 11. סקירה תקופתית / Periodic review (Reg. 17)

- **Annual review** of this policy, the database-definitions document, the
  processor register, RLS/grants, and a documented **backup-restore test** —
  owned by the DPO/security officer.
- Re-run after any material schema change, new processor, or new data feature
  (which also triggers a **PIA** — see [`PIA_TEMPLATE.md`](./PIA_TEMPLATE.md)).
- Last review: `[[OWNER: date]]` · Next due: `[[OWNER: date]]`.

---
_Grounded in: `supabase/schema.sql`, `supabase/legal-consent-2026-06.sql`,
`web/app/api/lead/route.ts`, `web/components/LeadForm.tsx`,
`docs/EDGE_FUNCTIONS.md`, `supabase/README.md`. Draft — not an audit; verify with
counsel and confirm the database security tier._
