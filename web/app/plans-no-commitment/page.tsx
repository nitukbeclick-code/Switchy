// ────────────────────────────────────────────────────────────────────────────
// /plans-no-commitment — the NO-COMMITMENT subcategory landing. Web-app
// counterpart of the static site/plans-no-commitment.html: cellular & internet
// plans you can leave whenever you want, no exit penalty. A TRUTHFULLY-filtered
// table (by the real `noCommit` flag) and a hand-off to the /compare hub. Mirrors
// the static page, adapted to the app's components + mobile-first, RTL.
//
// CROSS-CATEGORY: this page spans cellular + internet, so it composes
// <ComparisonTable> + <CommissionDisclosure> + <PriceCaveat> directly (the same
// pieces <CategoryLanding> uses) and hands off to the multi-category /compare hub.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): in our catalogue EVERY plan
// is no-commitment, so the copy states that plainly rather than implying a scarce
// filter — and the table simply surfaces the cheapest no-commit cellular/internet
// plans, ascending by price. Nothing is fabricated; disclosure + caveat sit by the
// prices, and an honest empty state (→ /compare) shows if nothing matches.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import FreshnessBadge from "@/components/FreshnessBadge";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { plansByCategory } from "@/lib/data";
import {
  collectionPageSchema,
  categoryAggregateOfferSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import { getLivePlans } from "@/lib/live-catalogue";
import type { Plan } from "@/lib/types";

const TITLE_HE = "מסלולים ללא התחייבות";

// ISR: regenerate the static HTML hourly so the featured table + ₪ figures read
// from the live DB catalogue (with the bundled snapshot as a resilient fallback)
// and never drift stale vs the live /compare hub.
export const revalidate = 3600;

/** This cross-category page's catalogue scope (cellular + internet). */
const SCOPE: ReadonlySet<string> = new Set(["cellular", "internet"]);

/** Cheapest no-commitment plans across cellular + internet, priced first. */
function noCommitPlans(all: Plan[], limit = 10): Plan[] {
  return all
    .filter(
      (p): p is Plan =>
        SCOPE.has(p.cat) && typeof p.price === "number" && p.noCommit === true,
    )
    .sort((a, b) => a.price - b.price)
    .slice(0, limit);
}

// NOTE: this page genuinely spans TWO categories (cellular + internet), so the
// single-category categoryMetaDescription() can't label it without overstating.
// The description below is already truth-only and category-accurate; it is kept
// verbatim while the data path moves to the live catalogue.
export const metadata: Metadata = pageMetadata({
  title: "מסלולים ללא התחייבות — סלולר ואינטרנט",
  description:
    "מסלולי סלולר ואינטרנט ללא התחייבות — עוזבים מתי שרוצים, בלי קנס יציאה. " +
    "ממוינים מהזול ביותר, מחירים מעודכנים מכל החברות, כולל המחיר אחרי המבצע. השוואה חינמית.",
  path: "/plans-no-commitment",
});

export default async function PlansNoCommitmentPage() {
  // ── ONE live catalogue read per render (whole catalogue; this page is cross-
  // category). On any failure getLivePlans returns the bundled snapshot. ─────────
  const { plans: catalogue } = await getLivePlans();
  const all = catalogue.length
    ? catalogue
    : [...plansByCategory("cellular"), ...plansByCategory("internet")];
  const plans = noCommitPlans(all);
  const hasPlans = plans.length > 0;
  // Real "data as of" date (catalogue updated_at, else build-time UTC) — drives
  // BOTH the visible <FreshnessBadge> and the schema's temporalCoverage month, so
  // the structured data can never disagree with what the human reads.
  const asOf = lastDataDate(plans);
  // Cross-category AggregateOffer (cellular + internet no-commit plans) — the
  // price range across the SAME plans the table renders; no single `category` arg
  // since this page spans two categories. Returns null when nothing is priced;
  // rendered conditionally so nothing false is emitted.
  const categoryOffer = categoryAggregateOfferSchema(plans, undefined, {
    temporalCoverage: asOf.slice(0, 7),
  });

  const crumbs = [
    { name: "בית", url: "/" },
    { name: TITLE_HE, url: "/plans-no-commitment" },
  ];

  const related = [
    { href: "/compare/cellular", label: "השוואת מסלולי סלולר", hint: "כל מסלולי הסלולר, ממוין מהזול." },
    { href: "/compare/internet", label: "השוואת מסלולי אינטרנט", hint: "סיב, כבל וגיגה — מחיר מבצע וקבוע." },
    { href: "/glossary/no-commitment", label: "מה זה ללא התחייבות?", hint: "הסבר קצר וברור במילון המונחים." },
    { href: "/glossary/exit-fee", label: "מה זה קנס יציאה?", hint: "מתי משלמים על עזיבה מוקדמת." },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: `${TITLE_HE} בישראל`,
          description:
            "מסלולי סלולר ואינטרנט ללא התחייבות בישראל — ממוינים מהזול ביותר, כולל המחיר אחרי המבצע.",
          url: "/plans-no-commitment",
          plans,
        })}
      />
      {/* Cross-category AggregateOffer — a single "prices range ₪low–₪high across
          N plans" node for the no-commit set, in ILS, stamped with the real
          catalogue month. Omitted when nothing is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{TITLE_HE}</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          השוואת מסלולים
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          מסלולים ללא התחייבות
        </h1>
      </header>

      {/* ── Landing section (mirrors CategoryLanding for a cross-category page) ── */}
      <section aria-labelledby="no-commit-h" className="mt-8 w-full">
        <header className="sw-reveal">
          <h2
            id="no-commit-h"
            className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
          >
            {TITLE_HE} — סלולר ואינטרנט
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground sm:text-lg">
            מסלולים שאפשר לעזוב מתי שרוצים, בלי קנס יציאה ובלי תקופת מחויבות. למעשה,
            כל המסלולים בקטלוג שלנו הם ללא התחייבות — כאן ריכזנו את הזולים ביותר בסלולר
            ובאינטרנט במקום אחד, ממוינים מהזול ליקר. שימו לב גם למחיר אחרי תקופת המבצע.
          </p>
        </header>

        {/* Commission disclosure (Consumer Protection §7b) — above the prices. */}
        <CommissionDisclosure variant="inline" className="mt-4 max-w-2xl" />

        {/* Freshness stamp (honest "data as of" date, near the table). */}
        <div className="mt-4">
          <FreshnessBadge date={asOf} />
        </div>

        {/* Featured comparison table + price caveat (§17) under the prices. */}
        <div className="mt-6">
          <ComparisonTable
            plans={plans}
            caption="השוואת מסלולים ללא התחייבות — מחירים בשקלים, כולל המחיר אחרי המבצע"
          />
          {hasPlans ? <PriceCaveat className="mt-3" /> : null}
        </div>

        {/* Primary hand-off to the multi-category compare hub. */}
        <div className="mt-6">
          <Link
            href="/compare"
            className="sw-lift group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            לכל מרכז ההשוואה
            <span
              aria-hidden="true"
              className="transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:-translate-x-0.5"
            >
              ←
            </span>
          </Link>
        </div>

        {/* Onward subcategory links (no dead-ends). */}
        <nav aria-label={`תתי-קטגוריות — ${TITLE_HE}`} className="mt-8">
          <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
            לפי קטגוריה
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { href: "/compare/cellular", label: "כל מסלולי הסלולר — טבלה מלאה" },
              { href: "/compare/internet", label: "כל מסלולי האינטרנט — טבלה מלאה" },
              { href: "/cellular-budget", label: "מסלולי סלולר תקציביים" },
              { href: "/kosher-plans", label: "מסלולים כשרים" },
            ].map((sub, i) => (
              <li key={sub.href}>
                <Link
                  href={sub.href}
                  className="sw-lift card card-interactive group flex items-center justify-between gap-2 px-4 py-3.5"
                  style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
                >
                  <span className="font-medium text-foreground transition-colors group-hover:text-accent">
                    {sub.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-accent transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:-translate-x-0.5"
                  >
                    ←
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <RelatedAuthorityPages
        heading="עמודים קשורים"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
