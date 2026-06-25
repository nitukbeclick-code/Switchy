// ────────────────────────────────────────────────────────────────────────────
// /vs — the HEAD-TO-HEAD HUB. One card per curated, catalogue-gated provider-vs-
// provider match-up ("X מול Y"), grouped by category, linking to /vs/[pair]. Gives
// the /vs route an index (no dead-end) and a discoverable list of every match-up.
//
// HONESTY (E-E-A-T): entry prices + plan counts are catalogue-derived; pairs only
// appear when both sides have real plans in the category (gated in lib/vs.ts).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import DataMethodology from "@/components/DataMethodology";
import LlmDataFeed from "@/components/LlmDataFeed";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import { getVsPairs } from "@/lib/vs";
import type { VsPair } from "@/lib/vs";
import { getLivePlans } from "@/lib/live-catalogue";
import { lastDataDate } from "@/lib/aeo";
import {
  breadcrumbSchema,
  collectionPageSchema,
  pageAggregateOfferSchema,
  SITE_URL,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils } from "@/lib/format";

// ISR keeps the hub's static HTML fresh against the live catalogue (hourly).
export const revalidate = 3600;

// Bare title — the root layout's title template brands the <title> once. (The OG
// title is brand-normalised by pageMetadata.) Previously the inline brand suffix
// here was double-applied by the template → "… | brand | brand".
export const metadata: Metadata = pageMetadata({
  title: "השוואות ראש בראש — ספק מול ספק",
  description:
    "השוואות ישירות בין ספקי התקשורת בישראל: סלקום מול פרטנר, בזק מול HOT ועוד. " +
    "מחיר התחלתי, מספר מסלולים ומאפיינים בכל קטגוריה — מהקטלוג ובשקלים. חינמי.",
  path: "/vs",
});

/** Group the resolved pairs by their Hebrew category label, in stable order. */
function groupByCategory(pairs: VsPair[]): { label: string; pairs: VsPair[] }[] {
  const byLabel = new Map<string, VsPair[]>();
  for (const p of pairs) {
    const list = byLabel.get(p.categoryLabel);
    if (list) list.push(p);
    else byLabel.set(p.categoryLabel, [p]);
  }
  return [...byLabel.entries()]
    .map(([label, list]) => ({ label, pairs: list }))
    .sort((a, b) => b.pairs.length - a.pairs.length || a.label.localeCompare(b.label, "he"));
}

