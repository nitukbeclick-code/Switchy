// ────────────────────────────────────────────────────────────────────────────
// geo-schema-city — a small, page-owned JSON-LD builder for the LOCAL Service
// node on /compare/[service]/[city]. It composes the PREPARED schema.ts builders
// (placeSchema for the city, the brand Organization) into a schema.org `Service`
// describing what this page genuinely is: a FREE telecom price-comparison service,
// provided by the brand Organization, whose `areaServed` is the city (a Place) —
// honestly noting that the same plans/prices apply across ALL of Israel.
//
// HONESTY (E-E-A-T), non-negotiable: Israeli telecom is largely NATIONAL — the
// SAME providers/plans/prices are available in every city. So `areaServed` lists
// BOTH the city Place AND the national "IL" country, and `description` states the
// national framing explicitly. There is NO city-specific price/availability claim,
// no fabricated rating/award, and the only external entity reference is the brand's
// own canonical site. This file deliberately does NOT touch schema.ts; it only
// consumes its exported builders/constants so conventions (SITE_URL, @id, ILS,
// he-IL, brand Organization) stay in one place.
// ────────────────────────────────────────────────────────────────────────────

import { SITE_NAME, SITE_URL } from "./schema";

type Json = Record<string, unknown>;

/** Resolve a possibly-relative url against SITE_URL into an absolute url. Mirrors
 * the private `absUrl` in schema.ts (kept local so this helper stays additive and
 * does not need a new schema.ts export). */
function absUrl(url: string): string {
  return url.startsWith("http")
    ? url
    : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Build the LOCAL `Service` node for a service × city comparison page.
 *
 * - `@type` Service, `serviceType` = the honest "comparison" service type (Hebrew),
 * - `provider` = the brand Organization (the genuine provider of this free service),
 * - `areaServed` = the city Place (passed in, already built via placeSchema) AND
 *   the national Country (Israel), because availability is NATIONAL — the same
 *   plans/prices apply everywhere, so the page must not imply the service is
 *   city-only,
 * - `isPartOf` = the national service hub (/compare/<service>) — this localized
 *   page is a part of that service's overall comparison,
 * - `offers` = a free Offer (price 0 ILS): the comparison itself is free.
 *
 * HONESTY: `serviceType`/`description` describe only what the site factually does
 * (a free price comparison); no city-specific price/availability is asserted, and
 * the only `sameAs`/url is the brand's own canonical origin.
 */
export function serviceCitySchema(args: {
  /** Hebrew service label, e.g. "סלולר" / "אינטרנט סיב אופטי". */
  serviceLabel: string;
  /** Hebrew city display name, e.g. "תל אביב-יפו". */
  cityName: string;
  /** Canonical url of THIS service×city page (absolute or site-relative). */
  pageUrl: string;
  /** Service-slug for the national hub this page is part of, e.g. "cellular". */
  serviceSlug: string;
  /** The city Place node (built via placeSchema, optionally district-enriched). */
  place: Json;
}): Json {
  const pageUrl = absUrl(args.pageUrl);
  const hubUrl = absUrl(`/compare/${args.serviceSlug}`);

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${pageUrl}#service`,
    // FACTUAL service type: a telecom price-comparison service (free).
    serviceType: `השוואת מחירי ${args.serviceLabel}`,
    name: `השוואת ${args.serviceLabel} ב${args.cityName}`,
    description:
      `שירות חינמי להשוואת מסלולי ${args.serviceLabel} עבור תושבי ${args.cityName}. ` +
      `הזמינות ארצית — אותם ספקים, מסלולים ומחירים כמו בכל הארץ, ללא הבדל מחיר לפי עיר.`,
    inLanguage: "he-IL",
    url: pageUrl,
    // The genuine provider of this free comparison service: the brand itself.
    provider: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
    },
    // HONEST areaServed: the city Place AND the national country, because the same
    // plans/prices apply across ALL of Israel (national availability).
    areaServed: [
      args.place,
      { "@type": "Country", name: "ישראל", alternateName: "Israel" },
    ],
    // This localized page is part of the national service-comparison hub.
    isPartOf: {
      "@type": "CollectionPage",
      "@id": `${hubUrl}#page`,
      name: `השוואת ${args.serviceLabel}`,
      url: hubUrl,
    },
    // The comparison service itself is free (price 0 ILS).
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "ILS",
      availability: "https://schema.org/InStock",
    },
  };
}
