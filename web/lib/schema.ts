// ────────────────────────────────────────────────────────────────────────────
// JSON-LD builders — pure functions returning plain objects. Rendered via the
// <JsonLd> component. All claims must be TRUTHFUL and verifiable: these describe
// what the catalogue/service factually is (free comparison, ILS prices), never
// unverifiable superlatives. Pages pass their own data in.
// ────────────────────────────────────────────────────────────────────────────

import type { GlossaryTerm, Plan, Provider } from "./types";
import {
  CATEGORY_HE,
  getAggregateRating,
  providerOfficialUrl,
  providerSlug,
  termsForCategory,
} from "./data";

/** Canonical site origin (no trailing slash). */
export const SITE_URL = "https://www.switchy-ai.com";
/** Brand name as shown to users / engines (single canonical form everywhere). */
export const SITE_NAME = "חוסך / Switch AI";
/**
 * Alternate brand-name forms that MUST resolve to the same entity. GEO/knowledge
 * graphs key `sameAs`/knowledge-panel on a single name, so we declare every form
 * the brand appears under (the Hebrew "חוסך", the canonical English "Switch AI",
 * and the legacy "Switchy" variant the site also appeared under) as
 * `alternateName`. KEEP the footer + llm-context in sync with these.
 */
export const SITE_ALT_NAMES: readonly string[] = ["חוסך", "Switch AI", "Switchy"];
const CURRENCY = "ILS";

type Json = Record<string, unknown>;

