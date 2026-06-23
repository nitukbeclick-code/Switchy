# Supabase Edge Functions

All server-side logic lives in `supabase/functions/<slug>/index.ts` (Deno), with
shared helpers in `supabase/functions/_shared/`. The live project ref is
`orzitfqmlvopujsoyigr`.

These functions are not authenticated by Supabase's gateway JWT check — almost
all are deployed with **`--no-verify-jwt`** and enforce their own auth (a shared
webhook secret, a Telegram HMAC, a Meta signature, or an admin-token gate). The
table below records each function's own auth model, taken from the source.

## Function reference

| Slug | Purpose | Own auth model | `--no-verify-jwt` |
|------|---------|----------------|:---:|
| `notify-lead` | The team's interactive Telegram "digital rep". Fired by a Postgres trigger on every INSERT into `public.leads` **and** `public.meetings`; also serves the bot webhook, chat commands, and the rep console Mini App. Formats a Hebrew lead/meeting card (WhatsApp opener, optional AI triage), posts to Telegram + Resend. | Shared `x-webhook-secret` (= Vault `lead_webhook_secret`); Telegram updates use a `secret_token` = SHA-256 of that secret; actions pinned to `telegram_chat_id` (+ optional `telegram_allowed_user_ids`). | yes |
| `renewal-reminders` | The bot's scheduled brain. `pg_cron` POSTs with a `mode` (`digest` / `sweep` / `follow-up` / `weekly`) for renewal digests, lead re-delivery, SLA escalation, and the weekly business report. | Shared `x-webhook-secret`. | yes |
| `crm-api` | Admin CRM backend for the WhatsApp pipeline. One POST endpoint dispatched by `{action}` (`takeOver` / `handBack` / `sendReply` / `setContactStatus` / `setLeadStatus` / list-and-read actions). Flips `whatsapp_conversations.bot_enabled` for live human takeover and logs each control action to `security_audit_log` (actor uid + entity ids inside `detail`). The app/site never touch `whatsapp_*` directly. | **Authenticated**: every request carries `Authorization: Bearer <user access token>` and must pass the `is_admin` gate (`requireAdmin` → 403; `requireAdmin` distinguishes "no/invalid token" from "not admin"). DB access is service-role. | yes (gateway off; `requireAdmin` is the real gate) |
| `analytics-track` | Public, fire-and-forget product-funnel event sink. Appends one row to `analytics_events` (service role). Never echoes data back (`{ ok: true }` only), so it can't be a read oracle. | Public; write-only by design. | yes |
| `community-moderate` | Target of an AFTER INSERT trigger on `community_posts` / `community_replies`. Classifies the new row with an LLM and flags clear violations (`is_flagged`, Hebrew `moderation_note`); never hard-deletes — a human reviews. | The trigger sends `x-webhook-secret: <lead_webhook_secret>`; mismatch → rejected. | yes |
| `community-notify` | Target of a Supabase Database Webhook on INSERT into `community_posts` / `community_replies` / `provider_reviews`. Sends a short Hebrew team Telegram ping. | Webhook must send `x-webhook-secret: <lead_webhook_secret>`; mismatch → rejected. | yes |
| `site-ai-chat` | Public chat endpoint behind the "חוסך AI" widget. Real Gemini call grounded in the bundled `plans-snapshot.json` catalogue. **Durable multi-turn memory**: loads/upserts the rolling transcript in `public.ai_sessions` (service role) keyed by an opaque client `session_id`, so a conversation survives a reload. Fails soft — if `ai_sessions` isn't applied, the chat still works statelessly via the browser-replayed history. Per-IP throttled via `chat_messages`. | Public; grounded to bundled catalogue. | yes |
| `site-plan-advisor` | Public, multi-turn plan recommender behind the website "מצא לי מסלול" flow. Strictly grounded in the bundled catalogue snapshot (cannot invent providers/plans/prices). Does **not** capture leads. Per-IP rate-limited (~20/hr) via `advisor_sessions`. | Public; grounded to bundled catalogue. | yes |
| `site-bill-analyzer` | Public endpoint behind "צלמו את החשבון". Gemini Vision extracts provider / monthly ₪ / category from a bill photo and matches cheaper catalogue options. The image is **never stored** — only a summary row in `bill_analyses` (provider / spend / suggestions). | Public. | yes |
| `site-subscribe` | Newsletter signup. Records the subscriber in `newsletter_subscribers` (service role, idempotent double-opt-in upsert) and sends a Hebrew welcome email via Resend. | Public. | yes |
| `whatsapp-webhook` | Meta WhatsApp Cloud API webhook — a catalogue-grounded AI agent + CRM. GET = Meta verification (echoes `hub.challenge`); POST = incoming messages, de-duped by `wamid`, persisted (contact / conversation / message), routed by intent. Honours **STOP/opt-out** (Spam Law — flips the contact to `opted_out`, logs to `security_audit_log`) and the **§11 first-contact notice** *even when a human has taken over* (`bot_enabled = false` silences only the AI auto-reply, not storage/STOP/§11). | POST authenticated via `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the Meta App Secret); GET via the verify token. | yes |
| `telegram-webhook` | Telegram deep-link account linking (`/start <uuid>`) between a Telegram chat and an app profile, with a per-chat link cap to prevent notification harvesting. | Telegram webhook `secret_token` (`tgWebhookToken`) + strict UUID validation of the untrusted `/start` payload. | yes |
| `support-agent` | **Stub only** — the directory contains a `deno.json` but no `index.ts`. Not a deployed function at present. | — | — |

> The verify-JWT column reflects the deploy convention used across this repo
> (the deploy script and CI both pass `--no-verify-jwt`). Every function enforces
> its own auth: a shared webhook secret, a Telegram `secret_token`, a Meta HMAC,
> or — for `crm-api` — an in-function `requireAdmin` (`profiles.is_admin`) gate
> rather than a public secret. Always confirm the current flag against the actual
> deploy step before relying on it for a security decision.

The migration files those functions depend on (and the **order** to apply them
in) are in [`DEPLOYMENT.md`](./DEPLOYMENT.md#sql-schema--migration-order); the
tables they read/write are in [`DATA_MODEL.md`](./DATA_MODEL.md).

## Shared helpers (`supabase/functions/_shared/`)

`config.ts` (Vault-first / env-fallback config resolution, `safeEqual`,
`tgWebhookToken`), `telegram.ts`, `whatsapp.ts`, `email.ts` (Resend), `ai.ts`,
`db.ts` (service-role `insertRow` etc.), `leads.ts`, `digests.ts`, `weekly.ts`,
`followup.ts`, `agenda.ts`, `meetings.ts` / `meeting_followup.ts` / `reschedule.ts`,
`google_calendar.ts`, `zoom.ts`, `webapp.ts` (`authorizeRep` — HMAC-validates
Telegram `initData`), `admin.ts` (`requireAdmin`), `catalogue.ts`,
`cron_health.ts`, `log.ts` (structured JSON logs), `types.ts`.

## Config resolution (Vault first, env fallback)

Functions read each secret from **Vault** via a service-role RPC, falling back to
an **Edge Function env var**. So config can be managed entirely in SQL
(`select vault.create_secret('<value>','<name>');`) without dashboard access,
while keys already set as Edge secrets keep working. Required keys for the lead
pipeline: `telegram_bot_token` (env), `telegram_chat_id` (Vault),
`lead_webhook_secret` (Vault), `resend_api_key` (env). Optional:
`openai_api_key` / `anthropic_api_key` (AI triage), Zoom S2S OAuth secrets, and
`telegram_allowed_user_ids`. The full key matrix + rotation order is in
`supabase/README.md` §8.

## Deploy recipe (CLI)

GitHub runners have unrestricted egress to Supabase; the sandboxed dev
environment does not. The reliable path is the Supabase CLI, which reads the
sources from disk:

```bash
# Single function (the canonical recipe — verify-jwt disabled, own auth applies):
npx --no-install supabase functions deploy <slug> \
  --project-ref orzitfqmlvopujsoyigr \
  --no-verify-jwt

