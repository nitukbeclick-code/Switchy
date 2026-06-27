// ────────────────────────────────────────────────────────────────────────────
// /internet-cable-only — the CABLE / COPPER INTERNET subcategory landing. Web-app
// counterpart of the static site/internet-cable-only.html: home-internet plans on
// the legacy cable / copper (HFC / נחושת) infrastructure rather than fiber. A
// TRUTHFULLY-filtered table (cable/copper detected from the plan's REAL catalogue
// text) and a hand-off to the parent /compare/internet hub. Mirrors the static
// page, adapted to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): cable/copper is detected ONLY
// from the plan's catalogue text (נחושת / כבל / דאבל / cable / DOCSIS) — non-
// fabricating. CategoryLanding surfaces the commission disclosure + price caveat,
// and the table shows an honest empty state (→ /compare) when none match. The copy
// points fiber-eligible users to the fiber page, since fiber is usually superior.
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

const CATEGORY = "internet";
const TITLE_HE = "אינטרנט על תשתית כבל";

/** A searchable blob of a plan's REAL descriptive fields (name/specs/feats/fine). */
function planBlob(p: Plan): string {
  return JSON.stringify({
    plan: p.plan,
    specs: p.specs ?? null,
    feats: (p as Record<string, unknown>).feats ?? null,
    fineLines: (p as Record<string, unknown>).fineLines ?? null,
  });
}

/** Marked as copper / cable (HFC) in the catalogue text. */
function isCopperOrCable(p: Plan): boolean {
  return /נחושת|כבל|cable|דאבל|docsis/i.test(planBlob(p));
}

/** Cheapest cable/copper internet plans, priced first. */
function cablePlans(limit = 10): Plan[] {
  return plansByCategory(CATEGORY)
    .filter((p): p is Plan => typeof p.price === "number" && isCopperOrCable(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "אינטרנט על תשתית כבל / נחושת — השוואת מחירים",
  description:
    "מסלולי אינטרנט ביתי על תשתית הכבל והנחושת (HFC) — חלופה זמינה היכן שאין סיב. " +
    "ממוינים מהזול ביותר, כולל המחיר אחרי המבצע. השוו מכל הספקים. השוואה חינמית.",
  path: "/internet-cable-only",
});

export default function InternetCableOnlyPage() {
  const plans = cablePlans();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "כבל", url: "/internet-cable-only" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי האינטרנט — טבלה מלאה" },
    { href: "/internet-fiber-only", label: "אינטרנט סיב אופטי" },
    { href: "/internet-giga", label: "אינטרנט גיגה (1000Mb)" },
    { href: "/internet", label: "עמוד האינטרנט הראשי" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי האינטרנט",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/internet-fiber-only", label: "אינטרנט סיב אופטי", hint: "מהירות ויציבות גבוהות — אם יש סיב בכתובת." },
    { href: "/internet-giga", label: "אינטרנט גיגה", hint: "מסלולים במהירות 1000Mb ומעלה." },
    { href: "/internet", label: "עמוד האינטרנט הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי אינטרנט ביתי על תשתית כבל / נחושת (HFC) בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/internet-cable-only",
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
        <span className="text-foreground">כבל</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          אינטרנט על תשתית כבל
        </h1>
      </header>

      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="מסלולי אינטרנט ביתי על תשתית הכבל והנחושת (HFC) — חלופה זמינה ונפוצה כמעט בכל הארץ, במיוחד היכן שעדיין אין פריסת סיב. הטבלה מציגה רק מסלולים שמסומנים בקטלוג כתשתית כבל/נחושת, ממוינים מהזול ליקר. אם יש סיב אופטי בכתובת שלכם — לרוב כדאי להעדיף אותו לטובת מהירות ויציבות גבוהות יותר."
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
