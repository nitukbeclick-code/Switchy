// ────────────────────────────────────────────────────────────────────────────
// /internet-giga — the GIGABIT INTERNET subcategory landing. Web-app counterpart
// of the static site/internet-giga.html: home-internet plans at gigabit speed
// (1000Mb / 1GB and up). A TRUTHFULLY-filtered table (download speed parsed from
// the plan's REAL `מהירות` spec, ≥ 1000Mb) and a hand-off to the parent
// /compare/internet hub. Mirrors the static page, adapted to the app's components
// + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): "giga" is computed ONLY from
// the plan's real download-speed spec — non-fabricating. Speeds are the provider's
// stated "up-to" rate; the copy says so. CategoryLanding surfaces the commission
// disclosure + price caveat, and the table shows an honest empty state if none match.
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
const TITLE_HE = "אינטרנט גיגה";
/** The gigabit threshold in Mbps (1000Mb), shown in copy so the filter is honest. */
const GIGA_MBPS = 1000;

/** Parse the leading download-speed number (Mbps) from a plan's `מהירות` spec. */
function downloadMbps(p: Plan): number {
  const raw = p.specs?.["מהירות"];
  if (typeof raw !== "string") return 0;
  const m = raw.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Cheapest internet plans at gigabit (≥ 1000Mb) download speed, priced first. */
function gigaPlans(limit = 10): Plan[] {
  return plansByCategory(CATEGORY)
    .filter(
      (p): p is Plan =>
        typeof p.price === "number" && downloadMbps(p) >= GIGA_MBPS,
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "אינטרנט גיגה (1000Mb) — השוואת מחירים",
  description:
    "מסלולי אינטרנט במהירות גיגה (1000Mb ומעלה) ממוינים מהזול ביותר — לבתים עם " +
    "הרבה משתמשים כבדים במקביל. השוו מכל הספקים, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/internet-giga",
});

export default function InternetGigaPage() {
  const plans = gigaPlans();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "גיגה", url: "/internet-giga" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי האינטרנט — טבלה מלאה" },
    { href: "/internet-fiber-only", label: "אינטרנט סיב אופטי" },
    { href: "/internet-cable-only", label: "אינטרנט על תשתית כבל" },
    { href: "/internet", label: "עמוד האינטרנט הראשי" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי האינטרנט",
      hint: `${plansByCategory(CATEGORY).length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/internet-fiber-only", label: "אינטרנט סיב אופטי", hint: "התשתית שמספקת מהירות גיגה אמיתית." },
    { href: "/glossary/download-upload-speed", label: "מהירות הורדה והעלאה", hint: "מה באמת אומר המספר במגה־ביט." },
    { href: "/internet", label: "עמוד האינטרנט הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי אינטרנט במהירות גיגה (1000Mb ומעלה) בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/internet-giga",
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
        <span className="text-foreground">גיגה</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          אינטרנט גיגה (1000Mb)
        </h1>
      </header>

      <div className="mt-8">
        <CategoryLanding
          category={CATEGORY}
          titleHe={TITLE_HE}
          intro="מסלולי אינטרנט במהירות גיגה — 1000Mb ומעלה — ממוינים מהזול ליקר. מתאים לבתים עם כמה משתמשים כבדים במקביל, הורדות גדולות וזרימת וידאו ב-4K. הטבלה מציגה רק מסלולים שמהירות ההורדה המוצהרת שלהם בקטלוג היא לפחות 1000Mb. המהירות היא &quot;עד&quot; כפי שמציין הספק — בפועל היא תלויה בתשתית ובכתובת."
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