// ── Organization ─────────────────────────────────────────────────────────────
/** Organization schema for the brand (used in the global layout). */
export function orgSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    alternateName: SITE_ALT_NAMES,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.png`,
    description:
      "שירות חינמי להשוואת מסלולי תקשורת בישראל — סלולר, אינטרנט, טלוויזיה, " +
      "חבילות משולבות וחבילות חו״ל — וחיבור ללקוחות עם הסכמתם.",
    areaServed: "IL",
  };
}

// ── WebSite (with SearchAction) ──────────────────────────────────────────────
/** WebSite schema for the brand site. */
export function websiteSchema(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: SITE_ALT_NAMES,
    url: SITE_URL,
    inLanguage: "he-IL",
  };
}

// ── Product (a single plan) ──────────────────────────────────────────────────
/**
 * Product schema for one plan, with an AggregateOffer in ILS. `after` (post-promo
 * price), when present, widens the price range so the offer is honest about the
 * highest the customer may pay.
 */
export function productSchema(plan: Plan): Json {
  const catHe = CATEGORY_HE[plan.cat] ?? plan.cat;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: plan.plan,
    brand: { "@type": "Brand", name: plan.provider },
    category: catHe,
    sku: plan.id,
    offers: planOffers(plan, { "@type": "Organization", name: plan.provider }),
  };
}

/**
 * Build the `offers` node for a plan. When the plan has a real post-promo `after`
 * price that differs from the headline, we emit an honest {@link AggregateOffer}
 * spanning `[low, high]`; a single fixed price is a plain {@link Offer} (an
 * `AggregateOffer` with `offerCount: 1` is mildly self-contradictory to
 * validators). `seller` is passed in so callers can use a concrete Organization
 * or an `@id` reference. HONESTY: the price widening reflects only real `after`.
 */
function planOffers(plan: Plan, seller: Json): Json {
  const prices = [plan.price, plan.after].filter(
    (n): n is number => typeof n === "number" && n > 0,
  );
  const low = prices.length ? Math.min(...prices) : plan.price;
  const high = prices.length ? Math.max(...prices) : plan.price;

  if (high > low) {
    return {
      "@type": "AggregateOffer",
      priceCurrency: CURRENCY,
      lowPrice: low,
      highPrice: high,
      offerCount: 2,
      seller,
    };
  }
  return {
    "@type": "Offer",
    priceCurrency: CURRENCY,
    price: low,
    seller,
  };
}

// ── ItemList (a list of plans) ───────────────────────────────────────────────
/** ItemList schema wrapping a ranked list of plans (each as a Product). */
export function itemListSchema(plans: Plan[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: plans.length,
    itemListElement: plans.map((plan, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: productSchema(plan),
    })),
  };
}

// ── ItemList (comparison of two providers' representative plans) ──────────────
/**
 * Comparison ItemList for a head-to-head provider-vs-provider page. Each side's
 * REPRESENTATIVE plan (the caller passes the cheapest in the compared category)
 * becomes a positioned ListItem → Product, so answer engines read the match-up as
 * a structured comparison. The list is ordered cheapest-first by the caller.
 *
 * HONESTY: this only serializes the two real plans handed in — it asserts no
 * "winner" and fabricates nothing. The page's visible summary states the derived
 * (cheaper / more-options) conclusion; the schema stays purely descriptive.
 */
export function comparisonSchema(args: {
  name: string;
  url: string;
  plans: Plan[];
}): Json {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: args.name,
    url: absUrl(args.url),
    numberOfItems: args.plans.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: args.plans.map((plan, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: productSchema(plan),
    })),
  };
}

// ── FAQPage ──────────────────────────────────────────────────────────────────
/** A single FAQ question/answer pair. */
export interface QA {
  question: string;
  answer: string;
}

/** FAQPage schema from question/answer pairs. */
export function faqPageSchema(qas: QA[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.map((qa) => ({
      "@type": "Question",
      name: qa.question,
      acceptedAnswer: { "@type": "Answer", text: qa.answer },
    })),
  };
}

// ── BreadcrumbList ───────────────────────────────────────────────────────────
/** A breadcrumb trail item. `url` may be absolute or site-relative. */
export interface Crumb {
  name: string;
  url: string;
}

/** BreadcrumbList schema. Relative urls are resolved against SITE_URL. */
export function breadcrumbSchema(items: Crumb[]): Json {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url.startsWith("http")
        ? item.url
        : `${SITE_URL}${item.url.startsWith("/") ? "" : "/"}${item.url}`,
    })),
  };
}

// ── CollectionPage ───────────────────────────────────────────────────────────
/**
 * CollectionPage schema for a category/listing page. Pass the page's name +
 * description and optionally the plans it lists (embedded as an ItemList).
 */
export function collectionPageSchema(args: {
  name: string;
  description: string;
  url: string;
  plans?: Plan[];
}): Json {
  const { name, description, url, plans } = args;
  const absUrl = url.startsWith("http")
    ? url
    : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
  const schema: Json = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: absUrl,
    inLanguage: "he-IL",
  };
  if (plans && plans.length) {
    schema.mainEntity = itemListSchema(plans);
  }
  return schema;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Resolve a possibly-relative url against SITE_URL into an absolute url. */
function absUrl(url: string): string {
  return url.startsWith("http")
    ? url
    : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

// ── Review / AggregateRating (REAL data only) ────────────────────────────────
/**
 * AggregateRating schema for a plan/provider, FROM real `rating`/`reviews` only.
 * Returns `null` when no genuine rating exists — callers MUST omit the field
 * rather than fabricate it. The optional `reliability`/`speed` additionalProperty
 * is emitted ONLY when such real metrics are present on the source; otherwise it
 * is omitted entirely (never invented).
 */
export function aggregateRatingSchema(
  planOrProvider: Plan | Provider,
): Json | null {
  const rating = getAggregateRating(planOrProvider);
  if (!rating) return null;

  const schema: Json = {
    "@type": "AggregateRating",
    ratingValue: rating.ratingValue,
    reviewCount: rating.reviewCount,
    bestRating: rating.bestRating,
    worstRating: rating.worstRating,
  };

  // Real sub-metrics ONLY — emitted as additionalProperty when genuinely present.
  const src = planOrProvider as unknown as Record<string, unknown>;
  const extra: Json[] = [];
  for (const [key, label] of [
    ["reliability", "אמינות"],
    ["speed", "מהירות"],
  ] as const) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      extra.push({
        "@type": "PropertyValue",
        name: label,
        value: v,
      });
    }
  }
  if (extra.length) schema.additionalProperty = extra;

  return schema;
}

/**
 * Review schema array for a plan, FROM real `provider_reviews`/`reviews` array
 * data only. Returns `null` when no genuine individual reviews exist — there is
 * NO fabrication of review text, authors, or ratings. Each review must carry a
 * real body/author and a numeric rating to be included.
 */
export function reviewSchema(plan: Plan): Json[] | null {
  const src = plan as unknown as Record<string, unknown>;
  const raw = src.provider_reviews ?? src.reviewsList ?? src.userReviews;
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const reviews: Json[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const body =
      typeof rec.body === "string"
        ? rec.body
        : typeof rec.text === "string"
          ? rec.text
          : undefined;
    const ratingValue =
      typeof rec.rating === "number" && Number.isFinite(rec.rating)
        ? rec.rating
        : undefined;
    if (!body || ratingValue === undefined) continue; // omit, never invent

    const review: Json = {
      "@type": "Review",
      reviewBody: body,
      reviewRating: {
        "@type": "Rating",
        ratingValue,
        bestRating: 5,
        worstRating: 1,
      },
    };
    const author =
      typeof rec.author === "string"
        ? rec.author
        : typeof rec.name === "string"
          ? rec.name
          : undefined;
    if (author) review.author = { "@type": "Person", name: author };
    if (typeof rec.date === "string") review.datePublished = rec.date;
    reviews.push(review);
  }

  return reviews.length ? reviews : null;
}

// ── DefinedTerm / DefinedTermSet (glossary) ──────────────────────────────────
/** Minimal shape a single DefinedTerm needs (term + definition, optional url/slug). */
interface DefinedTermInput {
  term: string;
  definition: string;
  /** Optional slug or url for the term's canonical @id/url. */
  slug?: string;
  url?: string;
}

/** Resolve a term's canonical url + #term @id from a slug or explicit url. */
function termUrls(t: DefinedTermInput): { url: string; id: string } {
  const url = t.url
    ? absUrl(t.url)
    : `${SITE_URL}/glossary/${t.slug ?? ""}`;
  return { url, id: `${url}#term` };
}

