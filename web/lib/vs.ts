// ────────────────────────────────────────────────────────────────────────────
// Provider-vs-provider comparison data — the CURATED set of "X מול Y" pairs that
// back the /vs/[pair] GEO pages. Pairs are hand-picked, SAME-CATEGORY, and limited
// to genuinely-searched match-ups (the major carriers vs each other, the major
// ISPs vs each other) — NOT all 153 permutations, so every page has real depth.
//
// HONESTY (non-negotiable): a pair is only emitted when BOTH providers have real
// plans in the pair's category (gated by buildVsPairs() against the live
// catalogue). Every figure on the page is catalogue-derived; the "summary" verdict
// is DERIVED (who is cheaper / who has more options) and clearly labeled — there
// is NO fabricated winner, rating, or coverage claim.
//
// Pure + side-effect-free so pages can call these in generateStaticParams / RSC
// render. The pair URL slug is "{slugA}-vs-{slugB}-{category}" with the two
// provider slugs in a STABLE (alphabetical) order, so each SAME-CATEGORY match-up
// has exactly one canonical URL regardless of which side the user typed first —
// and the same two providers can have one page PER category they both serve
// (e.g. cellular AND internet) without the URLs colliding.
// ────────────────────────────────────────────────────────────────────────────

import {
  getProvider,
  plansByProvider,
  providerSlug,
  CATEGORY_HE,
} from "./data";
import type { Plan, Provider } from "./types";

/** A curated, same-category match-up between two providers (by display name). */
export interface VsPairSpec {
  /** First provider's display name (must match the catalogue). */
  a: string;
  /** Second provider's display name (must match the catalogue). */
  b: string;
  /** The single category this match-up compares (both must have plans in it). */
  category: string;
}

// ── Curated match-ups ─────────────────────────────────────────────────────────
// Genuinely-searched, same-category pairs only. Cellular: the major carriers +
// the budget MVNOs people actually cross-shop. Internet: the major ISPs. TV/triple:
// the headline pay-TV providers. Order within a spec is irrelevant — the slug is
// canonicalised alphabetically by buildVsPairs().
const CURATED_PAIRS: VsPairSpec[] = [
  // ── Cellular — the big carriers vs each other ──────────────────────────────
  { a: "סלקום", b: "פרטנר", category: "cellular" },
  { a: "סלקום", b: "פלאפון", category: "cellular" },
  { a: "פרטנר", b: "פלאפון", category: "cellular" },
  { a: "סלקום", b: "הוט מובייל", category: "cellular" },
  { a: "פרטנר", b: "הוט מובייל", category: "cellular" },
  { a: "פלאפון", b: "הוט מובייל", category: "cellular" },
  // ── Cellular — carriers vs the value brands people cross-shop ───────────────
  { a: "סלקום", b: "גולן טלקום", category: "cellular" },
  { a: "פרטנר", b: "גולן טלקום", category: "cellular" },
  { a: "גולן טלקום", b: "רמי לוי", category: "cellular" },
  { a: "רמי לוי", b: "019 מובייל", category: "cellular" },
  { a: "גולן טלקום", b: "019 מובייל", category: "cellular" },
  { a: "הוט מובייל", b: "רמי לוי", category: "cellular" },
  { a: "הוט מובייל", b: "גולן טלקום", category: "cellular" },
  { a: "Xphone", b: "רמי לוי", category: "cellular" },

  // ── Internet — the major ISPs vs each other ────────────────────────────────
  { a: "בזק", b: "HOT", category: "internet" },
  { a: "בזק", b: "CCC", category: "internet" },
  { a: "בזק", b: "פרטנר", category: "internet" },
  { a: "בזק", b: "סלקום", category: "internet" },
  { a: "HOT", b: "פרטנר", category: "internet" },
  { a: "HOT", b: "סלקום", category: "internet" },
  { a: "פרטנר", b: "סלקום", category: "internet" },

  // ── TV / triple — the headline pay-TV providers ────────────────────────────
  { a: "yes", b: "HOT", category: "tv" },
  { a: "HOT", b: "סלקום", category: "tv" },
  { a: "yes", b: "HOT", category: "triple" },
  { a: "HOT", b: "סלקום", category: "triple" },
];

