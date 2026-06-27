// ────────────────────────────────────────────────────────────────────────────
// /cellular-mid-range — the MID-RANGE CELLULAR subcategory landing. Web-app
// counterpart of the static site/cellular-mid-range.html: the "middle field" that
// balances budget and headroom. A TRUTHFULLY-filtered table of cellular plans in
// a stated price band (₪41–₪79/mo), and a hand-off to /compare/cellular. Mirrors
// the static page, adapted to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue plans inside the stated band, ascending by price — nothing fabricated.
// The band is stated in the copy so the filter is transparent. CategoryLanding
// surfaces the commission disclosure + price caveat next to the prices.
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
import { pageMetadata } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import type { Plan } from "@/lib/types";

const CATEGORY = "cellular";
const TITLE_HE = "מסלולי סלולר בטווח הביניים";
/** The stated price band (₪/mo), shown in the copy so the filter is honest. */
const BAND_MIN = 41;
const BAND_MAX = 79;

/** Cellular plans inside the {@link BAND_MIN}–{@link BAND_MAX} band, priced first. */
function midRangePlans(limit = 8): Plan[] {
  return plansByCategory(CATEGORY)
    .filter(
      (p): p is Plan =>
        typeof p.price === "number" &&
        p.price >= BAND_MIN &&
        p.price <= BAND_MAX,
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי סלולר בטווח הביניים — ₪41–₪79",
  description:
    "מסלולי סלולר בטווח המחיר ₪41–₪79 — שדה האמצע שמאזן תקציב ואיכות. גב גדול, " +
    "מהירות טובה ומחיר הגיוני. השוו מחירים מכל החברות, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/cellular-mid-range",
});

export default function CellularMidRangePage() {
  const plans = midRangePlans();
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
    { name: "טווח ביניים", url: "/cellular-mid-range" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
    { href: "/cellular-5g", label: "מסלולי 5G הזולים" },
    { href: "/cellular-with-abroad", label: "מסלולי סלולר עם חו״ל" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/cellular-budget", label: "מסלולים תקציביים", hint: "עד ₪40 לחודש." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי סלולר בטווח הביניים בישראל — ₪41–₪79 לחודש, ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-mid-range",
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
        <span className="text-foreground">טווח ביניים</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי סלולר בטווח הביניים
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
          intro="שדה האמצע של הסלולר — מסלולים בטווח ₪41–₪79 לחודש שמאזנים תקציב מול נפח גלישה, מהירות ותנאים. הטבלה מציגה רק מסלולים מהקטלוג בתוך טווח המחיר הזה, ממוינים מהזול ליקר, כולל המחיר אחרי תקופת המבצע."
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
