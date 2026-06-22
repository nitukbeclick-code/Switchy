// ────────────────────────────────────────────────────────────────────────────
// /privacy — מדיניות פרטיות (Privacy Policy).
//
// HONESTY / LEGAL: this is a TRUTHFUL draft describing the data the service
// actually collects (name, phone, city, desired category, source, IP + consent
// timestamps → public.leads via Supabase) and how consent works. Details that
// only the owner can supply — registered legal name, contact email/phone, the
// database registration number under Israeli Privacy Protection Law — are marked
// with [[OWNER: …]] placeholders and MUST be filled in and reviewed by a lawyer
// before this is treated as a binding policy. We do NOT assert any unverified
// compliance status.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";

// Real last editorial review of this policy. Bump when the policy text changes.
const LAST_REVIEWED = "2026-06-22";

export const metadata: Metadata = {
  title: "מדיניות פרטיות",
  description:
    "מדיניות הפרטיות של חוסך / Switch AI: אילו פרטים אנו אוספים בטופס יצירת הקשר, " +
    "כיצד אנו שומרים עליהם, מתי הם מועברים לספק (רק לאחר הסכמה), וכיצד לממש את " +
    "זכויותיכם לפי חוק הגנת הפרטיות.",
  alternates: { canonical: "/privacy" },
};

interface Section {
  h: string;
  paras?: string[];
  items?: string[];
}

