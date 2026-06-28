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

const CATEGORY = "internet";
const TITLE_HE = "אינטרנט על תשתית כבל";

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

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

/** A priced cable/copper (HFC) internet plan. */
function isCableOnly(p: Plan): boolean {
  return typeof p.price === "number" && isCopperOrCable(p);
}

/** Cheapest cable/copper internet plans, priced first. */
function cablePlans(all: Plan[], limit = 10): Plan[] {
  return all
    .filter((p): p is Plan => isCableOnly(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "אינטרנט על תשתית כבל / נחושת — השוואת מחירים",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (cable/HFC) plans
  // the page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isCableOnly),
    }) ??
    "מסלולי אינטרנט ביתי על תשתית הכבל והנחושת (HFC) — חלופה זמינה היכן שאין סיב. " +
      "ממוינים מהזול ביותר, כולל המחיר אחרי המבצע. השוו מכל הספקים. השוואה חינמית.",
  path: "/internet-cable-only",
});

export default async function InternetCableOnlyPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = cablePlans(all);
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
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
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

      {/* ── Freshness stamp (honest "data as of" date, near the table) ────── */}
      <div className="mt-6">
        <FreshnessBadge date={asOf} />
      </div>

      <div className="mt-4">
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
