// ────────────────────────────────────────────────────────────────────────────
// /5g-vs-4g — the "5G מול 4G בסלולר" comparison landing. Web-app counterpart of
// the static site/5g-vs-4g.html: a concise, truth-only comparison of the two
// network generations, backed by TWO real catalogue slices of cellular plans —
// the cheapest 5G plans (real `is5G` flag) and the cheapest non-5G ("4G") plans.
// Hands off to the parent /compare/cellular hub. Mirrors the static page, adapted
// to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): both tables show only REAL
// catalogue plans, split solely by the plan's own `is5G` flag, ascending by
// price — nothing fabricated. The TL;DR is qualitative and non-fabricating (no
// invented Mbps/latency specs). CategoryLanding surfaces the commission
// disclosure + price caveat, and each table shows an honest empty state when
// none match.
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
import { pageMetadata } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import { getLivePlans } from "@/lib/live-catalogue";
import type { Plan } from "@/lib/types";

const CATEGORY = "cellular";
const TITLE_HE = "5G מול 4G בסלולר";

// ISR: regenerate the static HTML hourly so the featured tables + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** Cheapest priced 5G cellular plans (real `is5G` flag), priced first. */
function fivegPlans(all: Plan[], limit = 12): Plan[] {
  return all
    .filter((p): p is Plan => typeof p.price === "number" && p.is5G === true)
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

/** Cheapest priced non-5G ("4G") cellular plans, priced first. */
function fourgPlans(all: Plan[], limit = 12): Plan[] {
  return all
    .filter((p): p is Plan => typeof p.price === "number" && p.is5G !== true)
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "5G מול 4G — מתי באמת כדאי לשדרג וכמה זה עולה?",
  // Truth-only TL;DR — qualitative comparison, no fabricated network specs. The
  // "מסלולים הזולים בכל דור רשת" claim is backed by the two real catalogue slices
  // the page renders.
  description:
    "השוואה בין מסלולי 5G ל-4G: מה ההבדל האמיתי ביום-יום, מתי שווה לעבור, וכמה זה " +
    "עולה — עם המסלולים הזולים בכל דור רשת, מתוך הקטלוג של SWITCHY. השוואה חינמית.",
  path: "/5g-vs-4g",
});

export default async function FiveGvsFourGPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const fiveg = fivegPlans(all);
  const fourg = fourgPlans(all);
  // The combined featured set drives the page-level schema + freshness stamp.
  const featured = [...fiveg, ...fourg];
  // Real "data as of" date (catalogue updated_at, else build-time UTC) — drives
  // BOTH the visible <FreshnessBadge> and the schema's temporalCoverage month, so
  // the structured data can never disagree with what the human reads.
  const asOf = lastDataDate(featured);
  // Category-scoped AggregateOffer (price range across the REAL featured plans).
  // Returns null when no plan is priced; rendered conditionally so nothing false
  // is emitted.
  const categoryOffer = categoryAggregateOfferSchema(featured, CATEGORY, {
    temporalCoverage: asOf.slice(0, 7),
  });

  const crumbs = [
    { name: "בית", url: "/" },
    { name: CATEGORY_HE[CATEGORY], url: `/compare/${CATEGORY}` },
    { name: "5G מול 4G", url: "/5g-vs-4g" },
  ];

  const fivegSubcats = [
    { href: "/cellular-5g", label: "כל מסלולי ה-5G הזולים" },
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי הסלולר — טבלה מלאה" },
  ];

  const fourgSubcats = [
    { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
    { href: "/data-only", label: "מסלולי גלישה בלבד" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי הסלולר",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/cellular-5g", label: "מסלולי 5G הזולים", hint: "כל מסלולי ה-5G במקום אחד, מהזול." },
    { href: "/glossary/5g", label: "מה זה 5G?", hint: "הסבר קצר וברור במילון המונחים." },
    { href: "/cellular", label: "עמוד הסלולר הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "השוואה בין מסלולי 5G ל-4G בישראל — המסלולים הזולים בכל דור רשת, ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/5g-vs-4g",
          plans: featured,
        })}
      />
      {/* Category AggregateOffer — a single "prices range ₪low–₪high across N
          plans" node for the featured set, in ILS, stamped with the real
          catalogue month. Omitted when no plan is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
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
        <span className="text-foreground">5G מול 4G</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואה
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          5G מול 4G בסלולר
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          5G מהיר ויציב יותר באזורים עמוסים, וההפרש במחיר היום הצטמצם מאוד. הנה
          ההשוואה בין שני דורות הרשת — עם המסלולים הזולים בכל צד.
        </p>
      </header>

      {/* ── Truth-only TL;DR — qualitative, no fabricated specs ───────────── */}
      <div className="mt-6 rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-foreground">
        <b className="text-ink">השורה התחתונה:</b> אם הטלפון שלכם תומך ב-5G ויש
        כיסוי באזור — וההפרש במחיר זהה או קרוב למסלול 4G — אין סיבה לא לעבור,
        במיוחד באזורים עירוניים עמוסים. אבל אל תשלמו פרמיה גבוהה רק בשביל הכותרת:
        בגלישה רגילה רוב המשתמשים לא ירגישו הבדל דרמטי.
      </div>

      {/* ── Freshness stamp (honest "data as of" date, near the tables) ───── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      {/* ── 5G slice (real `is5G` plans, cheapest first) ─────────────────── */}
      <section className="mt-8" aria-label="מסלולי 5G">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          מסלולי 5G — הדור החדש
        </h2>
        <div className="mt-4">
          <CategoryLanding
            category={CATEGORY}
            titleHe="מסלולי 5G"
            intro="מסלולי הסלולר ב-5G, ממוינים מהזול ליקר. הטבלה מציגה רק מסלולים שמסומנים בקטלוג כ-5G. המהירות בפועל תלויה בכיסוי, בתשתית ובכתובת."
            plans={fiveg}
            subcats={fivegSubcats}
          />
        </div>
      </section>

      {/* ── 4G slice (non-5G plans, cheapest first) ──────────────────────── */}
      <section className="mt-12" aria-label="מסלולי 4G">
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          מסלולי 4G — מספיק לרוב
        </h2>
        <div className="mt-4">
          <CategoryLanding
            category={CATEGORY}
            titleHe="מסלולי 4G"
            intro="מסלולי הסלולר שאינם מסומנים כ-5G (4G), ממוינים מהזול ליקר. עבור רוב השימושים — גלישה, רשתות חברתיות, ניווט ווידאו — 4G עדיין מספיק לחלוטין, ולעיתים זול יותר."
            plans={fourg}
            subcats={fourgSubcats}
          />
        </div>
      </section>

      <RelatedAuthorityPages
        heading="עמודים קשורים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
