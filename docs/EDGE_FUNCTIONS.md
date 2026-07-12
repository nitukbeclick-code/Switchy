# Supabase Edge Functions

All server-side logic lives in `supabase/functions/<slug>/index.ts` (Deno), with
shared helpers in `supabase/functions/_shared/`. The live project ref is
`orzitfqmlvopujsoyigr`.

These functions are not authenticated by Supabase's gateway JWT check — all
are deployed with **`--no-verify-jwt`** and enforce their own auth (a shared
webhook secret, a Telegram HMAC, a Meta signature, a self-resolved user JWT, or
an admin-token gate). The table below records each function's own auth model,
taken from the source.

## Function reference

26 functions, listed alphabetically (matches `ls supabase/functions/`, minus
`_shared/` and `tests/`). The former `support-agent` stub directory no longer
exists and has been dropped from this table.

| Slug | Purpose | Own auth model | `--no-verify-jwt` |
|------|---------|----------------|:---:|
| `account-delete` | Deletes the **caller's own** account: scrubs their PII across the product tables, removes storage objects, records do-not-contact suppression, writes a counts-only audit row, then deletes the `auth.users` row. Scrub steps are fail-soft + idempotent; only a failed auth-user delete returns `ok:false`. | **Fail-closed self-auth**: the uid comes only from the caller's own JWT (`uidFromJwt` → GoTrue `/auth/v1/user`). No/bad JWT → 401 and nothing is touched. Requires `POST { confirm:"DELETE" }`; rate-limited. | yes (resolves the JWT itself) |
| `admin-metrics` | Read-only observability rollup for the admin dashboard (GET, `?days=` 1–90): per-day funnel-event counts, `agent_tool_calls` success rates by tool/channel, a PII-free `security_audit_log` histogram, and cron health. Performs **zero writes**; empty data yields honest zeros. | Either of two credentials: `Authorization: Bearer <user token>` passing `requireAdmin` (`profiles.is_admin`), **or** `x-webhook-secret` (constant-time) for server-to-server probes. Both missing/invalid → 401. | yes |
| `analytics-track` | Public, fire-and-forget product-funnel event sink. Appends one row to `analytics_events` (service role). Never echoes data back (`{ ok: true }` only), so it can't be a read oracle. Per-IP hourly cap (600, fail-open — a dropped beacon must never error). | Public; write-only by design. | yes |
| `community-admin` | The moderation dashboard's server authority — the browser can't do this work (`community_reports` is service-role-read-only; posts/replies UPDATE/DELETE RLS is own-row). GET = the queue (open reports + flagged posts/replies); POST = `approve` / `remove` / `ban` / `unban` / `resolve` / `dismiss`. Every destructive action runs through a SECURITY DEFINER RPC that re-checks `is_admin` and writes a `security_audit_log` row. | **Authenticated**: `requireAdmin` (Bearer user JWT → `profiles.is_admin`, fail-closed) → 401 otherwise. | yes |
| `community-digest` | Weekly, cron-driven re-engagement email summarising a member's **own unread** community notifications — sent only to explicit opt-ins (`profiles.community_digest_opt_in`, default false — §30A). Zero-unread members are skipped, never sent a hollow email. `{ dryRun }` returns what would send. | POST: shared `x-webhook-secret`, fail-closed. GET `?unsub=<uid>&sig=<hmac>`: one-click unsubscribe authenticated by an HMAC keyed with the server-only service-role key (flips only that member's opt-in). | yes |
| `community-moderate` | Target of an AFTER INSERT trigger on `community_posts` / `community_replies`. Two-layer screening: a deterministic high-precision heuristic pre-screen, then an LLM classifier (Gemini primary, Groq fallback; conservative, fail-OPEN — classifier outage never flags). Clear violations get `is_flagged` + a Hebrew `moderation_note`; every flag is audited to `security_audit_log`; never hard-deletes — a human reviews. | The trigger sends `x-webhook-secret: <lead_webhook_secret>`; mismatch → rejected. | yes |
| `community-notify` | Target of a Supabase Database Webhook on INSERT into `community_posts` / `community_replies` / `provider_reviews`. (1) Sends a short Hebrew team Telegram ping; (2) fans out `@mention` tokens into `community_notifications` via one SECURITY DEFINER RPC (`resolve_community_mentions`) that also enforces the user's notification opt-out. | Webhook must send `x-webhook-secret: <lead_webhook_secret>`; mismatch → rejected. | yes |
| `crm-api` | Admin CRM backend for the WhatsApp pipeline. One POST endpoint dispatched by `{action}`: pipeline reads (`overview` / `slaMetrics` / `listConversations` / `getThread` / `listContacts` / `listLeads` / `listSellableLeads` / `repLeaderboard` / `listMeetings` / `getMeeting`), operations (`sendReply` / `takeOver` / `handBack` / `setContactStatus` / `setLeadStatus` / `setMeetingStatus`), and admin-only roster management (`listMembers` / `setMemberRole`). `takeOver`/`handBack` flip `whatsapp_conversations.bot_enabled` (live human takeover) and append a `crm_events` audit row. The app/site never touch `whatsapp_*` directly. | **Authenticated + graded (C.2)**: every request carries `Authorization: Bearer <user access token>` and must pass `requireCrmAccess` — `is_admin` is the full superset; otherwise a `crm_members` row grants `viewer` (read-only) or `rep` (read + operate). Each action declares a minimum capability (`crm_roles.ts`); unmapped actions are admin-only (fail-closed). DB access is service-role. | yes (gateway off; `requireCrmAccess` is the real gate) |
| `lead-digest` | Proactive cron-driven Telegram push: (a) the morning executive digest (reuses `buildDailyDigest`), (b) a stale-lead SLA nudge (leads still `new`, never contacted, past the SLA window). Truth-only: a failed query suppresses its section rather than inventing "all clear". `{ dryRun }` returns the would-send text without posting. | Shared `x-webhook-secret`, fail-closed (unset/mismatch → 401/503, nothing posted). | yes |
| `lead-export` | The **sellable-lead** export feed (monetization). POST returns (and optionally forwards to a configured buyer destination) the feed of leads that may lawfully be sold. **Hard legal gate, enforced twice**: only leads with a non-null `consent_share_at` (separate third-party-sharing consent — service/marketing consent does NOT qualify) pass both the PostgREST filter and `filterSellable()`. `lost` leads are never sold; the feed is deduped per person+category. `{ dryRun }` supported. | Shared `x-webhook-secret`, fail-closed — same contract as `notify-lead` / `lead-digest`. | yes |
| `meeting-book` | Email-verified, self-serve Zoom consultation booking for **anonymous** site visitors — the anti-spam front door to `public.meetings` (the `meetings_guard` DB trigger stays the schedule/rate authority). `request-code` → `verify-code` → `book` flow. | Public with layered gates: Origin allow-list; 6-digit crypto-random OTP (SHA-256-hashed at rest, constant-time compare, 15-min expiry, max 5 attempts, single-use); per-email + per-IP rate limits; generic responses that never leak address existence. | yes (callers are anonymous browsers) |
| `notify-lead` | The team's interactive Telegram "digital rep". Fired by a Postgres trigger on every INSERT into `public.leads` **and** `public.meetings`; also serves the bot webhook, chat commands, and the rep console Mini App. Formats a Hebrew lead/meeting card (WhatsApp opener, optional AI triage), posts to Telegram + Resend. | Shared `x-webhook-secret` (= Vault `lead_webhook_secret`); Telegram updates use a `secret_token` = SHA-256 of that secret; actions pinned to `telegram_chat_id` (+ optional `telegram_allowed_user_ids`); Mini App data routes validate Telegram `initData` (`authorizeRep`). | yes |
| `referral-issue` | Mints + persists a real referral code for the Flutter app's referral screen (`referral_codes`, `channel='app'`) — the table is service-role-only, so the app calls this instead of inserting directly. Thin, rate-limited, fail-soft wrapper over `_shared/referrals.ts`. No advertised reward (share-the-tool framing), so no §30A consent gate on issuing. | Public (the app's anon JWT is attached automatically); origin allow-list + rate limit. | yes |
| `renewal-reminders` | The bot's scheduled brain. `pg_cron` POSTs with a `mode`: `digest` (daily renewal digest), `sweep` (re-deliver unnotified leads/meetings, claim-before-send), `follow-up` (hourly SLA ladder + meeting reminders/expirations), `weekly` (business report), `renewal-emails` (customer-facing renewal-radar emails, opt-in tracked plans only). | Shared `x-webhook-secret`. | yes |
| `rep-brief` | Turns one lead into a concise Hebrew **call-brief** for the human phone rep: the customer's stated need, 2–3 best-matching real catalogue plans, talking points/objections, and the mandatory compliance reminders (§7b commission disclosure + §30A consent). The plan facts always come from the deterministic catalogue-grounded builder; optional AI only rephrases — it can never add a plan/price. | Either a verified admin (`requireAdmin` Bearer token) **or** the shared `x-webhook-secret` (constant-time). Anything else → 401/403. | yes |
| `savings-watch` | Scheduled (pg_cron) proactive savings watcher: for each `tracked_plans` row with `watch_opt_in = true`, detects a real price drop (`plan_price_history`) or a catalogue plan that genuinely beats the user's current price, then sends Web Push and/or WhatsApp with the real figures. §30A gate chain in order: consent (opt-in rows only) → `marketing_suppression` → quiet hours (23:00–08:00 Israel) → per-opportunity dedupe ledger. Fail-soft; each channel degrades independently; `{ dryRun }` supported. | Shared `x-webhook-secret` + a post-auth in-memory rate-limit. | yes |
| `site-ai-chat` | Public chat endpoint behind the "Switchy AI" widget. Delegates to the **shared agent** (`_shared/agent.ts` `runAgent({channel:'site'})`) — grounded, tool-using Gemini loop over the **live `public.plans`** catalogue with the bundled `plans-snapshot.json` as fallback; degrades to a no-tools text chain, then a template fallback (never hard-fails). Durable multi-turn memory via the unified `ChatSession` (`_shared/session.ts`) in `public.ai_sessions`. Lead capture is consent-gated (`captureAiLead`). | Public with edge guards: Origin allow-list (never `*` — paid-LLM endpoint), per-IP hourly rate-limit that **fails closed** (503 on DB error), payload/length caps, timeout → 504. | yes |
| `site-bill-analyzer` | Public endpoint behind "צלמו את החשבון". Gemini Vision extracts provider / monthly ₪ / category from a bill photo and matches cheaper catalogue options. The image is **never stored** — only a summary row in `bill_analyses` (provider / spend / suggestions). Unreadable images still return 200 with a friendly Hebrew `error`. | Public; strict rate-limit (1 analysis / IP / day). | yes |
| `site-plan-advisor` | Public, multi-turn plan recommender behind the website "מצא לי מסלול" flow. Strictly grounded in the bundled catalogue snapshot (`plans-snapshot.json`, copied from `site/data/plans.json`) — cannot invent providers/plans/prices. Does **not** capture leads. Per-IP rate-limited (~20/hr) via `advisor_sessions`. | Public; grounded to bundled catalogue. | yes |
| `site-push-notify` | Scheduled deal-feed **Web Push** sender. Reads `plan_price_history` for material price drops (≥ ₪5 OR ≥ 10%), reads opted-in `push_subscriptions`, and sends end-to-end-encrypted (VAPID + `aes128gcm`) pushes to each matching subscriber — honoring opt-out, quiet hours (23:00–08:00 Israel), category prefs, and per-(subscription, drop) dedupe (`push_deliveries`). `GET ?action=health` reports config/grants; `POST { dryRun:true }` selects + counts without sending. **Fail-soft**: absent VAPID keys → `503 "not configured"`, sends nothing. Pure selection logic in `deals.ts`; WebCrypto VAPID/encryption in `webpush.ts`. See [`AI_AGENT.md`](./AI_AGENT.md#the-deal-feed-sender--site-push-notify). | Shared `x-webhook-secret` (constant-time, fail-closed) + a post-auth in-memory rate-limit. | yes |
| `site-subscribe` | Newsletter signup. Records the subscriber in `newsletter_subscribers` (service role, idempotent — re-subscribing is a no-op success) and sends a Hebrew welcome email via Resend (with a List-Unsubscribe header); a failed email never fails the subscription. | Public; per-IP hourly rate limit. | yes |
| `street-price` | Crowd-reported real-world "מחיר רחוב" over `public.street_prices` (RLS-locked, service-role-only). POST = submit one real price: validated against the live catalogue (unknown provider/category rejected, never guessed), screened by a deterministic plausibility heuristic (plausible → `approved`, implausible → `pending` for a human — never auto-rejected), audited to `security_audit_log`; an optionally attached callback `lead` goes through the existing consent-gated leads path, never this table. GET = the **threshold-gated** aggregate via `get_street_price()` (a typical figure only above the minimum-reports threshold). Success bodies never echo stored data. | Public; per-reporter-fingerprint rate limit. A bare price report carries no contact details, so no consent is needed; consent is enforced only when a `lead` is attached. | yes |
| `telegram-user-webhook` | The **public, customer-facing** Telegram bot (distinct from the internal rep bot `telegram-webhook`). Answers end-user DMs with the shared grounded agent (`runAgent`) over the live catalogue, captures consent-gated leads, honours §30A STOP and the §11 first-contact notice. **Ships dark**: with no `TELEGRAM_USER_BOT_TOKEN` every POST is a 503 no-op. Guard chain: token present → secret verify → per-chat rate limit → STOP → §11 → consent-before-lead. | Telegram `x-telegram-bot-api-secret-token` = SHA-256 of `lead_webhook_secret` (fail-closed when unset); the `?action=set-webhook` admin action is `x-webhook-secret`-gated. | yes (Telegram can't send a Supabase JWT) |
| `telegram-webhook` | The internal rep-side Telegram bot: (1) deep-link account linking (`/start <uuid>`) between a Telegram chat and an app profile, with a per-chat link cap (max 2) to prevent notification harvesting; (2) the **rep → WhatsApp relay** — an authorized rep's plain-text reply in the team chat (threaded on a conversation card via `telegram_thread_id`) is sent to that customer's WhatsApp and stored as the outbound message. | Telegram webhook `secret_token` (`tgWebhookToken`) + strict UUID validation of the untrusted `/start` payload; the relay acts only for authorized reps. | yes |
| `translate` | On-demand, cached, site-wide UI translation (Hebrew → `ar`/`en`/`ru`/`am`/`es`/`fr`) for the two site front-ends. Every translation is cached in `public.site_translations`, so steady-state model spend trends to zero. **Safety**: prices/numbers/brands/units/URLs are sentinel-masked before the model sees the text and restored after; a translation that drops a sentinel is rejected (Hebrew original kept). Fail-soft: any failure leaves the string untranslated, never a broken page. | Public; per-request size caps + in-memory per-IP flood backstop. | yes |
| `whatsapp-webhook` | Meta WhatsApp Cloud API webhook — a catalogue-grounded AI agent + CRM. GET = Meta verification (echoes `hub.challenge`); POST = incoming messages, de-duped by `wamid`, persisted (contact / conversation / message), routed by intent. Honours **STOP/opt-out** (Spam Law — flips the contact to `opted_out`, logs to `security_audit_log`) and the **§11 first-contact notice** *even when a human has taken over* (`bot_enabled = false` silences only the AI auto-reply, not storage/STOP/§11). Bridges to the shared agent via `agent_runner.ts`. | POST authenticated via `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the Meta App Secret); GET via the verify token. | yes |

> The verify-JWT column reflects the deploy convention used across this repo
> (the deploy script and CI both pass `--no-verify-jwt`). Every function enforces
> its own auth: a shared webhook secret, a Telegram `secret_token`, a Meta HMAC,
> a self-resolved user JWT (`account-delete`), or an in-function admin gate —
> `requireAdmin` (`profiles.is_admin`) for `community-admin`/`admin-metrics`/
> `rep-brief`, and the graded `requireCrmAccess` (`is_admin` ∪ `crm_members`
> roles) for `crm-api` — rather than a public secret. Always confirm the current
> flag against the actual deploy step before relying on it for a security
> decision.

The migration files those functions depend on (and the **order** to apply them
in) are in [`DEPLOYMENT.md`](./DEPLOYMENT.md#sql-schema--migration-order); the
tables they read/write are in [`DATA_MODEL.md`](./DATA_MODEL.md).

## Shared helpers (`supabase/functions/_shared/`)

`config.ts` (Vault-first / env-fallback config resolution, `safeEqual`,
`tgWebhookToken`), `telegram.ts`, `whatsapp.ts`, `email.ts` (Resend), `ai.ts`
(Gemini text + Vision + the function-calling step + the Groq/OpenRouter fallback
chain), `db.ts` (service-role `insertRow` etc.), `leads.ts` (the single
honest-consent lead gate), `digests.ts`, `weekly.ts`, `followup.ts`, `agenda.ts`,
`meetings.ts` / `meeting_followup.ts` / `meeting_user_emails.ts` /
`reschedule.ts`, `google_calendar.ts`, `google_sheets.ts`, `zoom.ts`,
`webapp.ts` (`authorizeRep` — HMAC-validates Telegram `initData`), `admin.ts`
(`requireAdmin`, `uidFromJwt`), `crm_roles.ts` (the graded CRM capability map),
`catalogue.ts`, `bill.ts` / `bill-forensics.ts`, `knowledge.ts` (curated
truth-only FAQ block), `lead_quality.ts`, `leadlookup.ts`, `referrals.ts`,
`compliance.ts` (suppression + quiet hours), `switch.ts`, `sse.ts`, `cors.ts`,
`ratelimit.ts`, `cron_health.ts`, `observability.ts` (`captureError`), `log.ts`
(structured JSON logs), `types.ts`.

### The unified AI agent core

`agent.ts` (`runAgent` — the grounded, tool-using brain), `tools.ts` (the agent
tool registry + Gemini `functionDeclaration`s), `scoring.ts` (THE
provider-neutral plan-ranking formula), and `session.ts` (the unified
`ChatSession` memory) form one shared brain across WhatsApp, the site, and the
app. The WhatsApp webhook bridges to it via `whatsapp-webhook/agent_runner.ts`.
The full design — the loop, the tools, the compliance guardrails, the deal feed —
is documented in **[`AI_AGENT.md`](./AI_AGENT.md)**.

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
  function. The dispatch options currently cover 22 of the 26 functions, plus
  `all` (which deploys those same 22). Four functions are **not** dispatch
  options — `community-admin`, `community-digest`, `lead-export`, `rep-brief` —
  deploy those with the CLI recipe above.
- The workflow is manual-dispatch only; there is no push/commit-message
  trigger.

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
  (`deno task test`, over `supabase/functions/tests/`) the functions on every
  push. The `check` task's file list in `supabase/functions/deno.json` is
  explicit and currently covers every function except `telegram-webhook`
  (which deploys without CI type-checking).
- `.github/workflows/bot-health.yml` probes the deployed functions daily and
  fails loudly if config regresses.
- All functions emit structured JSON logs (`_shared/log.ts`) for the dashboard
  log explorer.
