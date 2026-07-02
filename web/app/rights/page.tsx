// ────────────────────────────────────────────────────────────────────────────
// /rights — מימוש הזכויות / Data-subject rights (request intake).
//
// Israeli Privacy Protection Law §13/§14 + Amendment 13: a person may request to
// ACCESS, CORRECT, or DELETE their data, or WITHDRAW marketing/processing consent.
// This page hosts the request-intake form (<RightsForm> → /api/rights). It is an
// INTAKE only — it never displays or returns anyone's personal data.
//
// HONESTY / LEGAL: a truthful description of the rights and how to exercise them.
// Owner-only details (DPO name) are marked [[OWNER: …]]. No unverified compliance
// claims; the legal text is a draft for the owner's lawyer.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import Icon from "@/components/Icon";
import RightsForm from "@/components/RightsForm";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// Real last editorial review of this page. Bump when the text changes.
const LAST_REVIEWED = "2026-06-23";

export const metadata: Metadata = pageMetadata({
  title: "מימוש זכויות (פרטיות)",
  description:
    "מימוש הזכויות שלכם לפי חוק הגנת הפרטיות (תיקון 13): עיון, תיקון או מחיקת " +
    "מידע, וחזרה מהסכמה / הסרה מדיוור. הגישו בקשה מאובטחת — אנו נטפל בה בתוך " +
    "פרק הזמן הקבוע בדין.",
  path: "/rights",
});

interface Right {
  h: string;
  body: string;
}

