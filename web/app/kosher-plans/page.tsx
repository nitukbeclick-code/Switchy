// ────────────────────────────────────────────────────────────────────────────
// /kosher-plans — the KOSHER (מסלול כשר) subcategory landing. Web-app counterpart
// of the static site/kosher-plans.html: supervised "kosher line" cellular plans.
// A TRUTHFULLY-filtered table (by the real `kind === "kosher"` flag) and a hand-
// off to the parent /compare/cellular hub. Mirrors the static page, adapted to the
// app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue plans whose `kind` is "kosher", ascending by price — nothing
// fabricated. CategoryLanding surfaces the commission disclosure + price caveat,
// and the table shows an honest empty state (→ /compare) when none match. The copy
// notes that the exact level of supervision should be verified with the provider.
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
const TITLE_HE = "מסלולים כשרים";

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** A priced kosher (supervised) plan. */
function isKosher(p: Plan): boolean {
  return typeof p.price === "number" && p.kind === "kosher";
}

/** Cheapest kosher (supervised) plans, priced first. */
function kosherPlans(all: Plan[], limit = 8): Plan[] {
  return all
    .filter((p): p is Plan => isKosher(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולים כשרים — השוואת מחירים מלאה",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (kosher) plans the
  // page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isKosher),
    }) ??
    "מסלולי סלולר כשרים בפיקוח — ממוינים מהזול ביותר. השוו מחירים ותנאים מכל " +
      "החברות במקום אחד, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/kosher-plans",
});

export default async function KosherPlansPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = kosherPlans(all);
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
    { name: "כשר", url: "/kosher-plans" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
    { href: "/plans-no-commitment", label: "מסלולים ללא התחייבות" },
    { href: "/glossary/kosher-line", label: "מה זה קו כשר?" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/glossary/kosher-line", label: "מה זה קו כשר?", hint: "הסבר קצר וברור במילון המונחים." },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי סלולר כשרים בפיקוח בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/kosher-plans",
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
        <span className="text-foreground">כשר</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולים כשרים
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
          intro="מסלולי סלולר כשרים — קווים בפיקוח עם חסימת תכנים, ללא גישה לאינטרנט פתוח, באישור ועדת הרבנים לענייני תקשורת. הטבלה מציגה רק מסלולים שמסומנים כ&quot;כשר&quot; בקטלוג, ממוינים מהזול ליקר. רמת הפיקוח והחסימות המדויקת משתנה בין הספקים — כדאי לוודא את התנאים מול הספק לפני מעבר."
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
