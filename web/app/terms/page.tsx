// ────────────────────────────────────────────────────────────────────────────
// /terms — תנאי שימוש (Terms of Use).
//
// HONESTY / LEGAL: a TRUTHFUL draft of the terms governing use of the comparison
// service. It describes what the service factually is (a free comparison tool +
// consent-gated lead hand-off), and is explicit that prices are catalogue-derived
// and should be verified with the provider. Details only the owner can supply —
// registered legal name, contact details, governing-jurisdiction specifics — are
// marked [[OWNER: …]] and MUST be completed and reviewed by a lawyer before these
// terms are relied upon. No unverified legal/compliance claims are asserted.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// Real last editorial review of these terms. Bump when the text changes.
const LAST_REVIEWED = "2026-06-23";

export const metadata: Metadata = pageMetadata({
  title: "תנאי שימוש",
  description:
    "תנאי השימוש בשירות ההשוואה של Switchy AI: מהות השירות, אופן השימוש " +
    "בטופס יצירת הקשר, מקור המחירים והמלצה לאמת מול הספק, והגבלת אחריות.",
  path: "/terms",
});

interface Section {
  h: string;
  paras?: string[];
  items?: string[];
}

export default function TermsPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "תנאי שימוש", url: "/terms" },
  ];

  const sections: Section[] = [
    {
      h: "כללי",
      paras: [
        "ברוכים הבאים ל-Switchy AI (“השירות”, “האתר”, “אנחנו”). השימוש באתר " +
          "ובשירות כפוף לתנאים אלה. עצם השימוש מהווה הסכמה לתנאים; אם אינכם " +
          "מסכימים — אנא הימנעו משימוש בשירות. השירות מופעל תחת המותג " +
          "Switchy AI.",
      ],
    },
    {
      h: "מהות השירות",
      paras: [
        "השירות מציג השוואה בין מסלולי תקשורת בישראל (סלולר, אינטרנט, טלוויזיה, " +
          "חבילות משולבות וחבילות חו״ל) על בסיס קטלוג מסלולים מובנה. השוואת " +
          "המסלולים חינמית. אם תבחרו להשאיר פרטים, נוכל לחזור אליכם ולהעביר את " +
          "הפנייה לספק/ים רלוונטי/ים — אך ורק לאחר שאישרתם זאת במפורש.",
        "אנו איננו ספק תקשורת, איננו צד להתקשרות בינכם לבין הספק, ואיננו " +
          "מתחזים לגורם רשמי או בלעדי מטעם ספק כלשהו.",
      ],
    },
    {
      h: "דיוק המידע והמחירים",
      items: [
        "המחירים והתנאים המוצגים נגזרים מהקטלוג שלנו ועשויים להשתנות מעת לעת.",
        "כאשר קיים מחיר מבצע, אנו משתדלים להציג גם את המחיר לאחר תום המבצע — אך " +
          "התנאים המחייבים הם אלו של הספק.",
        "לפני התקשרות, מומלץ תמיד לאמת את המחיר והתנאים המלאים ישירות מול הספק.",
        "איננו מתחייבים לכך שכל מסלול בשוק מופיע בהשוואה, או שמסלול מסוים יהיה " +
          "זמין עבורכם.",
      ],
    },
    {
      h: "השימוש בטופס יצירת הקשר",
      items: [
        "עליכם למסור פרטים נכונים ומדויקים, ולמסור פרטים של עצמכם בלבד.",
        "אין למסור פרטים של אדם אחר ללא הרשאתו.",
        "יצירת הקשר וההעברה לספק נעשות רק לאחר סימון תיבת ההסכמה בטופס.",
        "אין לעשות שימוש לרעה בשירות, לרבות שליחת פניות אוטומטיות, שווא או " +
          "מרובות, או ניסיון לעקוף מנגנוני אבטחה והגבלת קצב.",
      ],
    },
    {
      h: "קניין רוחני",
      paras: [
        "התכנים באתר, לרבות העיצוב, הטקסטים, מילון המונחים והמתודולוגיה, הם " +
          "קניינו של השירות (או של מי שהעניק לנו רישיון), ומוגנים בדין. שמות " +
          "הספקים והמותגים שייכים לבעליהם בהתאמה ומוצגים לצורכי השוואה והסבר בלבד.",
      ],
    },
    {
      h: "הגבלת אחריות",
      paras: [
        "השירות ניתן כפי שהוא (“AS IS”). איננו אחראים להחלטות שתקבלו על בסיס " +
          "המידע באתר, ואיננו צד להתקשרות בינכם לבין הספק. במידה המרבית המותרת " +
          "בדין, איננו אחראים לנזק עקיף, תוצאתי או מיוחד הנובע מהשימוש בשירות. " +
          "אין באמור כדי לגרוע מזכויות צרכן מכוח כל דין.",
      ],
    },
    {
      h: "קישורים לאתרים חיצוניים",
      paras: [
        "האתר עשוי לכלול קישורים לאתרי ספקים או צדדים שלישיים. איננו אחראים " +
          "לתוכן, למדיניות הפרטיות או לזמינות של אתרים אלו.",
      ],
    },
    {
      h: "פרטיות",
      paras: [
        "השימוש בפרטים שאתם מוסרים כפוף ל",
      ],
    },
    {
      h: "הסכמה, חזרה מהסכמה וזכויות לפי חוק הגנת הפרטיות",
      paras: [
        "מסירת הפרטים בטופס יצירת הקשר נעשית מרצונכם החופשי ועל בסיס הסכמתכם " +
          "המפורשת. אינכם חייבים למסור פרטים — אך ללא מסירתם לא נוכל לחזור אליכם " +
          "עם הצעה ולהעביר את הפנייה לספק. בהתאם לחוק הגנת הפרטיות, התשמ״א-1981 " +
          "ותיקוניו (לרבות תיקון 13), עומדות לכם הזכויות לעיין במידע שנאסף עליכם, " +
          "לבקש לתקנו, לבקש למחקו ולחזור בכם מהסכמתכם — בכל עת וללא תנאי. חזרה " +
          "מהסכמה אינה פוגעת בחוקיות העיבוד שבוצע עד למועד החזרה.",
        "למימוש זכויות אלה, או להסרה מרשימת יצירת הקשר, ניתן להגיש בקשה דרך עמוד " +
          "מימוש הזכויות שלנו, או לפנות אלינו בכתובת hello@chosech.co.il. פרטים " +
          "נוספים מצויים ב",
      ],
    },
    {
      h: "דיוור שיווקי והסרה ממנו",
      items: [
        "דיוור שיווקי (פרסומת) — בערוצי SMS, אימייל או וואטסאפ — יישלח רק אם " +
          "בחרתם להצטרף אליו באופן יזום בטופס יצירת הקשר, בהתאם לחוק התקשורת " +
          "(תיקון 40 — “חוק הספאם”).",
        "ההסכמה לכל ערוץ היא אופציונלית ונפרדת מההסכמה ליצירת קשר בנוגע לפנייה; " +
          "תיבות ההסכמה לדיוור אינן מסומנות כברירת מחדל.",
        "ניתן להסיר את ההסכמה לקבלת דיוור בכל עת — בתשובת ״הסר״ להודעה, או " +
          "בפנייה אלינו בכתובת hello@chosech.co.il או בוואטסאפ 050-503-7537.",
      ],
    },
    {
      h: "גילוי בדבר דמי תיווך",
      paras: [
        "השוואת המסלולים באתר חינמית עבורכם. אנו מקבלים דמי תיווך/הפניה מהספקים " +
          "כאשר אתם עוברים ספק דרכנו — וזה אינו משפיע על המחיר שתשלמו. ההשוואה " +
          "נעשית לפי המתודולוגיה השקופה שלנו, ואנו מסמנים בגלוי כל תוכן מקודם. " +
          "פירוט מלא של אופן ההשוואה והדירוג מצוי בעמוד השקיפות והמתודולוגיה.",
      ],
    },
    {
      h: "שינויים בתנאים",
      paras: [
        "אנו עשויים לעדכן תנאים אלה מעת לעת. הגרסה העדכנית תפורסם תמיד בעמוד זה, " +
          "לצד תאריך העדכון האחרון. המשך השימוש לאחר עדכון מהווה הסכמה לתנאים " +
          "המעודכנים.",
      ],
    },
    {
      h: "דין וסמכות שיפוט",
      paras: [
        "על תנאים אלה יחולו דיני מדינת ישראל. סמכות השיפוט הבלעדית בכל מחלוקת " +
          "תהיה נתונה לבתי המשפט המוסמכים בישראל, " +
          "אלא אם נקבע אחרת בדין צרכני מחייב.",
      ],
    },
    {
      h: "יצירת קשר",
      paras: [
        "לשאלות בנוגע לתנאים אלה ניתן לפנות אלינו בכתובת " +
          "hello@chosech.co.il או בוואטסאפ 050-503-7537.",
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
          name: "תנאי שימוש — Switchy AI",
          description:
            "התנאים החלים על השימוש בשירות ההשוואה: מהות השירות, מקור המחירים, " +
            "השימוש בטופס יצירת הקשר והגבלת אחריות.",
          url: "/terms",
          lastReviewed: LAST_REVIEWED,
          about: "תנאי שימוש",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">תנאי שימוש</span>
      </nav>

      <header className="mt-4">
        <h1 className="sw-reveal font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          תנאי שימוש
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          תנאים אלה מסבירים מהו השירות, כיצד להשתמש בו, ומה גבולות האחריות.
          השוואת המסלולים חינמית, ויצירת קשר נעשית רק לאחר אישורכם.
        </p>
        <p
          className="sw-reveal mt-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/70 px-3 py-1 text-sm text-muted backdrop-blur supports-[backdrop-filter]:bg-surface/60"
          style={{ animationDelay: "120ms" }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
          />
          עודכן לאחרונה: <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>
        </p>
      </header>

      <div className="mt-12 space-y-5 sm:space-y-6">
        {sections.map((s, i) => (
          <section
            key={s.h}
            aria-labelledby={`s-${s.h}`}
            className="sw-reveal bento p-6 sm:p-8"
            style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}
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
                {s.h === "פרטיות" && p.endsWith("ל") && (
                  <>
                    {" "}
                    <Link
                      href="/privacy"
                      className="interactive text-accent-text hover:text-accent-hover"
                    >
                      מדיניות הפרטיות
                    </Link>
                    .
                  </>
                )}
                {/* Commission-disclosure clause links to the methodology page. */}
                {s.h === "גילוי בדבר דמי תיווך" && (
                  <>
                    {" "}
                    <Link
                      href="/transparency"
                      className="interactive text-accent-text hover:text-accent-hover"
                    >
                      לעמוד השקיפות והמתודולוגיה
                    </Link>
                    .
                  </>
                )}
                {/* Amendment-13 / consent-withdrawal clause links to the rights
                    intake; only the closing paragraph (ending "ב") gets the link. */}
                {s.h === "הסכמה, חזרה מהסכמה וזכויות לפי חוק הגנת הפרטיות" &&
                  p.endsWith("ב") && (
                    <>
                      {" "}
                      <Link
                        href="/rights"
                        className="interactive text-accent-text hover:text-accent-hover"
                      >
                        עמוד מימוש הזכויות
                      </Link>
                      {" "}וב
                      <Link
                        href="/privacy"
                        className="interactive text-accent-text hover:text-accent-hover"
                      >
                        מדיניות הפרטיות
                      </Link>
                      .
                    </>
                  )}
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
          </Link>
          ,{" "}
          <Link
            href="/rights"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            מימוש הזכויות
          </Link>{" "}
          ואת{" "}
          <Link
            href="/accessibility"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            הצהרת הנגישות
          </Link>
          .
        </p>
      </aside>
    </main>
  );
}
