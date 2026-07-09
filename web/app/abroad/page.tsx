// ────────────────────────────────────────────────────────────────────────────
// /abroad — the ABROAD (חבילות חו״ל / eSIM + נדידה) category landing. The web-app
// counterpart of the static site/abroad.html: a real intro, a FEATURED table of
// the cheapest packages, onward subcategory links, and a clear hand-off to the
// full /compare/abroad hub. Mirrors the static page's content/structure, adapted
// to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the featured table is the
// cheapest catalogue packages (real, derived) — nothing fabricated. Abroad plans
// are priced per-package (ComparisonTable/format.ts handle the per-unit suffix).
// CategoryLanding surfaces the commission disclosure + price caveat next to the
// prices. Self-canonical metadata + CollectionPage/ItemList JSON-LD describe only
// real plans.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import CategoryLanding from "@/components/CategoryLanding";
import FreshnessBadge from "@/components/FreshnessBadge";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import { ils, priceUnitLabel } from "@/lib/format";
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

const CATEGORY = "abroad";
const TITLE_HE = CATEGORY_HE[CATEGORY]; // "חבילות חו״ל" (already a full phrase)

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
  title: "חבילות גלישה בחו״ל — eSIM ונדידה, השוואת מחירים",
  // Fact-dense, truth-only TL;DR derived from the catalogue (plan count, provider
  // count + sample names, ₪ price floor) so an answer engine extracts real figures.
  description:
    categoryMetaDescription(CATEGORY) ??
    "גלישה בחו״ל בלי הפתעות. השוו חבילות eSIM ונדידה לכל יעד — לפי ימים, נפח " +
      "גלישה ומחיר — והפעילו עוד לפני הטיסה. השוואה חינמית, מחירים בשקלים.",
  path: "/abroad",
});

export default async function AbroadLandingPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = cheapestPlans(all);
  // Catalogue-derived entry price for the flat-ink hero's green VALUE clause — the
  // cheapest featured plan (same `plans` CategoryLanding renders) plus its REAL
  // per-unit suffix (abroad is per-package, not per-month — never mislabel it as
  // "לחודש"). Undefined ⇒ no fabricated number shown.
  const cheapestFeatured = plans
    .filter((p) => typeof p.price === "number")
    .sort((a, b) => a.price - b.price)[0];
  const minFeatured = cheapestFeatured?.price;
  const minUnitLabel = cheapestFeatured
    ? priceUnitLabel(cheapestFeatured)
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
  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל חבילות חו״ל — טבלה מלאה" },
    { href: "/providers", label: "לפי ספק — כל ספקי חבילות חו״ל" },
    { href: `/guides#cat-${encodeURIComponent(CATEGORY_HE[CATEGORY])}`, label: "מדריכי גלישה בחו״ל" },
    { href: "/compare/cellular", label: "מסלולי סלולר הכוללים חו״ל" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל חבילות חו״ל",
      hint: `${all.length} חבילות מכל הספקים, ממוין מהזול.`,
    },
    {
      href: "/compare/cellular",
      label: "השוואת מסלולי סלולר",
      hint: "כולל מסלולים עם גלישה ושיחות בחו״ל.",
    },
    {
      href: `/guides#cat-${encodeURIComponent(CATEGORY_HE[CATEGORY])}`,
      label: "מדריכי גלישה בחו״ל",
      hint: "איך לבחור eSIM ולחסוך בנדידה, לפי יעד.",
    },
    { href: "/providers", label: "כל ספקי התקשורת", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: CollectionPage (with the featured plans as an ItemList)
          + Breadcrumb. Describes only the real plans shown. */}
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} — eSIM ונדידה`,
          description:
            "השוואת חבילות גלישה בחו״ל מכל הספקים — eSIM ונדידה לכל יעד, לפי ימים, נפח גלישה ומחיר.",
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
        <Link href="/" className="underline underline-offset-2 hover:text-accent">
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
          fill. Abroad is priced per-package, so the suffix is the REAL per-unit
          label (לחבילה), never a hardcoded "לחודש". Exactly ONE primary CTA
          (green fill + glow) into the full compare hub + ONE quiet secondary text
          link to the advisor. The featured table below comes from
          <CategoryLanding hideHero> so there is one ink hero + one primary CTA. */}
      <section className="relative isolate mt-6 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            חבילות גלישה בחו״ל
            {minFeatured !== undefined ? (
              <>
                {" "}
                <span className="text-[#4ade80]">
                  מ-{ils(minFeatured)} {minUnitLabel}.
                </span>
              </>
            ) : null}
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
            style={{ animationDelay: "60ms" }}
          >
            השוואה חינמית של חבילות eSIM ונדידה לכל יעד — מחירים בשקלים.
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
              לכל חבילות חו״ל
              <Icon name="chevron" size={18} aria-hidden="true" />
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/book"
              location="category-hero"
              label="consult"
              className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
            >
              או דברו עם יועץ
            </TrackedCtaLink>
          </div>
          {minFeatured !== undefined ? (
            <p
              className="nums-tabular sw-reveal mt-8 text-sm text-white/85"
              style={{ animationDelay: "150ms" }}
            >
              {all.length} חבילות · החל מ-
              <span className="font-display font-bold text-[#4ade80]">
                {ils(minFeatured)}
              </span>{" "}
              {minUnitLabel}
            </p>
          ) : null}
          {/* Quiet, truthful benefit line (parity with the home hero) — a
              qualitative, travel-honest reassurance (abroad is per-package, so no
              monthly-savings claim), no fabricated figure. Sits BELOW the hard
              catalogue count so the real numbers lead the hedge. */}
          <p
            className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            חבילה מתאימה חוסכת בנדידה — וההשוואה חינם
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
          intro="גלישה בחו״ל בלי הפתעות. השוו חבילות eSIM ונדידה לכל יעד — לפי ימים, נפח גלישה ומחיר — והפעילו עוד לפני הטיסה. הטבלה מציגה את החבילות הזולות ביותר בקטלוג, ממוינות מהזול ליקר."
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
