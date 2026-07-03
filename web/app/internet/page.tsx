// ────────────────────────────────────────────────────────────────────────────
// /internet — the INTERNET category landing. The web-app counterpart of the
// static site/internet.html: a real intro, a FEATURED table of the cheapest
// plans, onward subcategory links (incl. the real /compare/fiber service axis),
// and a clear hand-off to the full /compare/internet hub. Mirrors the static
// page's content/structure, adapted to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the featured table is the
// cheapest catalogue plans (real, derived) — nothing fabricated. CategoryLanding
// surfaces the commission disclosure + price caveat next to the prices. Self-
// canonical metadata + CollectionPage/ItemList JSON-LD describe only real plans.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import CategoryLanding from "@/components/CategoryLanding";
import FreshnessBadge from "@/components/FreshnessBadge";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import { ils } from "@/lib/format";
import { plansByCategory, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  categoryAggregateOfferSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata, categoryMetaDescription } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import { getLivePlans } from "@/lib/live-catalogue";
import type { Plan } from "@/lib/types";

const CATEGORY = "internet";
const TITLE_HE = `מסלולי ${CATEGORY_HE[CATEGORY]}`;

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** The cheapest N plans (by headline price), priced first, from a plan list. */
function cheapestPlans(all: Plan[], limit = 6): Plan[] {
  return all
    .filter((p): p is Plan => typeof p.price === "number")
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי אינטרנט — השוואת חבילות תשתית וספק",
  // Fact-dense, truth-only TL;DR derived from the catalogue (plan count, provider
  // count + sample names, ₪ price floor) so an answer engine extracts real figures.
  description:
    categoryMetaDescription(CATEGORY) ??
    "תשתית + ספק, סיב אופטי עד גיגה. השוו את כל חבילות האינטרנט — כולל מחירי " +
      "המבצע ומה קורה אחריו — ובחרו לפי המהירות והמחיר שמתאימים לכם. השוואה חינמית.",
  path: "/internet",
});

