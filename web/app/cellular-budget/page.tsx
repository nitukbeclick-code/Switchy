// ────────────────────────────────────────────────────────────────────────────
// /cellular-budget — the BUDGET CELLULAR subcategory landing. Web-app counterpart
// of the static site/cellular-budget.html: an intro, a TRUTHFULLY-filtered table
// of the cheapest cellular plans under a stated price threshold (≤ ₪40/mo), and a
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
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { plansByCategory, CATEGORY_HE } from "@/lib/data";
import { collectionPageSchema, breadcrumbSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import type { Plan } from "@/lib/types";

const CATEGORY = "cellular";
const TITLE_HE = "מסלולי סלולר תקציביים";
/** The stated budget ceiling (₪/mo). Shown in the copy so the filter is honest. */
const BUDGET_MAX = 40;

/** Cheapest cellular plans at or below {@link BUDGET_MAX}, priced first. */
function budgetPlans(limit = 8): Plan[] {
  return plansByCategory(CATEGORY)
    .filter(
      (p): p is Plan => typeof p.price === "number" && p.price <= BUDGET_MAX,
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי סלולר תקציביים — עד ₪40 לחודש",
  description:
    "מסלולי הסלולר הזולים ביותר — עד ₪40 לחודש, ממוינים מהזול ביותר. " +
    "מחירים מעודכנים מכל החברות, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/cellular-budget",
});

export default function CellularBudgetPage() {
  const plans = budgetPlans();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "תקציבי", url: "/cellular-budget" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-mid-range", label: "מסלולי סלולר בטווח הביניים" },
    { href: "/cellular-5g", label: "מסלולי 5G הזולים" },
    { href: "/plans-no-commitment", label: "מסלולים ללא התחייבות" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/street-prices", label: "מחירי רחוב אמיתיים", hint: "מה משלמים בפועל, לא רק מחירון." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי הסלולר הזולים ביותר בישראל — עד ₪40 לחודש, ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-budget",
          plans,
        })}
      />
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
        <span className="text-foreground">תקציבי</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי סלולר תקציביים
        </h1>
      </header>

      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="מסלולי הסלולר הזולים ביותר במקום אחד — עד ₪40 לחודש, ממוינים מהזול ליקר. כל המסלולים בטבלה נמשכים ישירות מהקטלוג ועומדים בתקרת המחיר הזו. שימו לב גם למחיר אחרי תקופת המבצע — לעיתים מסלול זול עולה בהמשך."
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
