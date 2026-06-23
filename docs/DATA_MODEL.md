# Data Model

High-level map of the Supabase Postgres schema and its Row-Level-Security (RLS)
posture. Authoritative DDL lives in `supabase/schema.sql` plus the dated
migration deltas (`supabase/*-2026-06*.sql`); this document summarizes it — read
the SQL for exact columns, constraints, and policy bodies.

> **Catalogue is not in the database.** The plan catalogue is static reference
> data shipped in the app (`lib/data/`) and exported to the web surfaces
> (`site/data/plans.json`, `web/data/catalogue.json`). There is no `plans` table.

## RLS posture (project-wide)

- **RLS is enabled on every table.** A table with RLS and no matching policy is
  *locked* — the safe default (Supabase "automatic RLS").
- **Public reads** are explicit and narrow: community posts/replies/likes and
  provider reviews (`select using (true)`), plus the helper views
  `community_feed` and `provider_rating_summary`.
- **User writes are scoped to `auth.uid() = user_id`.** Satisfied by the app's
  startup anonymous sign-in (anonymous users hold the `authenticated` role).
- **The sales/ops team reads operational data with the `service_role` key** —
  server-side only (edge functions), never shipped in any client.
- **Defence-in-depth column grants**: even where a row policy lets a session see
  its own rows, table-level column GRANTs are tightened so clients can't read
  internal/PII columns via `select=*`.

## Tables

### Accounts & leads

| Table | Holds | RLS posture (summary) |
|-------|-------|------------------------|
| `profiles` | user account rows (optional `quiz` / `bills` sync) | owner-scoped |
| `leads` | contact requests from app / web / site | **insert: anyone** (`leads_insert_anyone`, deliberate anonymous lead capture); **select: own row only** (`auth.uid() = user_id`), and column-scoped — `revoke select … from anon, authenticated` then `grant select (id, status, created_at, user_id) to authenticated`. The team reads everything via `service_role` (bypasses RLS). |
| `lead_events` | per-lead audit trail (status changes, notes) | service-role / ops |

`public.leads` is the convergence point of all three front-ends. Its INSERT path
is guarded by triggers (anti-abuse, consent-stamp) and fans out to notifications
— see **Lead pipeline** below.

#### Lead anti-abuse + consent triggers (on `public.leads`)

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

### Meetings (video consultation with a rep)

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `meetings` | booked video consultations | owner-scoped; server enforces the schedule via `meetings_guard()` |
| `meeting_events` | meeting audit trail | service-role / ops |

`meetings_guard()` authoritatively enforces the booking rules (from tomorrow,
Sun–Thu 09:00–20:30 + Fri 09:00–12:30, 30-min slots, one open meeting per phone,
30-day horizon; `starts_at` computed `at time zone 'Asia/Jerusalem'`). INSERT
triggers `notify-lead` (a Telegram confirmation card), and the rep confirm path
creates a Zoom link (S2S OAuth) or accepts a replied link.

### Support tickets

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `support_tickets` | in-app support tickets | owner-scoped |
| `support_messages` | ticket thread messages | owner-scoped |

### AI / advisor / analytics

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `chat_messages` | app AI-chat history | owner-scoped |
| `advisor_sessions` | advisor flow sessions | owner-scoped |
| `bill_analyses` | bill-analyzer summary rows (the **image is never stored**) | service-role write |
| `plan_views` | plan-view tracking | service-role / ops |
| `analytics_events` | product-funnel events from the `analytics-track` sink | service-role write (write-only; never echoed back) |
| `newsletter_subscribers` | marketing-site newsletter signups | service-role write (via `site-subscribe`) |

### WhatsApp CRM

| Table | Holds | RLS posture |
|-------|-------|-------------|
| `whatsapp_contacts` | WhatsApp contacts | service-role only |
| `whatsapp_conversations` | conversation threads | service-role only |
| `whatsapp_messages` | individual messages (de-duped by Meta `wamid`) | service-role only |
| `crm_events` | CRM activity / control events | service-role only |

The app/site never touch the `whatsapp_*` tables directly. The `whatsapp-webhook`
function writes them (service role); the admin-gated `crm-api` function reads/acts
on them. DDL: `supabase/whatsapp-2026-06.sql`, `whatsapp-control-2026-06.sql`,
`whatsapp-telegram-thread-2026-06.sql`.

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
ladder), `weekly` (Sunday business report).

## Config secrets (not application data)

Operational secrets (Telegram / Resend / AI / Zoom keys, the shared
`lead_webhook_secret`, the team `telegram_chat_id`) live in **Supabase Vault**
(with Edge env-var fallback), read by edge functions via a service-role RPC. They
are never stored in the application tables and never shipped to any client. Key
matrix + rotation order: `supabase/README.md` §8.

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — the four surfaces + cross-surface flows.
- [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md) — the functions that read/write these tables.
- `supabase/schema.sql` + `supabase/*-2026-06*.sql` — authoritative DDL + policies.
- `supabase/README.md` — backend setup, security model, secret-rotation runbook.