/** Minimum real plans EACH side must have in the category for a page to be worth it. */
const MIN_PLANS_PER_SIDE = 1;

/**
 * Build the canonical pair slug: "{slugA}-vs-{slugB}-{category}" with the two
 * provider slugs in a STABLE (alphabetical) order. The category is part of the
 * slug because the SAME two providers can be a genuine match-up in MORE THAN ONE
 * category (e.g. סלקום vs פרטנר in both cellular AND internet) — without it those
 * pages would collide on one URL. Qualifying the slug by category gives each
 * same-category match-up its own unique, descriptive, canonical URL.
 */
export function pairSlug(
  slugA: string,
  slugB: string,
  category: string,
): string {
  const ordered = [slugA, slugB].sort((x, y) => x.localeCompare(y));
  return `${ordered[0]}-vs-${ordered[1]}-${category}`;
}

/** One side of a resolved match-up: its provider, the category plans, and stats. */
export interface VsSide {
  provider: Provider;
  /** This provider's plans IN the pair's category, cheapest first. */
  plans: Plan[];
  /** Lowest headline price in the category (Infinity-safe → number). */
  minPrice: number;
  /** Number of plans in the category. */
  planCount: number;
  /** The single cheapest plan in the category. */
  cheapest: Plan;
}

/** A fully-resolved, render-ready provider-vs-provider match-up. */
export interface VsPair {
  /** Canonical URL slug, e.g. "cellcom-vs-partner-cellular". */
  slug: string;
  /** The compared category id (e.g. "cellular"). */
  category: string;
  /** Hebrew category label (e.g. "סלולר"). */
  categoryLabel: string;
  /** The two sides, in canonical (alphabetical-by-slug) order. */
  a: VsSide;
  b: VsSide;
}

/** Resolve one provider + its category plans into a {@link VsSide}, or null. */
function resolveSide(name: string, category: string): VsSide | null {
  const slug = providerSlug(name);
  const provider = getProvider(slug);
  if (!provider) return null;

  const plans = plansByProvider(slug)
    .filter((p) => p.cat === category && typeof p.price === "number")
    .sort((x, y) => x.price - y.price);
  if (plans.length < MIN_PLANS_PER_SIDE) return null;

  const cheapest = plans[0];
  return {
    provider,
    plans,
    minPrice: cheapest.price,
    planCount: plans.length,
    cheapest,
  };
}

// ── Resolved pairs (built once, gated against the live catalogue) ─────────────
function buildVsPairs(): VsPair[] {
  const out: VsPair[] = [];
  const seen = new Set<string>();

  for (const spec of CURATED_PAIRS) {
    const sideA = resolveSide(spec.a, spec.category);
    const sideB = resolveSide(spec.b, spec.category);
    // Gate: BOTH sides must have real plans in the category. Skip thin pages.
    if (!sideA || !sideB) continue;
    if (sideA.provider.slug === sideB.provider.slug) continue;

    const slug = pairSlug(
      sideA.provider.slug,
      sideB.provider.slug,
      spec.category,
    );
    // The category is already in the slug, so the slug itself is the dedupe key.
    if (seen.has(slug)) continue;
    seen.add(slug);

    // Canonical order: alphabetical by provider slug (matches pairSlug()).
    const [first, second] =
      sideA.provider.slug.localeCompare(sideB.provider.slug) <= 0
        ? [sideA, sideB]
        : [sideB, sideA];

    out.push({
      slug,
      category: spec.category,
      categoryLabel: CATEGORY_HE[spec.category] ?? spec.category,
      a: first,
      b: second,
    });
  }

  // Stable, deterministic order for sitemap/index predictability.
  out.sort((x, y) => x.slug.localeCompare(y.slug));
  return out;
}

const VS_PAIRS: VsPair[] = buildVsPairs();
const VS_PAIR_BY_SLUG = new Map(VS_PAIRS.map((p) => [p.slug, p]));

