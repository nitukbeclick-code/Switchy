// ────────────────────────────────────────────────────────────────────────────
// /accessibility — הצהרת נגישות (Accessibility Statement).
//
// HONESTY / LEGAL: an Israeli accessibility statement per the spirit of תקנות
// שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות) and the IS 5568 /
// WCAG 2.0 AA standard it adopts. It states the ACTUAL, TRUTHFUL status:
//   • what we HAVE done (the concrete, verifiable a11y measures in the codebase:
//     semantic HTML, skip-link, ARIA labels, visible focus rings, AA-graded color
//     tokens, reduced-motion support, RTL, keyboard nav), and
//   • what we have NOT done — we do NOT claim a formal third-party audit or a
//     signed compliance certificate, because none is verified here.
// RESPONSIBLE PARTY: at the current scale of activity (turnover < 1M ₪) a formal
// accessibility COORDINATOR is not mandatory; the responsible party is named as the
// team ("צוות Switchy AI") with real contacts, plus a complaint/feedback
// mechanism that commits to handling accessibility issues within 60 days. The date
// is the real last review. No unverified compliance claim is asserted (no "fully
// compliant"/"certified"). MUST be reviewed by the owner / an accessibility
// consultant before being relied on as the binding statement.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// Real last review of the site's accessibility status. Bump on each review.
const LAST_REVIEWED = "2026-06-23";

export const metadata: Metadata = pageMetadata({
  title: "הצהרת נגישות",
  description:
    "הצהרת הנגישות של Switchy AI: רמת הנגישות הנוכחית של האתר, ההתאמות " +
    "שבוצעו, מגבלות ידועות, וכיצד לדווח על תקלת נגישות או לבקש סיוע.",
  path: "/accessibility",
});

interface Section {
  h: string;
  paras?: string[];
  items?: string[];
}

