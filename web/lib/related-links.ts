// ────────────────────────────────────────────────────────────────────────────
// Shared, catalogue-derived RelatedLinks group builders — the hub-spoke internal
// linking that deepens the crawlable entity graph (better crawl topology, topical
// authority, and LLM/answer-engine topology). One place that turns a CATEGORY or a
// PLAN into the grouped cross-links rendered by <RelatedLinks>, plus the NavLink
// flattener that mirrors those groups into a relatedLinksSchema ItemList.
//
// This generalises the per-page buildRelatedGroups() helpers already proven on
// /compare/[service], /providers/[slug] and /vs/[pair] so the CATEGORY LANDINGS
// (cellular, internet, tv, triple, abroad and their sub-axes via <CategoryLanding>)
// and the PER-PLAN pages (/plans/[id]) get the same labelled topical web — without
// hand-maintaining a link list on each of ~30 pages.
//
// HONESTY (E-E-A-T, non-negotiable): every href is a REAL on-site route that is
// known to exist — providers come from getProviders(), vs-pairs are the catalogue-
// GATED getVsPairs()/vsPairsForProvider() (both sides have real plans), sibling
// compares are getServices() entries, and guides are guidesInCategory() rows. Every
// count/₪ figure in a hint is catalogue-derived. No fabricated links, counts, or
// "cheapest" winners; no cloaking or misleading anchor text.
//
// Pure + side-effect-free (reads the bundled catalogue accessors only), so pages
// may call these in RSC render / generateStaticParams.
// ────────────────────────────────────────────────────────────────────────────

import {
  getProviders,
  getServices,
  plansForService,
  plansByCategory,
  CATEGORY_HE,
} from "./data";
import { getVsPairs, vsPairsForProvider } from "./vs";
import { guidesInCategory } from "./guides";
import { ils } from "./format";
import type { Plan, Provider } from "./types";
import type { RelatedLinkGroup } from "@/components/RelatedLinks";
import type { NavLink } from "./schema";

/** Cap per group so a block stays a tasteful curated set, not an undifferentiated pile. */
const MAX_PROVIDERS = 8;
const MAX_VS = 6;
const MAX_GUIDES = 4;

/** Providers that have at least one plan in the given catalogue category. */
function providersInCategory(category: string): Provider[] {
  return getProviders().filter((p) => p.categories.includes(category));
}

/** "ספקים ב<קטגוריה>" group — each provider's real /providers/[slug] page. */
function providerGroup(category: string, excludeSlug?: string): RelatedLinkGroup {
  const catHe = CATEGORY_HE[category] ?? category;
  return {
    title: `ספקי ${catHe}`,
    links: providersInCategory(category)
      .filter((p) => p.slug !== excludeSlug)
      .slice(0, MAX_PROVIDERS)
      .map((p) => ({
        href: `/providers/${p.slug}`,
        label: p.name,
        hint: `${p.planCount} מסלולים, החל מ-${ils(p.minPrice)}.`,
      })),
  };
}

/** "השוואות נוספות" group — the OTHER catalogue services' /compare hubs. */
function siblingComparesGroup(category: string): RelatedLinkGroup {
  return {
    title: "השוואות נוספות",
    links: getServices()
      // Drop services that draw from THIS category (the page is already that hub).
      .filter((svc) => !svc.categories.includes(category))
      .map((svc) => ({
        href: `/compare/${svc.slug}`,
        label: `השוואת ${svc.label}`,
        hint: `${plansForService(svc.slug).length} מסלולים בקטגוריית ${svc.label}.`,
      })),
  };
}

/** "השוואות ראש בראש" group — the catalogue-gated /vs pairs IN this category. */
function vsGroupForCategory(category: string): RelatedLinkGroup {
  return {
    title: "השוואות ראש בראש",
    links: getVsPairs()
      .filter((pair) => pair.category === category)
      .slice(0, MAX_VS)
      .map((pair) => ({
        href: `/vs/${pair.slug}`,
        label: `${pair.a.provider.name} מול ${pair.b.provider.name}`,
        hint: `${pair.categoryLabel} — ${pair.a.provider.name} מ-${ils(
          pair.a.minPrice,
        )}, ${pair.b.provider.name} מ-${ils(pair.b.minPrice)}.`,
      })),
  };
}

