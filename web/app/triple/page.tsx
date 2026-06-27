// ────────────────────────────────────────────────────────────────────────────
// /triple — the TRIPLE (חבילה משולבת) category landing. The web-app counterpart
// of the static site/triple.html: a real intro, a FEATURED table of the cheapest
// plans, onward subcategory links, and a clear hand-off to the full
// /compare/triple hub. Mirrors the static page's content/structure, adapted to
// the app's components + mobile-first, RTL.
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
import { plansByCategory, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  categoryAggregateOfferSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import type { Plan } from "@/lib/types";

const CATEGORY = "triple";
const TITLE_HE = CATEGORY_HE[CATEGORY]; // "חבילה משולבת" (already a full phrase)

/** The cheapest N plans in a category (by headline price), priced first. */
function cheapestPlans(cat: string, limit = 6): Plan[] {
  return plansByCategory(cat)
    .filter((p): p is Plan => typeof p.price === "number")
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "חבילות משולבות (טריפל) — השוואת מחירים",
  description:
    "אינטרנט, טלוויזיה וסלולר בחבילה אחת — לרוב המסלול הכי חסכוני. השוו את כל " +
    "הטריפלים, כולל המחיר אחרי המבצע, ומצאו את החבילה שמתאימה לבית שלכם. השוואה חינמית.",
  path: "/triple",
});

export default function TripleLandingPage() {
  const plans = cheapestPlans(CATEGORY);
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
    { href: `/compare/${CATEGORY}`, label: "כל החבילות המשולבות — טבלה מלאה" },
    { href: "/providers", label: "לפי ספק — כל ספקי החבילות" },
    { href: `/guides#cat-${encodeURIComponent(CATEGORY_HE[CATEGORY])}`, label: "מדריכי חבילה משולבת" },
    { href: "/compare/internet", label: "אינטרנט בנפרד" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל החבילות המשולבות",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    {
      href: "/compare/internet",
      label: "השוואת מסלולי אינטרנט",
      hint: "תשתית + ספק, סיב אופטי עד גיגה.",
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
            "השוואת חבילות משולבות (טריפל) מכל הספקים בישראל — אינטרנט, טלוויזיה וסלולר יחד, כולל המחיר אחרי המבצע.",
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

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          חבילות משולבות
        </h1>
      </header>

      {/* ── Freshness stamp (honest "data as of" date, near the table) ────── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      {/* ── Category landing (intro + featured table + disclosure/caveat +
          /compare hand-off + subcategory links) ───────────────────────────── */}
      <div className="mt-4">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="אינטרנט, טלוויזיה וסלולר בחבילה אחת — לרוב המסלול הכי חסכוני. השוו את כל הטריפלים, כולל המחיר אחרי תקופת המבצע, ומצאו את החבילה שמתאימה לבית שלכם. הטבלה מציגה את החבילות הזולות ביותר בקטלוג, ממוינות מהזול ליקר."
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
