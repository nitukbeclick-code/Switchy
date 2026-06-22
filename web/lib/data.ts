// ────────────────────────────────────────────────────────────────────────────
// Catalogue access — pure, build-time. Loads the BUNDLED web/data/catalogue.json
// (copied from site/data/plans.json) so the app builds with NO secrets and no
// network. Providers are DERIVED from the plans (unique names → slug + stats).
//
// All exports are synchronous + side-effect-free so pages can call them in RSC
// render or generateStaticParams. The JSON is read once at module init via fs.
// ────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AggregateRating,
  Category,
  GlossaryTerm,
  Plan,
  Provider,
  RecommendedEntity,
} from "./types";
import { CATEGORY_HE } from "./categories";

// ── Raw catalogue load (once, at module init) ────────────────────────────────
interface RawCatalogue {
  generated?: string;
  categories?: { id: string; name: string; icon?: string }[];
  plans: Plan[];
}

const CATALOGUE_PATH = join(process.cwd(), "data", "catalogue.json");

const catalogue: RawCatalogue = JSON.parse(
  readFileSync(CATALOGUE_PATH, "utf8"),
) as RawCatalogue;

const PLANS: Plan[] = Array.isArray(catalogue.plans) ? catalogue.plans : [];

// ── Hebrew category labels ───────────────────────────────────────────────────
// CATEGORY_HE lives in ./categories (a pure, fs-free module) so client components
// can import the label map without pulling node:fs into their bundle. Re-exported
// here for back-compat with existing `import { CATEGORY_HE } from "@/lib/data"`.
export { CATEGORY_HE };

// ── Slugify ──────────────────────────────────────────────────────────────────
/**
 * Explicit, readable English slugs for providers whose display name is Hebrew (or
 * otherwise non-ASCII). Without these the slug falls back to an opaque `p-<hash>`
 * token (e.g. `p-nr0ams`), which is un-citeable by LLMs, keyword-dead in the URL,
 * and looks untrustworthy in AI answers. Each value is the carrier's own
 * well-known English brand handle. KEEP IN SYNC with the catalogue provider names.
 */
const SLUG_OVERRIDES: Record<string, string> = {
  סלקום: "cellcom",
  פרטנר: "partner",
  פלאפון: "pelephone",
  "גולן טלקום": "golan",
  "הוט מובייל": "hot-mobile",
  "רמי לוי": "rami-levy",
  "וואלה מובייל": "walla-mobile",
  בזק: "bezeq",
  גילת: "gilat",
  "019 מובייל": "019mobile",
};

/**
 * Legacy `p-<hash>` slugs → the new readable slug, for 301 redirects so existing
 * links / indexed URLs don't 404 after the slug change. These are the exact
 * tokens {@link providerSlug} produced for the Hebrew-named providers BEFORE the
 * {@link SLUG_OVERRIDES} map existed (computed from the char-code hash below).
 * Consumed by `next.config.ts` `redirects()`.
 */
export const LEGACY_PROVIDER_SLUG_REDIRECTS: Readonly<Record<string, string>> = {
  "p-nr0ams": "cellcom", // סלקום
  "p-nsv1ek": "partner", // פרטנר
  "p-rcv4fq": "pelephone", // פלאפון
  "p-mkqt2p": "golan", // גולן טלקום
  "p-v0b8ln": "hot-mobile", // הוט מובייל
  "p-1irwebn": "rami-levy", // רמי לוי
  "p-jcymt6": "walla-mobile", // וואלה מובייל
  "p-vp0i": "bezeq", // בזק
  "p-rb9jp": "gilat", // גילת
  // NB: "019 מובייל" hashed to the readable "019" before (ASCII path), and is now
  // "019mobile"; both old paths are redirected from next.config.ts.
  "019": "019mobile",
};

/**
 * Slugify a provider name into a URL-safe ASCII slug. An explicit
 * {@link SLUG_OVERRIDES} entry wins (readable English brand handle); otherwise
 * Latin names lowercase + hyphenate, and any remaining non-ASCII name falls back
 * to a deterministic hashed token so every provider still gets a stable slug.
 */
export function providerSlug(name: string): string {
  const trimmed = (name ?? "").trim();
  if (SLUG_OVERRIDES[trimmed]) return SLUG_OVERRIDES[trimmed];

  // ASCII path: lowercase, non-alnum → hyphen, collapse + trim hyphens.
  const ascii = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;

  // Non-ASCII (e.g. Hebrew): build a deterministic ascii token from char codes.
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) >>> 0;
  }
  return `p-${hash.toString(36)}`;
}

