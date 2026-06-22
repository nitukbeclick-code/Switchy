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
import { ils } from "@/lib/format";

export const metadata: Metadata = {
  title: "כל ספקי התקשורת בישראל — מסלולים ומחירים",
  description:
    "אינדקס כל ספקי התקשורת בישראל בקטלוג שלנו — סלולר, אינטרנט, טלוויזיה, " +
    "חבילות משולבות וחו״ל. מספר מסלולים, מחיר התחלתי וקטגוריות לכל ספק. השוואה חינמית.",
  alternates: { canonical: "/providers" },
};

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
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          כל ספקי התקשורת בישראל
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          {providers.length} ספקים בקטלוג שלנו, ממוינים לפי המחיר ההתחלתי הזול
          ביותר. בחרו ספק כדי לראות את כל המסלולים, המחירים והמחיר אחרי המבצע.
        </p>
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
      <section aria-labelledby="providers-h" className="mt-6">
        <h2 id="providers-h" className="sr-only">
          רשימת הספקים
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/providers/${p.slug}`}
                className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="font-display text-lg font-semibold text-ink group-hover:text-accent">
                  {p.name}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {p.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ")}
                </span>
                <span className="mt-3 flex items-baseline gap-2 text-sm text-muted">
                  <span>{p.planCount} מסלולים</span>
                  <span aria-hidden="true">·</span>
                  <span>החל מ-{ils(p.minPrice)}</span>
                </span>
                <span className="mt-3 inline-block text-sm font-medium text-accent-text">
                  לכל המסלולים של {p.name} ←
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="השוואה לפי קטגוריה"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <link rel="canonical" href={`${SITE_URL}/providers`} />
    </main>
  );
}