export default async function InternetLandingPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = cheapestPlans(all);
  // Catalogue-derived entry price for the flat-ink hero's green VALUE clause — the
  // lowest headline price among the SAME featured `plans` CategoryLanding renders,
  // so the two figures can never disagree. Undefined ⇒ no fabricated number shown.
  const pricedFeatured = plans.filter((p) => typeof p.price === "number");
  const minFeatured = pricedFeatured.length
    ? Math.min(...pricedFeatured.map((p) => p.price))
    : undefined;
  // Real "data as of" date (catalogue updated_at, else build-time UTC) — drives
  // BOTH the visible <FreshnessBadge> and the schema's temporalCoverage month, so
  // the structured data can never disagree with what the human reads.
  const asOf = lastDataDate(plans);
  // Category-scoped AggregateOffer (price range across the REAL featured plans).
  // Returns null when no plan is priced; rendered conditionally so nothing false
  // is emitted.
  const categoryOffer = categoryAggregateOfferSchema(plans, CATEGORY, {
    temporalCoverage: asOf.slice(0, 7),
  });

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/${CATEGORY}` },
  ];

  // Onward subcategory links — REAL on-site routes only (no dead-ends).
  // /compare/fiber is a genuine service axis surfacing internet (fiber) plans.
  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי האינטרנט — טבלה מלאה" },
    { href: "/compare/fiber", label: "אינטרנט סיב אופטי" },
    { href: "/providers", label: "לפי ספק — כל חברות האינטרנט" },
    { href: `/guides#cat-${encodeURIComponent(CATEGORY_HE[CATEGORY])}`, label: "מדריכי אינטרנט" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי האינטרנט",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    {
      href: "/compare/triple",
      label: "השוואת חבילות משולבות",
      hint: "אינטרנט, טלוויזיה וסלולר בחבילה אחת — לרוב חסכוני יותר.",
    },
    {
      href: "/compare/tv",
      label: "השוואת מסלולי טלוויזיה",
      hint: "ערוצים, סטרימינג, ספורט ו-VOD.",
    },
    { href: "/providers", label: "כל ספקי התקשורת", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: CollectionPage (with the featured plans as an ItemList)
          + Breadcrumb. Describes only the real plans shown. */}
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "השוואת מסלולי אינטרנט מכל הספקים בישראל — תשתית וספק, סיב אופטי עד גיגה, כולל המחיר אחרי המבצע.",
          url: `/${CATEGORY}`,
          plans,
        })}
      />
      {/* Category AggregateOffer — a single "prices range ₪low–₪high across N
          plans" node for the featured set, in ILS, stamped with the real
          catalogue month. Omitted when no plan is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{CATEGORY_HE[CATEGORY]}</span>
      </nav>

      {/* ── Flat-ink hero panel ───────────────────────────────────────────────
          The bank-grade page hero (mirrors app/page.tsx): a solid deep-ink panel
          (#111827 in BOTH themes, so white-on-ink always holds) with the page
          <h1> set directly on it — NO photo/video behind. Green is applied ONLY
          to the catalogue-derived entry-price clause (VALUE), never as a second
          fill. Exactly ONE primary CTA (green fill + glow) into the full compare
          hub + ONE quiet secondary text link to the advisor. The featured table
          below comes from <CategoryLanding hideHero> so there is a single ink
          hero + single primary CTA per view. */}
      <section className="relative isolate mt-6 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            מסלולי אינטרנט
            {minFeatured !== undefined ? (
              <>
                {" "}
                <span className="text-accent">מ-{ils(minFeatured)} לחודש.</span>
              </>
            ) : null}
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
            style={{ animationDelay: "60ms" }}
          >
            השוואה חינמית של כל חבילות האינטרנט בישראל — כולל המחיר שאחרי המבצע.
          </p>
          <div
            className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
            style={{ animationDelay: "120ms" }}
          >
            <TrackedCtaLink
              href={`/compare/${CATEGORY}`}
              location="category-hero"
              label="compare"
              className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
            >
              לכל מסלולי האינטרנט
              <Icon name="chevron" size={18} aria-hidden="true" />
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/book"
              location="category-hero"
              label="consult"
              className="interactive text-sm text-white/70 underline-offset-4 hover:underline"
            >
              או דברו עם יועץ
            </TrackedCtaLink>
          </div>
          {minFeatured !== undefined ? (
            <p
              className="nums-tabular sw-reveal mt-8 text-sm text-white/70"
              style={{ animationDelay: "150ms" }}
            >
              {all.length} מסלולים · החל מ-
              <span className="font-display font-bold text-accent">
                {ils(minFeatured)}
              </span>{" "}
              לחודש
            </p>
          ) : null}
          {/* Quiet, truthful benefit line (parity with the home hero) — a
              qualitative reassurance, no fabricated figure. Sits BELOW the hard
              catalogue count so the real numbers lead the hedge. */}
          <p
            className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            מסלול מתאים יכול לחסוך לכם מאות ₪ בשנה — וההשוואה חינם
          </p>
        </div>
      </section>

      {/* ── Freshness stamp (honest "data as of" date, near the table) ────── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      {/* ── Category landing (intro + featured table + disclosure/caveat +
          /compare hand-off + subcategory links). hideHero: the flat-ink hero +
          the page <h1> live above, so this starts at the disclosure/table. ──── */}
      <div className="mt-4">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          hideHero
          intro="תשתית + ספק, סיב אופטי עד גיגה. השוו את כל חבילות האינטרנט — כולל מחירי המבצע ומה קורה אחריו — ובחרו לפי המהירות והמחיר שמתאימים לכם. הטבלה מציגה את המסלולים הזולים ביותר בקטלוג, ממוינים מהזול ליקר."
          plans={plans}
          subcats={subcats}
        />
      </div>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עמודים קשורים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
