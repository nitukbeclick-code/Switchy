# Supabase backend — חוסך (Chosech)

This folder holds the database schema for the app's backend.

## ✅ Live connection

The app is wired to a real project. The `schema.sql` tables are already applied
to it (via migration `20260609134100_init_schema`).

| | |
|---|---|
| Project ref | `orzitfqmlvopujsoyigr` |
| API URL | `https://orzitfqmlvopujsoyigr.supabase.co` |
| Region | `eu-central-1` (Frankfurt — lowest latency to Israel) |
| Dashboard | https://supabase.com/dashboard/project/orzitfqmlvopujsoyigr |

The Flutter app connects to it **only when build-time keys are supplied**, so
plain `flutter test` / CI stay fully on-device. Run the app against Supabase:

```bash
flutter run --dart-define-from-file=dart_define.json
```

`dart_define.json` (gitignored, holds the URL + **anon public** key) is created
from [`dart_define.example.json`](../dart_define.example.json). Never put the
`service_role` key there — it must never ship in the client.

### ⚠️ One dashboard toggle still needed

Writes scoped to `auth.uid()` (tracked plans, reviews, community) need a signed-in
user. `main.dart` signs the device in **anonymously** at startup, but you must
enable it once: **Dashboard → Authentication → Sign In / Providers → Anonymous
sign-ins → on**. Until then, only anonymous **lead capture** works (its insert
policy allows anyone). Two remaining items also need applying: the
`community-media` storage bucket (`storage.sql`) and the advisor hardening notes
in §7 — see the bottom of this file.

## 1. Apply the schema (reference / fresh environments)

1. Open your project → **SQL Editor** → **New query**.
2. Paste the whole of [`schema.sql`](./schema.sql) and **Run**.
3. It creates the tables, enables **RLS on every one of them**, and adds the
   access policies + two helper views (`community_feed`, `provider_rating_summary`).

> Re-running is safe — it uses `if not exists` / `drop policy if exists`.

## 2. What lives where

| Stays on the device (`SharedPreferences`) | Moves to Supabase |
|-------------------------------------------|-------------------|
| quiz answers, recent searches, dismissed-notification keys, watchlist/recently-viewed (can later sync via `profiles.quiz` / `profiles.bills`) | accounts (`profiles`), `leads`, `tracked_plans`, `community_posts` + `replies` + `likes` + `bookmarks`, `provider_reviews` |

The **plan catalogue itself stays in the app** (`lib/data/`) — it's static
reference data, no need for a table.

## 3. Security model (matches your project settings)

- **RLS is on for every table.** A table with RLS and no matching policy is
  *locked* — that's the safe default you chose with "Enable automatic RLS".
- Public reads: community posts/replies/likes and provider reviews
  (`using (true)` on `select`).
- Everything a user *writes* is scoped to `auth.uid() = user_id`.
- `leads` allows anonymous `insert` (lead capture before sign-in) but only the
  owner can read their own. Your sales team reads all leads with the
  **`service_role`** key — **server-side only, never in the app**.

## 4. Media

The app currently encodes images/voice as base64 data-URIs. For the backend,
prefer a **Supabase Storage** bucket (e.g. `community-media`) and store the
public URL in `media_url`. Base64 in a `text` column works but bloats the table.

Run [`storage.sql`](./storage.sql) after the schema to create the bucket and the
RLS policies (public read; each user can only upload/delete under their own
`<uid>/` folder).

## 5. Flutter integration (✅ wired)

Done — for reference, this is how it hangs together:

1. Dependency `supabase_flutter: ^2.5.0` is in `pubspec.yaml`.
2. `main.dart` initialises Supabase **only when** `SUPABASE_URL` /
   `SUPABASE_ANON_KEY` are passed at build time, then sets
   `appBackend = SupabaseBackend()` and does an anonymous sign-in. With no keys
   the app stays on `LocalBackend`, so `flutter test` and CI need no project.
3. The repository layer in [`lib/services/backend/`](../lib/services/backend/):
   - `backend.dart` — the `Backend` interface + `LeadInput`/`ReviewInput`.
   - `local_backend.dart` — `LocalBackend` (the on-device default) + `appBackend`.
   - `supabase_backend.dart` — the live implementation, queries mapped 1:1 to
     this schema (renamed from the old `.example`).

### Which domains are wired

| Domain | In `Backend` | Status via `appBackend` (with keys) |
|--------|:---:|---|
| Leads | ✅ | ✅ writes to `leads` (works anonymously) |
| Provider reviews | ✅ | ✅ upserts to `provider_reviews` (needs a signed-in user) |
| Tracked plans | ✅ | ✅ writes to `tracked_plans` (needs a signed-in user) |
| Community (posts/replies/likes/bookmarks) | ✅ | ⏳ contract + impl ready, but the **live feed still reads AppState + seed data** — switch `community_widget` onto `appBackend` during the community cutover so the seed feed isn't lost meanwhile |

"Needs a signed-in user" is satisfied by the startup anonymous sign-in once the
dashboard toggle (top of this file) is on.

## 6. Supabase CLI (installed)

The CLI is installed and `supabase/config.toml` is present, so the repo is
link-ready. The live schema was applied programmatically, so import it into the
CLI's migration history instead of re-authoring it:

```bash
supabase login                                   # opens a browser once
supabase link --project-ref orzitfqmlvopujsoyigr
supabase db pull                                 # snapshots the live schema into supabase/migrations/
```

After that, new changes flow through `supabase migration new …` → `supabase db push`.
For local dev: `supabase start` (Docker) brings up a full local stack;
`config.toml` already has `enable_anonymous_sign_ins = true` for parity.

