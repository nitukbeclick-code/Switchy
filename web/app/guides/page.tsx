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
import TrackedCtaLink from "@/components/TrackedCtaLink";
import { getGuides, guideCategories, guidesInCategory } from "@/lib/guides";
import { getCategories, getProviders, getPlans, plansByCategory } from "@/lib/data";
import { breadcrumbSchema, guidesCollectionSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils } from "@/lib/format";

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

  // Real catalogue figures for the hero trust band — derived exactly as the home
  // page does (truth-only; nothing fabricated). featuredCat is the cellular hook
  // when present, and minFeatured is that category's real cheapest entry price.
  const catalogueCategories = getCategories();
  const providers = getProviders();
  const planCount = getPlans().length;
  const featuredCat = catalogueCategories.includes("cellular")
    ? "cellular"
    : catalogueCategories[0];
  const cheapestFeatured = [...plansByCategory(featuredCat)]
    .filter((p) => typeof p.price === "number")
    .sort((a, b) => a.price - b.price);
  const minFeatured = cheapestFeatured.length ? cheapestFeatured[0].price : 0;

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

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Premium-2026 flat-ink hero panel (mirrors the home hero): a solid deep
          ink panel (#111827 in BOTH themes) with the white headline set directly
          on it — NO photo/video behind — and green applied ONLY to the price
          clause (VALUE). ONE primary CTA + ONE quiet secondary text link. Every
          number is catalogue-derived (planCount / providers / minFeatured). */}
      <section className="mt-4 relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
            מדריכים שיעזרו לכם לשלם פחות על התקשורת.{" "}
            <span className="text-accent">מסלולים מ-{ils(minFeatured)} לחודש.</span>
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
            style={{ animationDelay: "60ms" }}
          >
            {guideCount} מדריכים בעברית — טיפים, השוואות ומדריכי החלטה לסלולר,
            אינטרנט, טלוויזיה, חבילות וחו״ל.
          </p>
          {/* CTA row — exactly ONE primary (solid green, glow, press). Reading a
              guide is lower-intent, so the primary points straight to the compare
              tool; the guides are the whole page below, so no second fill. */}
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
          {/* Trust band — REAL catalogue counts; the entry price carries the
              green VALUE emphasis (text-accent on ink), NOT a button. */}
          <p
            className="sw-reveal mt-8 text-sm text-white/85"
            style={{ animationDelay: "150ms" }}
          >
            {planCount} מסלולים · {providers.length} ספקים · החל מ-
            <span className="font-display font-bold text-accent">
              {ils(minFeatured)}
            </span>{" "}
            לחודש
          </p>
          {/* Quiet qualitative value line — honest, no fabricated figure. */}
          <p
            className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            מסלול מתאים יכול לחסוך לכם מאות ₪ בשנה — וההשוואה חינם
          </p>
        </div>
      </section>

      {/* ── Category jump-chips ─────────────────────────────────────────────
          SECONDARY grammar — quiet outline pills on the light surface (border +
          surface bg, greens only on hover). They anchor into each grouped
          section below; the count badge uses text-accent-text (the AA green for
          text), never a green fill that would read as an action. */}
      <nav
        aria-label="קפיצה לקטגוריה"
        className="mt-8 flex flex-wrap justify-center gap-2"
      >
        {categories.map((c) => (
          <a
            key={c.cat}
            href={`#cat-${encodeURIComponent(c.cat)}`}
            className="interactive press sw-lift inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground hover:border-accent/50 hover:text-accent hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {c.cat}
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/[0.1] px-1.5 text-xs font-semibold tabular-nums text-accent-text">
              {c.count}
            </span>
          </a>
        ))}
      </nav>

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
