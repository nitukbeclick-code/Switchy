// ────────────────────────────────────────────────────────────────────────────
// /quiz — the 5-question matcher. A few answers → INSTANT, REAL plan matches,
// ranked by the SAME provider-neutral formula the app + WhatsApp bot use
// (lib/recommend.ts → /api/recommend), then handed off to the existing lead flow.
//
// This server component owns the SEO shell (self-canonical metadata, WebPage +
// HowTo + Breadcrumb JSON-LD, the SGE summary, honest trust signals) and renders
// the client <QuizWizard> for the interactive part. Catalogue counts are REAL.
//
// HONESTY (E-E-A-T): the quiz ranks only real catalogue plans, never fabricates a
// match, shows annual saving only against a real bill, and is provider-neutral.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import {
  getPlans,
  getProviders,
  getCategories,
  plansByCategory,
} from "@/lib/data";
import {
  breadcrumbSchema,
  webPageSchema,
  howToSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils } from "@/lib/format";
import QuizWizard from "./QuizWizard";

export const metadata: Metadata = pageMetadata({
  title: "שאלון התאמה — מצאו את המסלול המשתלם ביותר",
  description:
    "ענו על 5 שאלות קצרות וקבלו מיד התאמות אמיתיות מתוך הקטלוג שלנו: מסלולי " +
    "סלולר, אינטרנט, טלוויזיה, משולב וחו״ל — מדורגים לפי הצרכים שלכם, עם הסבר " +
    "לכל התאמה. חינמי, בלי התחייבות, וללא העדפת ספק.",
  path: "/quiz",
});