# Examples:
npx --no-install supabase functions deploy notify-lead       --project-ref orzitfqmlvopujsoyigr --no-verify-jwt
npx --no-install supabase functions deploy renewal-reminders --project-ref orzitfqmlvopujsoyigr --no-verify-jwt
```

Requires a Supabase access token (`SUPABASE_ACCESS_TOKEN`).

### Via CI (preferred)

`.github/workflows/deploy-functions.yml` deploys from the repo:

- **Manually**: Actions tab → "Deploy edge functions" → Run workflow → pick a
  function (`notify-lead`, `renewal-reminders`, `telegram-webhook`,
  `site-ai-chat`, or `all`).
- **By commit**: a push whose commit message contains `[deploy]` deploys
  `notify-lead`.

The workflow runs `supabase functions deploy "<fn>" … --no-verify-jwt` and needs
the repo secret `SUPABASE_ACCESS_TOKEN`.

### Post-deploy registration

After deploying functions that own a webhook, (re)register it. For the Telegram
bot:

```bash
curl -H 'x-webhook-secret: <lead_webhook_secret>' \
  'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=set-telegram-webhook'
```

Health check (sources only, no values):

```bash
curl 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=health'
```

## CI / monitoring

- `.github/workflows/ci.yml` type-checks (`deno task check`) and unit-tests
  (`deno task test`) the functions on every push.
- `.github/workflows/bot-health.yml` probes the deployed functions daily and
  fails loudly if config regresses.
- All functions emit structured JSON logs (`_shared/log.ts`) for the dashboard
  log explorer.
