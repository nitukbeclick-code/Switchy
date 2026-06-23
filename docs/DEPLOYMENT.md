# Deployment

Each of the four surfaces ships independently. None depends on FlutterFlow.

| Surface | Where it lives | How it deploys |
|---------|----------------|----------------|
| Next.js GEO app (`web/`) | Vercel — `https://switchyy-omega.vercel.app` (also fronts `switchy-ai.com` domains per the lead-API origin allow-list) | Auto-deploy on push to the production branch; Vercel installs deps + runs `next build` |
| Static site (`site/`) | Vercel (also the live `switchy-ai.com`) | Prebuilt HTML committed to the repo; served as static output |
| Supabase edge functions | Supabase project `orzitfqmlvopujsoyigr` | Supabase CLI / GitHub Actions (see [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md)) |
| Flutter app | App stores | `flutter build apk` / `flutter build ipa`, published directly |

## Next.js web app → Vercel

The Next.js app deploys to Vercel and rebuilds automatically when its source is
pushed.

- **Root Directory = `web`.** The live Vercel project is configured (in the
  Vercel dashboard) with its Root Directory set to `web/`, so Vercel installs and
  builds the Next.js app itself. The marker comment at the bottom of
  `web/README.md` records this (`Root Directory = web`).
- **`web/vercel.json`** sets `framework: nextjs` and the production security
  headers (CSP allowing GA4 / GTM / Meta Pixel + the Supabase origin, HSTS,
  `X-Frame-Options`, etc.).
- **`web/next.config.ts`** pins the Turbopack workspace root to `web/` (so Next
  doesn't walk up and pick the parent Flutter repo's lockfile) and 301-redirects
  legacy provider slugs.
- **Build needs no secrets.** The catalogue is bundled (`web/data/catalogue.json`),
  read at module init by `web/lib/data.ts`. Keep `next build` green — it's the
  release gate.
- **Runtime secrets** are server-only and set in Vercel's project env, not
  committed. The only required one for lead capture is
  `SUPABASE_SERVICE_ROLE_KEY` (used solely by `web/app/api/lead/route.ts`; if
  absent the route returns 503). Optional: `NEXT_PUBLIC_SUPABASE_URL`
  (defaults to the known project URL), `NEXT_PUBLIC_FB_PIXEL_ID`,
  `NEXT_PUBLIC_SITE_URL`. See `web/.env.local.example`.

### .vercelignore / root-config gotcha

There are **two** Vercel configs and **two** `.vercelignore` files; they target
different projects. Do not cross them:

- **Repo root `vercel.json`** has `outputDirectory: "site"`, `framework: null`,
  and no build command — i.e. it ships the **static site**. The repo-root
  `.vercelignore` uploads only `site/**` (and `web/**`, `vercel.json`).
- **`web/.vercelignore`** deliberately does **not** inherit the root one: it
  ignores only `node_modules` and `.next` so Vercel can install deps and build
  `.next` itself for the Next.js project.

The consequence: the Next.js project must run with **Root Directory = `web`** in
the Vercel dashboard, so it uses `web/vercel.json` + `web/.vercelignore` and
ignores the root static-site config. A Vercel project pointed at the repo root
would deploy the static `site/` instead.

### Local dev (web)

```bash
cd web
npm install
npm run dev        # next dev  → http://localhost:3000
npm run build      # next build (the release gate — keep it green)
npm run lint       # eslint
npm run test       # vitest run (web/lib/__tests__/*)
```

> Next 16 has breaking changes vs. older Next.js — read
> `web/node_modules/next/dist/docs/` before writing Next-specific code
> (`web/AGENTS.md`). On OneDrive-synced storage, set `NEXT_DIST_DIR` to a local
> path to move the build output off the synced folder (avoids file-lock errors).

## Static site → Vercel (prebuilt HTML)

The static site is generated and committed, then served as static files.

```bash
node site/build.js          # regenerate ~230 *.html + sitemap.xml + robots.txt
# commit the generated HTML; deploy = publish site/
```