export default function QuizPage() {
  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const planCount = getPlans().length;
  const providerCount = getProviders().length;
  const categories = getCategories();
  const categoryCount = categories.length;

  // REAL catalogue entry price for the hero VALUE clause — the cheapest priced
  // plan in the featured (highest-traffic) category, derived exactly like the
  // home hero. Never a fabricated figure.
  const featuredCat = categories.includes("cellular")
    ? "cellular"
    : categories[0];
  const featuredMin = [...plansByCategory(featuredCat)]
    .filter((p) => typeof p.price === "number")
    .sort((a, b) => a.price - b.price);
  const minFeatured = featuredMin.length ? featuredMin[0].price : 0;

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "שאלון התאמה", url: "/quiz" },
  ];

  const summary =
    `שאלון ההתאמה של Switchy AI: חמש שאלות קצרות — קטגוריה, תקציב, מה הכי חשוב לכם, ` +
    `מספר קווים וצורך בחו״ל — וקבלתם מיד דירוג של מסלולים אמיתיים מתוך הקטלוג שלנו, ` +
    `עם הסבר לכל התאמה. הדירוג ניטרלי לחלוטין כלפי הספקים, והשירות חינמי וללא התחייבות.`;

  // HowTo: the five quiz steps as machine-readable instructions (truthful — these
  // are exactly the steps the wizard walks the user through).
  const howTo = howToSchema({
    name: "איך מוצאים מסלול תקשורת מתאים בשאלון",
    description:
      "חמישה שלבים קצרים שמתרגמים את הצרכים שלכם לדירוג מסלולים אמיתי ומותאם.",
    url: "/quiz",
    steps: [
      { name: "בחירת קטגוריה", text: "בחרו מה מחפשים: סלולר, אינטרנט, טלוויזיה, חבילה משולבת או חבילת חו״ל." },
      { name: "תקציב", text: "סמנו את התקציב החודשי שנוח לכם, או שאין תקציב קבוע." },
      { name: "עדיפות", text: "בחרו מה הכי חשוב: מחיר, מהירות, כיסוי, שירות, גמישות או איזון." },
      { name: "מספר קווים", text: "ציינו לכמה קווים או אנשים המסלול מיועד." },
      { name: "שימוש בחו״ל", text: "סמנו אם חשוב לכם שהמסלול יכלול גלישה ושיחות בחו״ל." },
    ],
  });

  const related = [
    {
      title: "השוואת כל המסלולים",
      href: "/compare",
      description: "מרכז ההשוואה — כל שירות וכל הספקים, מחירים בשקלים.",
    },
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
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-20 sm:px-6">
      {/* Entrance motion: the `.sw-reveal` blocks below use the shared global alias
          (globals.css) which fires the swRevealUp keyframe — no per-page keyframe
          is redefined. Reduced-motion is handled globally. Stagger is applied via
          inline animationDelay on each revealed child. */}

      {/* Structured data: WebPage + HowTo + Breadcrumb. */}
      <JsonLd
        data={webPageSchema({
          name: "שאלון התאמה למסלול תקשורת",
          description:
            "חמש שאלות קצרות → התאמות אמיתיות ומדורגות מתוך הקטלוג, עם הסבר לכל התאמה.",
          url: "/quiz",
        })}
      />
      {howTo && <JsonLd data={howTo} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">שאלון התאמה</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Flat-ink editorial hero (bank-grade): a solid ink panel (#111827 in BOTH
          themes) with the white headline set directly on it — NO photo/video —
          and ONE primary CTA. The H1 is a CHECK ("בודקים…"), never a promised
          amount; green is applied ONLY to the price clause (VALUE), bound to the
          real catalogue entry price (minFeatured). The primary CTA is an in-page
          jump to the wizard; /book is demoted to a quiet SECONDARY white link. */}
      <header>
        <section className="relative isolate mt-4 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              בודקים כמה תוכלו לחסוך על התקשורת.{" "}
              <span className="text-accent">מסלולים מ-{ils(minFeatured)} לחודש.</span>
            </h1>
            <p
              className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
              style={{ animationDelay: "60ms" }}
            >
              חמש שאלות קצרות → דירוג של מסלולים אמיתיים מתוך הקטלוג שלנו, עם הסבר
              לכל התאמה. ללא העדפת ספק, חינמי וללא התחייבות.
            </p>
            <div
              className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
              style={{ animationDelay: "120ms" }}
            >
              {/* PRIMARY — in-page jump to the wizard. Solid green + accent glow +
                  press feedback. Exactly ONE primary per view. */}
              <a
                href="#quiz"
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                מצאו לי מסלול
                <Icon name="chevron" size={18} aria-hidden="true" />
              </a>
              {/* SECONDARY — quiet white text link, no fill. */}
              <TrackedCtaLink
                href="/book"
                location="hero"
                label="consult"
                className="interactive text-sm text-white/70 underline-offset-4 hover:underline"
              >
                או דברו עם יועץ
              </TrackedCtaLink>
            </div>
            {/* Trust band — REAL catalogue counts; the entry price carries the
                green VALUE emphasis (text-accent), NOT a button. */}
            <p
              className="sw-reveal mt-8 text-sm text-white/70"
              style={{ animationDelay: "150ms" }}
            >
              {planCount} מסלולים · {providerCount} ספקים · החל מ-
              <span className="font-display font-bold text-accent">
                {ils(minFeatured)}
              </span>{" "}
              לחודש
            </p>
            {/* Quiet qualitative value line — muted, small green tick, no
                fabricated figure. */}
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
      <div className="mt-12">
        <SgeSummary heading="השורה התחתונה: שאלון ההתאמה">{summary}</SgeSummary>
      </div>

      {/* ── Trust signals — real catalogue counts + §7b + §17 caveat ──────── */}
      <div className="mt-8">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── The wizard ────────────────────────────────────────────────────────
          id="quiz" is the hero CTA's in-page jump target; scroll-mt-6 keeps the
          sticky header from hiding it. aria-labelledby points to the sr-only h2. */}
      <section
        id="quiz"
        aria-labelledby="quiz-h"
        className="mt-14 scroll-mt-6"
      >
        <h2 id="quiz-h" className="sr-only">
          שאלון ההתאמה
        </h2>
        <QuizWizard />
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-20 border-t border-border pt-8"
      />
    </main>
  );
}
