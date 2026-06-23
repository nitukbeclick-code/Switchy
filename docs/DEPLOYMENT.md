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
migrations are applied separately in the Supabase SQL editor (see
`supabase/README.md` and the dated `supabase/*.sql` deltas).

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
