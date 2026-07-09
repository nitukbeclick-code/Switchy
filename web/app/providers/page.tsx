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
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
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

  // Real catalogue-derived entry price for the hero VALUE clause: the cheapest
  // starting price across all providers. Because rankings are sorted by minPrice
  // ascending, rank-0's minPrice IS the catalogue floor — never a fabricated
  // figure. Falls back to 0 only on an empty catalogue.
  const minFeatured = providers.length ? providers[0].minPrice : 0;
  // The category the hero CTA routes into — the highest-traffic compare hub.
  const featuredCat = categories.includes("cellular")
    ? "cellular"
    : (categories[0] ?? "cellular");

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

      {/* ── Hero (flat-ink panel) ─────────────────────────────────────────────
          Calm, flat-ink editorial hero (bank-grade): a solid deep-ink panel
          (#111827, the light-theme --ink) in BOTH themes so "white text on ink"
          always holds, with the white H1 set directly on it — NO photo/video
          behind — and ONE green primary CTA plus ONE quiet secondary link. Green
          is applied ONLY to the price clause (VALUE), bound to the real catalogue
          entry price (minFeatured). A hairline border keeps it defined on the
          dark page background. Entrance staggers via the global .sw-reveal alias
          (globals.css) — no page-scoped keyframes needed. */}
      <header className="mt-4">
        <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
              כל ספקי התקשורת בישראל.{" "}
              <span className="text-accent">מסלולים מ-{ils(minFeatured)} לחודש.</span>
            </h1>
            <p
              className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
              style={{ animationDelay: "60ms" }}
            >
              {providers.length} ספקים בקטלוג שלנו, ממוינים לפי המחיר ההתחלתי הזול
              ביותר. בחרו ספק כדי לראות את כל המסלולים, המחירים והמחיר אחרי המבצע.
            </p>
            {/* CTA row — exactly ONE primary (solid green, glow, press). The
                consult path is a quiet SECONDARY white text link so only one
                action reads as primary per viewport. */}
            <div
              className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
              style={{ animationDelay: "120ms" }}
            >
              <TrackedCtaLink
                href={`/compare/${featuredCat}`}
                location="hero"
                label="compare"
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                בדקו כמה תחסכו
                <Icon name="chevron" size={18} aria-hidden="true" />
              </TrackedCtaLink>
              <TrackedCtaLink
                href="/book"
                location="hero"
                label="consult"
                className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
              >
                או דברו עם יועץ
              </TrackedCtaLink>
            </div>
            {/* Trust band — REAL catalogue counts: providers (structure) +
                categories (scope). The entry price is the hook so it carries the
                green VALUE emphasis (text-accent on ink), NOT a button. */}
            <p
              className="sw-reveal mt-8 text-sm text-white/85"
              style={{ animationDelay: "150ms" }}
            >
              {providers.length} ספקים · {categories.length} קטגוריות · החל מ-
              <span className="font-display font-bold text-accent">
                {ils(minFeatured)}
              </span>{" "}
              לחודש
            </p>
            {/* Quiet qualitative value line — honest framing (no fabricated
                figure), muted with a small green tick. */}
            <p
              className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
              style={{ animationDelay: "180ms" }}
            >
              <Icon name="check" size={16} className="shrink-0 text-accent" />
              מסלול מתאים יכול לחסוך לכם מאות ₪ בשנה — וההשוואה חינם
            </p>
          </div>
        </section>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: ספקים">{summary}</SgeSummary>
      </div>

      {/* ── Provider grid ─────────────────────────────────────────────────── */}
      <section aria-labelledby="providers-h" className="mt-14">
        {/* Methodology note (transparent ranking) — the grid's honest intro. */}
        <p className="max-w-2xl text-sm text-muted">
          שיטת הסידור שקופה: מיון לפי המחיר ההתחלתי הנמוך ביותר (מהזול ליקר),
          ובמקרה של שוויון — לפי מספר המסלולים. זהו סידור &quot;ערך&quot; עובדתי,
          לא ציון איכות סמוי ולא תשלום על מיקום.
        </p>
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
            className="card mt-6"
          />
        ) : (
          <ul className="bento-grid mt-6">
            {providers.map((p, i) => (
              <ScrollReveal as="li" key={p.slug} index={i} className="h-full">
                <Link
                  href={`/providers/${p.slug}`}
                  className="group bento card-interactive flex h-full flex-col p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {/* Identity row: brand-colored avatar + name. The "ערך מוביל"
                      VALUE pill marks the single cheapest entry point (rank 0),
                      tied to the stated methodology below. Mono-green: a labeled
                      outline VALUE chip (green tokens), never a green fill that
                      reads as a button. */}
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
                      figure (green value text) — the single number the user scans
                      for. text-value-text is the AA ≥4.5:1 shade for a figure on
                      a light surface (never the raw fill green). */}
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
                  {/* Tertiary CTA — plain text link + direction-aware chevron
                      (no border/fill). text-accent-text is the AA link green on a
                      light surface; the chevron mirrors correctly under RTL, so
                      never a hardcoded ←/→. */}
                  <span className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-text transition-colors group-hover:text-accent-hover">
                    לכל המסלולים של {p.name}
                    <Icon
                      name="chevron"
                      size={16}
                      aria-hidden="true"
                      className="transition-transform group-hover:-translate-x-0.5"
                    />
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