/**
 * DefinedTerm schema for one glossary term. `inDefinedTermSet` points back at the
 * glossary hub so engines connect the term to the set. Accepts a full
 * {@link GlossaryTerm} (the prompt's contract) or a loose `{ term, definition,
 * url|slug }` object (the term page).
 */
export function definedTermSchema(term: GlossaryTerm | DefinedTermInput): Json {
  const { url, id } = termUrls(term);
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    "@id": id,
    name: term.term,
    description: term.definition,
    url,
    inDefinedTermSet: `${SITE_URL}/glossary#set`,
    inLanguage: "he-IL",
  };
}

/**
 * DefinedTermSet schema for the glossary hub, embedding every term as a
 * DefinedTerm member. Accepts EITHER a bare `GlossaryTerm[]` (the prompt's
 * contract) OR a `{ name, description, url, terms }` options object (the glossary
 * hub page).
 */
export function definedTermSetSchema(
  input:
    | GlossaryTerm[]
    | {
        terms: GlossaryTerm[];
        name?: string;
        description?: string;
        url?: string;
      },
): Json {
  const terms = Array.isArray(input) ? input : input.terms;
  const opts: { name?: string; description?: string; url?: string } =
    Array.isArray(input) ? {} : input;
  const setUrl = opts.url ? absUrl(opts.url) : `${SITE_URL}/glossary`;
  return {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${SITE_URL}/glossary#set`,
    name: opts.name ?? "מילון מונחי תקשורת — חוסך / Switch AI",
    description:
      opts.description ??
      "מילון מונחים עובדתי בעברית לשוק התקשורת בישראל: סלולר, אינטרנט, " +
        "טלוויזיה, חבילות משולבות וחו״ל.",
    url: setUrl,
    inLanguage: "he-IL",
    hasDefinedTerm: terms.map((t) => ({
      "@type": "DefinedTerm",
      "@id": `${SITE_URL}/glossary/${t.slug}#term`,
      name: t.term,
      description: t.definition,
      url: `${SITE_URL}/glossary/${t.slug}`,
    })),
  };
}

// ── Place / Geo (city wave) ──────────────────────────────────────────────────
/**
 * Place schema for a city (used by the later city/geo wave). `lat`/`lng` are
 * embedded as a GeoCoordinates when provided.
 */
