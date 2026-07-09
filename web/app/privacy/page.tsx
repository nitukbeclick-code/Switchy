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
import Icon from "@/components/Icon";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// Real last editorial review of this policy. Bump when the policy text changes.
const LAST_REVIEWED = "2026-07-04";

// Consent version surfaced to the user (matches the backend consent_version
// stamped on profiles/leads — supabase/legal-consent-2026-06.sql, default
// '2026-06'). Bump together with the consent text + LAST_REVIEWED.
const CONSENT_VERSION = "2026-06";

export const metadata: Metadata = pageMetadata({
  title: "מדיניות פרטיות",
  description:
    "מדיניות הפרטיות של Switchy AI: אילו פרטים אנו אוספים בטופס יצירת הקשר, " +
    "כיצד אנו שומרים עליהם, מתי הם מועברים לספק (רק לאחר הסכמה), מי הם מעבדי " +
    "המידע שלנו, וכיצד לממש את זכויותיכם לפי חוק הגנת הפרטיות (תיקון 13).",
  path: "/privacy",
});

interface Section {
  h: string;
  paras?: string[];
  items?: string[];
}

// Stable ASCII anchor for each section (clean #sec-N URLs, independent of the
// Hebrew heading text). The visible label stays the Hebrew heading.
const sectionId = (i: number) => `sec-${i + 1}`;