export default async function VsIndexPage() {
  const pairs = getVsPairs();
  const groups = groupByCategory(pairs);

  // AEO: read the whole live catalogue ONCE so the hub's AggregateOffer, the
  // machine-readable feed and the methodology stamp all read the SAME fresh rows.
  // getLivePlans never throws (bundled fallback with stale: true).
  const live = await getLivePlans();
  const asOf = live.lastUpdated ?? lastDataDate(live.plans);
  const offerSchema = pageAggregateOfferSchema(live.plans);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואות ראש בראש", url: "/vs" },
  ];

  const summary =
    `מרכז ההשוואות הישירות של Switchy AI: ${pairs.length} השוואות ראש בראש בין ספקי ` +
    `התקשורת בישראל, באותה קטגוריה. כל השוואה מציגה את המחיר ההתחלתי, מספר ` +
    `המסלולים והמאפיינים של שני הספקים זה מול זה — נתונים מהקטלוג, בשקלים, וללא ` +
    `עלות. בחרו השוואה כדי לראות מי זול יותר ומי מציע יותר.`;

  // ItemList of the match-ups (each as a ListItem → its /vs/[pair] page).
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: pairs.length,
    itemListElement: pairs.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `${p.a.provider.name} מול ${p.b.provider.name} — ${p.categoryLabel}`,
      url: `${SITE_URL}/vs/${p.slug}`,
    })),
  };

  const related = [
    {
      title: "כל הספקים",
      href: "/providers",
      description: "דפי ספקים עם כל המסלולים והמחירים.",
    },
    {
      title: "השוואה לפי שירות",
      href: "/compare",
      description: "כל הספקים בכל קטגוריה — לא רק שניים.",
    },
    {
      title: "דופק השוק",
      href: "/market-pulse",
      description: "מחיר ממוצע, מינימלי ומקסימלי בכל קטגוריה.",
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Page-scoped entrance motion (Emil Kowalski rules): a one-time fade + 10px
          lift, staggered 30–80ms via inline animationDelay. Server-rendered CSS
          only (no JS) — references the shared --ease-out token and animates ONLY
          transform + opacity (GPU). Reduced-motion: the animation is removed so
          blocks render statically at their already-visible resting state. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-reveal { animation: swReveal 420ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
        }
      `,
        }}
      />

      {/* Structured data: CollectionPage + ItemList + Breadcrumb. */}
      <JsonLd
        data={collectionPageSchema({
          name: "השוואות ראש בראש — ספק מול ספק",
          description:
            "השוואות ישירות בין ספקי התקשורת בישראל, באותה קטגוריה — מחיר ומסלולים זה מול זה.",
          url: "/vs",
        })}
      />
      <JsonLd data={itemList} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      {/* AEO: AggregateOffer (catalogue-wide price range) — null when no data. */}
      {offerSchema && <JsonLd data={offerSchema} />}

      {/* AEO pillar 3: machine-readable feed of the live catalogue. */}
      <LlmDataFeed
        plans={live.plans}
        meta={{ url: `${SITE_URL}/vs`, asOf, stale: live.stale }}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">השוואות ראש בראש</span>
      </nav>

      {/* ── Heading — the page's single focal point. An honest catalogue-derived
          count chip sits above the H1 (green=ACTION accent, never amber/value),
          so the hub announces its real depth at a glance. ───────────────────── */}
      <header className="mt-4">
        {pairs.length > 0 && (
          <p className="sw-reveal inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent-text">
            <Icon name="check" size={15} aria-hidden />
            {pairs.length} השוואות ראש בראש
          </p>
        )}
        <h1
          className="sw-reveal mt-3 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl"
          style={{ animationDelay: "40ms" }}
        >
          השוואות ראש בראש — ספק מול ספק
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "80ms" }}
        >
          השוואות ישירות בין שני ספקים באותה קטגוריה — מחיר התחלתי, מספר מסלולים
          ומאפיינים זה מול זה. הנתונים מהקטלוג ובשקלים.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: השוואות ראש בראש">{summary}</SgeSummary>
      </div>

      {/* ── Match-up cards, grouped by category ───────────────────────────── */}
      {/* Designed empty state — only when the live catalogue gates every pair out
          (never expected in practice, but the hub must never dead-end on a blank
          page). Leads with the brand mascot + a CTA to the broad compare hub. */}
      {groups.length === 0 && (
        <EmptyState
          mascot
          title="אין כרגע השוואות ראש בראש"
          description="הקטלוג מתעדכן — בינתיים אפשר להשוות את כל הספקים בכל קטגוריה."
          cta={{ label: "להשוואה לפי שירות", href: "/compare" }}
          className="mt-12"
        />
      )}

      {groups.map((group) => (
        <section
          key={group.label}
          aria-labelledby={`vs-cat-${group.label}`}
          className="mt-12"
        >
          <h2
            id={`vs-cat-${group.label}`}
            className="font-display text-2xl font-bold tracking-tight text-ink"
          >
            {group.label}
          </h2>
          <ul className="mt-6 bento-grid">
            {group.pairs.map((p, i) => {
              // Honest, catalogue-derived value read: which side has the lower
              // ENTRY price (null on a tie). Surfaced as an amber VALUE pill below
              // — amber = VALUE only here; green stays reserved for the ACTION CTA.
              const cheaper =
                p.a.minPrice < p.b.minPrice
                  ? p.a
                  : p.b.minPrice < p.a.minPrice
                    ? p.b
                    : null;
              return (
                <li
                  key={p.slug}
                  className="sw-reveal"
                  style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
                >
                  <Link
                    href={`/vs/${p.slug}`}
                    className="group bento card-interactive flex h-full flex-col p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {/* Head-to-head title — the two providers stacked around a
                        small "מול" rule so the match-up reads as A-vs-B, not one
                        run-on line. */}
                    <span className="flex flex-col gap-1 font-display text-lg font-semibold tracking-tight text-ink">
                      <span className="transition-colors group-hover:text-accent">
                        {p.a.provider.name}
                      </span>
                      <span className="flex items-center gap-2 text-xs font-medium text-muted">
                        <span
                          aria-hidden="true"
                          className="h-px flex-1 bg-border"
                        />
                        מול
                        <span
                          aria-hidden="true"
                          className="h-px flex-1 bg-border"
                        />
                      </span>
                      <span className="transition-colors group-hover:text-accent">
                        {p.b.provider.name}
                      </span>
                    </span>

                    {/* Entry-price read for each side, with the cheaper one marked
                        as VALUE (amber). Real catalogue minimums, in ₪. */}
                    <dl className="mt-4 space-y-1.5 text-sm">
                      {[p.a, p.b].map((side) => {
                        const isCheaper = cheaper === side;
                        return (
                          <div
                            key={side.provider.slug}
                            className="flex items-baseline justify-between gap-3"
                          >
                            <dt className="text-muted">{side.provider.name}</dt>
                            <dd
                              className={
                                isCheaper
                                  ? "font-display font-bold tracking-tight text-value-text"
                                  : "font-medium text-foreground"
                              }
                            >
                              מ-{ils(side.minPrice)}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>

                    {cheaper && (
                      <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-value/10 px-2 py-0.5 text-[11px] font-semibold text-value-text">
                        {cheaper.provider.name} זול יותר בכניסה
                      </span>
                    )}

                    <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-accent-text">
                      להשוואה המלאה
                      <Icon
                        name="arrow"
                        size={16}
                        className="transition-transform group-hover:-translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ── Sources & methodology — show your work (E-E-A-T) ──────────────── */}
      <DataMethodology
        dateModified={asOf}
        stale={live.stale}
        planCount={live.plans.length}
        className="mt-14"
      />

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
