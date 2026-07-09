// ────────────────────────────────────────────────────────────────────────────
// /plans — the PRICING HUB ("מחירון"). Mirrors the static site/plans.html: a full
// price list, ONE place that surfaces the cheapest plans in every catalogue
// category, each block linking onward to the per-category comparison hub
// (/compare/{category}). It is the natural "מחירון מלא" entry point and an
// ItemList authority page for the catalogue's lowest-priced offers.
//
// HONESTY (E-E-A-T): every figure is catalogue-derived — the total plan count, the
// provider count, and each category's REAL lowest price + plan count. We render
// only the cheapest few real plans per category (the rest live on /compare/...),
// so nothing here is fabricated. The "cheapest first" order is a transparent,
// stated methodology — not a covert quality score. The §7b commission disclosure
// and the §17 price caveat sit prominently near the prices.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import EmptyState from "@/components/EmptyState";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import FreshnessBadge from "@/components/FreshnessBadge";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import {
  getPlans,
  getCategories,
  plansByCategory,
  CATEGORY_HE,
} from "@/lib/data";
import type { Plan, Category } from "@/lib/types";
import {
  collectionPageSchema,
  itemListSchema,
  categoryAggregateOfferSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata, homeMetaDescription } from "@/lib/seo";
import { lastDataDate } from "@/lib/aeo";
import { getLivePlans } from "@/lib/live-catalogue";
import { ils } from "@/lib/format";

// ISR: regenerate the static HTML hourly so the price list + ₪ figures read from
// the live DB catalogue (with the bundled snapshot as a resilient fallback) and
// never drift stale vs the live /compare hubs.
export const revalidate = 3600;

// How many cheapest plans to preview per category before linking to /compare.
// A short, scannable taste of each category's pricing — the full list lives on
// the category hub. Kept small so the page stays mobile-light and fast.
const PREVIEW_PER_CATEGORY = 4;

// Page-scoped entrance reveal (Emil Kowalski rules): fade + lift, <300ms past the
// initial offset, custom ease-out token, animates ONLY transform + opacity, and
// disabled under prefers-reduced-motion. Static CSS string → rendered as a plain
// <style> child (no dangerouslySetInnerHTML, no JS).
const REVEAL_CSS = `
.sw-reveal { animation: swReveal 280ms var(--ease-out) both; }
@keyframes swReveal {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .sw-reveal { animation: none; }
}
`;

export const metadata: Metadata = pageMetadata({
  title: "מחירון מלא — מחירי כל מסלולי התקשורת בישראל",
  // Fact-dense, truth-only site-wide TL;DR (total plans, providers, covered
  // categories, ₪ floor) — this hub spans every category, so the whole-catalogue
  // homeMetaDescription fits; falls back to the static copy if the catalogue is empty.
  description:
    homeMetaDescription() ??
    "מחירון מלא של מסלולי הסלולר, האינטרנט, הטלוויזיה, החבילות המשולבות וחו״ל מכל " +
      "הספקים בישראל — המסלולים הזולים בכל קטגוריה, מחירים בשקלים כולל המחיר אחרי " +
      "המבצע. השוואה חינמית ובלי התחייבות.",
  path: "/plans",
});

/** Lowest headline price across a list of plans, or null when none priced. */
function minPriceOf(plans: Plan[]): number | null {
  let min = Number.POSITIVE_INFINITY;
  for (const p of plans) {
    if (typeof p.price === "number" && p.price < min) min = p.price;
  }
  return Number.isFinite(min) ? min : null;
}

/** Plans of a category sorted cheapest-first (priced plans ahead of unpriced). */
function cheapestFirst(plans: Plan[]): Plan[] {
  return plans
    .slice()
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}

/** A category that actually has at least one plan, with its preview slice. */
interface CategoryBlock {
  cat: Category;
  he: string;
  total: number;
  min: number | null;
  preview: Plan[];
}

