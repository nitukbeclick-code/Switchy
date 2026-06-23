# Data Model

High-level map of the Supabase Postgres schema and its Row-Level-Security (RLS)
posture. Authoritative DDL lives in `supabase/schema.sql` plus the dated
migration deltas (`supabase/*-2026-06*.sql`); this document summarizes it — read
the SQL for exact columns, constraints, and policy bodies. The
**application order** of those migrations is in
[`DEPLOYMENT.md`](./DEPLOYMENT.md#sql-schema--migration-order).

> **The app's canonical catalogue is static.** The plan catalogue the Flutter
> app and the web surfaces render is shipped in the app (`lib/data/`) and
> exported to the web surfaces (`site/data/plans.json`, `web/data/catalogue.json`).
> There is, however, **also a `public.plans` (and `public.providers`) table in
> the database** — a publicly-readable *mirror* of the catalogue that exists so
> the WhatsApp bot and the site AI can ground their answers in SQL. The app/site
> do not depend on it for rendering; the export tool keeps it in sync. See
> [Catalogue mirror](#catalogue-mirror-plans--providers) below.

## RLS posture (project-wide)

- **RLS is enabled on every table.** A table with RLS and no matching policy is
  *locked* — the safe default (Supabase "automatic RLS").
- **Public reads** are explicit and narrow: community posts/replies/likes and
  provider reviews (`select using (true)`); the catalogue-mirror tables
  `plans` / `providers` / `plan_price_history`; and the helper views
  `community_feed` and `provider_rating_summary`.
- **User writes are scoped to `auth.uid() = user_id`** (or `= id`). Satisfied by
  the app's startup anonymous sign-in (anonymous users hold the `authenticated`
  role).
- **The sales/ops team reads operational data with the `service_role` key** —
  server-side only (edge functions), never shipped in any client.
- **Defence-in-depth column grants**: even where a row policy lets a session see
  its own rows, table-level column GRANTs are tightened so clients can't read
  internal/PII columns via `select=*` (e.g. on `leads`, `support_tickets`).
- **⚠️ The 2026-06 grant gap (project-wide invariant).** On this project the
  *default privileges do NOT grant to `service_role`*. `service_role` bypasses
  RLS, but it still needs an explicit base-table `GRANT` or every insert/select
  silently 403s. Every service-role-only table below therefore spells its grants
  out, and `rls-defensive-2026-06.sql` adds belt-and-braces deny-all policies on
  the PII tables. Keep this in mind when adding any new table.

## Tables

### Accounts & leads

| Table | Holds | RLS posture (summary) |
|-------|-------|------------------------|
| `profiles` | user account rows (optional `quiz` / `bills` sync; `is_admin` flag; consent columns) | owner-scoped (`auth.uid() = id`) |
| `leads` | contact requests from app / web / site | **insert: anyone** (`leads_insert_anyone`, deliberate anonymous lead capture); **select: own row only** (`auth.uid() = user_id`), and column-scoped — `revoke select … from anon, authenticated` then a narrow `grant select (…)`. The team reads everything via `service_role`. |
| `lead_events` | per-lead audit trail (status changes, notes) | service-role / ops |

`public.leads` is the convergence point of all three front-ends. Its INSERT path
is guarded by triggers (anti-abuse, consent-stamp) and fans out to notifications
— see **[Lead pipeline](#lead-pipeline-end-to-end)** below.

#### `leads` columns of note (compliance)

- **Consent timestamps** (`legal-consent-2026-06.sql`):
  `terms_accepted_at` / `privacy_accepted_at` / `marketing_accepted_at` — the
  *when* of consent, server-stamped so it can't be backdated.
  `marketing_accepted_at` is NULL unless the user actively opted in (Spam Law
  safe default).
- **Per-channel marketing opt-in** (`marketing-consent-2026-06.sql`):
  `consent_marketing_sms` / `consent_marketing_email` / `consent_marketing_whatsapp`,
  each `not null default false`. §30A treats each channel as a separate
  advertisement, so consent is tracked per channel.
- **`city`** (`leads-city-2026-06.sql`) — optional city tag so the notify
  pipeline can route a lead to the right regional partner.

#### `leads` anti-abuse + consent triggers (on `public.leads`)

- `leads_rate_limit_before_insert` → a BEFORE INSERT gate that shape-validates,
  nulls server-managed client values (e.g. `source_ip`, `status`), stamps the IP
  itself, and rate-limits (every insert fans out to Telegram + Resend + a paid AI
  call, so an unthrottled anon key would be a cost/spam amplifier). The route
  surfaces this as HTTP 429.
- `leads_consent_stamp` → a BEFORE INSERT trigger that overwrites
  `terms_accepted_at` / `privacy_accepted_at` / `marketing_accepted_at` with
  `now()` when the caller sent a non-null sentinel (else null) — so the consent
  proof (Israeli Spam Law §30A + Privacy Reg. 13) can't be backdated.
- `leads_notify_after_insert` → AFTER INSERT `SECURITY DEFINER` function that
  `pg_net`-POSTs the new row to the `notify-lead` edge function (secret read from
  Vault). See [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md).

### Tracked plans (renewal radar)

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `tracked_plans` | the user's tracked/owned plans for renewal alerts | owner-scoped writes (needs a signed-in user) |

### Community

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `community_posts` | forum posts | public read; owner-scoped write |
| `community_replies` | replies | public read; owner-scoped write |
| `post_likes` | likes | public read; owner-scoped write |
| `post_bookmarks` | bookmarks | owner-scoped |
| `community_reports` | user abuse reports | owner-scoped insert / ops review |
| `community_notifications` | in-app community notifications | owner-scoped |

Views: `community_feed` (composed feed). Inserts fan out to
`community-moderate` (LLM flagging) and `community-notify` (team Telegram ping).

### Provider reviews

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `provider_reviews` | user reviews of carriers | public read; owner-scoped upsert (needs a signed-in user) |

View: `provider_rating_summary` (aggregate stars / counts). The app combines this
with the catalogue's seed ratings via `ProviderRatings` — it never fabricates
ratings.

### Catalogue mirror (`plans` + `providers`)

A publicly-readable copy of the catalogue, kept in the DB so the WhatsApp bot
(`whatsapp-webhook`) and the site AI can ground their answers in SQL. The app's
catalogue stays static (`lib/data/`); the export tool (`tool/export_plans.dart`)
UPSERTs these tables from `lib/data.dart`.

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `plans` | per-plan catalogue rows + bot-grounding columns (`after` / `after_exact` post-promo price, `is_5g`, `no_commit`, `has_abroad`, `specs` jsonb) and owner curation (`featured`, `editor_choice`, `editor_rank`) | **public read** (`grant select … to anon, authenticated`); writes service-role only (the export tool) |
| `providers` | one row per carrier — single source of truth for `logo_url`, `rating`, `review_count`, `categories`, and owner curation (`featured`, `editor_choice`, `sponsored`, `methodology_note`) | **public read** (`providers public read` policy); writes service-role only (owner curates) |
| `plan_price_history` | append-only daily price snapshots per plan (`price`, `after`, `captured_at`) — the ledger behind the "Market Pulse" trend | **public read** (`plan_price_history public read`); writes service-role only (the catalogue-sync) |

> **Curation transparency.** `featured` / `editor_choice` / `sponsored` all
> default FALSE and are set deliberately by the owner; `methodology_note` carries
> the human "why". They are never auto-populated — E-E-A-T rule. DDL:
> `plans-enrich-2026-06.sql`, `providers-2026-06.sql`, `plan-price-history-2026-06.sql`.

### Meetings (video consultation with a rep)

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `meetings` | booked video consultations | owner-scoped; server enforces the schedule via `meetings_guard()` |
| `meeting_events` | meeting audit trail | service-role / ops |

`meetings_guard()` authoritatively enforces the booking rules (from tomorrow,
Sun–Thu 09:00–20:30 + Fri 09:00–12:30, 30-min slots, one open meeting per phone,
30-day horizon; `starts_at` computed `at time zone 'Asia/Jerusalem'`). INSERT
triggers `notify-lead` (a Telegram confirmation card), and the rep confirm path
creates a Zoom link (S2S OAuth) or accepts a replied link. DDL: `meetings-2026-06.sql`.

### Support tickets

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `support_tickets` | in-app support tickets (`status`, `agent_type`, escalation/Telegram-group columns) | owner-scoped read/insert; **UPDATE column-scoped to `status` only** — the workflow columns (`agent_type` / `escalated_at` / `human_assigned_to` / `telegram_group_id`) are server-managed (service-role) |
| `support_messages` | ticket thread messages (`role` ∈ user/agent/human) | owner-scoped |

DDL: `support-tickets-2026-06-12.sql`.

### Site AI rate-limit / log tables

These are **write-mostly IP-keyed throttle/log tables**, not per-user history.
RLS is ON with **no client policies**; only the service-role edge fns reach them
(and each carries an explicit `service_role` grant — the grant-gap rule). They
hold a coarse `ip` for abuse triage and **no lead PII** (lead PII goes to
`public.leads` via the consent path).

| Table | Holds | Written by |
|-------|-------|-----------|
| `chat_messages` | per-IP throttle ledger for the site chat | `site-ai-chat` |
| `advisor_sessions` | per-IP throttle ledger for the plan advisor (~20/hr/IP) | `site-plan-advisor` |
| `bill_analyses` | per-bill summary row (`provider`, `current_spend`, `suggestions` jsonb) — **the bill image is never stored** | `site-bill-analyzer` |
| `analytics_events` | product-funnel events (`event`, `props` jsonb, `ip`) | `analytics-track` (write-only; never echoed back) |
| `ai_sessions` | the site chat's durable multi-turn memory — a capped rolling transcript (`messages` jsonb) per opaque client `session_id`, so a conversation survives a reload. Pruned after 30 days idle (`prune_ai_sessions()`). | `site-ai-chat` (load + upsert per turn) |
| `newsletter_subscribers` | marketing-site newsletter signups (`email`, `consent`, double-opt-in `confirmed_at`) | `site-subscribe` |

> **`ai_sessions` is conversation memory, not identity.** `session_id` is an
> opaque client-generated id; nothing mints identity from it. The chat fails
> soft — if the table isn't applied, the chat still works statelessly via the
> browser-replayed history. DDL: `ai-sessions-2026-06.sql`,
> `analytics-events-2026-06.sql`.

### WhatsApp CRM

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `whatsapp_contacts` | WhatsApp contacts (`wa_phone` E.164 unique, `status` pipeline, `opted_in_marketing`, FK to `leads`/`profiles`) | service-role only |
| `whatsapp_conversations` | conversation threads (`status`, `intent`, `ai_state` jsonb, and the **`bot_enabled` takeover gate** + `human_active_at` / `assigned_rep`) | service-role only |
| `whatsapp_messages` | individual messages (`direction`, `actor`, `body` text/caption only — **never base64 bytes**), de-duped by Meta `wa_message_id` (`wamid`) | service-role only |
| `crm_events` | append-only CRM activity / control feed (`actor`, `event`/`kind`, ≤80-char `preview` — **never PII/bytes**) | **admin read** (`crm_events_admin_select`: `profiles.is_admin`) + service-role writes; published to Realtime for the admin CRM screen |

The app/site never touch the `whatsapp_*` tables directly. The `whatsapp-webhook`
function writes them (service role); the admin-gated `crm-api` function reads/acts
on them. **Live human takeover** is governed by the single authoritative gate
`whatsapp_conversations.bot_enabled`:

- `bot_enabled = true` → the bot auto-replies as usual.
- `bot_enabled = false` → a human is in the loop: the bot still **stores** the
  customer's inbound messages and still honours STOP/opt-out + the §11
  first-contact notice, but it **never** generates an AI auto-reply. The `crm-api`
  `takeOver` / `handBack` actions (and a rep reply) flip the flag.

DDL: `whatsapp-2026-06.sql`, `whatsapp-control-2026-06.sql`,
`crm-takeover-2026-06.sql`, `whatsapp-telegram-thread-2026-06.sql`.

### Compliance / audit / data-subject rights

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `security_audit_log` | Reg.13 security audit trail (`event`, `detail` jsonb, `ip`) — consent-recorded, CRM control actions, STOP/opt-out, §11 notices, retention-purge counts | service-role only (RLS on, no client policy); appended via the `log_security_event` RPC (authenticated) or directly by edge fns |
| `data_subject_requests` | one row per privacy request (`kind` ∈ access/correction/deletion/withdraw; `contact`; statutory `deadline_at` stamped server-side at +30 days; `handled_at` proof) | service-role only (explicit deny-all-for-authenticated policy); inserted by the site privacy endpoint, worked by the team |
| `marketing_suppression` | Spam-Law §30A opt-out / do-not-contact registry (unique `(channel, contact)`; `reason`) — every marketing sender MUST check it before sending | service-role only |

> **Honesty note on `marketing_suppression`.** The table exists and is the
> intended §30A opt-out proof, but as of this writing the WhatsApp STOP handler
> (`whatsapp-webhook` `handleOptOut`) flips the contact to `opted_out` and writes
> a `whatsapp_marketing_opt_out` row to `security_audit_log` — it does **not yet
> INSERT into `marketing_suppression`**, and there is no campaign sender wired to
> read it yet. Treat it as defined-but-not-yet-wired storage; the wiring is
> called out in `marketing-consent-2026-06.sql`. Don't claim it is enforced.

#### Compliance posture (Israeli law)

The DB layer is the **technical scaffolding** for compliance — it is not a
declaration that the org has been audited. Owner-only legal items (DPO name,
registered ח.פ, lawyer-reviewed policy text) live as `[[OWNER]]` placeholders in
`docs/legal/*` and are out of scope here.

- **Privacy Protection Law + Reg.13 (2017)** — access control (RLS + grant gap),
  encryption in transit (TLS at the edge) / at rest (Supabase disk), audit
  logging (`security_audit_log`), data-subject rights (`data_subject_requests`,
  +30-day `deadline_at`), and data-minimisation retention sweeps
  (`purge_expired_personal_data()` monthly via pg_cron — leads & whatsapp_* PII
  past 24 months, **terminal/closed rows only**, never live ones).
- **Spam Law §30A** — prior, explicit, per-channel opt-in (`leads.consent_marketing_*`,
  default false), provable consent timing (`*_accepted_at`), and the opt-out
  registry (`marketing_suppression`) + the WhatsApp STOP handler.
- **§11 first-contact notice** — the WhatsApp bot sends the mandatory disclosure
  on first contact (`withFirstContactNotice`).
- Column-level PII encryption (pgsodium) is **deferred** — disk encryption +
  strict RLS + service-role-only access is the control. See
  `data-protection-2026-06.sql` for the assessment.

DDL: `legal-consent-2026-06.sql`, `data-protection-2026-06.sql`,
`marketing-consent-2026-06.sql`, `audit-observability-2026-06.sql`,
`function-search-path-2026-06.sql`, `rls-defensive-2026-06.sql`.

## Lead pipeline (end to end)

```
Flutter app  ─┐
web /api/lead ─┼─▶  INSERT public.leads
site form    ─┘        │  BEFORE INSERT: rate-limit gate + consent stamp
                       │  AFTER  INSERT: leads_notify_after_insert (SECURITY DEFINER, pg_net)
                       ▼
              notify-lead  (Edge Function, x-webhook-secret)
                       ▼
        Telegram interactive card  +  Resend email  (+ optional AI triage)
                       ▼
        Team actions write leads.status / leads.actual_saving + lead_events
                       ▼
        App tracker streams status back to the user via Supabase Realtime
```

Scheduled follow-up (pg_cron → `renewal-reminders` modes): `digest` (daily),
`sweep` (re-deliver unnotified leads every 10 min), `follow-up` (hourly SLA
ladder), `weekly` (Sunday business report). Retention sweeps run separately:
`retention-purge-monthly` (1st, 03:30 UTC) and `analytics-purge-monthly`
(2nd, 03:40 UTC).

## Config secrets (not application data)

Operational secrets (Telegram / Resend / AI / Zoom keys, the shared
`lead_webhook_secret`, the team `telegram_chat_id`) live in **Supabase Vault**
(with Edge env-var fallback), read by edge functions via a service-role RPC. They
are never stored in the application tables and never shipped to any client. Key
matrix + rotation order: `supabase/README.md` §8.

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the four surfaces + cross-surface flows.
- [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md) — the functions that read/write these tables.
- [`DEPLOYMENT.md`](./DEPLOYMENT.md#sql-schema--migration-order) — the migration application order.
- `supabase/schema.sql` + `supabase/*-2026-06*.sql` — authoritative DDL + policies.
- `supabase/README.md` — backend setup, security model, secret-rotation runbook.
