// ────────────────────────────────────────────────────────────────────────────
// /triple-budget — the BUDGET TRIPLE-BUNDLE subcategory landing. Web-app
// counterpart of the static site/triple-budget.html: combined (triple) bundles —
// internet + TV + cellular — priced at or below ₪160/mo. A TRUTHFULLY-filtered
// table (offer price ≤ 160) and a hand-off to the parent /compare/triple hub.
// Mirrors the static page, adapted to the app's components + mobile-first, RTL.
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

const CATEGORY = "triple";
const TITLE_HE = "חבילה משולבת עד ₪160";
/** The stated budget ceiling (₪/mo). Shown in the copy so the filter is honest. */
const BUDGET_MAX = 160;

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** The advertised offer price, preferring the exact figure (mirrors build.js offerPrice). */
function offerPrice(p: Plan): number {
  const exact = typeof p.priceExact === "number" ? p.priceExact : null;
  return exact ?? p.price;
}

/** Whether a triple-bundle plan's offer price is at or below {@link BUDGET_MAX}. */
function isBudget(p: Plan): boolean {
  return typeof p.price === "number" && offerPrice(p) <= BUDGET_MAX;
}

/** Cheapest triple bundles at or below {@link BUDGET_MAX}, priced first. */
function budgetPlans(all: Plan[], limit = 10): Plan[] {
  return all
    .filter((p): p is Plan => isBudget(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "חבילה משולבת (טריפל) עד ₪160 לחודש",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (≤₪160) plans the
  // page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isBudget),
    }) ??
    "חבילות משולבות (טריפל: אינטרנט + טלוויזיה + סלולר) עד ₪160 לחודש — " +
      "ממוינות מהזול ביותר, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/triple-budget",
});

export default async function TripleBudgetPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = budgetPlans(all);
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
    { name: "עד ₪160", url: "/triple-budget" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל החבילות המשולבות — טבלה מלאה" },
    { href: "/internet-budget", label: "אינטרנט ביתי עד ₪80" },
    { href: "/tv-streaming-included", label: "טלוויזיה עם סטרימינג כלול" },
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל החבילות המשולבות",
      hint: `${all.length} חבילות מכל הספקים, ממוין מהזול.`,
    },
    { href: "/internet-budget", label: "אינטרנט ביתי עד ₪80", hint: "להרכבת חבילה משלכם בנפרד." },
    { href: "/tv-streaming-included", label: "טלוויזיה עם סטרימינג כלול", hint: "מה כלול בחלק הטלוויזיה." },
    { href: "/triple", label: "עמוד החבילות המשולבות", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "חבילות משולבות (טריפל) עד ₪160 לחודש בישראל — ממוינות מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/triple-budget",
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
        <span className="text-foreground">עד ₪160</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת חבילות
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          חבילה משולבת עד ₪160
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
          intro="חבילה משולבת זולה לא חייבת לגרוע מהשירות. הטבלה מציגה את כל החבילות המשולבות (אינטרנט + טלוויזיה + סלולר) שעולות עד ₪160 לחודש, ממוינות מהזול ליקר — כולן נמשכות ישירות מהקטלוג. בדקו מה בדיוק כלול בכל חבילה ואת המחיר אחרי תקופת המבצע מול הספק."
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