export default function RightsPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מימוש זכויות", url: "/rights" },
  ];

  const rights: Right[] = [
    {
      h: "זכות עיון",
      body:
        "אתם רשאים לבקש לעיין במידע האישי שאנו מחזיקים עליכם. נשיב לכם דרך ערוץ " +
        "מאומת — לא נציג מידע אישי בעמוד זה ולא נשלח אותו ללא אימות זהות.",
    },
    {
      h: "זכות תיקון",
      body:
        "אם מצאתם שמידע עליכם שגוי, לא שלם או לא מדויק, תוכלו לבקש לתקנו.",
    },
    {
      h: "זכות מחיקה",
      body:
        "תוכלו לבקש למחוק את פרטיכם, בכפוף לחובות שמירה חוקיות שעשויות לחול עלינו.",
    },
    {
      h: "חזרה מהסכמה / הסרה מדיוור",
      body:
        "תוכלו לחזור בכם מהסכמתכם לעיבוד או לפנייה שיווקית, ולהסיר את עצמכם " +
        "מרשימת יצירת הקשר, בכל עת. חזרה מהסכמה אינה פוגעת בחוקיות העיבוד שבוצע " +
        "לפניה.",
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

      <JsonLd
        data={webPageSchema({
          name: "מימוש זכויות (פרטיות) — Switchy AI",
          description:
            "הגשת בקשה לעיון, תיקון או מחיקת מידע, או חזרה מהסכמה / הסרה מדיוור, " +
            "לפי חוק הגנת הפרטיות.",
          url: "/rights",
          lastReviewed: LAST_REVIEWED,
          about: "מימוש זכויות לפי חוק הגנת הפרטיות",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מימוש זכויות</span>
      </nav>

      <header className="mt-4">
        <h1 className="sw-reveal font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מימוש הזכויות שלכם
        </h1>
        <p
          className="sw-reveal mt-4 max-w-prose text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          לפי חוק הגנת הפרטיות, התשמ״א-1981 ותיקוניו (לרבות תיקון 13), עומדות
          לכם זכויות ביחס למידע האישי שלכם. כאן ניתן להגיש בקשה — נטפל בה בתוך
          פרק הזמן הקבוע בדין.
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
            עודכן לאחרונה: <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>
          </span>
          <a
            href="#rights-form"
            className="interactive inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-medium text-accent-text hover:bg-accent/15"
          >
            <Icon name="arrow" size={14} className="-scale-x-100" />
            לטופס הגשת הבקשה
          </a>
        </div>
      </header>

      <div className="mt-10 space-y-5 sm:space-y-6">
        <section
          aria-labelledby="rights-list-h"
          className="sw-reveal bento scroll-mt-24 p-6 sm:p-8"
        >
          <div className="sw-head flex items-center gap-2">
            <h2
              id="rights-list-h"
              className="font-display text-2xl font-bold tracking-tight text-ink"
            >
              הזכויות שלכם
            </h2>
            <a
              href="#rights-list-h"
              aria-hidden="true"
              tabIndex={-1}
              className="sw-anchor interactive ms-1 text-muted hover:text-accent-text"
            >
              #
            </a>
          </div>
          {/* Each right as a soft inner card — bento-within-bento, breathing room. */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {rights.map((r) => (
              <div
                key={r.h}
                className="rounded-xl border border-border/50 bg-background/60 p-4"
              >
                <h3 className="text-base font-semibold text-foreground">
                  {r.h}
                </h3>
                <p className="mt-1.5 leading-relaxed text-foreground">{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="rights-how-h"
          className="sw-reveal bento scroll-mt-24 p-6 sm:p-8"
          style={{ animationDelay: "60ms" }}
        >
          <div className="sw-head flex items-center gap-2">
            <h2
              id="rights-how-h"
              className="font-display text-2xl font-bold tracking-tight text-ink"
            >
              כיצד אנו מטפלים בבקשה
            </h2>
            <a
              href="#rights-how-h"
              aria-hidden="true"
              tabIndex={-1}
              className="sw-anchor interactive ms-1 text-muted hover:text-accent-text"
            >
              #
            </a>
          </div>
          <ul className="mt-4 max-w-prose list-disc space-y-2 pe-5 leading-relaxed text-foreground marker:text-accent">
            <li>
              אנו מתעדים כל בקשה ומטפלים בה בתוך פרק הזמן הקבוע בדין (בדרך כלל עד
              30 ימים).
            </li>
            <li>
              לפני ביצוע בקשה הנוגעת למידע אישי, ייתכן שנאמת את זהותכם — זאת כדי
              להגן עליכם ולמנוע גישה לא מורשית למידע.
            </li>
            <li>
              בקשות בנושאי פרטיות מטופלות על ידי הממונה על הגנת הפרטיות מטעמנו;
              פרטי הממונה יעודכנו עם השלמת המינוי. בינתיים ניתן לפנות בכתובת
              hello@switchy-ai.com או בוואטסאפ 050-503-7537.
            </li>
          </ul>
        </section>

        {/* Anchor target for the header "jump to form" cue. Wraps the form so we
            don't edit the shared <RightsForm> component; scroll-mt clears the
            sticky header on jump. */}
        <div id="rights-form" className="scroll-mt-24">
          <RightsForm />
        </div>

        <section
          aria-labelledby="rights-authority-h"
          className="sw-reveal bento scroll-mt-24 p-6 sm:p-8"
          style={{ animationDelay: "180ms" }}
        >
          <div className="sw-head flex items-center gap-2">
            <h2
              id="rights-authority-h"
              className="font-display text-2xl font-bold tracking-tight text-ink"
            >
              פנייה לרשות להגנת הפרטיות
            </h2>
            <a
              href="#rights-authority-h"
              aria-hidden="true"
              tabIndex={-1}
              className="sw-anchor interactive ms-1 text-muted hover:text-accent-text"
            >
              #
            </a>
          </div>
          <p className="mt-3 max-w-prose leading-relaxed text-foreground">
            אם בקשתכם לא נענתה לשביעות רצונכם, או אם אתם סבורים שזכותכם לפי חוק
            הגנת הפרטיות נפגעה, באפשרותכם להגיש תלונה לרשות להגנת הפרטיות (הרשות
            להגנת הפרטיות) במשרד המשפטים. פרטים על אופן הגשת תלונה מצויים באתר
            הרשות: gov.il/he/departments/the_privacy_protection_authority.
          </p>
        </section>
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
