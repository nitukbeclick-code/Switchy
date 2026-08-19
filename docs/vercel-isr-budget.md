# Vercel free-tier budget — ISR writes, origin transfer, build churn

Why the account kept receiving *"Approaching your limits"* mail, what changed, and
what you have to do once (a secret) so prices stay fresh anyway.

## What actually blew the quota

Vercel's Hobby plan includes **200,000 ISR writes** and **10 GB Fast Origin
Transfer** per month. Every time a prerendered page is regenerated it costs one
write, the transfer of the regenerated HTML, and the CPU that rendered it —
whether or not the underlying data changed.

The app prerenders **679 pages** (`next build` → prerender-manifest), 599 of them
with a revalidate timer. Every one of those timers was **one hour**:

| Surface | Prerendered pages | Old `revalidate` | Worst-case writes / month |
|---------|------------------:|-----------------:|--------------------------:|
| `/guides/[slug]` | 150 | 3600 s | 108,000 |
| `/compare/[service]/[city]` | 252 | 3600 s | 181,440 |
| `/plans/[id]` | 120 | 3600 s | 86,400 |
| `/vs/[pair]` | 25 | 3600 s | 18,000 |
| `/providers/[slug]` | 18 | 3600 s | 12,960 |
| 27 landing pages + `/compare/[service]` | 33 | 3600 s | 23,760 |
| `/sitemap.xml` | 1 | 3600 s | 720 |
| **Total** | **599** | | **431,280 — 216% of the allowance** |

Worst case assumes every page is requested in every window, which is roughly what
a crawler walking the sitemap does. That is how the account reached 100% of the
ISR-write allowance (and 75% of Fast Origin Transfer) in July–August 2026.

On top of that, `rebuild-static.yml` pushes regenerated `site/*.html` whenever a
price changes — up to 48 commits a day. Every one of those pushes redeployed the
**Next** project too, re-prerendering all 679 of its pages for a diff that touched
no file the app contains. At even a few catalogue edits a day that doubles the
write bill on its own.

The community Q&A pages are **not** part of this: `/community/post/[id]` and
`/community/questions` render dynamically (neither appears in the prerender
manifest), so their old 300 s timers cost nothing — and bought nothing. They are
still worth watching, because a dynamic render bills Fluid Active CPU and origin
transfer on *every* request; see the follow-ups at the bottom.

Nothing here is fixed by deleting old deployments or data: these are **usage**
meters that reset each billing cycle, not stored bytes.

## What changed

**1. `revalidate` is now a safety net, not the freshness mechanism.**
The 598 catalogue pages revalidate every **24 h** and `/sitemap.xml` every 6 h.
Worst case drops from 431,280 to **18,060 writes/month — 9% of the included
allowance.** The two community pages moved to 24 h / 30 min for the same reason,
so that the day one of them becomes cacheable it does not reintroduce the
problem.

**2. Freshness moved to an on-demand purge.** `POST /api/revalidate`
(`web/app/api/revalidate/route.ts`) purges the routes listed in
`web/lib/isr-budget.ts` and the next request regenerates them from live Supabase
prices. A price edit is visible in seconds; a quiet day costs nothing.

**3. The `rebuild-static` workflow fires that purge** after it pushes, instead of
relying on a redeploy.

**4. Each Vercel project ignores commits it does not care about.** Both projects
run their Root Directory's `vercel.json`, so `ignoreCommand` goes in
`web/vercel.json` (project `switchyy`, Root Directory `web`) and
`site/vercel.json` (project `switchy`, Root Directory `site`) — the repo-root
`vercel.json` is not the config either project reads. Each runs
`git diff --quiet HEAD^ HEAD -- .`, which is scoped to that root directory: no
diff → exit 0 → skip the build; a missing `HEAD^` (first or shallow build) →
non-zero → build. The safe default is always to deploy.

**5. CI enforces the budget.** `web/lib/__tests__/isr-budget.test.ts` reads the
real `export const revalidate` out of every `app/**/page.tsx`, multiplies by each
route's real `generateStaticParams` cardinality, and fails if:

- any page revalidates faster than `MIN_REVALIDATE_SECONDS` (30 min),
- an ISR page is missing from the purge lists (it would sit stale for a day),
- a purge list names a route that is no longer an ISR page,
- the worst-case projection exceeds **50% of the included writes**.

Adding 400 pages or halving a timer now fails a test instead of arriving as a
quota mail.

## The one-time setup: `REVALIDATE_SECRET`

Until this is set, the purge endpoint answers `503` and freshness falls back to
the 24 h timer — degraded, never wrong. To turn it on:

1. Generate a secret: `openssl rand -hex 32`.
2. **Vercel** → the Next project → Settings → Environment Variables → add
   `REVALIDATE_SECRET` (Production; Preview if you want to test there). Redeploy.
3. **GitHub** → repo → Settings → Secrets and variables → Actions → New
   repository secret → `REVALIDATE_SECRET`, the same value. The
   `Purge the Next app's ISR cache` step in `rebuild-static.yml` picks it up
   automatically. (Optional: set the `REVALIDATE_URL` *variable* if the endpoint
   is not `https://switchy-ai.com/api/revalidate`.)

Verify:

```bash
curl -i -X POST https://switchy-ai.com/api/revalidate \
  -H 'content-type: application/json' \
  -H "x-revalidate-secret: $REVALIDATE_SECRET" \
  -d '{"scope":"catalogue"}'
# → 200 {"ok":true,"purged":["/5g-vs-4g", …]}
```

Without the header it must answer `403`. The endpoint accepts no content — it can
only invalidate caches — so a leaked secret costs a burst of regeneration, not a
content change.

### Optional: purge straight from Supabase

The DB webhook that already fires `repository_dispatch` on `public.plans`
(documented at the top of `.github/workflows/rebuild-static.yml`) can call the
purge directly instead of waiting for the rebuild:

- URL `https://switchy-ai.com/api/revalidate`, method `POST`
- Headers `x-revalidate-secret: <the secret>`, `content-type: application/json`
- Body `{"scope":"catalogue"}` — or `{"scope":"community"}` on a webhook over the
  community tables, which purges the Q&A hub and permalinks without touching the
  ~600 catalogue pages.

Debounce bulk edits: one purge per sync, not one per row.

## Scopes

| Scope | Purges |
|-------|--------|
| `catalogue` | the 33 catalogue routes/patterns + `/sitemap.xml` |
| `community` | `/community/questions`, `/community/post/[id]` + `/sitemap.xml` |
| `all` | everything above |

`{"paths":["/community/post/abc"]}` adds concrete paths (max 50 per call) to any
scope — useful for purging exactly one permalink when a reply lands.

The scopes are deliberately separate: a price edit must not re-write the ~500
community permalinks, and a new reply must not re-write the catalogue.

## If a limit mail arrives again

1. Open Vercel → the team → Usage, and read **which** meter is at its limit.
   ISR writes, Fast Origin Transfer, Fluid Active CPU and build minutes have
   different causes; only the first two are addressed here.
2. `cd web && npx vitest run lib/__tests__/isr-budget.test.ts` — the failure
   message lists the five most expensive surfaces.
3. If the budget test passes and the meter is still climbing, the cause is
   traffic through dynamic renders, not configuration. Two known candidates,
   both deliberately left out of this change because they alter behaviour and
   need their own testing:

   - **The desktop device-split proxy** (`web/proxy.ts`) rewrites desktop
     requests to the static origin and sets `Vary: User-Agent`. User-agent
     strings are near-unique, so the CDN misses on most requests and those bytes
     are billed as origin transfer. Narrowing the `Vary` to the paths whose
     response genuinely differs by device (the `.html` and static-asset rewrites
     are identical for every device) is the next available saving.
   - **The community Q&A pages** render on every request. `/community/questions`
     is dynamic because it reads `searchParams`; `/community/post/[id]` has no
     `generateStaticParams`, so nothing is prerendered and each permalink view is
     a function invocation plus two Supabase reads. Making them cacheable would
     move that cost from CPU/transfer to a handful of ISR writes — the budget
     test already reserves room for 500 such pages.
