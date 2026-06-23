// ─────────────────────────────────────────────────────────────────────────────
// /guides/[slug] — a single GUIDE ARTICLE. Renders the REAL ported article
// (TLDR → optional TOC → sections with tip/callout boxes → FAQ → related guides),
// premium + dark-mode aware. Emits Article + Breadcrumb JSON-LD always, FAQPage
// when the guide has Q&A, and HowTo when the guide is genuinely a step-by-step.
// Self-canonical via pageMetadata; internal links to the real /compare & /providers
// pages so an SEO/AEO visitor is one click from the comparison they need.
//
// HONESTY (E-E-A-T): all content/dates are ported verbatim from the published
// guide; HowTo is emitted ONLY for guides that really carry ordered steps; every
// internal link is a real on-site route. Nothing is fabricated.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import JsonLd from "@/components/JsonLd";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import {
  getGuide,
  getGuides,
  relatedGuides,
  guideInternalLinks,
  type GuideSection,
} from "@/lib/guides";
import {
  articleSchema,
  breadcrumbSchema,
  faqPageSchema,
  howToSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-static";

// Pre-render one page per guide at build time. force-static means notFound()
// would degrade to a soft-200, so cap to known slugs -> unknown slugs get a real 404.
export const dynamicParams = false;
export function generateStaticParams() {
  return getGuides().map((g) => ({ slug: g.slug }));
}

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  // The ported `title` already carries the brand suffix; pageMetadata's brand
  // normaliser strips+reapplies it, so the H1 (bare) is the cleaner title source.
  return pageMetadata({
    title: guide.h1,
    description: guide.desc,
    path: `/guides/${guide.slug}`,
  });
}

/** Stable ASCII anchor id for a section (sec-N) — avoids slugifying Hebrew. */
function sectionId(i: number): string {
  return `sec-${i + 1}`;
}

