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
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import { ils, priceUnitLabel } from "@/lib/format";
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
  /**
   * When true (the DEFAULT), the component skips its own flat-ink hero panel
   * (title + price + intro + primary CTA) and renders the intro on a light
   * surface above the table instead. Every current consumer owns its own page
   * <h1> header, so the internal ink hero would double-render — the hero is
   * therefore OPT-IN: pass `hideHero={false}` only on a page that has NO header
   * of its own and wants this component to supply the single ink hero.
   */
  hideHero?: boolean;
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
  hideHero = true,
  className,
}: CategoryLandingProps) {
  const comparePath = `/compare/${category}`;
  const hasPlans = plans.length > 0;
  const headingId = `cat-landing-${category}`;

  // Catalogue-derived entry price for the flat-ink hero's green VALUE clause —
  // the lowest priced plan among the passed-in `plans` only (PRESENTATIONAL: no
  // fetch, so the figure can never drift from the page's data). Undefined when
  // nothing is priced, in which case the hero shows no fabricated number.
  const pricedPlans = plans.filter((p) => typeof p.price === "number");
  // Keep the cheapest priced plan itself (not just its number) so the price
  // clause can carry that plan's REAL per-unit suffix via priceUnitLabel —
  // abroad rows are לחבילה/ליום/לדקה, never a hardcoded "לחודש" that would
  // mislabel a per-package/per-day price as monthly.
  const cheapestFeatured = pricedPlans.length
    ? pricedPlans.reduce((a, b) => (b.price < a.price ? b : a))
    : undefined;
  const minFeatured = cheapestFeatured?.price;
  const minUnitLabel = cheapestFeatured ? priceUnitLabel(cheapestFeatured) : "לחודש";

  // Catalogue-derived hub-spoke cross-links: this category's providers, head-to-
  // head /vs pages, the other-category /compare hubs, and the category's guides.
  // Every link is a real on-site route; empty groups are dropped by <RelatedLinks>.
  const relatedGroups = buildCategoryRelatedGroups(category);
  const relatedNav = relatedNavLinks(relatedGroups);

  return (
    <section
      // When the host page owns the flat-ink hero (hideHero), this section has no
      // internal heading to point at, so it carries its own aria-label instead of
      // an aria-labelledby that would orphan a missing id.
      aria-labelledby={hideHero ? undefined : headingId}
      aria-label={hideHero ? titleHe : undefined}
      className={["w-full", className ?? ""].join(" ").trim()}
    >
      {/* ── Intro block — flat-ink hero panel ─────────────────────────────────
          Calm, bank-grade hero (mirrors app/page.tsx): a solid deep-ink panel
          with the title/intro set directly on it (NO photo/video behind) and
          green applied ONLY to the catalogue-derived entry-price clause (VALUE).
          The panel is a fixed ink (#111827) in BOTH themes so white-on-ink
          always holds; the hairline border keeps it defined on a dark page. The
          heading stays an <h2> (the host page owns the page <h1>) and keeps the
          section's aria-labelledby id. Green is a VALUE text treatment here, not
          a fill — the only green FILL is the one primary CTA below.

          Skipped when `hideHero` is set: the host page then renders the single
          flat-ink hero (carrying the page <h1> + the one primary CTA), so this
          component starts straight at the disclosure + comparison table. */}
      {!hideHero && (
        <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h2
              id={headingId}
              className="sw-reveal font-display text-3xl font-bold tracking-tight text-white sm:text-5xl"
            >
              {titleHe}
              {minFeatured !== undefined ? (
                <>
                  {" "}
                  <span className="text-accent">מ-{ils(minFeatured)} {minUnitLabel}.</span>
                </>
              ) : null}
            </h2>
            <p
              className="sw-reveal mx-auto mt-5 max-w-2xl text-base font-medium leading-relaxed text-white/85 sm:text-lg"
              style={{ animationDelay: "60ms" }}
            >
              {intro}
            </p>
            {/* Primary hand-off to the full compare hub — the one green FILL in
                this view (three-tier PRIMARY: bg-accent + glow + press), tracked
                as a conversion. Chevron is direction-aware. */}
            <div
              className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
              style={{ animationDelay: "120ms" }}
            >
              <TrackedCtaLink
                href={comparePath}
                location="category-hero"
                label="compare"
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                {`לכל מסלולי ${titleHe}`}
                <Icon name="chevron" size={18} aria-hidden="true" />
              </TrackedCtaLink>
            </div>
          </div>
        </section>
      )}

      {/* Intro copy — when the hero is hidden the host page owns the ink hero,
          but the category framing paragraph still belongs here, on the light
          surface above the disclosure/table (content parity with the hero-on
          layout, where this same `intro` sits inside the panel). */}
      {hideHero && (
        <p className="sw-reveal max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          {intro}
        </p>
      )}

      {/* ── Commission disclosure (Consumer Protection §7b) — above the prices,
          never buried below them. Extra top margin when the hero is hidden so it
          doesn't crowd the host page's freshness stamp above it. ─────────────── */}
      <CommissionDisclosure
        variant="inline"
        className={hideHero ? "mt-5 max-w-2xl" : "mt-4 max-w-2xl"}
      />

      {/* ── Featured comparison table ───────────────────────────────────────────
          The core band. Renders from the passed `plans` only — no fetch here, so
          it can never drift from the page's data. The PriceCaveat (§17, VAT-
          inclusive / verify with provider) sits directly under the prices. The
          post-table hand-off is a TERTIARY text link (plain link + direction-
          aware chevron) — the ONE green FILL primary CTA lives in the hero.

          `nums-tabular` column-aligns every ₪ figure inside <ComparisonTable>
          (parity with the home featured/teaser tables in app/page.tsx) so prices
          read as an even numeric ledger — the shared class means both this
          component's consumers and the home stay in lockstep without editing the
          table itself. */}
      <div className="nums-tabular section">
        <ComparisonTable
          plans={plans}
          caption={`השוואת ${titleHe} — מחירים בשקלים, כולל המחיר אחרי המבצע`}
        />
        {hasPlans ? <PriceCaveat className="mt-3" /> : null}
        <Link
          href={comparePath}
          className="interactive mt-6 inline-flex items-center gap-1 font-medium text-accent-text hover:text-accent-hover"
        >
          {`לכל מסלולי ${titleHe}`}
          <Icon name="chevron" size={16} aria-hidden="true" />
        </Link>
      </div>

      {/* ── Onward links — subcategories + guides (no dead-ends) ────────────────
          A standalone band with symmetric breathing room (.section). Both link
          groups are TERTIARY: plain text links + a direction-aware chevron, no
          fill/border. Keeps the one-primary discipline (green fill = hero CTA
          only). ─────────────────────────────────────────────────────────────── */}
      <div className="section">
        {subcats && subcats.length > 0 ? (
          <nav aria-label={`תתי-קטגוריות — ${titleHe}`}>
            <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
              לפי סוג מסלול
            </h3>
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {subcats.map((sub, i) => (
                <li key={sub.href}>
                  <Link
                    href={sub.href}
                    className="interactive inline-flex items-center gap-1 font-medium text-accent-text hover:text-accent-hover"
                    style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
                  >
                    {sub.label}
                    <Icon name="chevron" size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {/* Guides link — keep the knowledge web connected (tertiary). */}
        <p
          className={[
            "text-sm text-muted",
            subcats && subcats.length > 0 ? "mt-8" : "",
          ]
            .join(" ")
            .trim()}
        >
          רוצים להבין לעומק לפני שמשווים?{" "}
          <Link
            href="/guides"
            className="interactive font-medium text-accent-text hover:text-accent-hover"
          >
            מדריכים: איך עוברים ספק, בוחרים מסלול וחוסכים
          </Link>
          .
        </p>
      </div>

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
