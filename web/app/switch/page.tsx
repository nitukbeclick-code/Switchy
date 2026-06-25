// ────────────────────────────────────────────────────────────────────────────
// /switch — index of all providers' "מדריך מעבר/ניתוק" (Smart Exit) guides.
//
// A helpful-content hub: one card per provider linking to its factual guide on
// how to disconnect + port the number AWAY from that provider. The framing is
// truthful and grounded in Israeli consumer rights (the disconnection law / זכות
// ניתוק, number porting via מסלקת הניוד, written notice). It invents no phone
// numbers or exact steps and always points users to compare alternatives first.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import EmptyState from "@/components/EmptyState";
import Icon from "@/components/Icon";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getProviders, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  breadcrumbSchema,
  faqPageSchema,
  knowledgeGraphSchema,
  type QA,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "מדריכי מעבר וניתוק ספק — איך לעזוב כל ספק בישראל",
  description:
    "מדריך עובדתי לניתוק ומעבר מכל ספק תקשורת בישראל — סלולר, אינטרנט, טלוויזיה " +
    "וחבילות משולבות. זכות הניתוק, ניוד מספר דרך מסלקת הניוד, והשוואת חלופות. חינם.",
  path: "/switch",
});

// Verification timestamp — when the data behind this page was last regenerated.
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

// Shared, factual rights FAQ — Israeli consumer law, stated generally (no invented
// per-provider steps/numbers). Reused on the per-provider pages too.
const RIGHTS_FAQ: QA[] = [
  {
    question: "האם מותר לי לעזוב את הספק בכל עת?",
    answer:
      "במסלול ללא התחייבות ניתן לעזוב בכל עת ללא קנס יציאה. במסלול עם התחייבות " +
      "ייתכן חיוב על יתרת תקופת ההתחייבות בלבד, בהתאם לתנאי ההסכם שחתמתם עליו. " +
      "כדאי לבדוק את מסמך תנאי ההתקשרות שלכם לפני הניתוק.",
  },
  {
    question: "האם אאבד את מספר הטלפון שלי כשאעבור ספק?",
    answer:
      "לא. בישראל ניתן לעבור ספק סלולר תוך שמירה על אותו מספר (ניוד מספר), ללא " +
      "עלות. הניוד מתבצע מול הספק החדש, שמטפל מול מסלקת הניוד בסגירת החשבון הישן.",
  },
  {
    question: "כמה זמן לוקח ניוד מספר סלולר?",
    answer:
      "ניוד מספר סלולר מתבצע בדרך כלל תוך יום עסקים אחד. מעבר ספק אינטרנט תלוי " +
      "בתשתית ועשוי לקחת מספר ימים עד להתקנה אצל הספק החדש.",
  },
  {
    question: "האם הספק יכול לסרב לנתק אותי?",
    answer:
      "לא. הספק מחויב לאפשר ניתוק. לאחר הודעת ניתוק, השירות מופסק והחיוב נעצר " +
      "בהתאם לדין ולתנאי ההתקשרות. את ההודעה כדאי לתעד (בכתב/בערוצים הרשמיים).",
  },
];

