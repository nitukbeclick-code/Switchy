// ────────────────────────────────────────────────────────────────────────────
// XML sitemap — home + every compare/[category] + every providers/[slug] page,
// all derived from the bundled catalogue at build time.
// ────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import {
  getCategories,
  getProviders,
  getGlossary,
  getCities,
  getServices,
} from "@/lib/data";
import { getVsPairs } from "@/lib/vs";
import { getGuides } from "@/lib/guides";
import { SITE_URL } from "@/lib/schema";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const home: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  const compare: MetadataRoute.Sitemap = getCategories().map((cat) => ({
    url: `${SITE_URL}/compare/${cat}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  // /compare and /providers — the authority index hubs (linked from the footer +
  // every breadcrumb trail). /quiz is the high-intent matcher entry point (a few
  // answers → instant real matches → lead hand-off), so it earns top priority.
  const hubs: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/quiz`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // /referral — the share-the-tool invite page (mints a real referral code).
    {
      url: `${SITE_URL}/referral`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    // /negotiate — the data-grounded retention/negotiation coach (market rate).
    {
      url: `${SITE_URL}/negotiate`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/compare`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/providers`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  const providers: MetadataRoute.Sitemap = getProviders().map((p) => ({
    url: `${SITE_URL}/providers/${p.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // Authority / cognitive-SEO hubs: transparency + glossary set + each term.
  const authority: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/transparency`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/glossary`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  const glossary: MetadataRoute.Sitemap = getGlossary().map((t) => ({
    url: `${SITE_URL}/glossary/${t.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Legal / compliance pages — privacy, terms, rights intake, accessibility
  // statement. Linked site-wide from the footer; low change frequency.
  const legal: MetadataRoute.Sitemap = [
    "/privacy",
    "/terms",
    "/rights",
    "/accessibility",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));

  // ── New waves: geo compare pages, market pulse, smart-exit ──────────────────
  const services = getServices();
  const cities = getCities();

  // /compare/[service] — one per service axis.
  const serviceHubs: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${SITE_URL}/compare/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  // /compare/[service]/[city] — only INFRA-DEPENDENT services (fiber/internet/tv/
  // triple) get city pages in the sitemap. Mobile/abroad are uniformly national,
  // so their 42 near-identical city pages are noindex (see the page's robots) and
  // are kept out of the sitemap to protect crawl budget + content quality. Must
  // match isInfraDependent() in /compare/[service]/[city]/page.tsx.
  const infraServiceSlugs = new Set(
    services
      .filter(
        (s) =>
          s.slug === "fiber" ||
          s.categories.includes("internet") ||
          s.categories.includes("tv") ||
          s.categories.includes("triple"),
      )
      .map((s) => s.slug),
  );
  const geo: MetadataRoute.Sitemap = services
    .filter((s) => infraServiceSlugs.has(s.slug))
    .flatMap((s) =>
      cities.map((c) => ({
        url: `${SITE_URL}/compare/${s.slug}/${c.slug}`,
        lastModified: now,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    );

  // /vs (hub) + /vs/[pair] — curated provider-vs-provider head-to-head pages
  // (catalogue-gated, same-category, high-intent "X מול Y" queries).
  const vs: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/vs`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...getVsPairs().map((p) => ({
      url: `${SITE_URL}/vs/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  // /market-pulse — current-market snapshot hub.
  const marketPulse: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/market-pulse`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // /bills — the "צלמו את החשבון" → savings tool (bill photo → cheaper plans).
  const bills: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/bills`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // /switch + /switch/[provider] — factual smart-exit guides.
  const switchHub: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/switch`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];
  const switchProviders: MetadataRoute.Sitemap = getProviders().map((p) => ({
    url: `${SITE_URL}/switch/${p.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // /guides (hub) + /guides/[slug] — the editorial authority layer (150 ported,
  // real articles). lastModified uses each article's genuine publish date so the
  // <lastmod> is truthful rather than a build-time stamp.
  const guidesHub: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/guides`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];
  const guides: MetadataRoute.Sitemap = getGuides().map((g) => ({
    url: `${SITE_URL}/guides/${g.slug}`,
    lastModified: new Date(g.date),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Dedupe by URL — services and categories overlap on the 5 shared slugs
  // (cellular/internet/tv/triple/abroad); only `fiber` is unique to services.
  // Keep the FIRST occurrence so the higher-priority `compare` (categories) entry
  // wins over the lower-priority `serviceHubs` duplicate. Self-conflicting <loc>
  // entries are a sitemap-validity smell, so we emit each URL exactly once.
  const all: MetadataRoute.Sitemap = [
    ...home,
    ...compare,
    ...hubs,
    ...serviceHubs,
    ...geo,
    ...providers,
    ...vs,
    ...marketPulse,
    ...bills,
    ...switchHub,
    ...switchProviders,
    ...guidesHub,
    ...guides,
    ...authority,
    ...glossary,
    ...legal,
  ];

  const seen = new Set<string>();
  return all.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
