// ────────────────────────────────────────────────────────────────────────────
// /cellular-esim — the eSIM CELLULAR subcategory landing. Web-app counterpart of
// the static site/cellular-esim.html: an intro, a TRUTHFULLY-filtered table of
// cellular plans that explicitly state eSIM support in their catalogue features /
// fine-print, and a hand-off to the parent /compare/cellular hub. Mirrors the
// static page, adapted to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): there is no boolean "eSIM"
// flag in the catalogue, so we detect it ONLY from a plan's REAL `feats`/
// `fineLines` text (not from an eSIM *fee* alone) — conservative and non-
// fabricating. CategoryLanding surfaces the commission disclosure + price caveat
// next to the prices, and the table shows an honest empty state when none match.
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
const TITLE_HE = "מסלולי סלולר עם eSIM";

/** Whether a plan EXPLICITLY states eSIM support in its features / fine-print. */
function statesEsim(p: Plan): boolean {
  const feats = Array.isArray(p.feats) ? (p.feats as unknown[]) : [];
  const fineLines = Array.isArray(p.fineLines)
    ? (p.fineLines as unknown[])
    : [];
  return [...feats, ...fineLines].some(
    (t) => typeof t === "string" && /e[-\s]?sim/i.test(t),
  );
}

/** Cheapest cellular plans that explicitly state eSIM support, priced first. */
function esimPlans(limit = 8): Plan[] {
  return plansByCategory(CATEGORY)
    .filter((p): p is Plan => typeof p.price === "number" && statesEsim(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "מסלולי סלולר עם eSIM בישראל — השוואת מחירים",
  description:
    "מסלולי סלולר ישראליים התומכים ב-eSIM — ללא SIM פיזי, מתאים לאייפון ולאנדרואיד " +
    "תואם eSIM. ממוינים מהזול ביותר, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/cellular-esim",
});

export default function CellularEsimPage() {
  const plans = esimPlans();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "eSIM", url: "/cellular-esim" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
    { href: "/cellular-5g", label: "מסלולי 5G הזולים" },
    { href: "/cellular-with-abroad", label: "מסלולי סלולר עם חו״ל" },
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/glossary/esim", label: "מה זה eSIM?", hint: "הסבר קצר וברור במילון המונחים." },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/providers", label: "כל ספקי הסלולר", hint: "מספר מסלולים ומחיר התחלתי לכל ספק." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי סלולר התומכים ב-eSIM בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/cellular-esim",
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
        <span className="text-foreground">eSIM</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולי סלולר עם eSIM
        </h1>
      </header>

      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="מסלולי סלולר ישראליים התומכים ב-eSIM — כרטיס SIM דיגיטלי ללא רכיב פיזי, שמתאים לאייפון ולמכשירי אנדרואיד תואמי eSIM. הטבלה כוללת רק מסלולים שבהם תמיכת ה-eSIM מצוינת במפורש בפרטי המסלול בקטלוג, ממוינים מהזול ליקר. כדאי לוודא תאימות והנפקה מול הספק לפני מעבר."
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
