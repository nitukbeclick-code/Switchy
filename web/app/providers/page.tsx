// ────────────────────────────────────────────────────────────────────────────
// /providers — the PROVIDER INDEX hub. One card per derived provider, linking to
// its /providers/[slug] page. This is a high-value GEO authority hub (it was a
// site-wide dead link before: the footer + every breadcrumb pointed here) and a
// natural ItemList of every carrier in the catalogue.
//
// HONESTY (E-E-A-T): every figure (plan count, starting price, categories) is
// catalogue-derived. Providers are ranked by the same TRANSPARENT, stated
// methodology used elsewhere (lowest starting price first) — no covert quality
// score. No fabricated ratings.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import EmptyState from "@/components/EmptyState";
import ScrollReveal from "@/components/ScrollReveal";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import {
  getCategories,
  buildProviderRankings,
  plansByCategory,
  CATEGORY_HE,
} from "@/lib/data";
import {
  breadcrumbSchema,
  collectionPageSchema,
  knowledgeGraphSchema,
  SITE_URL,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils } from "@/lib/format";
import { ProviderLogo } from "@/components/ProviderLogo";

// ── Provider avatar ──────────────────────────────────────────────────────────
// A circular monogram filled with the carrier's OWN brand color (from
// {@link providerBrandColor}) — the real per-carrier hue, NOT the app accent, and
// never recolored to the theme. White glyph for contrast on the saturated fill.
// Decorative: the provider name beside it carries the meaning → hidden from AT.
// Provider brand mark (real carrier logo, else brand-colored monogram) is the
// shared <ProviderLogo>, here at a 44px squircle.

export const metadata: Metadata = pageMetadata({
  title: "כל ספקי התקשורת בישראל — מסלולים ומחירים",
  description:
    "אינדקס כל ספקי התקשורת בישראל בקטלוג שלנו — סלולר, אינטרנט, טלוויזיה, " +
    "חבילות משולבות וחו״ל. מספר מסלולים, מחיר התחלתי וקטגוריות לכל ספק. השוואה חינמית.",
  path: "/providers",
});

export default function ProvidersIndexPage() {
  // Transparent "best value" order: cheapest entry point first (stated below).
  const providers = buildProviderRankings();
  const categories = getCategories();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "ספקים", url: "/providers" },
  ];

  const summary =
    `אינדקס ${providers.length} ספקי התקשורת בישראל שבקטלוג שלנו. לכל ספק מוצגים ` +
    `מספר המסלולים, המחיר ההתחלתי והקטגוריות שבהן הוא פעיל — כדי שתוכלו להשוות ` +
    `ספקים זה מול זה ולעבור לדף הספק עם כל המסלולים. השוואה חינמית, מחירים בשקלים.`;

  // ItemList of every provider (each as a ListItem → its on-site page).
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: providers.length,
    itemListElement: providers.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.name,
      url: `${SITE_URL}/providers/${p.slug}`,
    })),
  };

  // Related: the category compare hubs (no dead-ends).
  const related = categories.map((cat) => ({
    title: `השוואת מסלולי ${CATEGORY_HE[cat] ?? cat}`,
    href: `/compare/${cat}`,
    description: `${plansByCategory(cat).length} מסלולים מכל הספקים.`,
  }));

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* Structured data: CollectionPage + ItemList + Breadcrumb + KnowledgeGraph. */}
      <JsonLd
        data={collectionPageSchema({
          name: "ספקי תקשורת בישראל",
          description:
            "אינדקס כל ספקי התקשורת בישראל בקטלוג שלנו, עם מספר מסלולים ומחיר התחלתי לכל ספק.",
          url: "/providers",
        })}
      />
      <JsonLd data={itemList} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl: "/providers",
          pageName: "ספקי תקשורת בישראל",
          providers,
          serviceType: "אינדקס ספקי תקשורת",
          description:
            "דף מרכז את כל ספקי התקשורת בישראל שבקטלוג שלנו, עם קישור לדף כל ספק.",
        })}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">ספקים</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          כל ספקי התקשורת בישראל
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          {providers.length} ספקים בקטלוג שלנו, ממוינים לפי המחיר ההתחלתי הזול
          ביותר. בחרו ספק כדי לראות את כל המסלולים, המחירים והמחיר אחרי המבצע.
        </p>
        {/* Compact catalogue stat line — two figures as the only anchors:
            providers (structure) + categories (scope). No fabricated metrics. */}
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">ספקים בקטלוג</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {providers.length}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">קטגוריות שירות</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {categories.length}
            </dd>
          </div>
        </dl>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: ספקים">{summary}</SgeSummary>
      </div>

      {/* ── Methodology note (transparent ranking) ────────────────────────── */}
      <p className="mt-8 max-w-2xl text-sm text-muted">
        שיטת הסידור שקופה: מיון לפי המחיר ההתחלתי הנמוך ביותר (מהזול ליקר), ובמקרה
        של שוויון — לפי מספר המסלולים. זהו סידור &quot;ערך&quot; עובדתי, לא ציון
        איכות סמוי ולא תשלום על מיקום.
      </p>

      {/* ── Provider grid ─────────────────────────────────────────────────── */}
      <section aria-labelledby="providers-h" className="mt-8">
        <h2 id="providers-h" className="sr-only">
          רשימת הספקים
        </h2>
        {providers.length === 0 ? (
          // Defensive empty state — the catalogue should always carry providers,
          // but never dead-end on a blank grid. Routes onward to the compare hub.
          <EmptyState
            mascot
            title="אין ספקים להצגה כרגע"
            description="לא נמצאו ספקים בקטלוג. נסו את מרכז ההשוואה לכל המסלולים והשירותים."
            cta={{ label: "למרכז ההשוואה", href: "/compare" }}
            className="card"
          />
        ) : (
          <ul className="bento-grid">
            {providers.map((p, i) => (
              <ScrollReveal as="li" key={p.slug} index={i} className="h-full">
                <Link
                  href={`/providers/${p.slug}`}
                  className="group bento card-interactive flex h-full flex-col p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* Identity row: brand-colored avatar + name. The "ערך מוביל"
                      VALUE pill marks the single cheapest entry point (rank 0),
                      tied to the stated methodology below — amber = VALUE. */}
                  <div className="flex items-center gap-3">
                    <ProviderLogo provider={p.name} size={44} rounded="2xl" />
                    <span className="font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent">
                      {p.name}
                    </span>
                    {i === 0 && (
                      <span className="ms-auto shrink-0 rounded-full border border-value/30 bg-value/10 px-2.5 py-0.5 text-xs font-semibold text-value-text">
                        ערך מוביל
                      </span>
                    )}
                  </div>
                  <span className="mt-3 block text-sm text-muted">
                    {p.categories.map((c) => CATEGORY_HE[c] ?? c).join(" · ")}
                  </span>
                  {/* Stat row: plan count (neutral) + starting price as the VALUE
                      figure (amber text) — the single number the user scans for. */}
                  <span className="mt-4 flex items-baseline gap-2 text-sm text-muted">
                    <span>{p.planCount} מסלולים</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      החל מ-
                      <span className="font-display text-base font-bold text-value-text">
                        {ils(p.minPrice)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-text transition-transform group-hover:-translate-x-0.5">
                    לכל המסלולים של {p.name} ←
                  </span>
                </Link>
              </ScrollReveal>
            ))}
          </ul>
        )}
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="השוואה לפי קטגוריה"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