export function placeSchema(args: {
  city: string;
  lat?: number;
  lng?: number;
}): Json {
  const { city, lat, lng } = args;
  const schema: Json = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: city,
    address: {
      "@type": "PostalAddress",
      addressLocality: city,
      addressCountry: "IL",
    },
  };
  if (typeof lat === "number" && typeof lng === "number") {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lng,
    };
  }
  return schema;
}

/**
 * Bare GeoCoordinates helper (for embedding inside a Service `areaServed` or a
 * Place). Returns the coordinates object only.
 */
export function geoSchema(args: { lat: number; lng: number }): Json {
  return {
    "@type": "GeoCoordinates",
    latitude: args.lat,
    longitude: args.lng,
  };
}

// ── WebPage (generic informational page) ─────────────────────────────────────
/**
 * Generic WebPage schema for an informational page (privacy / terms /
 * accessibility statement). `lastReviewed` / `dateModified`, when given, should be
 * the REAL last editorial review date (never a fabricated freshness signal).
 * `isPartOf` links the page to the brand WebSite so engines connect it to the org.
 */
export function webPageSchema(args: {
  name: string;
  description: string;
  url: string;
  /** Real last-reviewed/modified date, e.g. "2026-06-22". Omitted when unknown. */
  lastReviewed?: string;
  /** schema.org subject of the page (e.g. "מדיניות פרטיות"). */
  about?: string;
}): Json {
  const schema: Json = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: args.name,
    description: args.description,
    url: absUrl(args.url),
    inLanguage: "he-IL",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
  };
  if (args.lastReviewed) {
    schema.lastReviewed = args.lastReviewed;
    schema.dateModified = args.lastReviewed;
  }
  if (args.about) {
    schema.about = { "@type": "Thing", name: args.about };
  }
  return schema;
}

// ── Dataset (Market Pulse — current price snapshot) ──────────────────────────
/**
 * Dataset schema for the Market Pulse current-market snapshot. Describes the
 * REAL, build-time per-category price statistics we publish (no fabricated trend
 * history). `variableMeasured` lists the genuine measures (avg/min/max/count) so
 * engines understand the dataset's columns. `temporalCoverage`, when given,
 * should be the real generation month (e.g. "2026-06") — never a fake range.
 */
export function datasetSchema(args: {
  name: string;
  description: string;
  url: string;
  /** Real generation period, e.g. "2026-06". Omitted when unknown. */
  temporalCoverage?: string;
  /** Measures present in the dataset (defaults to the price-stat measures). */
  measures?: string[];
}): Json {
  const measures = args.measures ?? [
    "מחיר ממוצע",
    "מחיר מינימלי",
    "מחיר מקסימלי",
    "מספר מסלולים",
  ];
  const schema: Json = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: args.name,
    description: args.description,
    url: absUrl(args.url),
    inLanguage: "he-IL",
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isAccessibleForFree: true,
    variableMeasured: measures.map((m) => ({
      "@type": "PropertyValue",
      name: m,
    })),
  };
  if (args.temporalCoverage) schema.temporalCoverage = args.temporalCoverage;
  return schema;
}

// ── Knowledge Graph (@graph, cross-linked) ───────────────────────────────────
/** Stable @id for a provider Organization node. */
function providerNodeId(provider: { name: string; slug?: string }): string {
  const slug = provider.slug ?? providerSlug(provider.name);
  return `${SITE_URL}/providers/${slug}#org`;
}

/**
 * Build an Organization node for a provider, with `sameAs` to its REAL official
 * URL (omitted when none is verified — never fabricated) and `url` to its on-site
 * provider page. Real AggregateRating is attached only when present.
 */
function providerOrgNode(provider: Provider | { name: string; slug?: string }): Json {
  const slug = provider.slug ?? providerSlug(provider.name);
  const org: Json = {
    "@type": "Organization",
    "@id": providerNodeId(provider),
    name: provider.name,
    url: `${SITE_URL}/providers/${slug}`,
  };
  const official = providerOfficialUrl(provider.name);
  if (official) org.sameAs = [official];
  const rating = aggregateRatingSchema(provider as Provider);
  if (rating) org.aggregateRating = rating; // real only
  return org;
}

