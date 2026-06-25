import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import Icon from "@/components/Icon";
import { breadcrumbSchema, SITE_URL, SITE_NAME } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { getProviders, getPlans, getCategories } from "@/lib/data";

// Stable ASCII anchor per section (clean #sec-N URLs, language-independent).
const sectionId = (i: number) => `sec-${i + 1}`;

// Last editorial review of this methodology page. Bumped when the policy changes.
const LAST_REVIEWED = "2026-06-22";

export const metadata: Metadata = pageMetadata({
  title: "שקיפות ומתודולוגיה",
  description:
    "איך Switchy AI אוסף ומאמת נתונים, איך נקבעת בחירת העורך, ולמה כל מסלול " +
    "מקודם מסומן בגלוי. מדיניות שקיפות מלאה — ללא ביקורות מומצאות ובלי דירוג סמוי.",
  path: "/transparency",
});

// WebPage schema carrying lastReviewed — signals the authority/freshness of the
// methodology to engines. Honest: the date is the real last editorial review.
function transparencyPageSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "שקיפות ומתודולוגיה",
    url: `${SITE_URL}/transparency`,
    inLanguage: "he-IL",
    lastReviewed: LAST_REVIEWED,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: {
      "@type": "Thing",
      name: "מתודולוגיית השוואת מסלולי תקשורת ושקיפות",
    },
  };
}

