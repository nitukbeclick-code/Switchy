// ────────────────────────────────────────────────────────────────────────────
// /cellular-5g — the 5G CELLULAR subcategory landing. Web-app counterpart of the
// static site/cellular-5g.html: an intro, a TRUTHFULLY-filtered table of the
// cheapest 5G plans (filtered by the real `is5G` flag), and a clear hand-off to
// the parent /compare/cellular hub. Mirrors the static page, adapted to the app's
// components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the featured table is the
// cheapest REAL 5G plans from the catalogue — nothing fabricated. CategoryLanding
// surfaces the commission disclosure + price caveat next to the prices. When no
// 5G plan exists the table renders an honest empty state linking to /compare.
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

const CATEGORY = "cellular";
const TITLE_HE = "מסלולי 5G";

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** Whether a plan is a REAL 5G cellular plan. */
function is5GPlan(p: Plan): boolean {
  return typeof p.price === "number" && p.is5G === true;
}

/** Cheapest REAL 5G cellular plans (by headline price), priced first. */
function cheapest5G(all: Plan[], limit = 8): Plan[] {
  return all
    .filter((p): p is Plan => is5GPlan(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי 5G הזולים ביותר — השוואת מחירים",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (5G-only) plans the
  // page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(is5GPlan),
    }) ??
    "כל מסלולי ה-5G בשוק במקום אחד, ממוינים מהזול ביותר. מהירות וכיסוי משופרים — " +
      "לרוב במחיר של מסלול רגיל. השוו מחירים מכל החברות, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/cellular-5g",
});

export default async function Cellular5gPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = cheapest5G(all);
  // Catalogue-derived entry price for the flat-ink hero's green VALUE clause — the
  // lowest headline price among the SAME featured (5G-only) `plans` this page and
  // CategoryLanding render, so the figures can never disagree. The count band uses
  // the 5G-plan count (real, filtered) — not the whole category. Undefined ⇒ no
  // fabricated number shown.
  const pricedFeatured = plans.filter((p) => typeof p.price === "number");
  const minFeatured = pricedFeatured.length
    ? Math.min(...pricedFeatured.map((p) => p.price))
    : undefined;
  const total5G = all.filter(is5GPlan).length;
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
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: TITLE_HE, url: "/cellular-5g" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-with-abroad", label: "מסלולי סלולר עם חו״ל" },
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
    { href: "/cellular-esim", label: "מסלולי סלולר עם eSIM" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
    { href: "/glossary/5g", label: "מה זה 5G?", hint: "הסבר קצר וברור במילון המונחים." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "השוואת מסלולי 5G מכל החברות בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-5g",
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
        <Link href={`/compare/${CATEGORY}`} className="underline underline-offset-2 hover:text-accent">
          {CATEGORY_HE[CATEGORY]}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">5G</span>
      </nav>

      {/* ── Flat-ink hero panel ───────────────────────────────────────────────
          The bank-grade page hero (mirrors app/page.tsx): a solid deep-ink panel
          (#111827 in BOTH themes, so white-on-ink always holds) with the page
          <h1> set directly on it — NO photo/video behind. Green is applied ONLY
          to the catalogue-derived entry-price clause (VALUE). The primary CTA
          hands off to the PARENT /compare/cellular hub (this is a subcategory);
          ONE quiet secondary text link to the advisor. The featured 5G table
          below comes from <CategoryLanding hideHero> so there is a single ink
          hero + single primary CTA per view. */}
      <section className="relative isolate mt-6 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            מסלולי 5G הזולים ביותר
            {minFeatured !== undefined ? (
              <>
                {" "}
                <span className="text-[#4ade80]">מ-{ils(minFeatured)} לחודש.</span>
              </>
            ) : null}
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
            style={{ animationDelay: "60ms" }}
          >
            השוואה חינמית של כל מסלולי ה-5G בישראל — כולל המחיר שאחרי המבצע.
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
              לכל מסלולי הסלולר
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
          {minFeatured !== undefined && total5G > 0 ? (
            <p
              className="sw-reveal mt-8 text-sm text-white/85"
              style={{ animationDelay: "150ms" }}
            >
              {total5G} מסלולי 5G · החל מ-
              <span className="font-display font-bold text-[#4ade80]">
                {ils(minFeatured)}
              </span>{" "}
              לחודש
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Freshness stamp (honest "data as of" date, near the table) ────── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      {/* ── Category landing (intro + featured 5G table + disclosure/caveat +
          /compare hand-off + subcategory links). hideHero: the flat-ink hero +
          the page <h1> live above, so this starts at the disclosure/table. ──── */}
      <div className="mt-4">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          hideHero
          intro="כל מסלולי ה-5G בשוק במקום אחד, ממוינים מהזול ביותר. הרשת החדשה מציעה מהירות גלישה וכיסוי משופרים — ולרוב במחיר של מסלול רגיל. הטבלה מציגה רק מסלולים שמסומנים 5G בקטלוג, ממוינים מהזול ליקר, כולל המחיר אחרי תקופת המבצע."
          plans={plans}
          subcats={subcats}
        />
      </div>

      <RelatedAuthorityPages
        heading="עמודים קשורים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