## 7. Region / project notes

- Region `eu-central-1` (Frankfurt) — lowest latency to Israeli users. Permanent.
- Keep the DB password in a password manager; the `service_role` key out of the
  client entirely.

### Advisor hardening (✅ applied)

The security advisor warnings were resolved in migrations
`20260609135408_init_storage_and_security_hardening` and
`…_harden_handle_new_user_and_bucket_listing`:

```sql
alter function public.set_updated_at() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- public bucket: drop the broad SELECT policy (objects served via public URL)
drop policy if exists "community_media_read" on storage.objects;
```

Two WARN-level notices remain **on purpose**:
- `leads_insert_anyone` — the deliberate anonymous lead-capture policy (§3).
- `public.rls_auto_enable()` — part of the project's built-in **automatic-RLS**
  feature; it's Supabase-managed, so we don't revoke it.

## 8. Lead notifications → Telegram (the digital rep)

Every new lead — from the app's lead form, the AI advisor flow, or the marketing
site — inserts into `public.leads`. An AFTER INSERT trigger forwards it server-side
to the team, so no keys ever ship in the client:

```
leads INSERT ──trigger (pg_net)──▶ notify-lead Edge Function ──▶ Telegram + Resend (+ AI triage)
```

- **Edge Function** [`functions/notify-lead/index.ts`](./functions/notify-lead/index.ts)
  — formats a Hebrew message (with a one-tap WhatsApp link), adds a one-line AI
  triage if an AI key is set, and posts to Telegram + Resend. `verify_jwt=false`;
  authed by a shared `x-webhook-secret`.
- **Trigger** `leads_notify_after_insert` → `public.notify_lead_on_insert()`
  (`SECURITY DEFINER`, reads the secret from Vault `lead_webhook_secret`) uses
  `pg_net` to POST the new row to the function. Migration:
  `…_leads_notify_telegram_trigger`.

### Config resolution — Vault first, env fallback

The function reads each value from **Vault** (via the service-role RPC
`public.get_lead_notify_config()`, migration `…_lead_notify_config_rpc`, using the
auto-injected `SUPABASE_SERVICE_ROLE_KEY`), falling back to an **Edge Function env
var**. So config can be managed entirely with SQL (`vault.create_secret(...)`) — no
dashboard access required — while keys already set as Edge secrets keep working.

| Key | Required | Where it lives now | Notes |
|-----|:---:|---|---|
| `telegram_bot_token` | ✅ | **env** (`TELEGRAM_BOT_TOKEN`) | from @BotFather |
| `telegram_chat_id` | ✅ | **Vault** (`telegram_chat_id`) | destination chat id (discover via `?action=telegram-chats`) |
| `lead_webhook_secret` | ✅ | **Vault** (`lead_webhook_secret`) | shared trigger↔function secret |
| `resend_api_key` | ✅ | **env** (`RESEND_API_KEY`) | — |
| `resend_from` / `leads_notify_email` | ➖ | env / Vault | email path (needs a Resend-verified domain) |
| `openai_api_key` *or* `anthropic_api_key` | ➖ | **env** (`OPENAI_API_KEY`) | enables the AI triage line |

Set a Vault value with SQL:
`select vault.create_secret('<value>', '<name>', '<description>');`
(env var name variants are also accepted — see `firstEnv()` in the function).

### Verify & test

```bash
# which integrations are configured + their source (vault|env|none), no values:
curl 'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=health'

# discover your Telegram chat id (after messaging the bot / adding it to a group):
curl -H 'x-webhook-secret: <lead_webhook_secret>' \
  'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=telegram-chats'

# end-to-end: submit a lead in the app (or insert into public.leads) → arrives in
# Telegram. Logs: Dashboard → Edge Functions → notify-lead.
```

Re-deploy after editing the function: `supabase functions deploy notify-lead --no-verify-jwt`.

### Status buttons (interactive bot) + delivery safety net

Each lead message carries inline buttons — **📞 דיברתי / 🏆 נסגר / ❌ לא רלוונטי**.
Pressing one updates `leads.status` (`contacted` / `won` / `lost`); the app's
tracker streams that change live (`leadStepStream` maps contacted→step 2,
won→step 4), and the buttons freeze into a stamp showing who handled the lead.

One-time setup:

```bash
# 1. schema: make sure leads.notified_at + the sweep index exist (schema.sql),
#    then mark historical leads as handled so the sweep doesn't replay them:
#      update public.leads set notified_at = created_at where notified_at is null;

# 2. register the bot webhook (NOTE: while a webhook is set, getUpdates — and
#    therefore ?action=telegram-chats — is disabled; undo with
#    ?action=delete-telegram-webhook):
curl -H 'x-webhook-secret: <lead_webhook_secret>' \
  'https://orzitfqmlvopujsoyigr.supabase.co/functions/v1/notify-lead?action=set-telegram-webhook'
```

- **Safety net** — `notify-lead` stamps `leads.notified_at` after a successful
  send. The daily `renewal-reminders` run re-delivers up to 10 leads that are
  >10 minutes old and never got stamped (trigger missed, or both Telegram and
  Resend were down), oldest first.
- **Webhook auth** — Telegram calls `?action=telegram-update` with a
  `secret_token` that is the SHA-256 hex digest of `lead_webhook_secret`
  (Telegram restricts the token charset, so the raw secret can't be used).
- **Secrets in URLs** — `?action=telegram-chats` now accepts the secret via the
  `x-webhook-secret` header only; query-string secrets leak into request logs.
- **Privacy** — lead details sent to the AI triage are disclosed in the site's
  privacy policy (site/build.js → privacy page, "שיתוף מידע").
