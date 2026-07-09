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
import Money from "@/components/Money";
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

  // Per-service catalogue rows computed ONCE (real counts + starting prices),
  // so the featured pick and every card below bind the same real numbers.
  const serviceRows = services.map((s) => {
    const plans = plansForService(s.slug);
    return { service: s, plans, count: plans.length, min: minPriceOf(plans) };
  });
  // FEATURE the highest-count service — a TRUTHFUL signal ("הכי הרבה מסלולים"),
  // NOT "פופולרי" (that would be fabricated). Ties resolve to the first in
  // display order (cellular leads), so the pick stays deterministic. `null` when
  // the catalogue is empty (guarded by the EmptyState branch below).
  const featuredSlug =
    serviceRows.reduce<(typeof serviceRows)[number] | null>(
      (best, row) => (best == null || row.count > best.count ? row : best),
      null,
    )?.service.slug ?? null;

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
      // pb-20 (5rem) clears the floating chat launcher (FAB) — this hub renders
      // NO sticky bar, so nothing else reserves that space at the page foot.
      className="mx-auto w-full max-w-5xl flex-1 px-4 pt-10 pb-20 sm:px-6"
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
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">השוואה</span>
      </nav>

      {/* ── Hero — TOOL FIRST ─────────────────────────────────────────────────
          The hub opens with the tool, not the trust content: an Icon-led eyebrow
          (green = ACTION), the H1 and ONE line of subtext — then straight into
          the service picker. The stats row and the trust panel move BELOW the
          picker (they support the tool; they are not the tool). */}
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
          className="sw-reveal mt-3 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "80ms" }}
        >
          בחרו שירות להשוואת מסלולים מכל הספקים בישראל — מחירים בשקלים, כולל המחיר
          אחרי המבצע.
        </p>
      </header>

      {/* ── Service picker — THE tool, first thing after the H1 ──────────────
          Compact, uniform cards (2-up from 360px, 3-up on lg): service name, one
          real "N מסלולים · החל מ-₪X" line (catalogue-derived), and a small green
          button as the explicit forward affordance. Prices render through the
          bidi-safe <Money> so ₪ always sits on the same side of the digits.
          Guards the (catalogue-wide unlikely) empty case with the shared
          EmptyState rather than a blank grid. */}
      <section aria-labelledby="services-h" className="mt-8">
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
          <ul className="mt-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-3">
            {serviceRows.map(({ service: s, plans, min }, i) => {
              // The single guided default: the highest-count service leads. Its
              // card spans the full 2-col row, wears the featured-ring language
              // used elsewhere, carries the truthful "הכי הרבה מסלולים" ribbon,
              // and owns the ONE grammar-PRIMARY action on this hub. Every other
              // card is grammar-SECONDARY (ghost outline, no fill, no glow).
              const isFeatured = s.slug === featuredSlug;
              return (
                <li
                  key={s.slug}
                  className={
                    isFeatured ? "min-[360px]:col-span-2 lg:col-span-2" : undefined
                  }
                >
                  <Link
                    href={`/compare/${s.slug}`}
                    className={[
                      "group sw-reveal card card-interactive relative flex h-full min-h-24 flex-col justify-between gap-2 p-4",
                      isFeatured
                        ? "border-accent/30 bg-accent/[0.06] ring-1 ring-accent/25"
                        : "",
                    ].join(" ")}
                    style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
                  >
                    {isFeatured && (
                      // VALUE-tinted ribbon (not a button) — a truthful signal
                      // that this axis carries the most plans. Pinned to the
                      // inline-start top corner; RTL-safe via logical start-4.
                      <span className="pointer-events-none absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-full border border-value/20 bg-value/10 px-2.5 py-0.5 text-[12px] font-semibold text-value-text shadow-[var(--shadow-soft)]">
                        <Icon name="spark" size={12} aria-hidden="true" />
                        הכי הרבה מסלולים
                      </span>
                    )}
                    <span>
                      <span
                        className={[
                          "block font-display font-semibold tracking-tight text-ink transition-colors group-hover:text-accent",
                          isFeatured ? "text-lg" : "text-base",
                        ].join(" ")}
                      >
                        {s.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">
                        {plans.length.toLocaleString("he-IL")} מסלולים
                        {min != null && (
                          <>
                            {" "}
                            <span aria-hidden="true">·</span> החל מ-
                            <Money
                              amount={min}
                              className="font-display font-semibold text-value-text"
                            />
                          </>
                        )}
                      </span>
                    </span>
                    {/* The whole card is the link; this is its visible action.
                        Featured = grammar-PRIMARY (solid accent + glow). Others =
                        grammar-SECONDARY (ghost outline, no fill, no glow). */}
                    {isFeatured ? (
                      <span className="inline-flex w-fit items-center justify-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform group-active:scale-[0.98]">
                        להשוואה
                        <Icon
                          name="arrow"
                          size={16}
                          aria-hidden="true"
                          className="transition-transform ease-[var(--ease-out)] group-hover:-translate-x-0.5"
                        />
                      </span>
                    ) : (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-accent-text transition-colors group-hover:border-accent/40">
                        להשוואה
                        <Icon
                          name="arrow"
                          size={14}
                          aria-hidden="true"
                          className="transition-transform ease-[var(--ease-out)] group-hover:-translate-x-0.5"
                        />
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Real catalogue stats row — below the tool, above the trust panel. */}
      <dl
        className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3"
        aria-label="נתוני הקטלוג"
      >
        {[
          { figure: planCount.toLocaleString("he-IL"), label: "מסלולים" },
          { figure: providerCount.toLocaleString("he-IL"), label: "ספקים" },
          { figure: services.length.toLocaleString("he-IL"), label: "שירותים להשוואה" },
        ].map((s) => (
          <div key={s.label} className="flex items-baseline gap-1.5">
            <dt className="order-2 text-sm text-muted">{s.label}</dt>
            <dd className="order-1 font-display text-xl font-bold tracking-tight text-ink">
              {s.figure}
            </dd>
          </div>
        ))}
      </dl>

      {/* ── Trust signals — real catalogue counts + honest trust points + the
          §7b disclosure + §17 price caveat. Supports the picker above (the
          single primary action on this hub). ─────────────────────────────── */}
      <div className="mt-6">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: השוואה">{summary}</SgeSummary>
      </div>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