export default function PrivacyPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מדיניות פרטיות", url: "/privacy" },
  ];

  const sections: Section[] = [
    {
      h: "מי אנחנו",
      paras: [
        "Switchy AI הוא שירות מקוון להשוואת מסלולי תקשורת בישראל (סלולר, " +
          "אינטרנט, טלוויזיה, חבילות משולבות וחבילות חו״ל). מדיניות זו מסבירה אילו " +
          "פרטים אישיים אנו אוספים דרך האתר, למה, ומה הזכויות שלכם.",
        "השירות מופעל על-ידי אריאל תקשורת (עוסק מורשה 322253618), מרחוב ליאו " +
          "בק 64, נהריה — הגורם המשפטי האחראי לעיבוד המידע (“בעל מאגר " +
          "המידע”), הפועל תחת המותג Switchy AI. לפניות בנושאי פרטיות ניתן " +
          "ליצור קשר בכתובת hello@switchy-ai.com או בוואטסאפ 050-503-7537.",
        "ממונה על הגנת הפרטיות (DPO): פרטי הממונה יעודכנו עם השלמת המינוי. " +
          "בינתיים ניתן לפנות בכל שאלה או בקשה בנוגע למידע האישי שלכם בכתובת " +
          "hello@switchy-ai.com או בוואטסאפ 050-503-7537.",
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
        "אם תבחרו להצטרף לקהילה (באתר או באפליקציה): אנו יוצרים לכם חשבון, ותוכן " +
          "שאתם מפרסמים — טקסט, תמונות, סרטונים והקלטות קול — נשמר אצלנו ומוצג " +
          "בפומבי למשתמשים אחרים בפיד הקהילה, יחד עם שם התצוגה ותמונת הפרופיל " +
          "שלכם. תוכלו למחוק תוכן בכל עת, וכן במסגרת מחיקת החשבון.",
        "בעת הרשמה או כניסה לקהילה: אם תתחברו עם חשבון Google או Facebook, נקבל " +
          "מהם את שמכם, כתובת האימייל ותמונת הפרופיל (לפי ההרשאה שתאשרו); אם " +
          "תירשמו עם אימייל וסיסמה, נשמור את כתובת האימייל. פרטים אלה משמשים " +
          "ליצירת החשבון ולהצגת הפרופיל שלכם בקהילה בלבד.",
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
      h: "דיוור שיווקי והסרה ממנו",
      paras: [
        "דיוור שיווקי (פרסומת) נשלח אך ורק אם בחרתם להצטרף אליו באופן יזום, " +
          "בהתאם לחוק התקשורת (בזק ושידורים), התשמ״ב-1982 (תיקון 40 — “חוק " +
          "הספאם”). בטופס יצירת הקשר ניתן לסמן בנפרד הסכמה לקבלת דיוור בכל אחד " +
          "מהערוצים — SMS, אימייל ו-וואטסאפ — וכל אחד מהם הוא בחירה אופציונלית " +
          "ונפרדת מההסכמה ליצירת קשר בנוגע לפנייה עצמה. תיבות אלה אינן מסומנות " +
          "כברירת מחדל.",
      ],
      items: [
        "ההסכמה לדיוור שיווקי היא אופציונלית ולכל ערוץ בנפרד — אינכם חייבים " +
          "להסכים כדי לקבל הצעה.",
        "ניתן להסיר את ההסכמה לדיוור בכל עת — בתשובת ״הסר״ להודעה, או בפנייה " +
          "אלינו בכתובת hello@switchy-ai.com או בוואטסאפ 050-503-7537.",
        "בעת הצטרפות לדיוור אנו שומרים תיעוד של ההסכמה ושל מועד מתן ההסכמה, " +
          "כראיה כנדרש בחוק.",
      ],
    },
    {
      h: "שיתוף מידע עם צדדים שלישיים",
      paras: [
        "הפנייה מועברת לספק/ים רלוונטי/ים רק לאחר הסכמתכם המפורשת, לצורך מתן " +
          "הצעה. בנוסף, אנו נעזרים במעבדי מידע (ספקי תשתית ושירות) הפועלים מטעמנו " +
          "ובהתאם להנחיותינו. חלק מהם מאחסנים או מעבדים מידע מחוץ לישראל (האיחוד " +
          "האירופי / ארה״ב / שירותי ענן גלובליים), בהתאם להוראות הדין בנוגע " +
          "להעברת מידע אל מחוץ לגבולות המדינה.",
      ],
      items: [
        "ספקי תקשורת: הפנייה מועברת לספק/ים רלוונטי/ים רק לאחר הסכמתכם, לצורך " +
          "מתן הצעה.",
        "Supabase: אחסון מסד הנתונים, הרשאות (Auth) ופונקציות שרת — מאגר המידע " +
          "המרכזי (אירופה / פרנקפורט).",
        "Vercel: אירוח האתר ושירותי ה-API (כולל קליטת טופס יצירת הקשר) — שרתי " +
          "קצה בארה״ב / גלובלי.",
        "Google — Gemini API: עיבוד בינה מלאכותית של טקסט חופשי שאתם כותבים " +
          "לעוזר/ניתוח חשבון. הנתונים אינם משמשים לאימון מודלים, ותמונת חשבון " +
          "מעובדת באופן רגעי ואינה נשמרת.",
        "Google Analytics 4: נתוני שימוש מצטברים, בכפוף להסכמתכם לעוגיות.",
        "Meta — WhatsApp: התכתבות בוואטסאפ כאשר אתם פונים אלינו בערוץ זה (מספר " +
          "טלפון, שם פרופיל, תוכן ההודעה).",
        "Resend: שליחת הודעות דוא״ל תפעוליות (כגון התראות פנייה לצוות).",
        "Telegram: התראות פנימיות לצוות בלבד (פרטי הפנייה מוצגים לנציגי הצוות) — " +
          "אינו פונה ללקוח.",
        "Google Sheets: יומן תפעולי פנימי של פניות לצוות (שם, טלפון, אימייל " +
          "והערות) — לשימוש פנימי בלבד, לא לפרסום ולא למכירה.",
        "Cloudflare: שירותי רשת/קצה ו-DNS; כתובת ה-IP משמשת לאבטחה והגבלת קצב.",
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
      h: "דיווח על אירוע אבטחה (אירוע חמור)",
      paras: [
        "במקרה של אירוע אבטחה חמור הנוגע למידע אישי, נפעל ללא דיחוי כדי לבלום " +
          "ולהעריך את האירוע. ככל שיידרש על פי דין, נדווח לרשות להגנת הפרטיות " +
          "ונודיע לנפגעים שהמידע שלהם הושפע, בהקדם האפשרי ובמסגרת הזמן הקבועה " +
          "בדין (כמקובל, עד כ-72 שעות מרגע שנודע לנו על האירוע). ההודעה תכלול " +
          "מידע סביר על האירוע ועל הצעדים שניתן לנקוט להקטנת הסיכון.",
      ],
    },
    {
      h: "הזכויות שלכם",
      items: [
        "הזכות לעיין במידע שנאסף עליכם ולקבל ממנו העתק.",
        "הזכות לבקש לתקן מידע שגוי, לא שלם או לא מדויק.",
        "הזכות לבקש למחוק את פרטיכם או להפסיק את עיבודם.",
        "הזכות להתנגד לשימוש במידע למטרות שיווק ולחזור מהסכמתכם בכל עת.",
        "הזכות להגיש תלונה לרשות להגנת הפרטיות במשרד המשפטים.",
      ],
      paras: [
        "למימוש הזכויות תוכלו להגיש בקשה דרך עמוד מימוש הזכויות שלנו, או לפנות " +
          "אלינו בכתובת hello@switchy-ai.com. נטפל בפנייתכם בהתאם לחוק הגנת " +
          "הפרטיות, התשמ״א-1981 ולתקנותיו, ובתוך פרק הזמן הקבוע בדין.",
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
      h: "פנייה לרשות להגנת הפרטיות",
      paras: [
        "אם פנייתכם בנושא פרטיות לא נענתה לשביעות רצונכם, או אם אתם סבורים שזכותכם " +
          "לפי חוק הגנת הפרטיות נפגעה, באפשרותכם להגיש תלונה לרשות להגנת הפרטיות " +
          "(הרשות להגנת הפרטיות) במשרד המשפטים. פרטים על אופן הגשת תלונה מצויים " +
          "באתר הרשות: gov.il/he/departments/the_privacy_protection_authority.",
      ],
    },
    {
      h: "גרסת ההסכמה",
      paras: [
        `מסמך זה הוא חלק מגרסת ההסכמה ${CONSENT_VERSION}. בעת מסירת פרטים בטופס ` +
          "יצירת הקשר אנו שומרים תיעוד של ההסכמה שניתנה ושל מועד מתן ההסכמה, " +
          "כראיה למתן ההסכמה ולגרסת המסמכים שעליה הסכמתם.",
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
        /* Heading anchor — a faint "#" that appears on hover/focus of a section
           heading, for deep-linking any clause. Hidden from assistive tech. */
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
          name: "מדיניות פרטיות — Switchy AI",
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
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מדיניות פרטיות</span>
      </nav>

      <header className="mt-4">
        <h1 className="sw-reveal font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          מדיניות פרטיות
        </h1>
        <p
          className="sw-reveal mt-4 max-w-prose text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          מדיניות זו מסבירה אילו פרטים אנו אוספים, כיצד אנו משתמשים בהם, ומה
          הזכויות שלכם. השוואת המסלולים באתר חינמית, ויצירת קשר נעשית רק לאחר
          אישורכם.
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/70 px-3 py-1 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
            <Icon name="lock" size={14} className="text-muted" />
            גרסת הסכמה {CONSENT_VERSION}
          </span>
        </div>
      </header>

      {/* ── Table of contents — quick jump (16 sections; reader orientation) ── */}
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
              style={{ animationDelay: `${Math.min(i * 40, 280)}ms` }}
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
              {s.paras?.map((p) => (
                <p
                  key={p}
                  className="mt-3 max-w-prose leading-relaxed text-foreground"
                >
                  {p}
                </p>
              ))}
              {s.items && (
                <ul className="mt-4 max-w-prose list-disc space-y-2 pe-5 leading-relaxed text-foreground marker:text-accent">
                  {s.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
              {/* Direct CTA to the rights-request intake, attached to the rights
                  section so it's actionable right where it's described. */}
              {s.h === "הזכויות שלכם" && (
                <p className="mt-5">
                  <Link
                    href="/rights"
                    className="interactive inline-flex items-center gap-1.5 font-medium text-accent-text underline-offset-4 hover:text-accent-hover hover:underline"
                  >
                    למעבר לעמוד מימוש הזכויות והגשת בקשה
                    {/* Page is always dir="rtl"; flip the end-pointing arrow so
                        it points to the logical "forward" (left) like the prior ←. */}
                    <Icon
                      name="arrow"
                      size={16}
                      aria-hidden="true"
                      className="-scale-x-100"
                    />
                  </Link>
                </p>
              )}
            </section>
          );
        })}
      </div>

      <aside className="mt-12 border-t border-border/40 pt-8 text-sm text-muted">
        <p className="font-medium text-foreground">
          שאלה בנושא פרטיות, או בקשה לגבי המידע שלכם?
        </p>
        <p className="mt-1.5 leading-relaxed">
          אפשר לכתוב לנו לכתובת{" "}
          <a
            href="mailto:hello@switchy-ai.com"
            className="interactive text-accent-text underline underline-offset-2 hover:text-accent-hover"
          >
            hello@switchy-ai.com
          </a>{" "}
          או בוואטסאפ 050-503-7537.
        </p>
        <p className="mt-4 leading-relaxed">
          ראו גם את{" "}
          <Link
            href="/rights"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            מימוש הזכויות
          </Link>
          ,{" "}
          <Link
            href="/terms"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            תנאי השימוש
          </Link>
          ,{" "}
          <Link
            href="/accessibility"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            הצהרת הנגישות
          </Link>{" "}
          ועמוד{" "}
          <Link
            href="/transparency"
            className="interactive text-accent-text hover:text-accent-hover"
          >
            השקיפות והמתודולוגיה
          </Link>
          .
        </p>
      </aside>
    </main>
  );
}
