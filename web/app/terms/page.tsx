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
import { breadcrumbSchema, webPageSchema, SITE_URL } from "@/lib/schema";

// Real last editorial review of these terms. Bump when the text changes.
const LAST_REVIEWED = "2026-06-22";

export const metadata: Metadata = {
  title: "תנאי שימוש",
  description:
    "תנאי השימוש בשירות ההשוואה של חוסך / Switchy: מהות השירות, אופן השימוש " +
    "בטופס יצירת הקשר, מקור המחירים והמלצה לאמת מול הספק, והגבלת אחריות.",
  alternates: { canonical: "/terms" },
};

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
        "ברוכים הבאים לחוסך / Switchy (“השירות”, “האתר”, “אנחנו”). השימוש באתר " +
          "ובשירות כפוף לתנאים אלה. עצם השימוש מהווה הסכמה לתנאים; אם אינכם " +
          "מסכימים — אנא הימנעו משימוש בשירות. השירות מופעל תחת המותג " +
          "Switch AI (חוסך).",
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
      <JsonLd
        data={webPageSchema({
          name: "תנאי שימוש — חוסך / Switchy",
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
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">תנאי שימוש</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          תנאי שימוש
        </h1>
        <p className="mt-3 text-lg text-foreground">
          תנאים אלה מסבירים מהו השירות, כיצד להשתמש בו, ומה גבולות האחריות.
          השוואת המסלולים חינמית, ויצירת קשר נעשית רק לאחר אישורכם.
        </p>
        <p className="mt-3 text-sm text-muted">
          עודכן לאחרונה: <time dateTime={LAST_REVIEWED}>{LAST_REVIEWED}</time>
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {sections.map((s) => (
          <section key={s.h} aria-labelledby={`s-${s.h}`}>
            <h2
              id={`s-${s.h}`}
              className="font-display text-2xl font-bold text-ink"
            >
              {s.h}
            </h2>
            {s.paras?.map((p) => (
              <p key={p} className="mt-3 leading-relaxed text-foreground">
                {p}
                {s.h === "פרטיות" && (
                  <>
                    {" "}
                    <Link
                      href="/privacy"
                      className="text-accent-text hover:text-accent-hover"
                    >
                      מדיניות הפרטיות
                    </Link>
                    .
                  </>
                )}
              </p>
            ))}
            {s.items && (
              <ul className="mt-4 list-disc space-y-2 pe-5 text-foreground">
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
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
            href="/accessibility"
            className="text-accent-text hover:text-accent-hover"
          >
            הצהרת הנגישות
          </Link>
          .
        </p>
      </aside>

      <link rel="canonical" href={`${SITE_URL}/terms`} />
    </main>
  );
}
