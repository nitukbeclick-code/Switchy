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
import RightsForm from "@/components/RightsForm";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";

// Real last editorial review of this page. Bump when the text changes.
const LAST_REVIEWED = "2026-06-23";

export const metadata: Metadata = {
  title: "מימוש זכויות (פרטיות)",
  description:
    "מימוש הזכויות שלכם לפי חוק הגנת הפרטיות (תיקון 13): עיון, תיקון או מחיקת " +
    "מידע, וחזרה מהסכמה / הסרה מדיוור. הגישו בקשה מאובטחת — אנו נטפל בה בתוך " +
    "פרק הזמן הקבוע בדין.",
  alternates: { canonical: "/rights" },
};

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
      <JsonLd
        data={webPageSchema({
          name: "מימוש זכויות (פרטיות) — חוסך / Switch AI",
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
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מימוש זכויות</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          מימוש הזכויות שלכם
        </h1>
        <p className="mt-3 text-lg text-foreground">
          לפי חוק הגנת הפרטיות, התשמ״א-1981 ותיקוניו (לרבות תיקון 13), עומדות
          לכם זכויות ביחס למידע האישי שלכם. כאן ניתן להגיש בקשה — נטפל בה בתוך
          פרק הזמן הקבוע בדין.
        </p>
        <p className="mt-3 text-sm text-muted">
          עודכן לאחרונה: <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>
        </p>
      </header>

      <div className="mt-10 space-y-10">
        <section aria-labelledby="rights-list-h">
          <h2
            id="rights-list-h"
            className="font-display text-2xl font-bold text-ink"
          >
            הזכויות שלכם
          </h2>
          <div className="mt-4 space-y-4">
            {rights.map((r) => (
              <div key={r.h}>
                <h3 className="text-base font-semibold text-foreground">
                  {r.h}
                </h3>
                <p className="mt-1 leading-relaxed text-foreground">{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="rights-how-h">
          <h2
            id="rights-how-h"
            className="font-display text-2xl font-bold text-ink"
          >
            כיצד אנו מטפלים בבקשה
          </h2>
          <ul className="mt-4 list-disc space-y-2 pe-5 text-foreground">
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
              hello@chosech.co.il או בוואטסאפ 050-503-7537.
            </li>
          </ul>
        </section>

        <RightsForm />

        <section aria-labelledby="rights-authority-h">
          <h2
            id="rights-authority-h"
            className="font-display text-2xl font-bold text-ink"
          >
            פנייה לרשות להגנת הפרטיות
          </h2>
          <p className="mt-3 leading-relaxed text-foreground">
            אם בקשתכם לא נענתה לשביעות רצונכם, או אם אתם סבורים שזכותכם לפי חוק
            הגנת הפרטיות נפגעה, באפשרותכם להגיש תלונה לרשות להגנת הפרטיות (הרשות
            להגנת הפרטיות) במשרד המשפטים. פרטים על אופן הגשת תלונה מצויים באתר
            הרשות: gov.il/he/departments/the_privacy_protection_authority.
          </p>
        </section>
      </div>

      <aside className="mt-12 border-t border-border pt-8 text-sm text-muted">
        <p>
          ראו גם את{" "}
          <Link
            href="/privacy"
            className="text-accent-text hover:text-accent-hover"
          >
            מדיניות הפרטיות
          </Link>{" "}
          ואת{" "}
          <Link
            href="/terms"
            className="text-accent-text hover:text-accent-hover"
          >
            תנאי השימוש
          </Link>
          .
        </p>
      </aside>
    </main>
  );
}
