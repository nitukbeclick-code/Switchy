// ─────────────────────────────────────────────────────────────────────────────
// /guides — the GUIDES HUB. A premium, dark-mode-aware authority index that lists
// every real guide article (ported from the static site) grouped by category,
// each card deep-linking into /guides/[slug]. Gives the /guides route a crawlable
// index (no dead-end) + a CollectionPage ItemList of every article for engines.
//
// HONESTY (E-E-A-T): every card links to a real on-site article; counts are
// derived from the catalogue of guides. Nothing is fabricated.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import EmptyState from "@/components/EmptyState";
import ScrollReveal from "@/components/ScrollReveal";
import Icon from "@/components/Icon";
import { getGuides, guideCategories, guidesInCategory } from "@/lib/guides";
import { breadcrumbSchema, guidesCollectionSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-static";

const guideCount = getGuides().length;

export const metadata: Metadata = pageMetadata({
  title: "מדריכים — איך לחסוך על תקשורת",
  description:
    `${guideCount} מדריכים מקצועיים בעברית: איך לעבור ספק, לבחור מסלול סלולר, ` +
    "סיב אופטי מול כבלים, eSIM לחו״ל ועוד — כל הטיפים כדי לא לשלם יותר מדי.",
  path: "/guides",
});

export default function GuidesHubPage() {
  const guides = getGuides();
  const categories = guideCategories();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מדריכים", url: "/guides" },
  ];

  // CollectionPage embedding an ItemList of Article references — an explicit,
  // ranked map of the hub for engines. Each entry carries the guide's real
  // headline, url, publish date and section + the brand Organization as
  // author/publisher (the genuine author of its editorial guides). Fields map
  // straight from the real guide catalogue (slug/h1/desc/date/cat) — nothing
  // fabricated; the builder omits any date it isn't given.
  const collection = guidesCollectionSchema({
    guides: guides.map((g) => ({
      slug: g.slug,
      h1: g.h1,
      desc: g.desc,
      date: g.date,
      cat: g.cat,
    })),
    url: "/guides",
  });

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd data={collection} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מדריכים</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          מרכז הידע
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מדריכים — איך לחסוך על תקשורת
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          {guideCount} מדריכים בעברית — טיפים, השוואות ומדריכי החלטה שיחסכו לכם
          כסף על סלולר, אינטרנט, טלוויזיה, חבילות וחו״ל.
        </p>

        {/* Category jump-chips — anchor into each grouped section below. */}
        <nav
          aria-label="קפיצה לקטגוריה"
          className="mt-6 flex flex-wrap gap-2"
        >
          {categories.map((c) => (
            <a
              key={c.cat}
              href={`#cat-${encodeURIComponent(c.cat)}`}
              className="interactive press inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {c.cat}
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/[0.1] px-1.5 text-xs font-semibold tabular-nums text-accent-text">
                {c.count}
              </span>
            </a>
          ))}
        </nav>
      </header>

      {/* ── Grouped guide cards (by category) ─────────────────────────────── */}
      <div className="mt-12 space-y-14">
        {guides.length === 0 ? (
          <EmptyState
            mascot
            title="המדריכים בדרך"
            description="עוד לא פרסמנו מדריכים בעמוד הזה. בינתיים אפשר לקפוץ ישר להשוואת המסלולים ולראות כמה אפשר לחסוך."
            cta={{ label: "להשוואת מסלולים", href: "/compare/cellular" }}
          />
        ) : null}
        {categories.map((c) => {
          const inCat = guidesInCategory(c.cat);
          return (
            <section
              key={c.cat}
              id={`cat-${encodeURIComponent(c.cat)}`}
              aria-labelledby={`cat-h-${encodeURIComponent(c.cat)}`}
              className="scroll-mt-24"
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-3">
                <h2
                  id={`cat-h-${encodeURIComponent(c.cat)}`}
                  className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-ink"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-5 w-1.5 rounded-full bg-accent"
                  />
                  {c.cat}
                </h2>
                <span className="text-sm text-muted">{c.count} מדריכים</span>
              </div>

              <div className="bento-grid mt-6">
                {inCat.map((g, gi) => (
                  <ScrollReveal key={g.slug} index={gi} className="flex">
                  <Link
                    href={`/guides/${g.slug}`}
                    className="card card-interactive group flex w-full flex-col p-5 sm:p-6"
                  >
                    <span className="self-start rounded-full bg-accent/[0.08] px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                      {g.cat}
                    </span>
                    <h3 className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-accent">
                      {g.h1}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-foreground">
                      {g.desc}
                    </p>
                    <span className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                      <span>{g.read} דק׳ קריאה</span>
                      <span className="mr-auto inline-flex items-center gap-1 font-medium text-accent-text">
                        קראו
                        <Icon
                          name="arrow"
                          size={15}
                          aria-hidden="true"
                          className="transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:-translate-x-0.5"
                        />
                      </span>
                    </span>
                  </Link>
                  </ScrollReveal>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Keep the entity web connected ─────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16"
        links={[
          {
            href: "/compare/cellular",
            label: "השוואת מסלולי סלולר",
            hint: "השוו מחירים בשקלים, מהקטלוג — חינם ובלי התחייבות.",
          },
          {
            href: "/compare/internet",
            label: "השוואת מסלולי אינטרנט",
            hint: "סיב אופטי וכבלים — מחיר מבצע ומחיר קבוע.",
          },
          {
            href: "/vs",
            label: "השוואות ראש בראש",
            hint: "ספק מול ספק בכל קטגוריה.",
          },
          {
            href: "/glossary",
            label: "מילון מונחים",
            hint: "5G, eSIM, סיב אופטי, ניוד מספר ועוד.",
          },
        ]}
      />
    </main>
  );
}
