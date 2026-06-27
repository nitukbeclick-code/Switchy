// ────────────────────────────────────────────────────────────────────────────
// /cellular-5g — the 5G CELLULAR subcategory landing. Web-app counterpart of the
// static site/cellular-5g.html: an intro, a TRUTHFULLY-filtered table of the
// cheapest 5G plans (filtered by the real `is5G` flag), and a clear hand-off to
// the parent /compare/cellular hub. Mirrors the static page, adapted to the app's
// components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): the featured table is the
// cheapest REAL 5G plans from the catalogue — nothing fabricated. CategoryLanding
// surfaces the commission disclosure + price caveat next to the prices. When no
// 5G plan exists the table renders an honest empty state linking to /compare.
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
const TITLE_HE = "מסלולי 5G";

/** Cheapest REAL 5G cellular plans (by headline price), priced first. */
function cheapest5G(limit = 8): Plan[] {
  return plansByCategory(CATEGORY)
    .filter((p): p is Plan => typeof p.price === "number" && p.is5G === true)
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי 5G הזולים ביותר — השוואת מחירים",
  description:
    "כל מסלולי ה-5G בשוק במקום אחד, ממוינים מהזול ביותר. מהירות וכיסוי משופרים — " +
    "לרוב במחיר של מסלול רגיל. השוו מחירים מכל החברות, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/cellular-5g",
});

export default function Cellular5gPage() {
  const plans = cheapest5G();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: TITLE_HE, url: "/cellular-5g" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-with-abroad", label: "מסלולי סלולר עם חו״ל" },
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
    { href: "/cellular-esim", label: "מסלולי סלולר עם eSIM" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
    { href: "/glossary/5g", label: "מה זה 5G?", hint: "הסבר קצר וברור במילון המונחים." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "השוואת מסלולי 5G מכל החברות בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-5g",
          plans,
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href={`/compare/${CATEGORY}`} className="hover:text-accent">
          {CATEGORY_HE[CATEGORY]}
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">5G</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי 5G הזולים ביותר
        </h1>
      </header>

      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="כל מסלולי ה-5G בשוק במקום אחד, ממוינים מהזול ביותר. הרשת החדשה מציעה מהירות גלישה וכיסוי משופרים — ולרוב במחיר של מסלול רגיל. הטבלה מציגה רק מסלולים שמסומנים 5G בקטלוג, ממוינים מהזול ליקר, כולל המחיר אחרי תקופת המבצע."
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