export default function PrivacyPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מדיניות פרטיות", url: "/privacy" },
  ];

  const sections: Section[] = [
    {
      h: "מי אנחנו",
      paras: [
        "חוסך / Switch AI הוא שירות מקוון להשוואת מסלולי תקשורת בישראל (סלולר, " +
          "אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל). מדיניות זו מסבירה אילו " +
          "פרטים אישיים אנו אוספים דרך האתר, למה, ומה הזכויות שלכם.",
        "השירות מופעל תחת המותג Switch AI (חוסך), והוא הגורם האחראי לעיבוד " +
          "המידע (“בעל מאגר המידע”). לפניות בנושאי פרטיות ניתן ליצור קשר " +
          "בכתובת hello@chosech.co.il או בוואטסאפ 050-503-7537.",
      ],
    },
    {
      h: "אילו פרטים אנו אוספים",
      paras: [
        "אנו אוספים אך ורק את הפרטים שאתם בוחרים למסור בטופס יצירת הקשר, וכן " +
          "מידע טכני בסיסי הנדרש לאבטחה ולמניעת שימוש לרעה:",
      ],
      items: [
        "פרטים שאתם מוסרים בטופס: שם מלא, מספר טלפון, עיר מגורים, וקטגוריית " +
          "השירות שמעניינת אתכם (סלולר / אינטרנט / טלוויזיה / חבילה משולבת / חו״ל).",
        "אישור ההסכמה שנתתם (סימון תיבת ההסכמה) וחותמת הזמן שבה ניתן.",
        "כתובת ה-IP שממנה נשלחה הפנייה ומקור הפנייה באתר (לצורך אבטחה, מניעת " +
          "ספאם והגבלת קצב).",
        "נתוני שימוש אנונימיים/מצטברים מ-Google Analytics (ראו פירוט בהמשך), " +
          "בכפוף להסכמה לעוגיות.",
      ],
    },
    {
      h: "כיצד אנו משתמשים בפרטים",
      items: [
        "ליצירת קשר חוזר אליכם לצורך מתן השוואת מסלולים והצעה מותאמת — בהתאם " +
          "להסכמתכם.",
        "להעברת הפנייה לספק/ים רלוונטי/ים לצורך מתן הצעה — אך ורק לאחר שאישרתם " +
          "זאת במפורש בטופס.",
        "לתפעול האתר, אבטחתו ומניעת שימוש לרעה (כגון הגבלת קצב פניות).",
        "איננו מוכרים את הפרטים שלכם ואיננו משתמשים בהם למטרות שלא פורטו כאן.",
      ],
    },
    {
      h: "בסיס משפטי והסכמה",
      paras: [
        "עיבוד הפרטים מבוסס על הסכמתכם המפורשת, הניתנת בעת סימון תיבת ההסכמה " +
          "בטופס. מסירת הפרטים היא מרצון; ללא מסירתם לא נוכל לחזור אליכם עם הצעה. " +
          "יצירת קשר שיווקית נעשית בהתאם להוראות חוק התקשורת (בזק ושידורים) " +
          "(תיקון מס׳ 40) — “חוק הספאם” — ובכפוף לזכותכם לבקש הסרה בכל עת.",
      ],
    },
    {
      h: "שיתוף מידע עם צדדים שלישיים",
      items: [
        "ספקי תקשורת: הפנייה מועברת לספק/ים רלוונטי/ים רק לאחר הסכמתכם, לצורך " +
          "מתן הצעה.",
        "ספקי תשתית: אנו משתמשים בשירותי Supabase לאחסון הפניות ובשירותי " +
          "אירוח (Vercel) להפעלת האתר. נתונים עשויים להיות מאוחסנים בשרתים מחוץ " +
          "לישראל בהתאם לתנאי ספקים אלו.",
        "Google Analytics: נתוני שימוש מצטברים, בכפוף להסכמתכם לעוגיות.",
        "רשויות מוסמכות: אם נידרש לכך על פי דין.",
      ],
    },
    {
      h: "עוגיות (Cookies) ואנליטיקה",
      paras: [
        "האתר עושה שימוש ב-Google Analytics 4 למדידת שימוש מצטברת ולשיפור " +
          "השירות. עוגיות אנליטיקה נטענות בכפוף להסכמה, וניתן לסרב להן או למחוק " +
          "אותן דרך הגדרות הדפדפן. עוגיות חיוניות לתפעול האתר עשויות לפעול גם " +
          "בהיעדר הסכמה לעוגיות לא-חיוניות.",
      ],
    },
    {
      h: "כמה זמן נשמרים הפרטים",
      paras: [
        "אנו שומרים את הפרטים למשך הזמן הדרוש למתן השירות ולעמידה בחובות חוקיות, " +
          "ולאחר מכן מוחקים או הופכים אותם לאנונימיים. ככלל, פרטי פנייה נשמרים " +
          "עד 24 חודשים ממועד הפנייה, או עד לבקשת מחיקה — המוקדם מביניהם.",
      ],
    },
    {
      h: "אבטחת מידע",
      paras: [
        "אנו נוקטים אמצעים סבירים לאבטחת המידע, ובכלל זה הגבלת גישה למפתחות " +
          "רגישים בצד השרת בלבד, העברת נתונים מוצפנת (HTTPS) והגבלת קצב פניות. " +
          "עם זאת, אף מערכת אינה חסינה לחלוטין, ואיננו יכולים להבטיח אבטחה מוחלטת.",
      ],
    },
    {
      h: "הזכויות שלכם",
      items: [
        "לעיין במידע שנאסף עליכם.",
        "לבקש לתקן מידע שגוי, לא שלם או לא מדויק.",
        "לבקש למחוק את פרטיכם או להפסיק את עיבודם.",
        "לחזור בכם מהסכמתכם ולבקש הסרה מרשימת יצירת קשר בכל עת.",
      ],
      paras: [
        "למימוש הזכויות פנו אלינו בכתובת hello@chosech.co.il. נטפל בפנייתכם " +
          "בהתאם לחוק הגנת הפרטיות, התשמ״א-1981 ולתקנותיו.",
      ],
    },
    {
      h: "פרטיות קטינים",
      paras: [
        "השירות אינו מיועד לקטינים מתחת לגיל 16, ואיננו אוספים ביודעין מידע " +
          "מקטינים. אם נודע לכם שקטין מסר לנו מידע, פנו אלינו ונפעל למחיקתו.",
      ],
    },
    {
      h: "שינויים במדיניות",
      paras: [
        "אנו עשויים לעדכן מדיניות זו מעת לעת. הגרסה העדכנית תפורסם תמיד בעמוד " +
          "זה, לצד תאריך העדכון האחרון המופיע למטה.",
      ],
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={webPageSchema({
          name: "מדיניות פרטיות — חוסך / Switch AI",
          description:
            "אילו פרטים אנו אוספים בטופס יצירת הקשר, כיצד אנו משתמשים בהם, ומתי " +
            "הם מועברים לספק — בהתאם להסכמתכם.",
          url: "/privacy",
          lastReviewed: LAST_REVIEWED,
          about: "מדיניות פרטיות",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מדיניות פרטיות</span>
      </nav>

      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          מדיניות פרטיות
        </h1>
        <p className="mt-3 text-lg text-foreground">
          מדיניות זו מסבירה אילו פרטים אנו אוספים, כיצד אנו משתמשים בהם, ומה
          הזכויות שלכם. השוואת המסלולים באתר חינמית, ויצירת קשר נעשית רק לאחר
          אישורכם.
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
            href="/terms"
            className="text-accent-text hover:text-accent-hover"
          >
            תנאי השימוש
          </Link>
          ,{" "}
          <Link
            href="/accessibility"
            className="text-accent-text hover:text-accent-hover"
          >
            הצהרת הנגישות
          </Link>{" "}
          ועמוד{" "}
          <Link
            href="/transparency"
            className="text-accent-text hover:text-accent-hover"
          >
            השקיפות והמתודולוגיה
          </Link>
          .
        </p>
      </aside>
    </main>
  );
}
