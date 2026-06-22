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
  // every breadcrumb trail).
  const hubs: MetadataRoute.Sitemap = [
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

  // /market-pulse — current-market snapshot hub.
  const marketPulse: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/market-pulse`,
      lastModified: now,
      changeFrequency: "weekly",
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
    ...marketPulse,
    ...switchHub,
    ...switchProviders,
    ...authority,
    ...glossary,
  ];

  const seen = new Set<string>();
  return all.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
