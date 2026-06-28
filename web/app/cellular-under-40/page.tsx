// ────────────────────────────────────────────────────────────────────────────
// /cellular-under-40 — the UNDER-₪40 CELLULAR subcategory landing. Web-app
// counterpart of the static site/cellular-under-40.html: the cheapest cellular
// plans at or below ₪40/mo. A TRUTHFULLY-filtered table (offer price ≤ 40) and a
// hand-off to the parent /compare/cellular hub. Mirrors the static page, adapted
// to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue plans at or below the stated threshold, ascending by price — nothing
// fabricated. The threshold is stated in the copy so the filter is transparent.
// CategoryLanding surfaces the commission disclosure + price caveat by the prices.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import CategoryLanding from "@/components/CategoryLanding";
import FreshnessBadge from "@/components/FreshnessBadge";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
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
const TITLE_HE = "מסלולי סלולר עד ₪40";
/** The stated budget ceiling (₪/mo). Shown in the copy so the filter is honest. */
const BUDGET_MAX = 40;

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** The advertised offer price, preferring the exact figure (mirrors build.js offerPrice). */
function offerPrice(p: Plan): number {
  const exact = typeof p.priceExact === "number" ? p.priceExact : null;
  return exact ?? p.price;
}

/** Whether a cellular plan's offer price is at or below {@link BUDGET_MAX}. */
function isUnder40(p: Plan): boolean {
  return typeof p.price === "number" && offerPrice(p) <= BUDGET_MAX;
}

/** Cheapest cellular plans at or below {@link BUDGET_MAX}, priced first. */
function under40Plans(all: Plan[], limit = 20): Plan[] {
  return all
    .filter((p): p is Plan => isUnder40(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי סלולר עד ₪40 לחודש — הזולים בישראל",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (≤₪40) plans the
  // page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isUnder40),
    }) ??
    "מסלולי סלולר עד ₪40 לחודש — הזולים ביותר בשוק הישראלי, ממוינים מהזול ביותר. " +
      "גלישה, שיחות ו-SMS בלי לשלם הרבה, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/cellular-under-40",
});

export default async function CellularUnder40Page() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = under40Plans(all);
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
    { name: "עד ₪40", url: "/cellular-under-40" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-budget", label: "מסלולי סלולר מתחת ל-₪30" },
    { href: "/cellular-mid-range", label: "מסלולי סלולר ₪30–₪60" },
    { href: "/plans-no-commitment", label: "מסלולים ללא התחייבות" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/cellular-budget", label: "מסלולי סלולר מתחת ל-₪30", hint: "התקרה הנמוכה ביותר — לתקציב הקטן." },
    { href: "/cellular-5g", label: "מסלולי 5G הזולים", hint: "הדור החדש, לרוב במחיר של מסלול רגיל." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי הסלולר הזולים ביותר בישראל — עד ₪40 לחודש, ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-under-40",
          plans,
        })}
      />
      {/* Category AggregateOffer — a single "prices range ₪low–₪high across N
          plans" node for the featured set, in ILS, stamped with the real
          catalogue month. Omitted when no plan is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/compare/${CATEGORY}`} className="hover:text-accent">
          {CATEGORY_HE[CATEGORY]}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">עד ₪40</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי סלולר עד ₪40
        </h1>
      </header>

      {/* ── Freshness stamp (honest "data as of" date, near the table) ────── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      <div className="mt-4">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="חוסכים בסלולר? הטבלה מציגה את כל מסלולי הסלולר שעולים עד ₪40 לחודש, ממוינים מהזול ליקר — כולם נמשכים ישירות מהקטלוג ועומדים בתקרת המחיר הזו. לרוב כוללים שיחות ו-SMS ללא הגבלה. שימו לב גם למחיר אחרי תקופת המבצע — לעיתים מסלול זול עולה בהמשך."
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