/** A tip (amber/value) or neutral callout box inside a section. */
function Callout({
  section,
}: {
  section: GuideSection;
}) {
  const tip = section.tip;
  const note = section.callout;
  return (
    <>
      {tip ? (
        <aside
          role="note"
          className="my-5 rounded-xl border-r-4 border-value bg-value/[0.07] p-4"
        >
          <p className="font-display text-sm font-semibold text-value-text">
            {tip.title ?? "טיפ"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {tip.text}
          </p>
        </aside>
      ) : null}
      {note ? (
        <aside
          role="note"
          className="my-5 rounded-xl border-r-4 border-border bg-surface p-4"
        >
          <p className="font-display text-sm font-semibold text-ink">
            {note.title ?? "שימו לב"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {note.text}
          </p>
        </aside>
      ) : null}
    </>
  );
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const url = `/guides/${guide.slug}`;
  const related = relatedGuides(guide, 3);
  const internalLinks = guideInternalLinks(guide);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מדריכים", url: "/guides" },
    { name: guide.h1, url },
  ];

  // HowTo only when the guide is genuinely a step-by-step (real ordered steps).
  const howTo = guide.howto
    ? howToSchema({
        name: guide.h1,
        description: guide.desc,
        url,
        steps: guide.howto,
      })
    : null;

  // A TOC is only worth showing for longer articles (a 2-item TOC is clutter).
  const showToc = guide.sections.length >= 3;

  const dateHe = new Date(guide.date).toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: Article + Breadcrumb (always); FAQPage + HowTo (real). */}
      <JsonLd
        data={articleSchema({
          headline: guide.h1,
          description: guide.desc,
          url,
          datePublished: guide.date,
          section: guide.cat,
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      {guide.faq.length ? (
        <JsonLd
          data={faqPageSchema(
            guide.faq.map((f) => ({ question: f.q, answer: f.a })),
          )}
        />
      ) : null}
      {howTo ? <JsonLd data={howTo} /> : null}

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/guides" className="interactive hover:text-accent">
          מדריכים
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">{guide.cat}</span>
      </nav>

      <article className="mt-4">
        {/* ── Article header ──────────────────────────────────────────────── */}
        <header>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            {guide.h1}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="font-medium text-accent-text">{guide.cat}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={guide.date}>{dateHe}</time>
            <span aria-hidden="true">·</span>
            <span>{guide.read} דק׳ קריאה</span>
          </div>
        </header>

        {/* ── TLDR ────────────────────────────────────────────────────────── */}
        <div className="bento mt-6 border-r-4 border-accent p-5 sm:p-6">
          <p className="text-base leading-relaxed text-foreground">
            <span className="font-display font-bold text-ink">בקצרה: </span>
            {guide.tldr}
          </p>
        </div>

        {/* ── Table of contents ───────────────────────────────────────────── */}
        {showToc ? (
          <nav
            aria-label="תוכן עניינים"
            className="card mt-6 p-5 sm:p-6"
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              בעמוד הזה
            </p>
            <ol className="space-y-2">
              {guide.sections.map((s, i) => (
                <li key={sectionId(i)} className="flex gap-2 text-sm">
                  <span aria-hidden="true" className="text-accent">
                    {i + 1}.
                  </span>
                  <a
                    href={`#${sectionId(i)}`}
                    className="interactive text-foreground hover:text-accent"
                  >
                    {s.h2}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        {/* ── Body sections ───────────────────────────────────────────────── */}
        <div className="mt-10 space-y-10">
          {guide.sections.map((s, i) => (
            <section
              key={sectionId(i)}
              id={sectionId(i)}
              className="scroll-mt-24"
            >
              <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {s.h2}
              </h2>
              {s.p?.map((p, pi) => (
                <p
                  key={pi}
                  className="mt-4 text-base leading-relaxed text-foreground"
                >
                  {p}
                </p>
              ))}
              {s.ul ? (
                <ul className="mt-4 space-y-2.5">
                  {s.ul.map((li, li2) => (
                    <li
                      key={li2}
                      className="flex gap-2.5 text-base leading-relaxed text-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2 inline-block h-1.5 w-1.5 flex-none rounded-full bg-accent"
                      />
                      <span>{li}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Callout section={s} />
            </section>
          ))}
        </div>

        {/* ── Step-by-step (visible) — only when the guide carries real steps. */}
        {guide.howto && guide.howto.length ? (
          <section className="mt-12">
            <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
              שלב אחר שלב
            </h2>
            <ol className="mt-5 space-y-4">
              {guide.howto.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-contrast"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display font-semibold text-ink">
                      {step.name}
                    </p>
                    <p className="mt-1 text-base leading-relaxed text-foreground">
                      {step.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* ── In-article CTA → the real compare page for this category ─────── */}
        <div className="bento mt-12 p-6 text-center sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-tight text-ink">
            רוצים לראות כמה תחסכו בפועל?
          </h2>
          <p className="mt-2 text-foreground">
            השוואה חינם בשניות, מהקטלוג ובשקלים — בלי התחייבות.
          </p>
          <Link
            href={internalLinks[0].href}
            className="press mt-5 inline-flex items-center gap-1.5 rounded-xl bg-accent px-6 py-3 font-display font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {internalLinks[0].label}
            <span aria-hidden="true">←</span>
          </Link>
        </div>

        {/* ── FAQ (visible — mirrors the FAQPage JSON-LD) ──────────────────── */}
        {guide.faq.length ? (
          <section
            aria-labelledby="faq-heading"
            className="mt-14 border-t border-border/40 pt-10"
          >
            <h2
              id="faq-heading"
              className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl"
            >
              שאלות נפוצות
            </h2>
            <div className="mt-5 space-y-3">
              {guide.faq.map((f, i) => (
                <details
                  key={i}
                  className="card group p-5 [&_summary]:cursor-pointer"
                >
                  <summary className="flex items-center justify-between gap-3 font-display font-semibold text-ink marker:content-none">
                    {f.q}
                    <span
                      aria-hidden="true"
                      className="text-accent transition-transform duration-200 group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <p className="mt-3 text-base leading-relaxed text-foreground">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ) : null}
      </article>

      {/* ── Internal links → real compare/providers pages ───────────────────── */}
      <RelatedAuthorityPages
        heading="קישורים שימושיים"
        className="mt-14"
        links={internalLinks.map((l) => ({ href: l.href, label: l.label }))}
      />

      {/* ── Further reading → related guides (never dead-ends) ──────────────── */}
      {related.length ? (
        <section
          aria-labelledby="more-guides"
          className="mt-14 border-t border-border/40 pt-10"
        >
          <h2
            id="more-guides"
            className="mb-6 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
          >
            <span
              aria-hidden="true"
              className="inline-block h-5 w-1.5 rounded-full bg-accent"
            />
            מדריכים נוספים
          </h2>
          <div className="bento-grid">
            {related.map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}`}
                className="card card-interactive group flex flex-col p-5"
              >
                <span className="self-start rounded-full bg-accent/[0.08] px-2.5 py-0.5 text-xs font-semibold text-accent-text">
                  {g.cat}
                </span>
                <h3 className="mt-3 font-display text-base font-semibold leading-snug tracking-tight text-ink transition-colors group-hover:text-accent">
                  {g.h1}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-foreground">
                  {g.desc}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
