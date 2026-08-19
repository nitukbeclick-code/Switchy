# CRM PII protection & security-watch

How the admin CRM protects customer PII (phone / email), and how raw-PII access
is bounded, audited, and alerted on. Scope: the `crm-api` edge function, the
shared masking helper, and the `security-watch` cron alerter.

## Threat model

The CRM (`crm-api`) reads the whole customer pipeline — WhatsApp conversations,
contact phones, lead phone/email, meeting phone/email. Access is already gated
(`requireCrmAccess` → admin or a graded `crm_members` role). The remaining risks
this work addresses:

- **Bulk raw-PII exposure** — a valid session (or a stolen token) pulling every
  phone/email in clear text (screenshot, shoulder-surf, scripted list read).
- **Cross-origin abuse** — the endpoint answering `Access-Control-Allow-Origin: *`.
- **Unbounded exfiltration** — no rate limit on reads/reveals.
- **Silent access** — raw-PII reads leaving no trail and triggering no alert.

## Controls

### 1. Mask by default
Every list/detail/thread read returns **masked** phone and email. Masking lives
in `supabase/functions/_shared/pii.ts` (`maskPhone`, `maskEmail`/`maskEmailN`,
pure + unit-tested) and is applied in the `crm_logic.ts` shape helpers and the
inline row maps in `actions_conversations.ts` / `actions_overview.ts` /
`actions_leads.ts`. Concretely that covers `overview`, `listConversations`,
`getThread`, `listContacts`, `listLeads`, `attentionLeads`, `getLeadDetail`,
`listSellableLeads`, `listMeetings`, `getMeeting`, `listMembers`, and the
`contactName` phone fallback (an unnamed contact's *name* is the masked number). Phone keeps the last 3 digits (`•••••••567`); email keeps
the first local char + the full domain (`d••@gmail.com`). Free-text **search**
still matches the raw phone — it filters the raw rows *before* shaping.

### 2. Reveal on demand (audited)
`revealContact {kind, id}` (`actions_reveal.ts`) is the **only** path that
returns unmasked PII, for a **single** record, on an explicit user action.
`kind` ∈ `lead | contact | conversation | meeting | member` (`member` reveals a
staff profile email and is additionally **admin-only**, enforced inside the
action). Every call writes a
`crm_pii_reveal` row to `security_audit_log` (actor uid + kind + id — never the
revealed value). Capability: `read` (any role that may open the CRM), because
reps need to actually contact customers; the guardrail is the audit trail + rate
limit, not withholding it. In the Flutter CRM, the conversation thread header
shows the masked number with a 👁 reveal control (`crm_widget.dart`).

### 3. Allowlisted CORS
`crm-api` no longer answers `*`. `json()`/`err()` are origin-neutral; the single
entrypoint wraps every response with `withCors(req, …)`, which reflects the
Origin only when it is on the shared allowlist (`_shared/cors.ts`). Auth is
Bearer (not cookie), so this is defense-in-depth.

### 4. Per-caller rate limits
Keyed by the verified uid (`_shared/ratelimit.ts`): a general bucket
(240/min/caller) plus a stricter reveal bucket (40/min/caller). A trip writes
`crm_rate_limited` to the audit log and returns `429` + `Retry-After` with the
unified error shape `{error, code:"rate_limited"}`.

### 5. FORCE RLS
`supabase/crm-security-hardening-2026-07.sql` sets `force row level security` on
`security_audit_log`, `whatsapp_contacts`, `whatsapp_conversations`,
`whatsapp_messages`, `leads`, `meetings` (RLS was already *enabled*). The
service-role edge functions bypass RLS by design (unchanged); FORCE only removes
the table-owner bypass.

### 6. security-watch (active alerting)
`supabase/functions/security-watch/` turns the passive audit trail active. A
pg_cron tick (every 15 min) POSTs the function (fail-closed on the shared
`lead_webhook_secret`); it scans the last ~20 min of `security_audit_log` and
pushes ONE Telegram alert if it sees: any `admin_grant` (privilege change), any
`crm_rate_limited` (abuse signal), or ≥25 `crm_pii_reveal` by a single actor
(bulk un-masking). Silent on all-clear. Analysis is pure in `lib.ts`
(unit-tested); thresholds live there.

## Audit events (in `security_audit_log`)

| event               | written by            | meaning                                  |
|---------------------|-----------------------|------------------------------------------|
| `crm_read_overview` / `crm_read_conversations` / `crm_read_contacts` / `crm_read_leads` | list reads | who pulled which list, and how many rows |
| `crm_thread_view`   | `actGetThread`        | a full conversation thread was opened    |
| `crm_lead_view` / `crm_lead_export` | lead detail / sellable feed | existing PII-heavy read trail |
| `crm_pii_reveal`    | `actRevealContact`    | one record's raw phone/email was revealed|
| `crm_rate_limited`  | `index.ts`            | a caller hit the general/reveal limit    |
| `crm_takeover` / `crm_handback` / `crm_reply` / `crm_contact_status` / `crm_lead_status` | mutations | existing control-action trail |
| `admin_grant`       | admin/role management | a privilege change                       |

Reviewing the trail (service-role / SQL editor):
```sql
select created_at, event, user_id, detail
from public.security_audit_log
where event in ('crm_pii_reveal','crm_rate_limited','admin_grant')
order by created_at desc limit 100;
```

## Operational setup

- **Deploy:** `security-watch` is in `.github/workflows/deploy-functions.yml`
  (dispatch choice + the `all` loop), deployed `--no-verify-jwt` like the other
  secret-gated jobs. `crm-api` redeploys normally.
- **Schedule:** apply `supabase/crm-security-hardening-2026-07.sql` (re-runnable;
  upserts the `security-watch-15min` cron job). Verify:
  `select * from cron.job where jobname = 'security-watch-15min';`
- **Secrets (already provisioned):** `lead_webhook_secret` (gate) and
  `telegram_bot_token` + `telegram_chat_id` (alert delivery). Missing secret ⇒
  safe, logged no-op (503).
- **Dry-run** (no Telegram post, shows what would alert):
  ```sql
  select net.http_post(
    url  := 'https://<project-ref>.supabase.co/functions/v1/security-watch',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lead_webhook_secret')),
    body := '{"dryRun": true}'::jsonb);
  ```

## Tuning

- Masking retained digits: `keep` arg of `maskPhone` (`_shared/pii.ts`).
- Rate limits: `RL_GENERAL` / `RL_REVEAL` (`crm-api/index.ts`).
- Alert thresholds / window: `REVEAL_THRESHOLD` / `WINDOW_MIN`
  (`security-watch/lib.ts`).