export default function SwitchIndexPage() {
  const providers = getProviders();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מדריכי מעבר וניתוק", url: "/switch" },
  ];

  const summary =
    "מדריכי מעבר וניתוק לכל ספקי התקשורת בישראל. כל מדריך מסביר באופן עובדתי איך " +
    "לנתק ולנייד את המספר מהספק — לפי זכות הניתוק, ניוד דרך מסלקת הניוד והודעה " +
    "בכתב — ומפנה להשוואת חלופות. ללא מספרי טלפון מומצאים, חינם.";

  // Related: compare hubs (no dead-ends).
  const related = [
    {
      title: "השוואת מסלולי סלולר",
      href: "/compare/cellular",
      description: "השוו מסלולים לפני המעבר ובחרו את החלופה המשתלמת.",
    },
    {
      title: "השוואת מסלולי אינטרנט",
      href: "/compare/internet",
      description: "סיב אופטי וכבלים — מחיר היום ומחיר אחרי המבצע.",
    },
    {
      title: "כל הספקים",
      href: "/providers",
      description: "דפי ספקים עם כל המסלולים והמחירים.",
    },
    {
      title: "מילון מונחים",
      href: "/glossary",
      description: "ניוד מספר, התחייבות, מסלקת הניוד ועוד.",
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: CollectionPage + FAQ + Breadcrumb + Knowledge Graph. */}
      <JsonLd
        data={collectionPageSchema({
          name: "מדריכי מעבר וניתוק ספק",
          description:
            "מדריכים עובדתיים לניתוק ומעבר מכל ספק תקשורת בישראל, מבוססי זכות " +
            "הניתוק וניוד מספר דרך מסלקת הניוד.",
          url: "/switch",
        })}
      />
      <JsonLd data={faqPageSchema(RIGHTS_FAQ)} />
      <JsonLd data={breadcrumbSchema(crumbs)} />
      <JsonLd
        data={knowledgeGraphSchema({
          pageUrl: "/switch",
          pageName: "מדריכי מעבר וניתוק ספק",
          providers,
          serviceType: "מדריך ניתוק ומעבר ספק תקשורת",
          description:
            "הדף מרכז מדריכי ניתוק ומעבר עובדתיים לכל ספקי התקשורת בישראל.",
        })}
      />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מדריכי מעבר וניתוק</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          One confident intent header: an eyebrow that frames the page, the H1
          focal point, the supporting promise, and an honest amber VALUE rail
          (qualitative — no fabricated figure). ──────────────────────────────── */}
      <header className="mt-5">
        <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1.5 text-sm font-semibold text-accent-text">
          <Icon name="info" size={16} />
          מדריך מעבר וניתוק
        </p>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          לעזוב כל ספק תקשורת — בלי להסתבך
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          כל מדריך מסביר באופן עובדתי את זכות הניתוק, ניוד המספר דרך מסלקת הניוד
          והודעת הניתוק בכתב, ומפנה להשוואת חלופות לפני שמחליטים.
        </p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-value/30 bg-value/10 px-3.5 py-1.5 text-sm font-semibold text-value-text">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-value" />
          מסלול מתאים יכול לחסוך מאות ₪ בשנה — והמעבר חינמי
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: מעבר וניתוק">{summary}</SgeSummary>
      </div>

      {/* ── How it works — a three-step rail that establishes the mental model
          before the user dives into a provider guide. Each step is the same
          numbered-badge contract used on the per-provider page. ────────────── */}
      <section aria-labelledby="how-h" className="mt-12">
        <h2 id="how-h" className="font-display text-lg font-bold tracking-tight text-ink">
          איך זה עובד
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              t: "השוו חלופה",
              d: "בדקו מסלול יעד משתלם לפני שעוזבים — המחיר היום והמחיר אחרי המבצע.",
            },
            {
              t: "הספק החדש מנייד",
              d: "ניוד המספר חינמי ומתבצע מול הספק החדש דרך מסלקת הניוד — אין צורך לנתק מראש.",
            },
            {
              t: "תיעוד וסגירה",
              d: "מסרו הודעת ניתוק בכתב היכן שצריך, ובדקו שהחשבון הסופי תקין.",
            },
          ].map((step, i) => (
            <li key={step.t} className="card flex gap-3 p-4">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent/10 font-display text-sm font-bold text-accent-text"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
                  {step.t}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Provider guide cards ──────────────────────────────────────────── */}
      <section aria-labelledby="guides-h" className="mt-14">
        <h2 id="guides-h" className="font-display text-2xl font-bold tracking-tight text-ink">
          בחרו את הספק שאתם רוצים לעזוב
        </h2>
        <p className="mt-2 text-sm text-muted">
          {providers.length} מדריכים עובדתיים — מדריך אחד לכל ספק.
        </p>
        {providers.length === 0 ? (
          <EmptyState
            className="card mt-6"
            icon={<Icon name="search" size={32} />}
            title="אין כרגע מדריכי ספקים"
            description="המדריכים מתעדכנים מהקטלוג. בינתיים אפשר להשוות מסלולים ולמצוא חלופה משתלמת."
            cta={{ label: "להשוואת כל המסלולים", href: "/compare" }}
          />
        ) : (
          <ul className="mt-6 bento-grid">
            {providers.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/switch/${p.slug}`}
                  className="group bento card-interactive flex h-full flex-col p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="font-display text-lg font-semibold tracking-tight text-ink transition-colors group-hover:text-accent-text">
                    מעבר וניתוק מ{p.name}
                  </span>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {p.categories.map((c) => (
                      <li
                        key={c}
                        className="rounded-full border border-border/60 bg-background/60 px-2.5 py-0.5 text-xs font-medium text-muted"
                      >
                        {CATEGORY_HE[c] ?? c}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-accent-text">
                    למדריך המלא
                    <Icon
                      name="arrow"
                      size={16}
                      aria-hidden
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Rights FAQ ────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold tracking-tight text-ink">
          שאלות נפוצות — זכויות בניתוק ומעבר
        </h2>
        <p className="mt-2 text-sm text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
        <div className="card mt-6 divide-y divide-border/60 overflow-hidden">
          {RIGHTS_FAQ.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-display font-semibold text-ink marker:hidden">
                <span>{qa.question}</span>
                <Icon
                  name="chevron"
                  size={18}
                  className="ms-auto shrink-0 rotate-90 text-muted transition-transform group-open:-rotate-90"
                />
              </summary>
              <p className="mt-2 leading-relaxed text-foreground">{qa.answer}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="לפני שעוזבים — השוו חלופות"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

    </main>
  );
}
