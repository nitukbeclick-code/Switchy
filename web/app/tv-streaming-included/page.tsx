// ────────────────────────────────────────────────────────────────────────────
// /tv-streaming-included — the TV-WITH-STREAMING subcategory landing. Web-app
// counterpart of the static site/tv-streaming-included.html: TV bundles that
// include a streaming service (Netflix / HBO Max / Disney+ …) in the package. A
// TRUTHFULLY-filtered table (a real feature bullet matches Netflix/HBO/Disney/Max)
// and a hand-off to the parent /compare/tv hub. Mirrors the static page, adapted
// to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue TV plans whose own `feats` name a bundled streaming service,
// ascending by price — nothing fabricated. CategoryLanding surfaces the
// commission disclosure + price caveat, and the table shows an honest empty
// state when none match.
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

const CATEGORY = "tv";
const TITLE_HE = "טלוויזיה עם סטרימינג כלול";

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** Whether a TV plan's own feature bullets name a bundled streaming service. */
function hasStreaming(p: Plan): boolean {
  if (typeof p.price !== "number") return false;
  return (p.feats ?? []).some((f) => /netflix|hbo|disney|max/i.test(f));
}

/** Cheapest TV bundles that include a streaming service, priced first. */
function streamingPlans(all: Plan[], limit = 10): Plan[] {
  return all
    .filter((p): p is Plan => hasStreaming(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "חבילות טלוויזיה עם Netflix / HBO Max / Disney+ כלולים",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (סטרימינג כלול)
  // plans the page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(hasStreaming),
    }) ??
    "חבילות טלוויזיה שכוללות Netflix, HBO Max, Disney+ או שירות סטרימינג אחר בחבילה — " +
      "ממוינות מהזול ביותר, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/tv-streaming-included",
});

export default async function TvStreamingIncludedPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = streamingPlans(all);
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
    { name: "סטרימינג כלול", url: "/tv-streaming-included" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל חבילות הטלוויזיה — טבלה מלאה" },
    { href: "/triple-budget", label: "חבילה משולבת עד ₪160" },
    { href: "/tv", label: "עמוד הטלוויזיה הראשי" },
    { href: "/guides", label: "מדריכי טלוויזיה וסטרימינג" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל חבילות הטלוויזיה",
      hint: `${all.length} חבילות מכל הספקים, ממוין מהזול.`,
    },
    { href: "/triple-budget", label: "חבילה משולבת עד ₪160", hint: "טלוויזיה יחד עם אינטרנט וסלולר." },
    { href: "/tv", label: "עמוד הטלוויזיה הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/guides", label: "מדריכי טלוויזיה", hint: "מתי שווה לחתוך את הכבלים לטובת סטרימינג." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "חבילות טלוויזיה הכוללות שירות סטרימינג (Netflix / HBO Max / Disney+) בישראל — ממוינות מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/tv-streaming-included",
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
        <span className="text-foreground">סטרימינג כלול</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת חבילות
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          טלוויזיה עם סטרימינג כלול
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
          intro="למה לשלם בנפרד על Netflix או HBO Max? הטבלה מציגה רק חבילות טלוויזיה שמסומנות בקטלוג ככוללות שירות סטרימינג בחבילה, ממוינות מהזול ליקר. בדקו אילו שירותים בדיוק כלולים ובאיזו רמת מנוי מול הספק — לעיתים מדובר במנוי בסיסי או לתקופה מוגבלת."
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
