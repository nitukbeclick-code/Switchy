// ────────────────────────────────────────────────────────────────────────────
// SEO metadata helper — builds a complete Next.js `Metadata` object (canonical +
// OpenGraph + Twitter) from a page's real title/description/path. PURE: no I/O,
// fully unit-testable.
//
// WHY: every page already sets `title` + `description` + `alternates.canonical`,
// but no inner page set its OWN OpenGraph/Twitter block — so sharing
// /compare/cellular surfaced the HOMEPAGE og:title/og:description and the homepage
// og:url (inherited from the layout). This centralises a per-page OG/Twitter block
// that mirrors each page's own (truthful) title/description and points og:url at
// the page's canonical URL.
//
// IMPORTANT (Next metadata merge semantics): `openGraph`/`twitter` are merged
// SHALLOW — a page that sets `openGraph` REPLACES the parent's `openGraph`
// entirely (incl. `images`). So we MUST re-declare the shared OG/Twitter image
// here, otherwise setting a per-page block would silently drop the file-based
// `opengraph-image.png` / `twitter-image.png` that previously cascaded by
// inheritance. We point at those same file-convention assets (resolved absolute
// via the layout's `metadataBase`) so the picture stays identical site-wide.
//
// HONESTY: this only re-states the title/description the page already declares and
// reuses the existing shared share-image — it fabricates no claims/prices/data.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "./schema";
import { CATEGORY_HE } from "./categories";
import { getPlans, plansByCategory } from "./data";
import type { Plan } from "./types";

/** The brand suffix the layout's title `template` appends ("%s | <brand>"). */
const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/** Shared OG/Twitter alt text (mirrors app/opengraph-image.alt.txt). */
const SHARE_IMAGE_ALT =
  "Switchy AI — השוואת מסלולי תקשורת בישראל: סלולר, אינטרנט, טלוויזיה " +
  "וחבילות. חינם ובלי התחייבות.";

/**
 * The file-convention share images at the app root (Next serves them with a
 * content-hashed query). Re-declared so every page's own openGraph/twitter block
 * keeps them after the shallow metadata merge. Relative paths resolve to absolute
 * URLs via the layout's `metadataBase`.
 */
const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: SHARE_IMAGE_ALT,
} as const;
const TWITTER_IMAGE = { url: "/twitter-image.png", alt: SHARE_IMAGE_ALT } as const;

/** Resolve a possibly-relative path to an absolute canonical URL on SITE_URL. */
function absUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Normalise an OpenGraph/Twitter title to a single, branded form. The layout
 * `title.template` brands the visible <title> for pages whose `title` is a bare
 * string, but it does NOT brand `openGraph.title`/`twitter.title`. A few pages
 * also inline the brand suffix in their own `title`. To get ONE consistent
 * branded share-title everywhere, strip any existing brand suffix, then append
 * it exactly once.
 */
function brandedTitle(title: string): string {
  const base = title.endsWith(BRAND_SUFFIX)
    ? title.slice(0, -BRAND_SUFFIX.length)
    : title;
  return `${base}${BRAND_SUFFIX}`;
}

export interface PageMetaInput {
  /** The page's visible title (bare — the layout template brands the <title>). */
  title: string;
  /** The page's meta description. */
  description: string;
  /** The page's canonical path (absolute or site-relative, e.g. "/compare"). */
  path: string;
  /** Optional robots override (e.g. national city pages → noindex, follow). */
  robots?: Metadata["robots"];
}

/**
 * Build a complete `Metadata` object for a page: canonical + OpenGraph + Twitter.
 *
 * - `title`/`description` are passed through verbatim for the page <title>/<meta>
 *   (the layout's title template brands the <title>).
 * - `openGraph`/`twitter` mirror the same title/description (brand-normalised),
 *   point `og:url` at the page's own canonical URL, carry `locale: he_IL`, and
 *   RE-DECLARE the shared file-convention share image (required — see header:
 *   the shallow merge would otherwise drop the inherited image).
 * - `twitter.card` is `summary_large_image` with the same shared image.
 * - `robots`, when given, is forwarded (used by the national city pages).
 */
