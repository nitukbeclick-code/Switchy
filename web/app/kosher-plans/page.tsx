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
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { plansByCategory, CATEGORY_HE } from "@/lib/data";
import { collectionPageSchema, breadcrumbSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import type { Plan } from "@/lib/types";

const CATEGORY = "cellular";
const TITLE_HE = "מסלולים כשרים";

/** Cheapest kosher (supervised) plans, priced first. */
function kosherPlans(limit = 8): Plan[] {
  return plansByCategory(CATEGORY)
    .filter((p): p is Plan => typeof p.price === "number" && p.kind === "kosher")
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולים כשרים — השוואת מחירים מלאה",
  description:
    "מסלולי סלולר כשרים בפיקוח — ממוינים מהזול ביותר. השוו מחירים ותנאים מכל " +
    "החברות במקום אחד, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/kosher-plans",
});

export default function KosherPlansPage() {
  const plans = kosherPlans();

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
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
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

      <div className="mt-8">
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