/**
 * Cross-linked Knowledge-Graph schema (`@graph`) for a listing/entity page.
 * Assembles:
 *  - the page entity (CollectionPage by default, or `pageType`),
 *  - one {@link Organization} node per provider, each `sameAs` its REAL official
 *    URL (omitted when none is verified — never fabricated),
 *  - a ServiceType/`about` subject, and
 *  - cross-links (`isRelatedTo` provider nodes; `subjectOf` real on-site urls)
 *    so engines traverse the graph.
 *
 * HONESTY: `sameAs` is only the provider's genuine official site. Any extra
 * related/subjectOf links must be real on-site canonical URLs supplied by caller.
 */
export function knowledgeGraphSchema(opts: {
  /** Canonical url of the page (absolute or site-relative). */
  pageUrl: string;
  /** Display name of the page entity. */
  pageName: string;
  /** Providers present on this page → Organization nodes (with sameAs). */
  providers: Array<Provider | { name: string; slug?: string }>;
  /** Plans on the page (used to derive the ServiceType/about subject). */
  plans?: Plan[];
  /** schema.org @type for the page entity. Defaults to "CollectionPage". */
  pageType?: string;
  /** Factual description of the page entity. */
  description?: string;
  /** ServiceType / "about" subject (e.g. "השוואת מסלולי סלולר"). */
  serviceType?: string;
  /** Extra real, on-site related entity urls (isRelatedTo). */
  related?: { id: string; name?: string }[];
  /** Real, on-site pages this entity is the subject of (subjectOf). */
  subjectOf?: { id: string; name?: string }[];
}): Json {
  const pageUrl = absUrl(opts.pageUrl);
  const graph: Json[] = [];

  const pageNode: Json = {
    "@type": opts.pageType ?? "CollectionPage",
    "@id": `${pageUrl}#page`,
    name: opts.pageName,
    url: pageUrl,
    inLanguage: "he-IL",
  };
  if (opts.description) pageNode.description = opts.description;

  const subject =
    opts.serviceType ??
    (opts.plans && opts.plans.length
      ? `השוואת מסלולי ${CATEGORY_HE[opts.plans[0].cat] ?? opts.plans[0].cat}`
      : undefined);
  if (subject) pageNode.about = { "@type": "Thing", name: subject };

  // Provider Organization nodes (deduped) + cross-links from the page.
  const seen = new Set<string>();
  const related: Json[] = [];
  for (const provider of opts.providers) {
    const id = providerNodeId(provider);
    if (seen.has(id)) continue;
    seen.add(id);
    graph.push(providerOrgNode(provider));
    related.push({ "@id": id });
  }

  // Extra related links (real on-site urls only).
  if (opts.related?.length) {
    for (const r of opts.related) {
      const node: Json = { "@id": absUrl(r.id) };
      if (r.name) node.name = r.name;
      related.push(node);
    }
  }
  if (related.length) pageNode.isRelatedTo = related;

  if (opts.subjectOf?.length) {
    pageNode.subjectOf = opts.subjectOf.map((s) => {
      const node: Json = { "@id": absUrl(s.id) };
      if (s.name) node.name = s.name;
      return node;
    });
  }

  graph.unshift(pageNode);
  return { "@context": "https://schema.org", "@graph": graph };
}

// ── Knowledge Web (Product ↔ DefinedTerm ↔ AggregateRating ↔ Provider) ───────
/** Stable @id for a plan's Product node (canonical compare-page anchor). */
function planProductId(plan: Plan): string {
  return `${SITE_URL}/compare/${plan.cat}#plan-${plan.id}`;
}

/** Glossary DefinedTerms relevant to a plan: its category terms + tech flags. */
function termsForPlan(plan: Plan): GlossaryTerm[] {
  const terms: GlossaryTerm[] = [...termsForCategory(plan.cat)];
  const extraSlugs: string[] = [];
  if (plan.is5G) extraSlugs.push("5g");
  if (plan.hasAbroad) extraSlugs.push("roaming");
  const pool = termsForCategory("cellular").concat(termsForCategory("abroad"));
  for (const slug of extraSlugs) {
    if (terms.some((t) => t.slug === slug)) continue;
    const found = pool.find((t) => t.slug === slug);
    if (found) terms.push(found);
  }
  return terms;
}

