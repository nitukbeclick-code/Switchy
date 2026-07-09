// ────────────────────────────────────────────────────────────────────────────
// /internet-mid — the MID-RANGE HOME-INTERNET subcategory landing. Web-app
// counterpart of the static site/internet-mid.html: home-internet plans priced
// ₪80–₪120/mo. A TRUTHFULLY-filtered table (80 < offer price ≤ 120) and a hand-off
// to the parent /compare/internet hub. Mirrors the static page, adapted to the
// app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue plans inside the stated price band, ascending by price — nothing
// fabricated. The band is stated in the copy so the filter is transparent.
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

const CATEGORY = "internet";
const TITLE_HE = "אינטרנט ביתי עד ₪120";
/** The stated price band (₪/mo), shown in the copy so the filter is honest. */
const BAND_MIN = 80;
const BAND_MAX = 120;

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** The advertised offer price, preferring the exact figure (mirrors build.js offerPrice). */
function offerPrice(p: Plan): number {
  const exact = typeof p.priceExact === "number" ? p.priceExact : null;
  return exact ?? p.price;
}

/** Whether an internet plan's offer price sits inside the ₪80–₪120 band. */
function isMid(p: Plan): boolean {
  if (typeof p.price !== "number") return false;
  const op = offerPrice(p);
  return op > BAND_MIN && op <= BAND_MAX;
}

/** Cheapest internet plans inside the ₪80–₪120 band, priced first. */
function midPlans(all: Plan[], limit = 15): Plan[] {
  return all
    .filter((p): p is Plan => isMid(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "אינטרנט ביתי עד ₪120 לחודש — השוואת מחירים",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (₪80–₪120) plans
  // the page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isMid),
    }) ??
    "מסלולי אינטרנט ביתי בטווח ₪80–₪120 לחודש — בדרך כלל מהירות 500–1000Mbps. " +
      "ממוינים מהזול ביותר, מחירים מעודכנים מכל החברות. השוואה חינמית.",
  path: "/internet-mid",
});

export default async function InternetMidPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = midPlans(all);
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
    { name: "עד ₪120", url: "/internet-mid" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי האינטרנט — טבלה מלאה" },
    { href: "/internet-budget", label: "אינטרנט ביתי עד ₪80" },
    { href: "/internet-giga", label: "אינטרנט גיגה (1000Mb)" },
    { href: "/internet-fiber-only", label: "אינטרנט סיב אופטי" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי האינטרנט",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/internet-budget", label: "אינטרנט ביתי עד ₪80", hint: "התקרה הנמוכה יותר — לתקציב הקטן." },
    { href: "/internet-giga", label: "אינטרנט גיגה (1000Mb)", hint: "מהירות מקסימלית לבתים עמוסים." },
    { href: "/internet", label: "עמוד האינטרנט הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי אינטרנט ביתי בטווח ₪80–₪120 לחודש בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/internet-mid",
          plans,
        })}
      />
      {/* Category AggregateOffer — a single "prices range ₪low–₪high across N
          plans" node for the featured set, in ILS, stamped with the real
          catalogue month. Omitted when no plan is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/compare/${CATEGORY}`} className="underline underline-offset-2 hover:text-accent">
          {CATEGORY_HE[CATEGORY]}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">עד ₪120</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          אינטרנט ביתי עד ₪120
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
          intro="טווח ₪80–₪120 מציע בדרך כלל מהירות גבוהה ויציבה לבית עם כמה משתמשים. הטבלה מציגה רק מסלולי אינטרנט שמחירם בקטלוג נופל בטווח הזה, ממוינים מהזול ליקר. בדקו גם את המחיר אחרי תקופת המבצע ואת עלות הנתב/התשתית, שלעיתים מתווספת בנפרד."
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