/** All resolved, catalogue-gated vs-pairs (build-time, immutable copy). */
export function getVsPairs(): VsPair[] {
  return VS_PAIRS.slice();
}

/** A single resolved vs-pair by its URL slug, or undefined if unknown/ungated. */
export function getVsPair(slug: string): VsPair | undefined {
  return VS_PAIR_BY_SLUG.get(slug);
}

/**
 * Resolved vs-pairs that involve a given provider slug (for cross-linking the
 * "השווה מול ..." block on /providers/[slug]). Returns the pairs and, for each,
 * the OTHER provider so the caller can label the link.
 */
export function vsPairsForProvider(
  providerSlugArg: string,
): Array<{ pair: VsPair; other: Provider }> {
  const out: Array<{ pair: VsPair; other: Provider }> = [];
  for (const pair of VS_PAIRS) {
    if (pair.a.provider.slug === providerSlugArg) {
      out.push({ pair, other: pair.b.provider });
    } else if (pair.b.provider.slug === providerSlugArg) {
      out.push({ pair, other: pair.a.provider });
    }
  }
  return out;
}

// ── Honest, DERIVED verdict (no fabricated winner) ────────────────────────────
/** A single derived comparison point used in the summary + FAQ. */
export interface VsVerdict {
  /** The lower-entry-price side, or null when they tie. */
  cheaperSide: VsSide | null;
  /** Price gap in ₪ between the two entry prices (>= 0). */
  priceGap: number;
  /** The side with more plans in the category, or null when they tie. */
  moreOptionsSide: VsSide | null;
  /** One-sentence, fully-derived Hebrew summary (clearly a data conclusion). */
  summary: string;
}

/**
 * Build a TRUTHFUL, data-derived verdict for a pair. Every claim is computed from
 * the catalogue (lowest entry price, plan count) — never a fabricated quality
 * judgement. When the two entry prices tie, `cheaperSide` is null and the summary
 * says so. The summary names the cheaper side, the gap, and who offers more
 * options, then states the choice depends on the buyer's need.
 */
export function vsVerdict(pair: VsPair): VsVerdict {
  const { a, b, categoryLabel } = pair;

  const priceGap = Math.abs(a.minPrice - b.minPrice);
  const cheaperSide =
    a.minPrice < b.minPrice ? a : b.minPrice < a.minPrice ? b : null;
  const moreOptionsSide =
    a.planCount > b.planCount ? a : b.planCount > a.planCount ? b : null;

  const aName = a.provider.name;
  const bName = b.provider.name;

  let priceSentence: string;
  if (cheaperSide) {
    const dearer = cheaperSide === a ? b : a;
    priceSentence =
      `ב${categoryLabel}, ${cheaperSide.provider.name} זול יותר בנקודת הכניסה — ` +
      `₪${cheaperSide.minPrice} מול ₪${dearer.minPrice} של ${dearer.provider.name}` +
      (priceGap > 0 ? ` (הפרש של ₪${priceGap})` : "") +
      ".";
  } else {
    priceSentence =
      `ב${categoryLabel}, נקודת הכניסה זהה — שני הספקים מתחילים מ-₪${a.minPrice}.`;
  }

  const optionsSentence = moreOptionsSide
    ? ` ${moreOptionsSide.provider.name} מציע יותר מסלולים בקטגוריה ` +
      `(${moreOptionsSide.planCount} מול ${
        moreOptionsSide === a ? b.planCount : a.planCount
      }).`
    : ` לשני הספקים ${a.planCount} מסלולים בקטגוריה.`;

  const summary =
    priceSentence +
    optionsSentence +
    ` הבחירה בין ${aName} ל${bName} תלויה במה שחשוב לכם — מחיר התחלתי, מספר ` +
    `אפשרויות או מאפיינים ספציפיים. כל הנתונים נלקחים מהקטלוג ומחירים בשקלים.`;

  return { cheaperSide, priceGap, moreOptionsSide, summary };
}