/**
 * Build the graph nodes for ONE plan's knowledge web: a Product node linked to
 * its DefinedTerm node(s) (via `mentions`) and its Provider node (via `brand` /
 * `offers.seller`), with a real AggregateRating attached only when present. The
 * Provider node uses the shared {@link providerNodeId} so multiple plans of the
 * same provider collapse onto a single Organization in the page graph.
 *
 * Returns the Product node plus any new DefinedTerm/Provider nodes not already
 * emitted (deduped via the `seenIds` set passed by the caller).
 */
function planKnowledgeNodes(plan: Plan, seenIds: Set<string>): Json[] {
  const out: Json[] = [];
  const catHe = CATEGORY_HE[plan.cat] ?? plan.cat;
  const productId = planProductId(plan);
  const providerId = providerNodeId({ name: plan.provider });

  // Provider node (once per provider).
  if (!seenIds.has(providerId)) {
    seenIds.add(providerId);
    out.push(providerOrgNode({ name: plan.provider }));
  }

  // DefinedTerm nodes (once per term).
  const terms = termsForPlan(plan);
  for (const t of terms) {
    const termId = `${SITE_URL}/glossary/${t.slug}#term`;
    if (seenIds.has(termId)) continue;
    seenIds.add(termId);
    out.push({
      "@type": "DefinedTerm",
      "@id": termId,
      name: t.term,
      url: `${SITE_URL}/glossary/${t.slug}`,
      inDefinedTermSet: `${SITE_URL}/glossary#set`,
    });
  }

  const product: Json = {
    "@type": "Product",
    "@id": productId,
    name: plan.plan,
    category: catHe,
    sku: plan.id,
    brand: { "@id": providerId },
    offers: planOffers(plan, { "@id": providerId }),
  };
  if (terms.length) {
    product.mentions = terms.map((t) => ({
      "@id": `${SITE_URL}/glossary/${t.slug}#term`,
    }));
  }
  const rating = aggregateRatingSchema(plan);
  if (rating) product.aggregateRating = rating; // real only

  out.push(product);
  return out;
}

/**
 * The W11 entity-linking "Knowledge Web": a `@graph` cross-linking each Product
 * offer (priceCurrency ILS) ↔ the DefinedTerm(s) for its category/technology ↔
 * its AggregateRating (real data only) ↔ its Provider (with `sameAs` to the real
 * official URL). Glossary terms relevant to a plan's category — plus 5G/roaming
 * when flagged — are linked via `mentions` so engines see the semantic web.
 *
 * Accepts EITHER a single {@link Plan} (the prompt's `knowledgeWebSchema(plan)`
 * contract) OR a page-level `{ plans, providers, pageUrl, category }` object
 * (the listing/provider pages). Providers passed in are still emitted as
 * Organization nodes even if they have no plans on the page.
 *
 * HONESTY: AggregateRating is attached ONLY when real; Provider `sameAs` only
 * when a genuine official URL exists; nothing is fabricated.
 */
export function knowledgeWebSchema(
  input:
    | Plan
    | {
        plans: Plan[];
        providers?: Array<Provider | { name: string; slug?: string }>;
        pageUrl?: string;
        category?: string;
      },
): Json {
  const isSinglePlan = "id" in input && "cat" in input && "plan" in input;
  const plans: Plan[] = isSinglePlan ? [input as Plan] : (input as { plans: Plan[] }).plans;
  const providers = isSinglePlan
    ? []
    : ((input as { providers?: Array<Provider | { name: string; slug?: string }> })
        .providers ?? []);

  const graph: Json[] = [];
  const seenIds = new Set<string>();

  // Emit provider Organization nodes first (so plan nodes can @id-reference them).
  for (const provider of providers) {
    const id = providerNodeId(provider);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    graph.push(providerOrgNode(provider));
  }

  for (const plan of plans) {
    graph.push(...planKnowledgeNodes(plan, seenIds));
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
