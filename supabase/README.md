# Supabase backend — Switchy (חוסך)

Everything server-side lives in this folder: the SQL schema + dated domain
migrations, and 26 Deno edge functions (plus a shared library and their test
suite) under [`functions/`](./functions/). There is no other backend.

## ✅ Live connection

| | |
|---|---|
| Project ref | `orzitfqmlvopujsoyigr` |
| API URL | `https://orzitfqmlvopujsoyigr.supabase.co` |
| Region | `eu-central-1` (Frankfurt — lowest latency to Israel) |
| Dashboard | https://supabase.com/dashboard/project/orzitfqmlvopujsoyigr |

The Flutter app connects **only when build-time keys are supplied**
(`flutter run --dart-define-from-file=dart_define.json`; created from
[`dart_define.example.json`](../dart_define.example.json), gitignored, anon key
only). With no keys the app stays on `LocalBackend`, so `flutter test` / CI
need no project. The repository layer is
[`lib/services/backend/`](../lib/services/backend/). Never put the
`service_role` key in the client.

## SQL — what lives where

[`schema.sql`](./schema.sql) is the base schema (tables, **RLS on every
table**, policies, helper views); [`storage.sql`](./storage.sql) adds the
`community-media` bucket. Everything since ships as dated, idempotent
`<domain>-YYYY-MM.sql` files in this folder — run them in the SQL editor (or
via `supabase db push` once imported into the CLI's migration history). The
domains, by filename prefix:

| Domain | Files (examples) |
|---|---|
| Leads & CRM | `leads-*`, `lead-*`, `crm-*`, `verified-customer-flow`, `wallet-stats` |
| Meetings & OTP | `meetings-*`, `meeting-*` (booking guard, atomic OTP, rate limits) |
| Community | `community-*` (web feed, moderation, replies, digest, media, search) |
| Plans & providers | `plans-*`, `providers-*`, `provider-capabilities`, `plan-price-history` |
| Savings & street prices | `savings-*`, `street-price*` (incl. k-anonymity) |
| Referrals | `referral-codes`, `referral-attribution` |
| Agent / AI | `agent-platform`, `ai-sessions`, `bot-knowledge`, `translations-cache`, `bill-forensics` |
| Messaging | `whatsapp-*`, `telegram-*`, `site-push-notify`, `meeting-email-otp` |
| Consent & privacy | `data-protection*`, `legal-consent`, `marketing-consent`, `lead-consent-share`, `renewal-email-optin` |
| Security & ops | `security-*`, `rls-defensive`, `function-search-path`, `audit-observability`, `observability-sentry`, `*-cron-*`, `cron-and-hardening` |

Security model in one line: RLS everywhere; public reads only where deliberate
(community, reviews); user writes scoped to `auth.uid()`; `leads` allows
anonymous insert (lead capture) with hardened write/read lockdown; the sales
side reads via `service_role` **server-side only**. Anonymous sign-in is used
by the app at startup (`config.toml` mirrors this locally with
`enable_anonymous_sign_ins = true`).

## Edge functions (`functions/`)

26 functions + a ~40-module [`functions/_shared/`](./functions/_shared/)
library (db, ai, agent, tools, scoring, session, ratelimit, log,
observability, referrals, …). By role:

| Role | Functions | Auth |
|---|---|---|
| Public site/app endpoints | `site-ai-chat`, `site-plan-advisor`, `site-bill-analyzer`, `site-subscribe`, `translate`, `street-price`, `referral-issue`, `analytics-track`, `meeting-book`, `account-delete` | origin allowlist + per-IP rate limit (user JWT where relevant) |
| Messaging / agent stack | `whatsapp-webhook`, `telegram-user-webhook`, `telegram-webhook`, `notify-lead` (team bot + rep console), `crm-api`, `rep-brief` | platform signatures (Meta HMAC, Telegram `secret_token`) / Bearer JWT → `crm_members` |
| Cron targets (pg_cron → HTTP) | `renewal-reminders`, `lead-digest`, `community-digest`, `savings-watch`, `site-push-notify` | `x-webhook-secret` (constant-time, fail-closed) |
| DB-webhook targets | `community-notify`, `community-moderate` | `x-webhook-secret` |
| Admin surfaces | `admin-metrics`, `community-admin`, `lead-export` | Bearer JWT → `profiles.is_admin` |

House style: `Deno.serve` + `_shared/db.ts` (PostgREST, fail-soft), structured
JSON logs (`_shared/log.ts`), truth-only replies, config read **Vault-first
with env fallback** (service-role RPC `get_lead_notify_config()` — manage
secrets entirely in SQL via `vault.create_secret(...)`). The one deliberate
exception is `telegram-webhook`, still on the legacy `std@0.168` `serve()` +
esm.sh client — pending modernization.

Six functions (`lead-digest`, `lead-export`, `meeting-book`, `referral-issue`,
`telegram-user-webhook`, `telegram-webhook`) carry a per-function `deno.json`
import map used by isolated deploys — if you touch the root
[`functions/deno.json`](./functions/deno.json) imports, keep them in sync.

### Tests & CI gates

From `supabase/functions/`:

```bash
deno task check   # type-checks every function (strict) — see note below
deno task test    # 72 test files in functions/tests/, no network needed
```

Both run in CI on every push / PR to `main` (`.github/workflows/ci.yml`). The `check` task lists
every function entry point **except** `telegram-webhook/index.ts`, whose
legacy remote imports (`deno.land/std@0.168`, esm.sh) make it the odd one out
until its modernization pass — everything else, including all deployed
`index.ts` + `lib.ts` files and the `_shared` modules, is type-checked.
Tests capture the real `Deno.serve` handlers without binding ports
(`tests/_capture_handler.ts`) and stub all network I/O.

`.github/workflows/bot-health.yml` probes the deployed functions' health
endpoints daily and fails loudly if config regresses.

### Deploying

Manual dispatch via `.github/workflows/deploy-functions.yml` (choice of
function or `all`). Not in the menu: `lead-export` (the monetization endpoint
— deliberately manual-only), `community-admin`, `community-digest` and
`rep-brief`. Or locally:

```bash
supabase functions deploy <name> --no-verify-jwt
```

`--no-verify-jwt` matters: callers are authenticated by the mechanisms in the
table above, not by the gateway JWT check. After editing Telegram-facing
functions, re-register the webhook (`?action=set-telegram-webhook`).

**Rotating `lead_webhook_secret`** — order matters: (1) update the Vault
secret, (2) wait ≤60s for the functions' config cache, (3) call
`?action=set-telegram-webhook` with the NEW secret so Telegram's
`secret_token` matches. Between (1) and (3) Telegram retries 401s, so nothing
is lost.

### Quick verification

```bash
# which integrations are configured + their source (vault|env|none), no values:
curl 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=health'

# discover a Telegram chat id (after messaging the bot):
curl -H 'x-webhook-secret: <lead_webhook_secret>' \
  'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=telegram-chats'
```

Logs: Dashboard → Edge Functions → `<name>`; all functions emit one JSON line
per event for the log explorer.

## Supabase CLI

`config.toml` is present and link-ready:

```bash
supabase login
supabase link --project-ref orzitfqmlvopujsoyigr
supabase db pull        # snapshot live schema into supabase/migrations/
supabase start          # full local stack (Docker)
```

## Flows worth knowing

- **Lead → team**: `leads` INSERT → trigger (`pg_net`, secret from Vault) →
  `notify-lead` → Telegram card with action buttons (status, claim, WhatsApp
  opener, undo) + Resend email + optional AI triage line. Chat commands:
  `/leads`, `/search`, `/stats`, `/hot`, `/weekly`, `/help`.
- **Meetings (Zoom)**: booking wizard in the app (`lib/pages/meeting/`);
  `meetings_guard()` enforces the schedule authoritatively server-side
  (Asia/Jerusalem, DST-safe). Rep confirms from the Telegram card or the
  **rep console** Mini App (`notify-lead?action=console`, HMAC-validated
  `initData` + allowlist); Zoom links auto-created when the S2S OAuth Vault
  secrets are set, else reply-with-link. Status reaches the customer via
  Realtime, push, and email.
- **Cron** (pg_cron → `renewal-reminders` modes + dedicated functions):
  `digest` daily, `sweep` every 10 min (claim-before-send re-delivery),
  `follow-up` hourly (SLA ladder), `weekly` business report — plus
  `lead-digest`, `community-digest`, `savings-watch`, `site-push-notify`.
