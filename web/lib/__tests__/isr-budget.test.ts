// ────────────────────────────────────────────────────────────────────────────
// ISR budget guard — the test that keeps the Vercel free tier from being blown
// again. It reads the REAL route segment config out of every app/**/page.tsx (no
// hand-maintained list of what the app renders) and asserts three things:
//
//   1. No page revalidates faster than MIN_REVALIDATE_SECONDS. Anything more
//      urgent belongs on the on-demand purge (/api/revalidate), not a timer.
//   2. Every ISR page is registered in lib/isr-budget's purge lists — otherwise
//      it would sit stale for a whole day after a catalogue edit, because the
//      webhook wouldn't know to purge it.
//   3. The WORST-CASE monthly write projection (every page requested in every
//      window, with the real generateStaticParams page counts) stays inside the
//      budget. Adding 400 pages, or halving a revalidate, fails here — in CI —
//      instead of arriving as a "you've used 100% of your ISR Writes" mail.
// ────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CATALOGUE_ISR_ROUTES,
  COMMUNITY_ISR_ROUTES,
  COMMUNITY_PERMALINK_SURFACE,
  ISR_WRITE_BUDGET,
  MIN_REVALIDATE_SECONDS,
  SITEMAP_ISR_ROUTES,
  projectedMonthlyWrites,
  routesForScope,
  type IsrSurface,
} from "@/lib/isr-budget";
import { getCities, getPlans, getProviders, getServices } from "@/lib/data";
import { getGuides } from "@/lib/guides";
import { getVsPairs } from "@/lib/vs";

const APP_DIR = join(process.cwd(), "app");

/** Every page.tsx under app/, as a route path ("/plans/[id]"). */
function pageFiles(): { route: string; file: string }[] {
  const out: { route: string; file: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "page.tsx") {
        const rel = relative(APP_DIR, dir);
        const segments = rel
          .split(sep)
          .filter((s) => s !== "" && s !== "." && !s.startsWith("("));
        out.push({ route: `/${segments.join("/")}`, file: full });
      }
    }
  };
  walk(APP_DIR);
  return out;
}

/** The literal `export const revalidate = N;` of a route file, if it has one. */
function declaredRevalidate(file: string): number | null {
  const src = readFileSync(file, "utf8");
  const match = /^export const revalidate = (\d+);$/m.exec(src);
  return match ? Number(match[1]) : null;
}

/** How many pages a route generates (its generateStaticParams cardinality). */
function pageCount(route: string): number {
  switch (route) {
    case "/compare/[service]/[city]":
      return getServices().length * getCities().length;
    case "/compare/[service]":
      return getServices().length;
    case "/plans/[id]":
      return getPlans().length;
    case "/providers/[slug]":
      return getProviders().length;
    case "/vs/[pair]":
      return getVsPairs().length;
    case "/guides/[slug]":
      return getGuides().length;
    // Deliberately over-counted. This route renders dynamically today (no
    // generateStaticParams → absent from the prerender manifest), so it writes
    // nothing; but it declares a revalidate, and the day it becomes cacheable
    // its surface is the sitemap's window of indexed permalinks. Reserving that
    // room now means the change won't silently blow the budget later.
    case "/community/post/[id]":
      return COMMUNITY_PERMALINK_SURFACE;
    default:
      // A plain route with no dynamic segment is exactly one page. A dynamic one
      // that reaches here has no declared cardinality — fail loudly rather than
      // silently under-counting the budget.
      if (route.includes("[")) {
        throw new Error(
          `ISR budget: route ${route} has a dynamic segment but no page count. ` +
            `Add its cardinality to pageCount() in this test.`,
        );
      }
      return 1;
  }
}

