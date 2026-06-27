// ────────────────────────────────────────────────────────────────────────────
// /internet — the INTERNET category landing. The web-app counterpart of the
// static site/internet.html: a real intro, a FEATURED table of the cheapest
// plans, onward subcategory links (incl. the real /compare/fiber service axis),
// and a clear hand-off to the full /compare/internet hub. Mirrors the static
// page's content/structure, adapted to the app's components + mobile-first, RTL.
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
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { plansByCategory, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import type { Plan } from "@/lib/types";

const CATEGORY = "internet";
const TITLE_HE = `מסלולי ${CATEGORY_HE[CATEGORY]}`;

/** The cheapest N plans in a category (by headline price), priced first. */
function cheapestPlans(cat: string, limit = 6): Plan[] {
  return plansByCategory(cat)
    .filter((p): p is Plan => typeof p.price === "number")
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי אינטרנט — השוואת חבילות תשתית וספק",
  description:
    "תשתית + ספק, סיב אופטי עד גיגה. השוו את כל חבילות האינטרנט — כולל מחירי " +
    "המבצע ומה קורה אחריו — ובחרו לפי המהירות והמחיר שמתאימים לכם. השוואה חינמית.",
  path: "/internet",
});

export default function InternetLandingPage() {
  const plans = cheapestPlans(CATEGORY);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/${CATEGORY}` },
  ];

  // Onward subcategory links — REAL on-site routes only (no dead-ends).
  // /compare/fiber is a genuine service axis surfacing internet (fiber) plans.
  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי האינטרנט — טבלה מלאה" },
    { href: "/compare/fiber", label: "אינטרנט סיב אופטי" },
    { href: "/providers", label: "לפי ספק — כל חברות האינטרנט" },
    { href: `/guides#cat-${encodeURIComponent(CATEGORY_HE[CATEGORY])}`, label: "מדריכי אינטרנט" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי האינטרנט",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    {
      href: "/compare/triple",
      label: "השוואת חבילות משולבות",
      hint: "אינטרנט, טלוויזיה וסלולר בחבילה אחת — לרוב חסכוני יותר.",
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
            "השוואת מסלולי אינטרנט מכל הספקים בישראל — תשתית וספק, סיב אופטי עד גיגה, כולל המחיר אחרי המבצע.",
          url: `/${CATEGORY}`,
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
        <span className="text-foreground">{CATEGORY_HE[CATEGORY]}</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי אינטרנט
        </h1>
      </header>

      {/* ── Category landing (intro + featured table + disclosure/caveat +
          /compare hand-off + subcategory links) ───────────────────────────── */}
      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="תשתית + ספק, סיב אופטי עד גיגה. השוו את כל חבילות האינטרנט — כולל מחירי המבצע ומה קורה אחריו — ובחרו לפי המהירות והמחיר שמתאימים לכם. הטבלה מציגה את המסלולים הזולים ביותר בקטלוג, ממוינים מהזול ליקר."
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
