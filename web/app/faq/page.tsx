// ────────────────────────────────────────────────────────────────────────────
// /faq — the FAQ HUB. Mirrors the static site/faq.html: a category-sectioned set
// of real Hebrew Q&A (general + per service), rendered as the shared, accessible
// <FaqAccordion> (native <details>, no client JS) and emitted ONCE as a single
// FAQPage JsonLd covering every visible answer.
//
// HONESTY (E-E-A-T): every Q&A is factual catalogue/process copy from lib/faq.ts
// (the single source of truth, also feeding the homepage + category pages). No
// fabricated figures, ratings, or testimonials. Because several answers reference
// the paid referral relationship ("זה באמת בחינם / עמלה"), a §7b
// <CommissionDisclosure> banner sits prominently up top, exactly like the compare
// hub. MOBILE-FIRST, RTL-native (the app's existing direction), AA a11y.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import Icon from "@/components/Icon";
import SgeSummary from "@/components/SgeSummary";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import { FaqAccordion, type FaqItem } from "@/components/FaqAccordion";
import { GENERAL_FAQ, faqForCategory } from "@/lib/faq";
import { CATEGORY_HE } from "@/lib/categories";
import {
  faqPageSchema,
  breadcrumbSchema,
  speakableSchema,
  type QA,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "שאלות נפוצות על מעבר ספק תקשורת — סלולר, אינטרנט, טלוויזיה וחו״ל",
  description:
    "כל התשובות במקום אחד — מעבר ספק, ניוד מספר, 5G, סיב אופטי, חבילות משולבות " +
    "ו-eSIM לחו״ל. הסברים ברורים בעברית, בלי ז׳רגון ובלי הפתעות. השוואה חינמית.",
  path: "/faq",
});

// QA → FaqItem (the accordion renders {q, a}); QA is {question, answer}.
function toItems(qas: QA[]): FaqItem[] {
  return qas.map((qa) => ({ q: qa.question, a: qa.answer }));
}

// The catalogue service categories that carry their OWN Q&A in lib/faq.ts, in the
// same order as the static FAQ. faqForCategory() returns [...specific, ...GENERAL],
// so we strip the shared general tail to get ONLY the category-specific questions
// (the general set is rendered once in its own section above).
const FAQ_CATEGORIES = ["cellular", "internet", "tv", "triple", "abroad"] as const;

/** A FAQ section: a heading, its Q&A, and the matching compare hub to continue to. */
interface FaqSection {
  id: string;
  /** Eyebrow / kicker label. */
  eyebrow: string;
  /** Visible H2. */
  heading: string;
  qas: QA[];
  /** "Continue to" compare link for this topic. */
  more?: { href: string; label: string };
}

function buildSections(): FaqSection[] {
  const generalLen = GENERAL_FAQ.length;

  const general: FaqSection = {
    id: "faq-general",
    eyebrow: "מדריך כללי",
    heading: "כללי — מעבר, חשבון וחיסכון",
    qas: GENERAL_FAQ,
    more: { href: "/guides", label: "לכל המדריכים" },
  };

  const byCategory: FaqSection[] = FAQ_CATEGORIES.flatMap((cat) => {
    // category-specific Q&A only (drop the appended general tail)
    const specific = faqForCategory(cat).slice(0, -generalLen);
    if (specific.length === 0) return [];
    const he = CATEGORY_HE[cat] ?? cat;
    return [
      {
        id: `faq-${cat}`,
        eyebrow: he,
        heading: he,
        qas: specific,
        more: { href: `/compare/${cat}`, label: `השוו מסלולי ${he}` },
      },
    ];
  });

  return [general, ...byCategory];
}