export default function AccessibilityPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "הצהרת נגישות", url: "/accessibility" },
  ];

  const sections: Section[] = [
    {
      h: "המחויבות שלנו",
      paras: [
        "אנו רואים חשיבות רבה במתן שירות נגיש לכלל המשתמשים, לרבות אנשים עם " +
          "מוגבלות, ופועלים להנגיש את האתר בהתאם לעקרונות תקן ישראלי 5568 " +
          "(המבוסס על הנחיות WCAG 2.0 ברמת AA) ולרוח תקנות שוויון זכויות לאנשים " +
          "עם מוגבלות (התאמות נגישות לשירות), התשע״ג-2013.",
      ],
    },
    {
      h: "רמת הנגישות באתר",
      paras: [
        "אנו שואפים לעמוד ברמת נגישות AA. האתר נבנה מתוך התחשבות בנגישות, אך " +
          "טרם עבר בדיקת נגישות פורמלית מקיפה על ידי מורשה נגישות חיצוני, ולכן " +
          "איננו מצהירים כי הוא נגיש באופן מלא או “מאושר”. אנו ממשיכים לשפר את " +
          "הנגישות באופן שוטף, ונשמח לקבל מכם משוב.",
      ],
    },
    {
      h: "מה כבר בוצע באתר",
      items: [
        "מבנה HTML סמנטי עם כותרות היררכיות, ציוני דרך (landmarks) ותגיות " +
          "ניווט מתאימות.",
        "קישור “דלג לתוכן” המופיע ראשון במעבר עם מקלדת.",
        "תמיכה בניווט וב-מיקוד באמצעות מקלדת, עם סימון מיקוד (focus) ברור וגלוי.",
        "תוויות ARIA וטקסט חלופי לפקדים ולאלמנטים שאינם טקסטואליים, וסימון " +
          "אלמנטים דקורטיביים כך שלא יוקראו.",
        "ניגודיות צבעים שתוכננה לעמוד ביחס של לפחות 4.5:1 לטקסט רגיל " +
          "(ו-3:1 לאלמנטים גרפיים).",
        "כיווניות מימין-לשמאל (RTL) ותוכן בעברית, מותאם לקוראי מסך.",
        "כיבוד העדפת המערכת לצמצום אנימציות (prefers-reduced-motion).",
        "טפסים עם תוויות מקושרות, הודעות שגיאה מוקראות (role=alert), וסימון " +
          "שדות חובה.",
      ],
    },
    {
      h: "מגבלות ידועות",
      paras: [
        "ייתכן שחלקים מסוימים באתר, או תכנים של צד שלישי המוטמעים בו (למשל " +
          "כלי מדידה או קישורים לאתרי ספקים חיצוניים), אינם נגישים במלואם, שכן " +
          "הם אינם בשליטתנו המלאה. אנו פועלים לאתר ולתקן ליקויי נגישות ככל " +
          "שמתגלים. אם נתקלתם בקושי — נשמח שתדווחו לנו כדי שנוכל לסייע ולתקן.",
      ],
    },
    {
      h: "הגורם האחראי על הנגישות",
      paras: [
        "בהיקף הפעילות הנוכחי של השירות לא חלה חובה למנות רכז נגישות ייעודי. עם " +
          "זאת, אנו רואים בנגישות אחריות שלנו: הגורם האחראי לטיפול בנושאי נגישות " +
          "באתר הוא צוות Switchy AI, שניתן לפנות אליו ישירות בערוצים הבאים:",
      ],
      items: [
        "הגורם האחראי: צוות Switchy AI",
        "דוא״ל: hello@chosech.co.il",
        "וואטסאפ: 050-503-7537",
      ],
    },
    {
      h: "דיווח על בעיית נגישות ומנגנון טיפול בפנייה",
      paras: [
        "אם נתקלתם בבעיית נגישות באתר, או אם דרושה לכם התאמת נגישות, נשמח שתדווחו " +
          "לנו ונפעל לתקן. ניתן לדווח/לפנות בכתובת hello@chosech.co.il או בוואטסאפ " +
          "050-503-7537. כדי שנוכל לסייע במהירות, נשמח אם תפרטו בפנייה:",
      ],
      items: [
        "תיאור הבעיה שבה נתקלתם.",
        "הדף (כתובת ה-URL) או הפעולה שבה אירעה הבעיה.",
        "סוג הדפדפן והטכנולוגיה המסייעת שבה אתם משתמשים (אם רלוונטי).",
        "דרך ליצירת קשר חוזר (אימייל או טלפון).",
      ],
    },
    {
      h: "זמן הטיפול בפנייה",
      paras: [
        "אנו מתחייבים לבחון כל פנייה בנושא נגישות ולטפל בה בהקדם האפשרי, ולכל " +
          "המאוחר בתוך 60 ימים ממועד קבלתה. נעדכן אתכם לגבי הטיפול בפנייתכם " +
          "ולגבי הפתרון, ככל שניתן ליישמו.",
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
        @media (prefers-reduced-motion: reduce) {
          .sw-reveal { animation: none; }
        }
      `,
        }}
      />

      <JsonLd
        data={webPageSchema({
          name: "הצהרת נגישות — Switchy AI",
          description:
            "רמת הנגישות הנוכחית של האתר, ההתאמות שבוצעו, מגבלות ידועות, וכיצד " +
            "לדווח על תקלת נגישות.",
          url: "/accessibility",
          lastReviewed: LAST_REVIEWED,
          about: "הצהרת נגישות",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">הצהרת נגישות</span>
      </nav>

      <header className="mt-4">
        <h1 className="sw-reveal font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          הצהרת נגישות
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          אנו מחויבים להנגיש את האתר לכלל המשתמשים. כאן מפורטים מצב הנגישות
          הנוכחי, ההתאמות שבוצעו, מגבלות ידועות, וכיצד לפנות אלינו לקבלת סיוע.
        </p>
        <p
          className="sw-reveal mt-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/70 px-3 py-1 text-sm text-muted backdrop-blur supports-[backdrop-filter]:bg-surface/60"
          style={{ animationDelay: "120ms" }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
          />
          ההצהרה עודכנה לאחרונה:{" "}
          <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>
        </p>
      </header>

      <div className="mt-12 space-y-5 sm:space-y-6">
        {sections.map((s, i) => (
          <section
            key={s.h}
            aria-labelledby={`s-${s.h}`}
            className="sw-reveal bento p-6 sm:p-8"
            style={{ animationDelay: `${Math.min(i * 50, 250)}ms` }}
          >
            <h2
              id={`s-${s.h}`}
              className="font-display text-2xl font-bold tracking-tight text-ink"
            >
              {s.h}
            </h2>
            {s.paras?.map((p) => (
              <p key={p} className="mt-3 leading-relaxed text-foreground">
                {p}
              </p>
            ))}
            {s.items && (
              <ul className="mt-4 list-disc space-y-2 pe-5 leading-relaxed text-foreground">
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <aside className="mt-12 border-t border-border/40 pt-8 text-sm text-muted">
        <p>
          ראו גם את{" "}
          <Link
            href="/privacy"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            מדיניות הפרטיות
          </Link>{" "}
          ואת{" "}
          <Link
            href="/terms"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            תנאי השימוש
          </Link>
          .
        </p>
      </aside>
    </main>
  );
}
