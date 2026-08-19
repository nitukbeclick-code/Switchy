// ────────────────────────────────────────────────────────────────────────────
// ISR budget — the ONE place that says how often this app is allowed to
// re-write its static pages, and which routes an on-demand purge must cover.
//
// WHY THIS EXISTS: every ISR regeneration is a metered "ISR Write" on Vercel
// (plus the origin transfer of the regenerated HTML and the CPU that rendered
// it). The free tier includes 200,000 writes / 10 GB Fast Origin Transfer per
// month. With `revalidate = 3600` on ~460 prerendered pages AND 300s on the ~500
// indexed community permalinks, the worst case was ~4.6M writes/month — the
// account hit 100% of the ISR-write allowance and 75% of origin transfer in
// July–August 2026 (Vercel "Approaching your limits" mails).
//
// THE MODEL: revalidate is the SAFETY NET (a page can never be more than
// `revalidate` stale even if every push notification fails). Real freshness is
// on-demand: the catalogue webhook / rebuild-static workflow POSTs to
// /api/revalidate, which purges exactly the routes listed here, and the next
// request regenerates them with live Supabase prices. So a price edit is live in
// seconds while the scheduled write budget stays tiny.
//
// The floor + the projection below are enforced by lib/__tests__/isr-budget.test.ts,
// which scans every app/**/page.tsx: lowering a `revalidate` past the floor, or
// adding a page whose worst case blows the monthly budget, fails CI instead of
// arriving as another quota mail. See docs/vercel-isr-budget.md.
// ────────────────────────────────────────────────────────────────────────────

/** Vercel Hobby (free) plan: included ISR writes per month. */
export const FREE_TIER_ISR_WRITES_PER_MONTH = 200_000;

/**
 * Share of the included writes this app is allowed to plan for at WORST CASE
 * (every page requested in every window, every month). The headroom absorbs
 * on-demand purges, redeploys and traffic spikes.
 */
export const ISR_WRITE_BUDGET_RATIO = 0.5;

/** The worst-case monthly write ceiling the projection test enforces. */
export const ISR_WRITE_BUDGET =
  FREE_TIER_ISR_WRITES_PER_MONTH * ISR_WRITE_BUDGET_RATIO;

/**
 * The shortest `revalidate` any page may declare. Anything more urgent than
 * this must use the on-demand purge instead of a shorter timer.
 */
export const MIN_REVALIDATE_SECONDS = 1_800;

/** Days per month used by the write projection (Vercel bills per calendar month). */
export const DAYS_PER_MONTH = 30;

/**
 * Catalogue-derived routes: every page whose body reads the plan catalogue
 * (bundled or live from `public.plans`). A catalogue change purges all of them.
 *
 * Entries with a `[param]` segment are ROUTE PATTERNS — `revalidatePath(pattern,
 * "page")` purges every generated page of that route in one call, so the list
 * stays 33 entries instead of ~450 paths.
 */
export const CATALOGUE_ISR_ROUTES: readonly string[] = [
  // Category + intent landing pages (one page each).
  "/5g-vs-4g",
  "/abroad",
  "/abroad-daily",
  "/book",
  "/cellular",
  "/cellular-5g",
  "/cellular-budget",
  "/cellular-esim",
  "/cellular-mid-range",
  "/cellular-under-40",
  "/cellular-with-abroad",
  "/data-only",
  "/esim-abroad",
  "/internet",
  "/internet-budget",
  "/internet-cable-only",
  "/internet-fiber-only",
  "/internet-giga",
  "/internet-mid",
  "/kosher-plans",
  "/plans",
  "/plans-no-commitment",
  "/triple",
  "/triple-budget",
  "/tv",
  "/tv-streaming-included",
  "/vs",
  // Route patterns — one call purges every generated page of the route.
  "/compare/[service]",
  "/compare/[service]/[city]",
  "/guides/[slug]",
  "/plans/[id]",
  "/providers/[slug]",
  "/vs/[pair]",
];

/** Community-derived routes: purged when a post or reply lands. */
export const COMMUNITY_ISR_ROUTES: readonly string[] = [
  "/community/questions",
  "/community/post/[id]",
];

/**
 * The sitemap is ISR too (it reads the community permalinks at runtime), and it
 * belongs to BOTH scopes — a new plan page and a new answered post each change
 * its `<loc>` set.
 */
export const SITEMAP_ISR_ROUTES: readonly string[] = ["/sitemap.xml"];

/**
 * How many community permalinks are CRAWLABLE, and therefore how many pages the
 * write projection has to assume get regenerated. This is the sitemap's own
 * `.limit(500)` on `community_feed` — the sitemap is what walks crawlers through
 * the permalinks, so its window IS the ISR surface. The budget test pins the two
 * together so raising the sitemap limit can't silently raise the write bill.
 */
export const COMMUNITY_PERMALINK_SURFACE = 500;

/** The purge scopes /api/revalidate accepts. */
export type RevalidateScope = "catalogue" | "community" | "all";

/** The routes a given scope purges (patterns included). */
export function routesForScope(scope: RevalidateScope): readonly string[] {
  switch (scope) {
    case "catalogue":
      return [...CATALOGUE_ISR_ROUTES, ...SITEMAP_ISR_ROUTES];
    case "community":
      return [...COMMUNITY_ISR_ROUTES, ...SITEMAP_ISR_ROUTES];
    case "all":
      return [
        ...CATALOGUE_ISR_ROUTES,
        ...COMMUNITY_ISR_ROUTES,
        ...SITEMAP_ISR_ROUTES,
      ];
  }
}

/** One prerendered surface: a route and how many pages it generates. */
export interface IsrSurface {
  /** Route or route pattern, e.g. "/plans/[id]". */
  route: string;
  /** The page's `export const revalidate` value, in seconds. */
  revalidate: number;
  /** How many pages this route generates (1 for a plain page). */
  pages: number;
}

/**
 * WORST-CASE monthly ISR writes for a surface: every one of its pages requested
 * in every revalidate window, every day of the month. Real traffic is lower —
 * a window with no request costs nothing — but crawlers walking the sitemap put
 * the indexed surface close to this, which is exactly how the quota was hit.
 */
export function projectedMonthlyWrites(surfaces: readonly IsrSurface[]): number {
  return surfaces.reduce((total, s) => {
    const windowsPerDay = (24 * 60 * 60) / s.revalidate;
    return total + s.pages * windowsPerDay * DAYS_PER_MONTH;
  }, 0);
}
