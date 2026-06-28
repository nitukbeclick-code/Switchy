// ────────────────────────────────────────────────────────────────────────────
// <CategoryLanding> — a reusable, PRESENTATIONAL category-landing section. One
// per service category (cellular / internet / tv / triple / abroad / …). It is
// the web-app counterpart of the static category pages (site/cellular.html,
// site/internet.html, …): an intro block, a FEATURED comparison table, a clear
// hand-off to the full /compare/{category} hub, and onward links (subcategories
// + guides) so the category never dead-ends.
//
// PRESENTATIONAL ONLY: this component does NOT fetch. The page that renders it
// reads the catalogue (getLivePlans / plansByCategory) and passes the already-
// ranked `plans` in, so the table here can never drift from the page's data.
//
// HONESTY (E-E-A-T / Consumer Protection §7b + §17): wherever pricing appears we
// surface the <CommissionDisclosure> (we receive a referral fee; it does not
// change the user's price) and the <PriceCaveat> (VAT-inclusive, accurate as of
// the update date, verify with the provider). TRUTH-ONLY: every figure shown is
// catalogue-derived from the passed `plans` — nothing is fabricated. When no
// plans are passed, qualitative copy stands in for any missing numbers.
//
// MOBILE-FIRST + RTL: inherits the app's direction; <ComparisonTable> already
// renders one card per plan on phones and the rich table on lg+. Entrance motion
// uses the shared `.sw-reveal` (transform + opacity only, <300ms band, reduced-
// motion safe) and the `.sw-lift` hover — no recoloring of provider brand marks.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Plan } from "@/lib/types";
import ComparisonTable from "@/components/ComparisonTable";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import RelatedLinks from "@/components/RelatedLinks";
import JsonLd from "@/components/JsonLd";
import {
  buildCategoryRelatedGroups,
  relatedNavLinks,
} from "@/lib/related-links";
import { relatedLinksSchema } from "@/lib/schema";

/** A single onward subcategory link (e.g. "5G", "תקציבי", "סיב אופטי"). */
export interface CategorySubcat {
  /** Destination href (internal on-site URL, truthful). */
  href: string;
  /** Visible, descriptive Hebrew anchor text. */
  label: string;
}

export interface CategoryLandingProps {
  /** Catalogue category bucket (e.g. "cellular") — drives the /compare hand-off. */
  category: string;
  /** Hebrew category title shown in the heading (e.g. "מסלולי סלולר"). */
  titleHe: string;
  /** A short Hebrew intro paragraph framing the category. */
  intro: string;
  /**
   * The plans to FEATURE in the comparison table, in the order to display. The
   * caller pre-ranks and pre-slices (this component renders them as-is, no fetch).
   */
  plans: Plan[];
  /** Optional onward subcategory links (the static page's sub-axes). */
  subcats?: CategorySubcat[];
  /** Optional extra classes on the outer section. */
  className?: string;
}

/**
 * The category landing section. Renders an intro, a featured comparison table
 * (from the passed `plans`), the disclosure + price caveat next to the prices, a
 * primary link to the full /compare/{category} hub, and optional subcategory +
 * guides links. Purely presentational — all data is passed in.
 */
export default function CategoryLanding({
  category,
  titleHe,
  intro,
  plans,
  subcats,
  className,
}: CategoryLandingProps) {
  const comparePath = `/compare/${category}`;
  const hasPlans = plans.length > 0;
  const headingId = `cat-landing-${category}`;

  // Catalogue-derived hub-spoke cross-links: this category's providers, head-to-
  // head /vs pages, the other-category /compare hubs, and the category's guides.
  // Every link is a real on-site route; empty groups are dropped by <RelatedLinks>.
  const relatedGroups = buildCategoryRelatedGroups(category);
  const relatedNav = relatedNavLinks(relatedGroups);

  return (
    <section
      aria-labelledby={headingId}
      className={["w-full", className ?? ""].join(" ").trim()}
    >
      {/* ── Intro block ─────────────────────────────────────────────────────── */}
      <header className="sw-reveal">
        <h2
          id={headingId}
          className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          {titleHe}
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground sm:text-lg">
          {intro}
        </p>
      </header>

      {/* ── Commission disclosure (Consumer Protection §7b) — above the prices,
          never buried below them. ────────────────────────────────────────── */}
      <CommissionDisclosure variant="inline" className="mt-4 max-w-2xl" />

      {/* ── Featured comparison table ───────────────────────────────────────────
          The core of the section. Renders from the passed `plans` only — no fetch
          here, so it can never drift from the page's data. The PriceCaveat (§17,
          VAT-inclusive / verify with provider) sits directly under the prices. */}
      <div className="mt-6">
        <ComparisonTable
          plans={plans}
          caption={`השוואת ${titleHe} — מחירים בשקלים, כולל המחיר אחרי המבצע`}
        />
        {hasPlans ? <PriceCaveat className="mt-3" /> : null}
      </div>

      {/* ── Primary hand-off to the full compare hub ──────────────────────────── */}
      <div className="mt-6">
        <Link
          href={comparePath}
          className="sw-lift group inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {`לכל מסלולי ${titleHe}`}
          <span
            aria-hidden="true"
            className="transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:-translate-x-0.5"
          >
            ←
          </span>
        </Link>
      </div>

      {/* ── Onward links — subcategories + guides (no dead-ends) ──────────────── */}
      {subcats && subcats.length > 0 ? (
        <nav aria-label={`תתי-קטגוריות — ${titleHe}`} className="mt-8">
          <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
            לפי סוג מסלול
          </h3>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {subcats.map((sub, i) => (
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
      ) : null}

      {/* ── Guides link — keep the knowledge web connected. ───────────────────── */}
      <p className="mt-6 text-sm text-muted">
        רוצים להבין לעומק לפני שמשווים?{" "}
        <Link
          href="/guides"
          className="rounded text-accent-text underline transition-colors duration-150 ease-[var(--ease-out)] hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          מדריכים: איך עוברים ספק, בוחרים מסלול וחוסכים
        </Link>
        .
      </p>

      {/* ── Grouped hub-spoke cross-links (catalogue-derived, no dead-ends) ─────
          A labelled topical web — ספקים / ראש-בראש / השוואות נוספות / מדריכים —
          that deepens the crawlable entity graph for SEO + answer engines. The
          relatedLinksSchema ItemList mirrors exactly what is rendered (de-duped
          by url), and is omitted when there are no links. */}
      {(() => {
        const nav = relatedLinksSchema({
          name: "המשיכו לחקור",
          links: relatedNav,
        });
        return nav ? <JsonLd data={nav} /> : null;
      })()}
      <RelatedLinks
        id={`cat-related-${category}`}
        groups={relatedGroups}
        className="mt-12"
      />
    </section>
  );
}

export { CategoryLanding };