export function pageMetadata(input: PageMetaInput): Metadata {
  const { title, description, path, robots } = input;
  const url = absUrl(path);
  const ogTitle = brandedTitle(title);

  const meta: Metadata = {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "he_IL",
      siteName: SITE_NAME,
      url,
      title: ogTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [TWITTER_IMAGE],
    },
  };
  if (robots) meta.robots = robots;
  return meta;
}

// ────────────────────────────────────────────────────────────────────────────
// Fact-DENSE meta-description builders — a truth-only, catalogue-derived TL;DR
// that crawlers + answer engines can extract verbatim. The static category
// landings (/cellular, /internet, …) + the homepage previously carried generic,
// hand-written descriptions with NO real figures; an answer engine reading them
// learned nothing extractable (how many plans? which providers? from what price?).
//
// These helpers compute every figure from the SAME bundled catalogue the pages
// render (lib/data), so the description can never disagree with the page:
//   - the REAL count of plans in the category,
//   - the REAL count of distinct providers,
//   - a sample of recognisable provider names (catalogue order — the curated
//     major-carrier-first order the pages already render in), and
//   - the REAL price floor (₪) — the cheapest headline price.
//
// HONESTY (TRUTH-ONLY): nothing is fabricated. Every number is derived from the
// catalogue; when a category has no priced plan the "מ-₪X" clause is omitted
// rather than invented, and a category with no plans at all yields `undefined`
// so callers fall back to their own copy instead of emitting an empty sentence.
// ────────────────────────────────────────────────────────────────────────────

/** Hebrew thousands-separated integer (e.g. 1234 → "1,234"). Prices are ₪ ints. */
function fmtNum(n: number): string {
  return new Intl.NumberFormat("he-IL").format(n);
}

/**
 * Pick the first `limit` DISTINCT provider names from a plan list, in catalogue
 * (first-seen) order. The catalogue is curated major-carrier-first, so this
 * surfaces the recognisable carriers (סלקום, פרטנר, בזק…) deterministically —
 * never a random or fabricated set.
 */