- The generator has **no npm dependencies**; `package.json`'s `build:site`
  script wraps it (`npm run build:site`).
- It reads the catalogue from `site/data/plans.json` and guide content from
  `site/content/guides/*.json` (~142 guides).
- `index.html` is **hand-written**, not generated — when the CSS/JS fingerprints
  change, update its references (the build prints the new hashes).
- CSS/JS are content-fingerprinted (`?v=<hash>`); the root `vercel.json` serves
  `*.css/*.js/*.svg/*.png` with `Cache-Control: immutable` for a year, plus a
  strict CSP and HSTS.
- Keep `node site/build.js` green.

## Supabase edge functions → CLI / CI

Deployed with the Supabase CLI (manual or via GitHub Actions), **not** with the
web deploys. See [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md) for the full recipe.
Quick form:

```bash
npx --no-install supabase functions deploy <slug> \
  --project-ref orzitfqmlvopujsoyigr --no-verify-jwt
```

Or push a commit containing `[deploy]`, or run the "Deploy edge functions"
workflow manually. Requires the repo secret `SUPABASE_ACCESS_TOKEN`. SQL schema /
migrations are applied separately in the Supabase SQL editor — see the order
below.

### Per-function deploy slug + auth

The 12 deployable functions (the `support-agent` directory is a **stub** —
`deno.json` only, no `index.ts`, not deployed) all deploy with the same recipe.
Each enforces its own auth (full matrix in [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md)):

```
notify-lead  renewal-reminders  crm-api  analytics-track
community-moderate  community-notify
site-ai-chat  site-plan-advisor  site-bill-analyzer  site-subscribe
whatsapp-webhook  telegram-webhook
```