// ── Core accessors ───────────────────────────────────────────────────────────
/** All plans in the catalogue (build-time, immutable copy). */
export function getPlans(): Plan[] {
  return PLANS.slice();
}

/** Distinct category ids present in the catalogue, in catalogue order. */
export function getCategories(): Category[] {
  const seen = new Set<string>();
  const out: Category[] = [];
  // Prefer the declared category order, then any extras found on plans.
  for (const c of catalogue.categories ?? []) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      out.push(c.id as Category);
    }
  }
  for (const p of PLANS) {
    if (!seen.has(p.cat)) {
      seen.add(p.cat);
      out.push(p.cat);
    }
  }
  return out;
}

/** Plans in a given category. */
export function plansByCategory(cat: string): Plan[] {
  return PLANS.filter((p) => p.cat === cat);
}

// ── Providers (derived) ──────────────────────────────────────────────────────
function buildProviders(): Provider[] {
  const byName = new Map<string, Plan[]>();
  for (const p of PLANS) {
    const list = byName.get(p.provider);
    if (list) list.push(p);
    else byName.set(p.provider, [p]);
  }

  const providers: Provider[] = [];
  const usedSlugs = new Set<string>();

  for (const [name, plans] of byName) {
    // Ensure slug uniqueness even if two names collide after slugify.
    let slug = providerSlug(name);
    if (usedSlugs.has(slug)) {
      let i = 2;
      while (usedSlugs.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    usedSlugs.add(slug);

    const categories = [...new Set(plans.map((p) => p.cat))];
    const minPrice = plans.reduce(
      (min, p) => (typeof p.price === "number" && p.price < min ? p.price : min),
      Number.POSITIVE_INFINITY,
    );
    const catNames = categories.map((c) => CATEGORY_HE[c] ?? c).join(", ");
    const summary =
      `${name} מציעה ${plans.length} ` +
      `מסלולים בקטלוג ` +
      `(${catNames})` +
      (Number.isFinite(minPrice)
        ? `, החל מ-₪${minPrice} לחודש.`
        : ".");

    providers.push({
      slug,
      name,
      categories,
      planCount: plans.length,
      minPrice: Number.isFinite(minPrice) ? minPrice : 0,
      summary,
    });
  }

  // Stable, deterministic order: most plans first, then name.
  providers.sort(
    (a, b) => b.planCount - a.planCount || a.name.localeCompare(b.name, "he"),
  );
  return providers;
}

const PROVIDERS: Provider[] = buildProviders();
const PROVIDER_BY_SLUG = new Map(PROVIDERS.map((p) => [p.slug, p]));

/** All derived providers (sorted by plan count then name). */
export function getProviders(): Provider[] {
  return PROVIDERS.slice();
}

/** A single provider by slug, or undefined if unknown. */
export function getProvider(slug: string): Provider | undefined {
  return PROVIDER_BY_SLUG.get(slug);
}

/** Plans offered by a provider, identified by slug. */
export function plansByProvider(slug: string): Plan[] {
  const provider = PROVIDER_BY_SLUG.get(slug);
  if (!provider) return [];
  return PLANS.filter((p) => p.provider === provider.name);
}

// ── Provider official URLs (Knowledge-Graph sameAs) ──────────────────────────
/**
 * Map of provider display name → REAL official website. Used for `sameAs` links
 * in the Organization/Knowledge-Graph JSON-LD so engines resolve our provider
 * entity to the authoritative one. HONESTY: every URL here is the provider's
 * genuine official site — never a marketing redirect, affiliate, or fabrication.
 * Providers without a verified official URL are intentionally omitted (callers
 * must skip `sameAs` rather than invent a link).
 */
export const PROVIDER_OFFICIAL_URLS: Readonly<Record<string, string>> = {
  בזק: "https://www.bezeq.co.il",
  פרטנר: "https://www.partner.co.il",
  HOT: "https://www.hot.net.il",
  "הוט מובייל": "https://www.hotmobile.co.il",
  סלקום: "https://www.cellcom.co.il",
  yes: "https://www.yes.co.il",
  פלאפון: "https://www.pelephone.co.il",
  "גולן טלקום": "https://www.golantelecom.co.il",
  "רמי לוי": "https://www.rl-net.co.il",
  "019 מובייל": "https://www.019mobile.co.il",
};

/**
 * The provider's real official URL by display name, or `undefined` when none is
 * verified. Callers MUST omit `sameAs` when this returns `undefined`.
 */
export function providerOfficialUrl(name: string): string | undefined {
  return PROVIDER_OFFICIAL_URLS[name];
}

// ── Aggregate rating (real data only) ────────────────────────────────────────
const RATING_SCALE_MIN = 1;
const RATING_SCALE_MAX = 5;

/** Coerce a value to a finite number, or null. */
function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Build an {@link AggregateRating} from a plan or provider, DERIVED only from
 * genuine catalogue `rating` (0–5) + `reviews`/`reviewCount` data. Returns `null`
 * when no real rating exists — there is NO fabrication. Callers MUST omit
 * Review/AggregateRating schema when this returns `null`.
 *
 * Accepts a {@link Plan}, a {@link Provider}, or any loose object carrying the
 * fields (so it works on raw catalogue rows too). A rating requires both a valid
 * `ratingValue` in (0, 5] AND a `reviewCount` ≥ 1 to be considered real.
 */
export function getAggregateRating(
  planOrProvider: Plan | Provider | Record<string, unknown> | undefined | null,
): AggregateRating | null {
  if (!planOrProvider || typeof planOrProvider !== "object") return null;
  const src = planOrProvider as Record<string, unknown>;

  const ratingValue = toFiniteNumber(src.rating ?? src.ratingValue);
  const reviewCount = toFiniteNumber(
    src.reviews ?? src.reviewCount ?? src.reviewsCount ?? src.ratingCount,
  );

  if (ratingValue === null || reviewCount === null) return null;
  if (ratingValue <= 0 || ratingValue > RATING_SCALE_MAX) return null;
  if (reviewCount < 1) return null;

  return {
    ratingValue,
    reviewCount: Math.round(reviewCount),
    worstRating: RATING_SCALE_MIN,
    bestRating: RATING_SCALE_MAX,
  };
}

// ── Glossary (telecom terms) ─────────────────────────────────────────────────
interface RawGlossary {
  generated?: string;
  terms: GlossaryTerm[];
}

const GLOSSARY_PATH = join(process.cwd(), "data", "glossary.json");

/** Ensure `categories` is always populated (defaults to `[category]`). */
function normalizeTerm(t: GlossaryTerm): GlossaryTerm {
  const categories =
    Array.isArray(t.categories) && t.categories.length
      ? t.categories
      : t.category
        ? [t.category]
        : [];
  return { ...t, categories };
}

const GLOSSARY: GlossaryTerm[] = (() => {
  try {
    const raw = JSON.parse(
      readFileSync(GLOSSARY_PATH, "utf8"),
    ) as RawGlossary;
    return Array.isArray(raw.terms) ? raw.terms.map(normalizeTerm) : [];
  } catch {
    return [];
  }
})();

const GLOSSARY_BY_SLUG = new Map(GLOSSARY.map((t) => [t.slug, t]));

/** All glossary terms, sorted by Hebrew term (build-time, immutable copy). */
export function getGlossary(): GlossaryTerm[] {
  return GLOSSARY.slice().sort((a, b) => a.term.localeCompare(b.term, "he"));
}

/** A single glossary term by slug, or `undefined` if unknown. */
export function getTerm(slug: string): GlossaryTerm | undefined {
  return GLOSSARY_BY_SLUG.get(slug);
}

/** Alias of {@link getTerm} — a single glossary term by slug. */
export const getGlossaryTerm = getTerm;

/** Glossary terms whose category matches the given plan category. */
export function termsForCategory(cat: string): GlossaryTerm[] {
  return GLOSSARY.filter((t) => t.category === cat);
}

// ── Cities (geo pages) ───────────────────────────────────────────────────────
/**
 * A major Israeli city with REAL public GeoCoordinates and its official
 * administrative district. Bundled in web/data/cities.json. Consumed by the
 * /compare/[service]/[city] geo pages and the homepage city quick-links.
 *
 * HONESTY: Israeli telecom is largely NATIONAL — the SAME providers/plans are
 * available in every city. City pages MUST frame availability as national and
 * only add genuinely-local nuance (e.g. fiber rollout). `lat`/`lng` are public
 * knowledge; `district` is one of Israel's six official מחוזות (+ יו״ש).
 */
export interface City {
  /** URL-safe ASCII slug, e.g. "tel-aviv". */
  slug: string;
  /** Hebrew display name, e.g. "תל אביב-יפו". */
  name: string;
  /** Official administrative district (מחוז), e.g. "מחוז תל אביב". */
  district: string;
  /** Latitude in WGS84 decimal degrees (real, public). */
  lat: number;
  /** Longitude in WGS84 decimal degrees (real, public). */
  lng: number;
}

interface RawCities {
  generated?: string;
  note?: string;
  cities: City[];
}

const CITIES_PATH = join(process.cwd(), "data", "cities.json");

const CITIES: City[] = (() => {
  try {
    const raw = JSON.parse(readFileSync(CITIES_PATH, "utf8")) as RawCities;
    return Array.isArray(raw.cities) ? raw.cities : [];
  } catch {
    return [];
  }
})();

const CITY_BY_SLUG = new Map(CITIES.map((c) => [c.slug, c]));

/** All cities (build-time, immutable copy), in catalogue order. */
export function getCities(): City[] {
  return CITIES.slice();
}

/** A single city by slug, or `undefined` if unknown. */
export function cityBySlug(slug: string): City | undefined {
  return CITY_BY_SLUG.get(slug);
}

// ── Services (geo-page service axis) ──────────────────────────────────────────
/**
 * A "service" is the user-facing axis of the /compare/[service]/[city] geo
 * pages. Each maps to one or more catalogue {@link Category} ids. `fiber` is a
 * dedicated entry point that surfaces internet plans (fiber being the headline
 * internet technology) without inventing a new category.
 */
export interface Service {
  /** URL-safe slug used in /compare/[service]/[city]. */
  slug: string;
  /** Hebrew display label. */
  label: string;
  /** Catalogue category ids this service draws plans from. */
  categories: string[];
}

const SERVICES: Service[] = [
  { slug: "cellular", label: "סלולר", categories: ["cellular"] },
  { slug: "internet", label: "אינטרנט", categories: ["internet"] },
  { slug: "fiber", label: "אינטרנט סיב אופטי", categories: ["internet"] },
  { slug: "tv", label: "טלוויזיה", categories: ["tv"] },
  { slug: "triple", label: "חבילה משולבת", categories: ["triple"] },
  { slug: "abroad", label: "חבילות חו״ל", categories: ["abroad"] },
];

/** All geo-page services, in display order. */
export function getServices(): Service[] {
  return SERVICES.slice();
}

/** A single service by slug, or `undefined` if unknown. */
export function serviceBySlug(slug: string): Service | undefined {
  return SERVICES.find((s) => s.slug === slug);
}

/** Plans backing a service (union of its categories' plans, cheapest first). */
export function plansForService(slug: string): Plan[] {
  const service = serviceBySlug(slug);
  if (!service) return [];
  const cats = new Set(service.categories);
  return PLANS.filter((p) => cats.has(p.cat)).sort(
    (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity),
  );
}

// ── Price stats (current market snapshot — REAL, no fabricated history) ───────
/** Per-category price statistics (avg/min/max/count + the cheapest plan). */
export interface PriceStat {
  /** Mean headline price across the category's plans (rounded to 1 dp). */
  avg: number;
  /** Lowest headline price in the category. */
  min: number;
  /** Highest headline price in the category. */
  max: number;
  /** Number of priced plans counted. */
  count: number;
  /** The single cheapest plan (by headline price) in the category. */
  cheapest: Plan;
}

/**
 * Current per-category price statistics, computed from the bundled catalogue at
 * build time. This is the REAL CURRENT market snapshot (no fake trend history) —
 * Market Pulse renders it labeled "מצב שוק נוכחי". Categories with no priced
 * plans are omitted from the result.
 */
export function priceStats(): Record<string, PriceStat> {
  const out: Record<string, PriceStat> = {};
  for (const cat of getCategories()) {
    const priced = plansByCategory(cat).filter(
      (p) => typeof p.price === "number" && Number.isFinite(p.price),
    );
    if (!priced.length) continue;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let cheapest = priced[0];
    for (const p of priced) {
      sum += p.price;
      if (p.price < min) {
        min = p.price;
        cheapest = p;
      }
      if (p.price > max) max = p.price;
    }
    out[cat] = {
      avg: Math.round((sum / priced.length) * 10) / 10,
      min,
      max,
      count: priced.length,
      cheapest,
    };
  }
  return out;
}

// ── Provider rankings (TRANSPARENT "best value", stated methodology) ──────────
/**
 * Providers ranked by a TRANSPARENT, stated methodology: lowest starting price
 * (minPrice) ascending, then plan count descending as a tie-breaker. This is an
 * HONEST "best value" sort — it surfaces who has the cheapest entry point, not a
 * covert quality score. When `category` is given, only providers with a plan in
 * that category are ranked, and `minPrice`/`planCount` are recomputed scoped to
 * that category so the ranking reflects the page the user is on.
 *
 * The methodology MUST be shown alongside the ranking wherever it is rendered.
 */
export function buildProviderRankings(category?: string): Provider[] {
  if (!category) {
    return getProviders()
      .slice()
      .sort(
        (a, b) =>
          a.minPrice - b.minPrice ||
          b.planCount - a.planCount ||
          a.name.localeCompare(b.name, "he"),
      );
  }

  // Category-scoped: recompute minPrice/planCount from this category's plans.
  const scoped: Provider[] = [];
  for (const provider of getProviders()) {
    const plans = plansByProvider(provider.slug).filter(
      (p) => p.cat === category,
    );
    if (!plans.length) continue;
    const minPrice = plans.reduce(
      (m, p) =>
        typeof p.price === "number" && p.price < m ? p.price : m,
      Number.POSITIVE_INFINITY,
    );
    scoped.push({
      ...provider,
      planCount: plans.length,
      minPrice: Number.isFinite(minPrice) ? minPrice : 0,
    });
  }
  return scoped.sort(
    (a, b) =>
      a.minPrice - b.minPrice ||
      b.planCount - a.planCount ||
      a.name.localeCompare(b.name, "he"),
  );
}

// ── Recommendation engine (truthful "best for X") ────────────────────────────
const SITE_ORIGIN = "https://app.switchy-ai.com";

/** Cheapest plan in a list matching a predicate (by headline price). */
function cheapestWhere(
  plans: Plan[],
  pred: (p: Plan) => boolean,
): Plan | undefined {
  let best: Plan | undefined;
  for (const p of plans) {
    if (!pred(p) || typeof p.price !== "number") continue;
    if (!best || p.price < best.price) best = p;
  }
  return best;
}

function recEntity(plan: Plan, bestFor: string, reason: string): RecommendedEntity {
  return {
    bestFor,
    planId: plan.id,
    plan: plan.plan,
    provider: plan.provider,
    category: plan.cat,
    price: plan.price,
    reason,
    url: `${SITE_ORIGIN}/compare/${plan.cat}`,
  };
}

/**
 * Build truthful "best for X" recommendations for the semantic-map llm-feed.
 * Every reason is FACTUAL and catalogue-derived (lowest starting price for a
 * need) — there is NO fabricated "reliability"/"speed" metric and NO covert
 * ranking. Methodology: within each category we surface the cheapest plan
 * overall, the cheapest with no commitment, the cheapest 5G, the cheapest that
 * includes abroad use, and the cheapest with no post-promo price jump.
 */
export function buildRecommendations(): RecommendedEntity[] {
  const out: RecommendedEntity[] = [];
  const seen = new Set<string>(); // dedupe identical (bestFor + planId)

  for (const cat of getCategories()) {
    const he = CATEGORY_HE[cat] ?? cat;
    const plans = plansByCategory(cat);
    if (!plans.length) continue;

    const picks: Array<{ plan: Plan | undefined; bestFor: string; reason: string }> = [
      {
        plan: cheapestWhere(plans, () => true),
        bestFor: `${he} — המחיר ההתחלתי הזול ביותר`,
        reason: "המחיר ההתחלתי הנמוך ביותר בקטגוריה בקטלוג שלנו.",
      },
      {
        plan: cheapestWhere(plans, (p) => p.noCommit),
        bestFor: `${he} — הזול ביותר ללא התחייבות`,
        reason: "המסלול הזול ביותר שניתן לעזוב בכל עת ללא קנס יציאה.",
      },
      {
        plan: cheapestWhere(plans, (p) => p.is5G),
        bestFor: `${he} — מסלול 5G הזול ביותר`,
        reason: "מסלול ה-5G בעלות ההתחלתית הנמוכה ביותר בקטגוריה.",
      },
      {
        plan: cheapestWhere(plans, (p) => p.hasAbroad),
        bestFor: `${he} — הכי משתלם עם שימוש בחו״ל`,
        reason: "המסלול הזול ביותר הכולל גלישה/שיחות בחו״ל.",
      },
      {
        plan: cheapestWhere(
          plans,
          (p) => p.after == null || (typeof p.after === "number" && p.after <= p.price),
        ),
        bestFor: `${he} — העלות היציבה ביותר לאורך זמן`,
        reason: "המחיר אינו עולה לאחר תום המבצע — עלות קבועה לאורך זמן.",
      },
    ];

    for (const { plan, bestFor, reason } of picks) {
      if (!plan) continue;
      const key = `${bestFor}|${plan.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(recEntity(plan, bestFor, reason));
    }
  }

  return out;
}