function sampleProviders(plans: Plan[], limit = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of plans) {
    const name = p.provider;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

/** The cheapest finite, positive-priced plan in a list, or `null`. */
function floorPlan(plans: Plan[]): Plan | null {
  let best: Plan | null = null;
  for (const p of plans) {
    if (typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0) {
      if (!best || p.price < best.price) best = p;
    }
  }
  return best;
}

/**
 * Hebrew per-unit price suffix for a plan, derived from its REAL `priceUnit`
 * (month/day/minute; abroad plans default to per-package when unset). Used so the
 * "החל מ-₪X" clause states the correct unit — e.g. a ₪1/minute roaming tariff is
 * "₪1 לדקה", NOT a misleading "₪1 לחודש".
 */
function priceUnitSuffix(plan: Plan): string {
  switch (plan.priceUnit) {
    case "day":
      return " ליום";
    case "minute":
      return " לדקה";
    case "package":
      return " לחבילה";
    case "month":
      return " לחודש";
    default:
      // Unset: monthly recurring categories read "לחודש"; abroad (where the unit
      // varies and is often per-package) stays unit-less rather than asserting a
      // wrong "/חודש".
      return plan.cat === "abroad" ? "" : " לחודש";
  }
}

/** Distinct provider count across a plan list. */
function providerCount(plans: Plan[]): number {
  return new Set(plans.map((p) => p.provider).filter(Boolean)).size;
}

/**
 * A fact-DENSE, truth-only meta description for a category landing/compare page,
 * computed from the bundled catalogue:
 *
 *   "השוואת N מסלולי <קטגוריה> מ-M ספקים (סלקום, פרטנר, בזק…) — החל מ-₪X לחודש.
 *    מחירים מעודכנים, ללא התחייבות."
 *
 * Every figure (N plans, M providers, sample names, ₪X floor) is REAL catalogue
 * data — the same data the page renders — so the TL;DR an answer engine extracts
 * matches the page exactly.
 *
 * Returns `undefined` when the category has no plans (caller falls back to its
 * own copy). When plans exist but none is priced, the "החל מ-₪X" clause is
 * omitted rather than invented.
 *
 * @param category  catalogue category id (e.g. "cellular").
 * @param opts.plans  inject a plan list for testing; defaults to the real
 *                    catalogue plans for the category.
 */
export function categoryMetaDescription(
  category: string,
  opts: { plans?: Plan[] } = {},
): string | undefined {
  const plans = opts.plans ?? plansByCategory(category);
  if (!plans.length) return undefined;

  const catHe = CATEGORY_HE[category] ?? category;
  const planCount = plans.length;
  const provCount = providerCount(plans);
  const sample = sampleProviders(plans, 3);
  const floor = floorPlan(plans);

  // "השוואת N מסלולי <קטגוריה>"
  let head = `השוואת ${fmtNum(planCount)} מסלולי ${catHe}`;
  // "מ-M ספקים (סלקום, פרטנר, בזק…)"
  if (provCount > 0) {
    head += ` מ-${fmtNum(provCount)} ספקים`;
    if (sample.length) {
      const ellipsis = provCount > sample.length ? "…" : "";
      head += ` (${sample.join(", ")}${ellipsis})`;
    }
  }

  const priceClause =
    floor != null
      ? ` — החל מ-₪${fmtNum(floor.price)}${priceUnitSuffix(floor)}.`
      : ".";

  return `${head}${priceClause} מחירים מעודכנים, השוואה חינמית וללא התחייבות.`;
}

/**
 * A fact-DENSE, truth-only meta description for the HOMEPAGE — a site-wide TL;DR
 * computed across the WHOLE catalogue:
 *
 *   "השוואת N מסלולי תקשורת מ-M ספקים בישראל — סלולר, אינטרנט, טלוויזיה, חבילות
 *    משולבות וחבילות חו״ל. מחירים החל מ-₪X, מעודכנים, ללא התחייבות."
 *
 * N (total plans), M (distinct providers), the covered categories, and the ₪X
 * floor are all REAL catalogue figures — never fabricated.
 *
 * @param opts.plans  inject a plan list for testing; defaults to the whole
 *                    real catalogue.
 */
export function homeMetaDescription(opts: { plans?: Plan[] } = {}): string | undefined {
  const plans = opts.plans ?? getPlans();
  if (!plans.length) return undefined;

  const planCount = plans.length;
  const provCount = providerCount(plans);
  const floor = floorPlan(plans);

  // Covered categories, in canonical CATEGORY_HE order, limited to those that
  // actually carry plans (truth-only — no category claimed without real data).
  const present = new Set(plans.map((p) => p.cat));
  const cats = Object.keys(CATEGORY_HE)
    .filter((id) => present.has(id as Plan["cat"]))
    .map((id) => CATEGORY_HE[id]);

  let head = `השוואת ${fmtNum(planCount)} מסלולי תקשורת`;
  if (provCount > 0) head += ` מ-${fmtNum(provCount)} ספקים בישראל`;
  const catsClause = cats.length ? ` — ${cats.join(", ")}.` : ".";
  // Site-wide the cheapest entry point spans mixed units (a per-minute roaming
  // tariff can be the global floor), so the homepage states "מ-₪X" WITHOUT a
  // "/חודש" suffix — honest about the floor without asserting a wrong unit.
  const priceClause =
    floor != null
      ? ` מחירים החל מ-₪${fmtNum(floor.price)}, מעודכנים, השוואה חינמית וללא התחייבות.`
      : " מחירים מעודכנים, השוואה חינמית וללא התחייבות.";

  return `${head}${catsClause}${priceClause}`;
}