export default function TransparencyPage() {
  const providerCount = getProviders().length;
  const planCount = getPlans().length;
  const categoryCount = getCategories().length;

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "שקיפות ומתודולוגיה", url: "/transparency" },
  ];

  const sections: { h: string; items: string[] }[] = [
    {
      h: "כיצד אנו אוספים נתונים",
      items: [
        `הנתונים מבוססים על קטלוג מסלולים מובנה הכולל ${planCount} מסלולים מ-${providerCount} ספקים ב-${categoryCount} קטגוריות.`,
        "כל מחיר מוצג בשקלים (₪) ולצדו יחידת החיוב (לחודש / לחבילה / ליום / לדקה).",
        "כאשר קיים מחיר מבצע, אנו מציגים גם את המחיר אחרי תום המבצע — כדי שהעלות לאורך זמן תהיה שקופה.",
      ],
    },
    {
      h: "כיצד אנו מאמתים נתונים",
      items: [
        "המחירים והתנאים נלקחים מהקטלוג המעודכן שלנו; מומלץ לאמת מול הספק לפני התקשרות, שכן מחירים עשויים להשתנות.",
        "קישורי הספקים (sameAs) מפנים אך ורק לאתרים הרשמיים של הספקים.",
        "אם נתון אינו ידוע בוודאות — אנו משמיטים אותו ולא מנחשים.",
      ],
    },
    {
      h: 'בחירת העורך (Editor\'s Choice) — קריטריונים',
      items: [
        '"בחירת העורך" נקבעת לפי קריטריונים עובדתיים בלבד מתוך הקטלוג: המחיר ההתחלתי הנמוך ביותר, היעדר התחייבות, תמיכה ב-5G, והכללת שימוש בחו״ל.',
        "לצד כל בחירה מצוין הקריטריון העובדתי שעל בסיסו נבחרה (למשל: ‏“המחיר ההתחלתי הנמוך ביותר בקטגוריה”).",
        "אין שום שיקול של תשלום בקביעת בחירת העורך.",
      ],
    },
    {
      h: "תוכן מקודם מסומן בגלוי",
      items: [
        'כל מסלול או ספק מקודם מסומן בתווית גלויה ("מקודם") בכל מקום שבו הוא מוצג.',
        "אין דירוג סמוי, ואין מניפולציה על מנועי בינה מלאכותית או על תוצאות חיפוש.",
        'איננו מציגים את עצמנו כ"רשמיים" או "בלעדיים" מטעם ספק כלשהו.',
      ],
    },
    {
      h: "ביקורות ודירוגים",
      items: [
        "אנו לא ממציאים ביקורות, דירוגי כוכבים או מדדי אמינות/מהירות.",
        "שדה דירוג מוצג אך ורק כאשר קיים נתון אמיתי; אחרת הוא מושמט לחלוטין.",
      ],
    },
    {
      h: "פרטיות והסכמה",
      items: [
        "השוואת המסלולים באתר חינמית לחלוטין וללא התחייבות.",
        "פנייה ליצירת קשר נשלחת לספק אך ורק לאחר שמילאתם טופס ואישרתם זאת במפורש.",
      ],
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Page-scoped entrance motion (Emil Kowalski rules): a one-time fade + 10px
          lift, staggered 30–80ms via inline animationDelay. Server-rendered CSS
          only (no JS) — references the shared --ease-out token and animates ONLY
          transform + opacity (GPU). Reduced-motion: the animation is removed so
          blocks render statically at their already-visible resting state. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sw-reveal { animation: swReveal 420ms var(--ease-out) both; }
        @keyframes swReveal {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        /* Heading anchor — faint "#" on hover/focus for deep-linking a section. */
        .sw-anchor { opacity: 0; transition: opacity 160ms var(--ease-out); }
        .sw-head:hover .sw-anchor,
        .sw-head:focus-within .sw-anchor { opacity: 1; }
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
          .sw-anchor { transition: none; }
        }
      `,
        }}
      />

      <JsonLd data={transparencyPageSchema()} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">שקיפות ומתודולוגיה</span>
      </nav>

      <header className="mt-4">
        <h1 className="sw-reveal font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          שקיפות ומתודולוגיה
        </h1>
        <p
          className="sw-reveal mt-4 max-w-prose text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          אנו מאמינים שהשוואה שווה רק אם היא הוגנת ושקופה. כאן מפורט איך אנו
          אוספים ומאמתים נתונים, איך נקבעת בחירת העורך, ולמה כל תוכן מקודם מסומן
          בגלוי.
        </p>
        <div
          className="sw-reveal mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted"
          style={{ animationDelay: "120ms" }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/70 px-3 py-1 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            נבדק לאחרונה: <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-3 py-1 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
            <Icon name="check" size={14} className="text-accent-text" />
            {planCount} מסלולים · {providerCount} ספקים
          </span>
        </div>
      </header>

      {/* ── Table of contents — quick jump to any section ──────────────────── */}
      <nav
        aria-label="תוכן העניינים"
        className="sw-reveal bento mt-8 p-5 sm:p-6"
        style={{ animationDelay: "150ms" }}
      >
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
          תוכן העניינים
        </h2>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {sections.map((s, i) => (
            <li key={s.h} className="flex items-baseline gap-2 leading-relaxed">
              <span
                aria-hidden="true"
                className="shrink-0 tabular-nums text-xs font-semibold text-muted"
              >
                {i + 1}.
              </span>
              <Link
                href={`#${sectionId(i)}`}
                className="interactive text-accent-text underline-offset-4 hover:text-accent-hover hover:underline"
              >
                {s.h}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-5 sm:space-y-6">
        {sections.map((s, i) => {
          const id = sectionId(i);
          return (
            <section
              key={s.h}
              aria-labelledby={id}
              className="sw-reveal bento scroll-mt-24 p-6 sm:p-8"
              style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
            >
              <div className="sw-head flex items-center gap-2">
                <h2
                  id={id}
                  className="font-display text-2xl font-bold tracking-tight text-ink"
                >
                  {s.h}
                </h2>
                <a
                  href={`#${id}`}
                  aria-hidden="true"
                  tabIndex={-1}
                  className="sw-anchor interactive ms-1 text-muted hover:text-accent-text"
                >
                  #
                </a>
              </div>
              <ul className="mt-4 max-w-prose list-disc space-y-2 pe-5 leading-relaxed text-foreground marker:text-accent">
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <aside className="mt-12 border-t border-border/40 pt-8 text-sm text-muted">
        <p>
          רוצים לראות את הנתונים בצורה מובנית? עיינו ב
          <Link
            href="/api/llm-feed"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            {" "}
            מפה הסמנטית (JSON)
          </Link>{" "}
          או ב
          <Link
            href="/glossary"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            מילון המונחים
          </Link>
          .
        </p>
      </aside>
    </main>
  );
}
