// ────────────────────────────────────────────────────────────────────────────
// Domain types — the shared contract every other module imports from "@/lib/...".
// Shapes mirror the bundled catalogue (web/data/catalogue.json), which is copied
// from site/data/plans.json. Keep this the single source of truth for the shape.
// ────────────────────────────────────────────────────────────────────────────

/** Plan categories present in the catalogue. */
export type Category =
  | "cellular"
  | "internet"
  | "tv"
  | "triple"
  | "abroad"
  | "electricity";

/** Per-unit price label driver. Abroad plans default to per-package when unset. */
export type PriceUnit = "month" | "package" | "day" | "minute";

/** Plan "kind" sub-variants seen in the catalogue (regular / data-only / kosher …). */
export type PlanKind = string;

/**
 * A single tariff/plan as bundled in the catalogue. Only the fields the GEO app
 * relies on are typed strictly; the rest of the rich catalogue payload (feats,
 * fineLines, terms, …) is preserved via the index signature so nothing is lost.
 */
export interface Plan {
  /** Stable catalogue id, e.g. "cel_cellcom_5gprocare1500". */
  id: string;
  /** Category bucket. */
  cat: Category;
  /** Provider display name (Hebrew or brand latin), e.g. "סלקום". */
  provider: string;
  /** Plan display name, e.g. "5G Pro Care 1500GB". */
  plan: string;
  /** Headline monthly/package price in ILS (₪), rounded. */
  price: number;
  /** Price after an introductory promo expires, in ILS — null when none. */
  after: number | null;
  /** Whether the plan is 5G. */
  is5G: boolean;
  /** Whether the plan has no commitment period. */
  noCommit: boolean;
  /** Whether the plan bundles roaming / abroad usage. */
  hasAbroad: boolean;
  /** Drives the per-unit suffix (month/package/day/minute). May be undefined. */
  priceUnit?: PriceUnit;
  /** Sub-variant of the plan (regular/dataonly/kosher/…). */
  kind?: PlanKind;
  /** Free-form spec map, Hebrew keys → values (e.g. {"נתונים":"1500GB"}). */
  specs?: Record<string, string>;
  // ── Rich real-world detail (all OPTIONAL, already carried by the catalogue) ──
  // The bundled catalogue ships these on most plans even though the GEO app only
  // reads a subset; typing them (rather than leaving them under the index
  // signature) lets the mobile detail surface render the full plan story
  // truth-only — every one is omittable, so a plan missing it simply renders less.
  /** Qualitative feature bullets ("מה כלול"), e.g. ["5G","נתיב מהיר"]. */
  feats?: string[];
  /** Fine-print clauses (the "אותיות קטנות"), each a single line. */
  fineLines?: string[];
  /**
   * Commitment / contract terms. The bundled catalogue carries an array of
   * bullet clauses (`string[]`); the live-DB `terms` column is a single raw
   * string. Both are accepted — `planDetail` normalises to a clean `string[]`,
   * so a string is treated as a one-line term and nothing is fabricated.
   */
  terms?: string[] | string;
  /** Who the plan is for, e.g. "ללקוחות חדשים בלבד". */
  eligibility?: string;
  /** Free-text additional info. */
  notes?: string;
  /** Link to the provider/source page the data was taken from. */
  sourceUrl?: string;
  /** When this data was last verified (ISO date string, e.g. "2026-06"). */
  updatedAt?: string;
  /** Real average star rating (0–5) — REAL catalogue data only; never invented. */
  rating?: number;
  /** Real number of reviews backing {@link rating} — real count only. */
  reviews?: number;
  /**
   * Fees as Hebrew label → value (e.g. {"התקנה":"₪149","נתב":"+₪19.9/ח׳"}). The
   * canonical shape is `Record<string, string>`; the `| object` member only
   * admits the live-DB jsonb column (typed `unknown` upstream, narrowed to
   * `object`) without a cast. Read it via `fee()` / `planFees()`, which coerce
   * values defensively — never index this map for a typed string directly.
   */
  fees?: Record<string, string> | object;
  /** Catalogue carries extra rich fields; keep them rather than dropping. */
  [key: string]: unknown;
}

