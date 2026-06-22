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
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getServices, plansForService } from "@/lib/data";
import {
  breadcrumbSchema,
  collectionPageSchema,
  SITE_URL,
} from "@/lib/schema";
import { ils } from "@/lib/format";

export const metadata: Metadata = {
  title: "השוואת מסלולי תקשורת בישראל — לפי שירות",
  description:
    "מרכז ההשוואה של כל שירותי התקשורת בישראל: סלולר, אינטרנט, סיב אופטי, " +
    "טלוויזיה, חבילות משולבות וחו״ל. בחרו שירות להשוואת מסלולים מכל הספקים בשקלים.",
  alternates: { canonical: "/compare" },
};

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

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואה", url: "/compare" },
  ];

  const summary =
    `מרכז ההשוואה של חוסך: כל שירותי התקשורת בישראל במקום אחד — סלולר, אינטרנט, ` +
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
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">השוואה</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          השוואת מסלולי תקשורת בישראל
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          בחרו שירות להשוואת מסלולים מכל הספקים בישראל — מחירים בשקלים, כולל המחיר
          אחרי המבצע. הזמינות ארצית, אותם ספקים בכל הארץ.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: השוואה">{summary}</SgeSummary>
      </div>

      {/* ── Service cards ─────────────────────────────────────────────────── */}
      <section aria-labelledby="services-h" className="mt-10">
        <h2 id="services-h" className="sr-only">
          שירותים להשוואה
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const plans = plansForService(s.slug);
            const min = minPriceOf(plans);
            return (
              <li key={s.slug}>
                <Link
                  href={`/compare/${s.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="font-display text-lg font-semibold text-ink group-hover:text-accent">
                    השוואת {s.label}
                  </span>
                  <span className="mt-2 flex items-baseline gap-2 text-sm text-muted">
                    <span>{plans.length} מסלולים</span>
                    {min != null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>החל מ-{ils(min)}</span>
                      </>
                    )}
                  </span>
                  <span className="mt-3 inline-block text-sm font-medium text-accent-text">
                    להשוואת {s.label} ←
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <link rel="canonical" href={`${SITE_URL}/compare`} />
    </main>
  );
}