/** Every ISR surface in the app: the pages, their timer, and their cardinality. */
function isrSurfaces(): IsrSurface[] {
  const surfaces: IsrSurface[] = [];
  for (const { route, file } of pageFiles()) {
    const revalidate = declaredRevalidate(file);
    if (revalidate === null) continue;
    surfaces.push({ route, revalidate, pages: pageCount(route) });
  }
  // The sitemap is a route handler, not a page, but it revalidates like one.
  const sitemapRevalidate = declaredRevalidate(join(APP_DIR, "sitemap.ts"));
  if (sitemapRevalidate !== null) {
    surfaces.push({
      route: "/sitemap.xml",
      revalidate: sitemapRevalidate,
      pages: 1,
    });
  }
  return surfaces;
}

describe("ISR budget", () => {
  const surfaces = isrSurfaces();

  it("finds the app's ISR pages (the scan itself must not silently break)", () => {
    expect(surfaces.length).toBeGreaterThan(30);
    expect(surfaces.map((s) => s.route)).toContain("/plans/[id]");
    expect(surfaces.map((s) => s.route)).toContain("/sitemap.xml");
  });

  it("declares no revalidate faster than the floor", () => {
    const tooFast = surfaces.filter(
      (s) => s.revalidate < MIN_REVALIDATE_SECONDS,
    );
    expect(
      tooFast.map((s) => `${s.route} = ${s.revalidate}s`),
      "use /api/revalidate for sub-30-minute freshness, not a shorter timer",
    ).toEqual([]);
  });

  it("registers every ISR page with the on-demand purge", () => {
    const purgeable = new Set(routesForScope("all"));
    const unregistered = surfaces
      .map((s) => s.route)
      .filter((route) => !purgeable.has(route));
    expect(
      unregistered,
      "add these to CATALOGUE_ISR_ROUTES / COMMUNITY_ISR_ROUTES in lib/isr-budget.ts, " +
        "or they stay stale for a full revalidate window after a catalogue edit",
    ).toEqual([]);
  });

  it("lists no purge route that is not a real ISR page", () => {
    const rendered = new Set(surfaces.map((s) => s.route));
    const stale = routesForScope("all").filter((route) => !rendered.has(route));
    expect(
      stale,
      "these purge targets no longer exist as ISR pages — drop them from lib/isr-budget.ts",
    ).toEqual([]);
  });

  it("keeps the worst-case monthly writes inside the free-tier budget", () => {
    const projected = projectedMonthlyWrites(surfaces);
    // Printed on failure so the fix is obvious: which surface got expensive.
    const perSurface = surfaces
      .map((s) => ({
        route: s.route,
        writes: Math.round(projectedMonthlyWrites([s])),
      }))
      .sort((a, b) => b.writes - a.writes)
      .slice(0, 5);
    expect(
      Math.round(projected),
      `worst-case ISR writes/month exceeds the budget. Biggest surfaces: ${JSON.stringify(perSurface)}`,
    ).toBeLessThanOrEqual(ISR_WRITE_BUDGET);
  });

  it("pins the community permalink surface to the sitemap's own window", () => {
    const sitemap = readFileSync(join(APP_DIR, "sitemap.ts"), "utf8");
    expect(sitemap).toContain(`.limit(${COMMUNITY_PERMALINK_SURFACE})`);
  });

  it("scopes purge routes the way the callers expect", () => {
    // A catalogue edit must not drag the ~500 community permalinks with it.
    expect(routesForScope("catalogue")).not.toContain("/community/post/[id]");
    // ...and a new reply must not re-write the whole catalogue.
    expect(routesForScope("community")).not.toContain("/plans/[id]");
    // Both change what the sitemap lists.
    for (const scope of ["catalogue", "community"] as const) {
      expect(routesForScope(scope)).toEqual(
        expect.arrayContaining([...SITEMAP_ISR_ROUTES]),
      );
    }
    expect(routesForScope("all")).toEqual(
      expect.arrayContaining([
        ...CATALOGUE_ISR_ROUTES,
        ...COMMUNITY_ISR_ROUTES,
      ]),
    );
  });
});