After deploying a function that owns a webhook, re-register it (e.g. the Telegram
bot via `notify-lead?action=set-telegram-webhook`, the Meta webhook in the Meta
dashboard). See `supabase/README.md` §8 and [`EDGE_FUNCTIONS.md`](./EDGE_FUNCTIONS.md#post-deploy-registration).

## SQL schema + migration order

Migrations are **not applied automatically** — every dated `supabase/*.sql` file
carries a "DO NOT auto-apply / apply manually after review" header. Apply them in
the Supabase SQL editor (or `psql "$DATABASE_URL" -f <file>`). All files are
idempotent / re-runnable (`create … if not exists`, `add column if not exists`,
`drop policy if exists`, `cron.schedule` upserts by name), so a re-run is a no-op
and partial re-applies are safe.

Apply in this order — later files assume the tables/functions earlier ones create
(several headers say "run AFTER schema.sql / upgrade / legal-consent"):

| # | File | Adds | Depends on |
|---|------|------|-----------|
| 1 | `schema.sql` | base tables + RLS + the two helper views + the site-AI rate-limit/log tables (`chat_messages` / `advisor_sessions` / `bill_analyses` / `newsletter_subscribers`) + `pg_cron` schedule templates (`analytics_events` arrives at #8) | — (fresh install) |
| 2 | `storage.sql` | the `community-media` Storage bucket + scoped RLS | schema |
| 3 | `upgrade-2026-06-10.sql` | interactive-bot v2 delta + the lead `pg_net` notify trigger / Vault config RPC + the `renewal-reminders` cron jobs | schema |
| 4 | `legal-consent-2026-06.sql` | consent columns on `profiles` + `leads`, `record_registration_consent` / `leads_consent_stamp`, `security_audit_log` + `log_security_event` | schema |
| 5 | `meetings-2026-06.sql` | `meetings` / `meeting_events`, `meetings_guard()`, Zoom path; ⚠️ **REPLACES `get_lead_notify_config()`** — verify every existing Vault key survives | schema, upgrade, legal-consent |
| 6 | `leads-city-2026-06.sql` | `leads.city` (regional routing) | schema |
| 7 | `profiles-admin-2026-06.sql` | `profiles.is_admin` (the `crm-api` `requireAdmin` gate) | schema |
| 8 | `analytics-events-2026-06.sql` | `analytics_events` sink (service-role) | schema |
| 9 | `ai-sessions-2026-06.sql` | `ai_sessions` (site-chat memory) + `prune_ai_sessions()` | schema |
| 10 | `plans-enrich-2026-06.sql` | bot-grounding columns on `public.plans` (`after` / `is_5g` / `specs` …) | schema (`plans` table) |
| 11 | `providers-2026-06.sql` | `public.providers` directory (seeded) + plan curation columns | schema (`plans` table) |
| 12 | `plan-price-history-2026-06.sql` | `plan_price_history` (Market Pulse ledger) | schema |
| 13 | `whatsapp-2026-06.sql` | `whatsapp_contacts` / `whatsapp_conversations` / `whatsapp_messages` | schema, leads, profiles |
| 14 | `whatsapp-control-2026-06.sql` | `bot_enabled` takeover gate + `crm_events` (v1: `kind`/`preview`) | whatsapp |
| 15 | `crm-takeover-2026-06.sql` | widens `crm_events` with canonical `actor`/`event` (additive; safe in either order vs #14) | whatsapp, profiles |
| 16 | `whatsapp-telegram-thread-2026-06.sql` | WhatsApp↔Telegram thread linkage | whatsapp |
| 17 | `marketing-consent-2026-06.sql` | per-channel `leads.consent_marketing_*` + `marketing_suppression` registry | leads |
| 18 | `data-protection-2026-06.sql` | `data_subject_requests` + `purge_expired_personal_data()` + `retention-purge-monthly` cron | leads, whatsapp, security_audit_log |
| 19 | `audit-observability-2026-06.sql` | ensures `security_audit_log` + `get_analytics_events()` / `purge_analytics_events()` + `analytics-purge-monthly` cron | security_audit_log, analytics_events |
| 20 | `function-search-path-2026-06.sql` | pins `search_path` on flagged SECURITY-context functions (advisor WARN fix) | the functions they harden |
| 21 | `rls-defensive-2026-06.sql` | belt-and-braces deny-all policies on the service-role-only PII tables | whatsapp, analytics_events |
| 22 | `support-tickets-2026-06-12.sql` | `support_tickets` / `support_messages` (UPDATE column-scoped to `status`) | schema |

> Notes: files 8–22 are largely independent of one another except where the
> "Depends on" column says so — the strict prerequisites are that **`schema.sql`
> runs first** and that the consent/whatsapp/profiles/analytics tables exist
> before the files that extend them. The two `crm_events` migrations (#14, #15)
> are deliberately additive and order-independent. The grant-gap rule (every new
> table needs an explicit `service_role` GRANT) is already baked into each file.

## Flutter app → app stores

```bash
export PATH="$HOME/.flutter-sdk/bin:$PATH"
flutter pub get
flutter build apk    # Android
flutter build ipa    # iOS
```

The deployment path is: write code → push to GitHub → build & publish to the app
stores directly. The app connects to Supabase only when build-time keys are
supplied:

```bash
flutter run --dart-define-from-file=dart_define.json   # URL + ANON (public) key
```

Without `dart_define.json` (gitignored) the app runs on `LocalBackend`. **Never**
put the `service_role` key in the client.

## Validation gates before shipping

| Surface | Gates (run in order) |
|---------|----------------------|
| Flutter (`lib/`) | `flutter analyze` → "No issues found"; `flutter test`; `flutter build web --no-pub` → "✓ Built build/web" |
| Web (`web/`) | `npm run lint`; `npm run test`; `npm run build` (keep `next build` green) |
| Site (`site/`) | `node site/build.js` runs clean; generated HTML committed |
| Edge functions | `deno task check`; `deno task test` |

CI: `.github/workflows/ci.yml` runs the Flutter analyze/test/web-build/APK gates
and the Deno type-check/test; `bot-health.yml` probes deployed functions daily;
`deploy-functions.yml` ships edge functions.
