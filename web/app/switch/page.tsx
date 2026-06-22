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
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getProviders, CATEGORY_HE } from "@/lib/data";
import {
  collectionPageSchema,
  breadcrumbSchema,
  faqPageSchema,
  knowledgeGraphSchema,
  SITE_URL,
  type QA,
} from "@/lib/schema";

export const metadata: Metadata = {
  title: "מדריכי מעבר וניתוק ספק — איך לעזוב כל ספק בישראל",
  description:
    "מדריך עובדתי לניתוק ומעבר מכל ספק תקשורת בישראל — סלולר, אינטרנט, טלוויזיה " +
    "וחבילות משולבות. זכות הניתוק, ניוד מספר דרך מסלקת הניוד, והשוואת חלופות. חינם.",
  alternates: { canonical: "/switch" },
};

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

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          מדריכי מעבר וניתוק ספק
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-foreground">
          איך לעזוב כל ספק תקשורת בישראל — בלי להסתבך. כל מדריך מסביר באופן עובדתי
          את זכות הניתוק, ניוד המספר דרך מסלקת הניוד והודעת הניתוק בכתב, ומפנה
          להשוואת חלופות לפני שמחליטים.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: מעבר וניתוק">{summary}</SgeSummary>
      </div>

      {/* ── Provider guide cards ──────────────────────────────────────────── */}
      <section aria-labelledby="guides-h" className="mt-12">
        <h2 id="guides-h" className="font-display text-2xl font-bold text-ink">
          בחרו את הספק שאתם רוצים לעזוב
        </h2>
        <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {providers.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/switch/${p.slug}`}
                className="group block h-full rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="font-display text-lg font-semibold text-ink group-hover:text-accent">
                  מעבר וניתוק מ{p.name}
                </span>
                <span className="mt-1 block text-sm text-muted">
                  {p.categories.map((c) => CATEGORY_HE[c] ?? c).join(", ")}
                </span>
                <span className="mt-3 inline-block text-sm font-medium text-accent-text">
                  למדריך המלא ←
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Rights FAQ ────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-14">
        <h2 id="faq-h" className="font-display text-2xl font-bold text-ink">
          שאלות נפוצות — זכויות בניתוק ומעבר
        </h2>
        <p className="mt-2 text-sm text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
        <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-surface">
          {RIGHTS_FAQ.map((qa) => (
            <details key={qa.question} className="group p-5">
              <summary className="cursor-pointer list-none font-display font-semibold text-ink marker:hidden">
                {qa.question}
              </summary>
              <p className="mt-2 text-foreground">{qa.answer}</p>
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

      <link rel="canonical" href={`${SITE_URL}/switch`} />
    </main>
  );
}
