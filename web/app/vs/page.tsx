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
import { getVsPairs } from "@/lib/vs";
import type { VsPair } from "@/lib/vs";
import {
  breadcrumbSchema,
  collectionPageSchema,
  SITE_URL,
} from "@/lib/schema";
import { ils } from "@/lib/format";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "השוואות ראש בראש — ספק מול ספק | חוסך / Switchy",
  description:
    "השוואות ישירות בין ספקי התקשורת בישראל: סלקום מול פרטנר, בזק מול HOT ועוד. " +
    "מחיר התחלתי, מספר מסלולים ומאפיינים בכל קטגוריה — מהקטלוג ובשקלים. חינמי.",
  alternates: { canonical: "/vs" },
};

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

export default function VsIndexPage() {
  const pairs = getVsPairs();
  const groups = groupByCategory(pairs);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "השוואות ראש בראש", url: "/vs" },
  ];

  const summary =
    `מרכז ההשוואות הישירות של חוסך: ${pairs.length} השוואות ראש בראש בין ספקי ` +
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

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">השוואות ראש בראש</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          השוואות ראש בראש — ספק מול ספק
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          השוואות ישירות בין שני ספקים באותה קטגוריה — מחיר התחלתי, מספר מסלולים
          ומאפיינים זה מול זה. הנתונים מהקטלוג ובשקלים.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: השוואות ראש בראש">{summary}</SgeSummary>
      </div>

      {/* ── Match-up cards, grouped by category ───────────────────────────── */}
      {groups.map((group) => (
        <section
          key={group.label}
          aria-labelledby={`vs-cat-${group.label}`}
          className="mt-10"
        >
          <h2
            id={`vs-cat-${group.label}`}
            className="font-display text-2xl font-bold text-ink"
          >
            {group.label}
          </h2>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.pairs.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/vs/${p.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="font-display text-lg font-semibold text-ink group-hover:text-accent">
                    {p.a.provider.name} מול {p.b.provider.name}
                  </span>
                  <span className="mt-2 flex items-baseline gap-2 text-sm text-muted">
                    <span>{p.a.provider.name} מ-{ils(p.a.minPrice)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{p.b.provider.name} מ-{ils(p.b.minPrice)}</span>
                  </span>
                  <span className="mt-3 inline-block text-sm font-medium text-accent-text">
                    להשוואה ←
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <link rel="canonical" href={`${SITE_URL}/vs`} />
    </main>
  );
}