/**
 * A provider, DERIVED from the catalogue (unique provider names → slug + stats).
 * `featured` / `editorChoice` / `sponsored` are HONESTY flags: any plan/provider
 * surfaced via one of these MUST be visibly labeled ("מקודם" / "בחירת העורך")
 * with a stated factual methodology — never covert.
 */
export interface Provider {
  /** URL-safe slug derived from the name. */
  slug: string;
  /** Provider display name. */
  name: string;
  /** Distinct categories this provider has plans in. */
  categories: string[];
  /** Number of plans this provider offers in the catalogue. */
  planCount: number;
  /** Lowest headline price across this provider's plans, in ILS (₪). */
  minPrice: number;
  /** Short factual Hebrew summary of the provider's catalogue presence. */
  summary: string;
  /** Editorially promoted — MUST be labeled "מקודם" wherever shown. */
  featured?: boolean;
  /** Editor's pick — MUST be labeled "בחירת העורך" with stated methodology. */
  editorChoice?: boolean;
  /** Paid placement — MUST be labeled "מקודם" wherever shown. */
  sponsored?: boolean;
}

/**
 * A single telecom glossary term (from web/data/glossary.json). Definitions are
 * REAL, factual Hebrew explanations — never marketing copy. `category` links the
 * term back to a plan {@link Category} so a Product offer can cross-link to the
 * DefinedTerm(s) relevant to its category/technology (the W11 "Knowledge Web").
 */
export interface GlossaryTerm {
  /** URL-safe ASCII slug, e.g. "fiber-optic" → /glossary/fiber-optic. */
  slug: string;
  /** Hebrew display term, e.g. "סיב אופטי". */
  term: string;
  /** Honest 2–3 sentence Hebrew definition. */
  definition: string;
  /** Primary related plan category bucket (loose — a term may map to a Category). */
  category: string;
  /**
   * All related plan categories for this term (defaults to `[category]` when not
   * authored). Drives the term page's "related" cross-links into compare pages.
   */
  categories?: string[];
}

/**
 * A truthful "best for X" recommendation in the semantic-map llm-feed. The
 * `reason` is FACTUAL and catalogue-derived (e.g. lowest starting price in a
 * category) — never a fabricated superlative. Editor's-Choice style picks must
 * carry their stated methodology in `reason`.
 */
export interface RecommendedEntity {
  /** The buyer need this entity is best for, e.g. "המחיר ההתחלתי הזול ביותר". */
  bestFor: string;
  /** Catalogue id of the recommended plan, e.g. "cel_cellcom_5gprocare1500". */
  planId: string;
  /** Plan display name. */
  plan: string;
  /** Provider display name. */
  provider: string;
  /** Plan category bucket. */
  category: string;
  /** Headline price in ILS that backs the recommendation. */
  price: number;
  /** Factual, catalogue-derived justification (no fabricated metrics). */
  reason: string;
  /** Canonical on-site url for the recommendation (the compare page). */
  url: string;
}

/**
 * Real aggregate rating for a plan or provider, DERIVED only from genuine
 * catalogue `rating` (0–5) + `reviews` (count) data. There is no fabrication:
 * when a plan/provider carries no real rating, the accessor returns `null` and
 * callers MUST omit Review/AggregateRating schema entirely rather than invent it.
 */
export interface AggregateRating {
  /** Average star rating, 0–5 (real catalogue data only). */
  ratingValue: number;
  /** Number of reviews backing the rating (real count only). */
  reviewCount: number;
  /** Lowest possible rating on the scale (schema.org bestRating/worstRating). */
  worstRating: number;
  /** Highest possible rating on the scale. */
  bestRating: number;
}