/** "מדריכים בנושא" group — the real guides published in this category. */
function guidesGroup(category: string): RelatedLinkGroup {
  const catHe = CATEGORY_HE[category] ?? category;
  return {
    title: `מדריכי ${catHe}`,
    links: guidesInCategory(catHe)
      .slice(0, MAX_GUIDES)
      .map((g) => ({
        href: `/guides/${g.slug}`,
        label: g.h1,
        hint: g.tldr,
      })),
  };
}

/**
 * Grouped cross-links for a CATEGORY landing (cellular / internet / tv / triple /
 * abroad and their sub-axes). Sections: the category's providers, the head-to-head
 * /vs pages in the category, the other-category /compare hubs, and the category's
 * guides. Empty groups are dropped by <RelatedLinks>, so callers pass this as-is.
 */
export function buildCategoryRelatedGroups(category: string): RelatedLinkGroup[] {
  return [
    providerGroup(category),
    vsGroupForCategory(category),
    siblingComparesGroup(category),
    guidesGroup(category),
  ];
}

/**
 * Grouped cross-links for a PER-PLAN page (/plans/[id]). Leads with the plan's own
 * provider page and the category /compare hub (the natural next hops), then the
 * head-to-head /vs pages that involve this provider, the OTHER providers in the
 * category, and the category's guides. Truth-only and catalogue-derived throughout.
 */
export function buildPlanRelatedGroups(plan: Plan): RelatedLinkGroup[] {
  const category = plan.cat;
  const catHe = CATEGORY_HE[category] ?? category;
  // The plan's own provider entity (by display name). May be undefined only for a
  // catalogue inconsistency — in which case the provider-scoped links are skipped.
  const ownProvider = getProviders().find((p) => p.name === plan.provider);
  const providerSlugOf = ownProvider?.slug;

  // ── Primary next hops: this plan's provider + the full category compare hub. ──
  const primary: RelatedLinkGroup = {
    title: "להמשך ההשוואה",
    links: [],
  };
  if (ownProvider) {
    primary.links.push({
      href: `/providers/${ownProvider.slug}`,
      label: `כל המסלולים של ${plan.provider}`,
      hint: `${ownProvider.planCount} מסלולים, החל מ-${ils(ownProvider.minPrice)}.`,
    });
  }
  const catPlanCount = plansByCategory(category).length;
  primary.links.push({
    href: `/compare/${category}`,
    label: `השוואת כל מסלולי ${catHe}`,
    hint: catPlanCount
      ? `${catPlanCount} מסלולים מכל הספקים, ממוין מהזול.`
      : "כל המסלולים בקטגוריה, ממוין מהזול.",
  });

  // ── Head-to-head /vs pages that involve THIS provider, in this category. ──────
  const vsForProvider: RelatedLinkGroup = {
    title: "השוואות ראש בראש",
    links: providerSlugOf
      ? vsPairsForProvider(providerSlugOf)
          .filter(({ pair }) => pair.category === category)
          .slice(0, MAX_VS)
          .map(({ pair, other }) => ({
            href: `/vs/${pair.slug}`,
            label: `${plan.provider} מול ${other.name}`,
            hint: `${pair.categoryLabel} — השוואה ישירה בין שני הספקים.`,
          }))
      : [],
  };

  return [
    primary,
    vsForProvider,
    providerGroup(category, providerSlugOf),
    guidesGroup(category),
  ];
}

/**
 * Flatten grouped links into NavLinks for relatedLinksSchema(). Mirrors the
 * per-page relatedNavLinks() helpers so the structured navigation list matches
 * exactly what <RelatedLinks> renders. (relatedLinksSchema de-dupes by url.)
 */
export function relatedNavLinks(groups: RelatedLinkGroup[]): NavLink[] {
  return groups.flatMap((g) =>
    g.links.map((l) => ({ name: l.label, url: l.href, description: l.hint })),
  );
}
