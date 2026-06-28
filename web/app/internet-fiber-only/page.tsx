// ────────────────────────────────────────────────────────────────────────────
// /internet-fiber-only — the FIBER-ONLY INTERNET subcategory landing. Web-app
// counterpart of the static site/internet-fiber-only.html: every FTTH / fiber-
// optic internet plan in the catalogue, in one place. A TRUTHFULLY-filtered table
// (fiber detected from a plan's REAL name/specs/features text, excluding copper/
// cable plans) and a hand-off to the parent /compare/internet hub. Mirrors the
// static page, adapted to the app's components + mobile-first, RTL.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): there is no boolean "fiber"
// flag, so we detect it ONLY from the plan's catalogue text (סיב / fiber / פייבר /
// FTTH) and exclude anything marked copper/cable (נחושת / כבל / דאבל) — non-
// fabricating. CategoryLanding surfaces the commission disclosure + price caveat.
// Fiber availability is address-dependent: the copy says to verify with the provider.
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
const TITLE_HE = "אינטרנט סיב אופטי";

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

/** Marked as fiber-optic (FTTH) in the catalogue text. */
function isFiber(p: Plan): boolean {
  return /סיב|fiber|פייבר|ftth/i.test(planBlob(p));
}

/** Marked as copper / cable (HFC) in the catalogue text. */
function isCopperOrCable(p: Plan): boolean {
  return /נחושת|כבל|cable|דאבל|docsis/i.test(planBlob(p));
}

/** A priced fiber-only internet plan (fiber, NOT copper/cable). */
function isFiberOnly(p: Plan): boolean {
  return typeof p.price === "number" && isFiber(p) && !isCopperOrCable(p);
}

/** Cheapest fiber-only internet plans (fiber, NOT copper/cable), priced first. */
function fiberPlans(all: Plan[], limit = 10): Plan[] {
  return all
    .filter((p): p is Plan => isFiberOnly(p))
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

export const metadata: Metadata = pageMetadata({
  title: "אינטרנט סיב אופטי (Fiber) — כל ספקי הסיב בישראל",
  // Fact-dense, truth-only TL;DR derived from the SAME filtered (fiber-only) plans
  // the page renders — real count, provider sample and ₪ floor, never fabricated.
  description:
    categoryMetaDescription(CATEGORY, {
      plans: plansByCategory(CATEGORY).filter(isFiberOnly),
    }) ??
    "השוואת כל מסלולי אינטרנט הסיב האופטי (FTTH/Fiber) בישראל — בזק, HOT, פרטנר, " +
      "גולן וגילת. ממוינים מהזול ביותר, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/internet-fiber-only",
});

export default async function InternetFiberOnlyPage() {
  // ── ONE live catalogue read per render (bundled fallback on any failure) ──────
  const { plans: catalogue } = await getLivePlans({ category: CATEGORY });
  const all = catalogue.length ? catalogue : plansByCategory(CATEGORY);
  const plans = fiberPlans(all);
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
    { name: "סיב אופטי", url: "/internet-fiber-only" },
  ];

  const subcats = [
    { href: `/compare/${CATEGORY}`, label: "כל מסלולי האינטרנט — טבלה מלאה" },
    { href: "/internet-giga", label: "אינטרנט גיגה (1000Mb)" },
    { href: "/internet-cable-only", label: "אינטרנט על תשתית כבל" },
    { href: "/glossary/fiber-optic", label: "מה זה סיב אופטי?" },
  ];

  const related = [
    {
      href: `/compare/${CATEGORY}`,
      label: "השוואת כל מסלולי האינטרנט",
      hint: `${all.length} מסלולים מכל הספקים, ממוין מהזול.`,
    },
    { href: "/internet", label: "עמוד האינטרנט הראשי", hint: "כל תתי-הקטגוריות במקום אחד." },
    { href: "/internet-giga", label: "אינטרנט גיגה", hint: "מסלולים במהירות 1000Mb ומעלה." },
    { href: "/glossary/fiber-optic", label: "מה זה סיב אופטי?", hint: "הסבר קצר וברור במילון המונחים." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "השוואת מסלולי אינטרנט סיב אופטי (FTTH) מכל הספקים בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/internet-fiber-only",
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
        <span className="text-foreground">סיב אופטי</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          אינטרנט סיב אופטי
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
          intro="כל מסלולי אינטרנט הסיב האופטי (FTTH/Fiber) בישראל במקום אחד, ממוינים מהזול ליקר. סיב אופטי מספק את המהירות והיציבות הגבוהות ביותר — כולל מהירות העלאה (Upload) משמעותית. הטבלה כוללת מסלולי סיב בלבד (ללא תשתית נחושת/כבל). זמינות הסיב תלויה בכתובת — כדאי לבדוק מול הספק לפני הזמנה."
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