export default async function PlansPricingPage() {
  // ── ONE live catalogue read per render, threaded through everything ──────────
  // The whole catalogue, live from the DB (bundled snapshot as a resilient
  // fallback). Every count/price below is derived from this single list so they
  // can never disagree with each other or with the live /compare hubs.
  const { plans: live } = await getLivePlans();
  const allPlans = live.length ? live : getPlans();
  // Provider count + category order derived FROM the same plan list (not a
  // separate bundled read) so the figures match the prices shown.
  const providerCount = new Set(allPlans.map((p) => p.provider).filter(Boolean))
    .size;
  // Canonical category ORDER from getCategories(), but membership/figures come
  // from the live plans (filter the live list per category).
  const categories = getCategories();

  // Per-category blocks (only categories that carry plans), each with its REAL
  // cheapest-first preview, total count and lowest price.
  const blocks: CategoryBlock[] = [];
  for (const cat of categories) {
    const inCat = allPlans.filter((p) => p.cat === cat);
    if (inCat.length === 0) continue;
    const ranked = cheapestFirst(inCat);
    blocks.push({
      cat,
      he: CATEGORY_HE[cat] ?? cat,
      total: ranked.length,
      min: minPriceOf(ranked),
      preview: ranked.slice(0, PREVIEW_PER_CATEGORY),
    });
  }

  // The cheapest plan overall (across the whole catalogue) — the single VALUE
  // figure surfaced in the hero, derived from the same plans the page renders.
  const overallMin = minPriceOf(allPlans);

  // The ItemList JSON-LD covers exactly the previewed (cheapest) plans, in the
  // visible cheapest-first order — truthful: it serializes only the real plans on
  // the page, not the whole catalogue.
  const previewed: Plan[] = blocks.flatMap((b) => b.preview);

  // Real "data as of" date (catalogue updated_at, else build-time UTC) — drives
  // BOTH the visible <FreshnessBadge> and the schema's temporalCoverage month, so
  // the structured data can never disagree with what the human reads.
  const asOf = lastDataDate(allPlans);
  // ONE cross-category AggregateOffer for the whole pricing hub: the price range
  // across the SAME previewed plans the page lists (no `category` arg — this hub
  // spans every category, so the range is multi-category and honestly un-labelled).
  // Returns null when nothing is priced; rendered conditionally so nothing false
  // is emitted.
  const categoryOffer = categoryAggregateOfferSchema(previewed, undefined, {
    temporalCoverage: asOf.slice(0, 7),
  });

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מחירון", url: "/plans" },
  ];

  const summary =
    `מחירון מלא של ${allPlans.length} מסלולי תקשורת מ-${providerCount} ספקים ` +
    `בישראל, בכל הקטגוריות` +
    (overallMin != null ? ` — החל מ-${ils(overallMin)} לחודש` : "") +
    `. לכל קטגוריה מוצגים כאן המסלולים הזולים ביותר, ומשם אפשר לעבור להשוואה ` +
    `המלאה. המחירים בשקלים וכוללים את המחיר אחרי תום המבצע.`;

  // Related: each category's full comparison hub — no dead-ends.
  const related = blocks.map((b) => ({
    title: `השוואת מסלולי ${b.he}`,
    href: `/compare/${b.cat}`,
    description:
      `${b.total} מסלולים מכל הספקים` +
      (b.min != null ? `, החל מ-${ils(b.min)}.` : "."),
  }));

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Entrance-reveal keyframes (static CSS, no JS). */}
      <style>{REVEAL_CSS}</style>

      {/* GEO structured data: CollectionPage + ItemList (the cheapest previewed
          plans, real) + Breadcrumb. */}
      <JsonLd
        data={collectionPageSchema({
          name: "מחירון מלא — מחירי כל מסלולי התקשורת בישראל",
          description:
            "מחירון מלא של מסלולי התקשורת מכל הספקים בישראל — המסלולים הזולים בכל קטגוריה, מחירים בשקלים.",
          url: "/plans",
        })}
      />
      <JsonLd data={itemListSchema(previewed)} />
      {/* Cross-category AggregateOffer — a single "prices range ₪low–₪high across
          N plans" node for the previewed catalogue set, in ILS, stamped with the
          real catalogue month. Omitted when nothing is priced. */}
      {categoryOffer && <JsonLd data={categoryOffer} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מחירון</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="sw-reveal inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-text">
          מחירון מלא
        </p>
        <h1
          className="sw-reveal mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          style={{ animationDelay: "40ms" }}
        >
          מחירי כל מסלולי התקשורת בישראל
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "80ms" }}
        >
          {allPlans.length} מסלולים מ-{providerCount} ספקים, בכל הקטגוריות —
          ממוינים מהזול ליקר. לכל קטגוריה מוצגים כאן המסלולים הזולים ביותר, ומשם
          אפשר לעבור להשוואה המלאה. המחירים בשקלים וכוללים את המחיר אחרי המבצע.
        </p>

        {/* Compact catalogue stat line — three REAL anchors: plans, providers,
            and the lowest price overall (amber = VALUE). No fabricated metrics. */}
        <dl
          className="sw-reveal mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">מסלולים בקטלוג</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {allPlans.length.toLocaleString("he-IL")}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">ספקים</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {providerCount.toLocaleString("he-IL")}
            </dd>
          </div>
          {overallMin != null && (
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">המחיר הזול ביותר</dt>
              <dd className="font-display text-xl font-bold tracking-tight text-value-text">
                {ils(overallMin)}
              </dd>
            </div>
          )}
        </dl>
      </header>

      {/* ── Commission disclosure (Consumer Protection §7b) — near the prices,
          NOT buried. ───────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <CommissionDisclosure variant="banner" />
      </div>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: המחירון">{summary}</SgeSummary>
      </div>

      {/* ── Methodology note (transparent ordering) ───────────────────────── */}
      <p className="mt-8 max-w-2xl text-sm text-muted">
        השיטה שקופה: בכל קטגוריה מוצגים המסלולים בעלי המחיר ההתחלתי הנמוך ביותר
        (מהזול ליקר). זהו סידור &quot;ערך&quot; עובדתי לפי מחיר — לא ציון איכות סמוי
        ולא תשלום על מיקום.
      </p>

      {/* ── Freshness stamp (honest "data as of" date, near the prices) ────── */}
      <div className="mt-4">
        <FreshnessBadge date={asOf} />
      </div>

      {/* ── Per-category price blocks ─────────────────────────────────────── */}
      {blocks.length === 0 ? (
        // Defensive empty state — the catalogue should always carry plans, but the
        // page never dead-ends on a blank list.
        <EmptyState
          className="mt-12"
          mascot
          title="המחירון בדרך"
          description="לא נמצאו מסלולים בקטלוג כרגע. אפשר לעבור למרכז ההשוואה ולחזור בקרוב."
          cta={{ label: "למרכז ההשוואה", href: "/compare/cellular" }}
        />
      ) : (
        <div className="mt-12 flex flex-col gap-16">
          {blocks.map((b) => (
            <section
              key={b.cat}
              aria-labelledby={`cat-${b.cat}-h`}
              className="scroll-mt-6"
            >
              {/* Category header: name + REAL count/lowest-price, and a direct
                  link to the full comparison hub. */}
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                <div>
                  <h2
                    id={`cat-${b.cat}-h`}
                    className="font-display text-2xl font-bold tracking-tight text-ink"
                  >
                    מסלולי {b.he}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {b.total.toLocaleString("he-IL")} מסלולים מכל הספקים
                    {b.min != null && (
                      <>
                        {" · "}החל מ-
                        <span className="font-semibold text-value-text">
                          {ils(b.min)}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <Link
                  href={`/compare/${b.cat}`}
                  className="interactive press inline-flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-surface px-4 py-2 text-sm font-medium text-accent-text ease-[var(--ease-out)] hover:border-accent/40 hover:bg-accent/[0.04] [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  לכל מסלולי ה{b.he} ←
                </Link>
              </div>

              {/* The cheapest few real plans in this category. The component is
                  mobile-first (cards on phones, a rich table on lg+). */}
              <div className="mt-5">
                <ComparisonTable
                  plans={b.preview}
                  caption={`המסלולים הזולים ביותר ב${b.he} — מחירים בשקלים, כולל מחיר אחרי המבצע`}
                />
              </div>

              {/* When more plans exist than the preview shows, an honest count +
                  hand-off to the full category comparison. */}
              {b.total > b.preview.length && (
                <p className="mt-4 text-sm text-muted">
                  מוצגים {b.preview.length} מתוך {b.total} מסלולי {b.he}.{" "}
                  <Link
                    href={`/compare/${b.cat}`}
                    className="interactive font-medium text-accent-text underline underline-offset-2 hover:text-accent-hover"
                  >
                    להשוואה המלאה ←
                  </Link>
                </p>
              )}
            </section>
          ))}
        </div>
      )}

      {/* ── Price caveat (Consumer Protection §17) — once, after the prices. ─ */}
      <PriceCaveat className="mt-10" />

      {/* ── Related — full comparison hubs, no dead-ends ──────────────────── */}
      <RelatedAuthorityPages
        heading="השוואה מלאה לפי קטגוריה"
        links={related}
        className="mt-16"
      />
    </main>
  );
}
