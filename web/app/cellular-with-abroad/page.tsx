// ────────────────────────────────────────────────────────────────────────────
// /cellular-with-abroad — the CELLULAR-WITH-ABROAD subcategory landing. Web-app
// counterpart of the static site/cellular-with-abroad.html: cellular plans that
// BUNDLE roaming / abroad usage (so you don't buy a separate roaming pack). A
// TRUTHFULLY-filtered table by the real `hasAbroad` flag, and a hand-off to the
// parent /compare/cellular hub. Mirrors the static page, adapted to the app's
// components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the table shows only REAL
// catalogue plans flagged `hasAbroad`, ascending by price — nothing fabricated.
// CategoryLanding surfaces the commission disclosure + price caveat next to the
// prices, and the table shows an honest empty state when none match.
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
const TITLE_HE = "מסלולי סלולר עם חו״ל";

/** Cheapest cellular plans that bundle abroad use (real `hasAbroad`), priced first. */
function abroadPlans(limit = 8): Plan[] {
  return plansByCategory(CATEGORY)
    .filter(
      (p): p is Plan => typeof p.price === "number" && p.hasAbroad === true,
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי סלולר עם גלישה בחו״ל — השוואת מחירים",
  description:
    "מסלולי סלולר שכוללים גלישה בחו״ל בחבילה — בלי לקנות חבילת רומינג נפרדת. " +
    "ממוינים מהזול ביותר, כולל המחיר אחרי המבצע. השוו מכל החברות. השוואה חינמית.",
  path: "/cellular-with-abroad",
});

export default function CellularWithAbroadPage() {
  const plans = abroadPlans();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "כולל חו״ל", url: "/cellular-with-abroad" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/compare/abroad", label: "חבילות חו״ל ייעודיות" },
    { href: "/cellular-esim", label: "מסלולי סלולר עם eSIM" },
    { href: "/cellular-5g", label: "מסלולי 5G הזולים" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/compare/abroad", label: "השוואת חבילות חו״ל", hint: "חבילות רומינג ו-eSIM ליעדים נפוצים." },
    { href: "/glossary/roaming", label: "מה זה רומינג?", hint: "הסבר קצר וברור במילון המונחים." },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי סלולר הכוללים גלישה בחו״ל בחבילה — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-with-abroad",
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
        <span className="text-foreground">כולל חו״ל</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי סלולר עם חו״ל
        </h1>
      </header>

      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="מסלולי סלולר שכוללים גלישה או שיחות בחו״ל כחלק מהחבילה — כך אתם נוסעים בלי לקנות חבילת רומינג נפרדת בכל פעם. הטבלה מציגה רק מסלולים שמסומנים בקטלוג ככוללים שימוש בחו״ל, ממוינים מהזול ליקר. בדקו את היעדים והנפח הנכללים מול הספק לפני הנסיעה."
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
