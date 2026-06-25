// ────────────────────────────────────────────────────────────────────────────
// /compare — the COMPARE HUB. One card per service axis (cellular / internet /
// fiber / tv / triple / abroad), linking to /compare/[service]. This is the
// authority hub the breadcrumb trails on every service + city page already point
// at ({ name: "השוואה", url: "/compare" }) — it was a dead link before.
//
// HONESTY (E-E-A-T): plan counts + starting prices are catalogue-derived. Israeli
// telecom is largely national; nothing about regional differences is fabricated.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import EmptyState from "@/components/EmptyState";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import {
  getServices,
  plansForService,
  getPlans,
  getProviders,
  getCategories,
} from "@/lib/data";
import {
  breadcrumbSchema,
  collectionPageSchema,
  SITE_URL,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils } from "@/lib/format";

export const metadata: Metadata = pageMetadata({
  title: "השוואת מסלולי תקשורת בישראל — לפי שירות",
  description:
    "מרכז ההשוואה של כל שירותי התקשורת בישראל: סלולר, אינטרנט, סיב אופטי, " +
    "טלוויזיה, חבילות משולבות וחו״ל. בחרו שירות להשוואת מסלולים מכל הספקים בשקלים.",
  path: "/compare",
});

/** Lowest headline price across a service's plans, or null when none priced. */
function minPriceOf(plans: { price?: number }[]): number | null {
  let min = Number.POSITIVE_INFINITY;
  for (const p of plans) {
    if (typeof p.price === "number" && p.price < min) min = p.price;
  }
  return Number.isFinite(min) ? min : null;
}

export default function CompareIndexPage() {
  const services = getServices();
  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const planCount = getPlans().length;
  const providerCount = getProviders().length;
  const categoryCount = getCategories().length;

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואה", url: "/compare" },
  ];

  const summary =
    `מרכז ההשוואה של Switchy AI: כל שירותי התקשורת בישראל במקום אחד — סלולר, אינטרנט, ` +
    `סיב אופטי, טלוויזיה, חבילות משולבות וחבילות חו״ל. בחרו שירות כדי להשוות מסלולים ` +
    `מכל הספקים, כולל המחיר אחרי המבצע. השוואה חינמית, מחירים בשקלים, זמינות ארצית.`;

  // ItemList of the service hubs (each as a ListItem → its compare page).
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: services.length,
    itemListElement: services.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `השוואת ${s.label}`,
      url: `${SITE_URL}/compare/${s.slug}`,
    })),
  };

  const related = [
    {
      title: "כל הספקים",
      href: "/providers",
      description: "דפי ספקים עם כל המסלולים והמחירים.",
    },
    {
      title: "דופק השוק",
      href: "/market-pulse",
      description: "מחיר ממוצע, מינימלי ומקסימלי בכל קטגוריה — מצב נוכחי.",
    },
    {
      title: "מילון מונחים",
      href: "/glossary",
      description: "מונחי תקשורת בעברית: ניוד מספר, סיב אופטי, 5G ועוד.",
    },
  ];

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* Page-scoped entrance reveal (Emil Kowalski rules): fade + lift each
          service card in, staggered 30–80ms via inline animationDelay. Server CSS
          only (no JS), references the shared --ease-out token, animates ONLY
          transform + opacity. Reduced-motion removes the animation so cards render
          statically at their resting (fully visible) state. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-reveal { animation: swReveal 400ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
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
          name: "השוואת מסלולי תקשורת בישראל",
          description:
            "מרכז ההשוואה של כל שירותי התקשורת בישראל — בחירת שירות להשוואת מסלולים מכל הספקים.",
          url: "/compare",
        })}
      />
      <JsonLd data={itemList} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">השוואה</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          The single confident focal point of the hub: an Icon-led category
          eyebrow (green = ACTION), the H1, an intent-matching lead, and a row of
          REAL catalogue stats so the value is legible above the fold. The price
          figure is amber (VALUE); everything else stays ink/structure. */}
      <header className="mt-4">
        <span
          className="sw-reveal inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 font-display text-xs font-semibold tracking-tight text-accent-text"
        >
          <Icon name="search" size={14} aria-hidden="true" />
          מרכז ההשוואה
        </span>
        <h1
          className="sw-reveal mt-4 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl"
          style={{ animationDelay: "40ms" }}
        >
          השוואת מסלולי תקשורת בישראל
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "80ms" }}
        >
          בחרו שירות להשוואת מסלולים מכל הספקים בישראל — מחירים בשקלים, כולל המחיר
          אחרי המבצע. הזמינות ארצית, אותם ספקים בכל הארץ.
        </p>
        <dl
          className="sw-reveal mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
          style={{ animationDelay: "120ms" }}
        >
          {[
            { figure: planCount.toLocaleString("he-IL"), label: "מסלולים" },
            { figure: providerCount.toLocaleString("he-IL"), label: "ספקים" },
            { figure: services.length.toLocaleString("he-IL"), label: "שירותים להשוואה" },
          ].map((s) => (
            <div key={s.label} className="flex items-baseline gap-1.5">
              <dt className="sr-only">{s.label}</dt>
              <dd className="font-display text-xl font-bold tracking-tight text-ink">
                {s.figure}
              </dd>
              <span className="text-sm text-muted">{s.label}</span>
            </div>
          ))}
        </dl>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: השוואה">{summary}</SgeSummary>
      </div>

      {/* ── Trust signals — real catalogue counts + honest trust points + the
          §7b disclosure + §17 price caveat. Builds trust before the user picks
          a service (the single primary action on this hub). ──────────────── */}
      <div className="mt-8">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── Service cards ───────────────────────────────────────────────────
          The hub's primary action: one bento tile per service axis. Visible
          section heading anchors the choice; each tile leads with the service
          name, shows the REAL plan count and an amber (VALUE) "starts at" price,
          and ends with a clear forward affordance. Guards the (catalogue-wide
          unlikely) empty case with the shared EmptyState rather than a blank
          grid. */}
      <section aria-labelledby="services-h" className="mt-12">
        <h2
          id="services-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          בחרו שירות להשוואה
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          כל שירות פותח השוואה מלאה מכל הספקים — ממוינת מהזול ליקר, עם המחיר אחרי
          המבצע.
        </p>
        {services.length === 0 ? (
          <EmptyState
            className="mt-8"
            mascot
            title="הקטלוג בעדכון"
            description="רשימת השירותים להשוואה אינה זמינה כרגע. אפשר לחזור בקרוב או לעיין בכל הספקים."
            cta={{ label: "לכל הספקים", href: "/providers" }}
          />
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => {
              const plans = plansForService(s.slug);
              const min = minPriceOf(plans);
              return (
                <li key={s.slug}>
                  <Link
                    href={`/compare/${s.slug}`}
                    className="group sw-reveal bento card-interactive flex h-full flex-col p-6"
                    style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                  >
                    <span className="font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
                      השוואת {s.label}
                    </span>
                    <span className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-sm text-muted">
                      <span>{plans.length} מסלולים</span>
                      {min != null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            החל מ-
                            <span className="font-display font-semibold text-value-text">
                              {ils(min)}
                            </span>
                          </span>
                        </>
                      )}
                    </span>
                    {/* Pinned to the tile bottom (mt-auto) so the forward
                        affordance aligns across equal-height cards. */}
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-accent-text">
                      להשוואת {s.label}
                      <Icon
                        name="arrow"
                        size={16}
                        aria-hidden="true"
                        className="transition-transform ease-[var(--ease-out)] group-hover:-translate-x-0.5"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
