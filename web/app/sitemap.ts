// ────────────────────────────────────────────────────────────────────────────
// XML sitemap — home + every compare/[category] + every providers/[slug] page,
// all derived from the bundled catalogue at build time.
// ────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import {
  getCategories,
  getPlans,
  getProviders,
  getGlossary,
  getCities,
  getServices,
} from "@/lib/data";
import { getVsPairs } from "@/lib/vs";
import { getGuides } from "@/lib/guides";
import { SITE_URL } from "@/lib/schema";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase-public";

// ISR (not force-static) because the community-Q&A permalinks below are read from
// the public community_feed view at runtime; the hourly revalidate picks up newly
// answered posts without a redeploy. The catalogue-derived entries are unaffected.
export const revalidate = 3600;

// The answered, non-flagged community-Q&A permalinks — the SAME ANON, public gate
// the /community/questions hub uses (is_flagged=false, reply_count≥1). Only the
// indexable post pages are emitted; /community itself stays noindex. lastModified
// is the post's real freshness: max(created_at, edited_at) — an author edit is a
// genuine content change crawlers should see. Best-effort: a failed read returns
// none so the sitemap never breaks on a network hiccup.
async function communityPermalinks(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await sb
      .from("community_feed")
      .select("id,created_at,edited_at")
      .eq("is_flagged", false)
      .gte("reply_count", 1)
      .order("created_at", { ascending: false })
      .limit(500);
    type Row = { id: string; created_at: string | null; edited_at: string | null };
    return ((data as Row[] | null) ?? []).map((p) => {
      const created = p.created_at ? Date.parse(p.created_at) : NaN;
      const edited = p.edited_at ? Date.parse(p.edited_at) : NaN;
      const ts = Math.max(
        Number.isNaN(created) ? 0 : created,
        Number.isNaN(edited) ? 0 : edited,
      );
      return {
        url: `${SITE_URL}/community/post/${p.id}`,
        lastModified: ts > 0 ? new Date(ts) : now,
        changeFrequency: "monthly" as const,
        priority: 0.4,
      };
    });
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
    // /book — email-verified self-serve Zoom consultation booking (high-intent
    // action entry point: pick a slot → verify email → book).
    {
      url: `${SITE_URL}/book`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
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

  // /wallet — the "ארנק התקשורת" personal savings view + calculator (a flagship
  // interactive tool). Indexable + self-canonical; sits with the other tools.
  const wallet: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/wallet`,
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

  // /switch-kit — the interactive "ערכת מעבר" (Switch Autopilot): pick current
  // provider + target plan → personalised cancellation letter + ניוד checklist +
  // tracker. A high-intent action tool, so it earns a prominent priority.
  // /street-prices — the community-reported "street price" aggregate page (shown
  // only above a real minimum-reports threshold). Both surfaces are crawlable.
  const switchKitAndStreet: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/switch-kit`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/street-prices`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // ── New static content + category-landing routes ───────────────────────────
  // Editorial/company pages (about · how-it-works · faq · community). Indexable,
  // self-canonical, low change frequency.
  const content: MetadataRoute.Sitemap = [
    "/about",
    "/how-it-works",
    "/faq",
    "/community-guidelines",
    // /community itself is noindex,follow (a UGC feed) — NOT listed here. The
    // indexable community surface is the read-only Q&A hub.
    "/community/questions",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Catalogue-backed category landing pages — the "/plans" all-categories hub plus
  // one per top-level category (cellular/internet/tv/triple/abroad). These mirror
  // the static-site landing pages and render only real catalogue data, so they sit
  // alongside the /compare/[category] hubs at a comparable priority.
  const categoryLandings: MetadataRoute.Sitemap = [
    "/plans",
    "/cellular",
    "/internet",
    "/tv",
    "/triple",
    "/abroad",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Sub-category landing pages — narrower, high-intent catalogue slices
  // (5G / budget / eSIM / mid-range / cellular+abroad, fiber-only / cable-only /
  // giga internet, kosher plans, no-commitment plans). Each is self-canonical and
  // catalogue-gated; a touch below the top-level category landings.
  const subCategoryLandings: MetadataRoute.Sitemap = [
    "/cellular-5g",
    "/cellular-budget",
    "/cellular-under-40",
    "/cellular-esim",
    "/cellular-mid-range",
    "/cellular-with-abroad",
    "/data-only",
    "/internet-fiber-only",
    "/internet-cable-only",
    "/internet-giga",
    "/internet-budget",
    "/internet-mid",
    "/triple-budget",
    "/tv-streaming-included",
    "/esim-abroad",
    "/abroad-daily",
    "/5g-vs-4g",
    "/kosher-plans",
    "/plans-no-commitment",
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // /plans/[id] — the rich per-plan detail pages (Product/Offer JSON-LD, spec
  // grid, fees, small print). One entry per catalogue plan, from the SAME bundled
  // catalogue that generateStaticParams() in /plans/[id]/page.tsx pre-renders
  // from, so the sitemap and the built pages can never disagree. lastModified is
  // the plan's real `updatedAt` verification stamp when it parses (truthful
  // freshness, like the guides' publish dates); otherwise the render date.
  const planPages: MetadataRoute.Sitemap = getPlans().map((p) => {
    const t = typeof p.updatedAt === "string" ? Date.parse(p.updatedAt) : NaN;
    return {
      url: `${SITE_URL}/plans/${p.id}`,
      lastModified: Number.isNaN(t) ? now : new Date(t),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    };
  });

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
  const community = await communityPermalinks(now);

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
    ...wallet,
    ...switchHub,
    ...switchProviders,
    ...switchKitAndStreet,
    ...content,
    ...categoryLandings,
    ...subCategoryLandings,
    ...planPages,
    ...guidesHub,
    ...guides,
    ...authority,
    ...glossary,
    ...legal,
    ...community,
  ];

  const seen = new Set<string>();
  return all.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });
}