export default function FaqPage() {
  const sections = buildSections();

  // Real count of service-specific FAQ sections (every section except the shared
  // "כללי" one) — drives the hero trust band, so the figure can never drift from
  // the rendered content (no hardcoded literal).
  const serviceCategoryCount = sections.filter(
    (s) => s.id !== "faq-general",
  ).length;

  // ONE FAQPage covering every visible answer, deduped on the question text
  // (the general set repeats some phrasing per service in the source copy).
  const seen = new Set<string>();
  const allQA: QA[] = sections
    .flatMap((s) => s.qas)
    .filter((qa) => {
      if (seen.has(qa.question)) return false;
      seen.add(qa.question);
      return true;
    });

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "שאלות נפוצות", url: "/faq" },
  ];

  // Speakable (voice / pillar 7): the concise read-aloud region — the SGE/AEO
  // summary paragraph (#ai-summary) + the H1 — both real rendered nodes.
  const speakable = speakableSchema(["#ai-summary p", "h1"]);

  const summary =
    `כל השאלות הנפוצות על מעבר ספק תקשורת בישראל במקום אחד — סלולר, אינטרנט, ` +
    `טלוויזיה, חבילות משולבות וחו״ל. תמצאו כאן הסברים על ניוד מספר, התחייבות וקנס ` +
    `יציאה, ההבדל בין סיב אופטי לכבלים, 5G מול 4G, eSIM לחו״ל ועוד — בעברית ברורה. ` +
    `השוואת המסלולים עצמה חינמית; אתם משלמים את אותו מחיר כמו אצל הספק.`;

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* Structured data: ONE FAQPage (all visible Q&A) + Breadcrumb + Speakable.
          Speakable marks the concise read-aloud region — the SGE/AEO summary
          paragraph (#ai-summary) + the H1 — so voice assistants read the real
          on-page answer block (it points at rendered nodes; it asserts nothing). */}
      <JsonLd data={faqPageSchema(allQA)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      {speakable ? <JsonLd data={speakable} /> : null}

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">שאלות נפוצות</span>
      </nav>

      {/* ── Hero (flat-ink panel) ─────────────────────────────────────────────
          Premium-2026 hero, mirroring the home: a solid deep-ink panel (#111827
          in BOTH themes so "white on ink" always holds) with the white H1 set
          directly on it — NO photo/video behind — an eyebrow pill, ONE green
          primary CTA + ONE quiet secondary link, and a REAL trust band (the
          honest visible Q&A count — no fabricated figure). The H1 keeps its role
          for the speakable/voice schema (which targets "h1"). Entrance staggers
          via the global `.sw-reveal` alias; a hairline border defines the panel
          on the dark page background. */}
      <header className="mt-4">
        <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <p
              className="sw-reveal mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/85"
              style={{ animationDelay: "0ms" }}
            >
              <Icon name="check" size={14} className="shrink-0 text-accent" />
              מרכז הידע · בעברית ברורה
            </p>
            <h1 className="sw-reveal mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              שאלות נפוצות
            </h1>
            <p
              className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl [text-wrap:pretty]"
              style={{ animationDelay: "60ms" }}
            >
              {allQA.length} שאלות ותשובות על מעבר ספק, סלולר, אינטרנט, טלוויזיה,
              חבילות משולבות וחו״ל — מרוכזות במקום אחד, בעברית ברורה.
            </p>
            {/* CTA row — exactly ONE primary (solid green, glow, press). The
                consult path is a quiet SECONDARY white text link. */}
            <div
              className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
              style={{ animationDelay: "120ms" }}
            >
              <TrackedCtaLink
                href="/compare"
                location="faq-hero"
                label="compare"
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                בדקו כמה תחסכו
                <Icon name="chevron" size={18} aria-hidden="true" />
              </TrackedCtaLink>
              <TrackedCtaLink
                href="/book"
                location="faq-hero"
                label="consult"
                className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
              >
                או דברו עם יועץ
              </TrackedCtaLink>
            </div>
            {/* Trust band — the honest count of visible Q&A (real, no fabricated
                figure). tabular-nums column-aligns the digit (parity with home). */}
            <p
              className="nums-tabular sw-reveal mt-8 text-sm text-white/85"
              style={{ animationDelay: "150ms" }}
            >
              <span className="font-display font-bold text-white">
                {allQA.length}
              </span>{" "}
              שאלות ותשובות ·{" "}
              <span className="font-display font-bold text-white">
                {serviceCategoryCount}
              </span>{" "}
              קטגוריות שירות · בלי ז׳רגון
            </p>
          </div>
        </section>
      </header>

      {/* ── §7b commission disclosure (several answers touch the paid model) ─ */}
      <CommissionDisclosure variant="banner" className="mt-8" />

      {/* ── SGE / AEO summary ─────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה">{summary}</SgeSummary>
      </div>

      {/* ── Jump links to the category sections (mobile-first chips) ──────── */}
      <nav aria-label="קפיצה לנושא" className="mt-8">
        <ul className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="interactive inline-flex rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-foreground transition-colors duration-150 ease-[var(--ease-out)] hover:border-accent/40 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.heading}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── FAQ sections ──────────────────────────────────────────────────── */}
      {sections.map((s) => (
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`${s.id}-h`}
          className="mt-12 scroll-mt-6"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
            {s.eyebrow}
          </p>
          <h2
            id={`${s.id}-h`}
            className="mt-2 font-display text-2xl font-bold tracking-tight text-ink"
          >
            {s.heading}
          </h2>
          <FaqAccordion items={toItems(s.qas)} className="mt-6" />
          {s.more && (
            <p className="mt-4 text-sm">
              <Link
                href={s.more.href}
                className="interactive inline-flex items-center gap-1 font-medium text-accent-text hover:text-accent-hover"
              >
                {s.more.label}
                <Icon name="chevron" size={16} aria-hidden="true" />
              </Link>
            </p>
          )}
        </section>
      ))}

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16 border-t border-border pt-8"
        links={[
          {
            href: "/guides",
            label: "מדריכים",
            hint: "איך עוברים ספק, בוחרים מסלול וחוסכים — שלב אחר שלב.",
          },
          {
            href: "/glossary",
            label: "מילון מונחים",
            hint: "5G, eSIM, סיב אופטי, ניוד מספר ועוד — בעברית ברורה.",
          },
          {
            href: "/compare/cellular",
            label: "השוואת מסלולי סלולר",
            hint: "השוו מחירים בשקלים, מהקטלוג — חינם ובלי התחייבות.",
          },
          {
            href: "/book",
            label: "תיאום פגישת ייעוץ",
            hint: "רוצים ליווי אישי במעבר? קבעו שיחה — בלי עלות.",
          },
        ]}
      />
    </main>
  );
}
