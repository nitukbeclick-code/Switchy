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
import { getPlans, getProviders, getCategories } from "@/lib/data";
import {
  breadcrumbSchema,
  webPageSchema,
  howToSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
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
  const categoryCount = getCategories().length;

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
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
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

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מצאו את המסלול המשתלם ביותר עבורכם
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-foreground">
          חמש שאלות קצרות, ומיד תקבלו דירוג של מסלולים אמיתיים מתוך הקטלוג שלנו —
          עם הסבר ברור למה כל מסלול מתאים לכם. ללא העדפת ספק, חינמי וללא התחייבות.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
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

      {/* ── The wizard ────────────────────────────────────────────────────── */}
      <section aria-labelledby="quiz-h" className="mt-10">
        <h2 id="quiz-h" className="sr-only">
          שאלון ההתאמה
        </h2>
        <QuizWizard />
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
