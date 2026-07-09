// ────────────────────────────────────────────────────────────────────────────
// /community-guidelines — "כללי הקהילה". The content policy for קהילת חוסך: how to
// behave, what isn't allowed, how prices/experiences must stay truthful, how
// moderation works (auto-flag + human review, flagged content shown "בבדיקת
// מנהל"), how to report/block, and that Switchy may remove content.
//
// HONESTY / SCOPE: this is a GUIDELINES page — a plain-language behaviour policy.
// It is deliberately SEPARATE from the legal surfaces (§7b commission disclosure,
// §30A/Amendment-13 consent, terms, privacy) — it does not restate or invent any
// legal text. Where a user needs the binding documents it links to /terms and
// /privacy rather than paraphrasing them.
//
// Server component — pure render from static copy. NO runtime/community data is
// read here (the live feed lives on the client community surfaces), so nothing is
// fabricated: no post counts, member figures or ratings appear on this page.
// Motion: the global `.sw-reveal` entrance (opacity + 8px lift, GPU only) staggered
// 30–80ms via inline animationDelay, plus the global `.sw-lift` desktop hover —
// both reduced-motion safe (collapse to the resting state in globals.css).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import Icon, { type IconName } from "@/components/Icon";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { breadcrumbSchema, SITE_URL, SITE_NAME } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "כללי הקהילה",
  description:
    "כללי הקהילה של קהילת חוסך: איך משתפים בכבוד, בלי ספאם, פרסום או הונאות, " +
    "בלי הטרדה או שנאה, ולמה מחירים וחוויות חייבים להיות אמיתיים. כך פועל הפיקוח " +
    "על התוכן — סימון אוטומטי, בדיקת מנהל, ותוכן שמוצג ׳בבדיקת מנהל׳ — ואיך " +
    "מדווחים או חוסמים משתמש.",
  path: "/community-guidelines",
});

// The core Do's — how the community should behave (positive framing first).
const DOS: { title: string; body: string }[] = [
  {
    title: "כתבו בכבוד",
    body: "מתייחסים לכל חבר/ה בקהילה יפה, גם כשלא מסכימים. אפשר לחלוק על דעה — לא על אדם.",
  },
  {
    title: "שתפו ניסיון אמיתי",
    body: "ספרו מה באמת קרה אחרי המעבר: מה עבד, מה לא, ומה הפתיע. חוויה כנה שווה יותר מכל פרסומת.",
  },
  {
    title: "עזרו אחד לשני",
    body: "שאלה של מישהו היא הזדמנות שלכם לעזור. תשובה מנוסחת בסבלנות מקדמת את כל הקהילה.",
  },
  {
    title: "הישארו ענייניים",
    body: "פרסמו בערוץ המתאים ובנושא. כך קל למצוא מידע ולחזור אליו כשצריך.",
  },
];

// The prohibited content — what will be removed. Each is a clear, enforceable line.
const DONTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "alert",
    title: "בלי ספאם, פרסום או הונאות",
    body: "אין לפרסם קידום מכירות, קישורי שותפים, הודעות חוזרות, סכמות ׳התעשרות מהירה׳ או ניסיונות הונאה. הקהילה היא לדיון בין אנשים — לא לוח מודעות.",
  },
  {
    icon: "alert",
    title: "בלי הטרדה, שנאה או איומים",
    body: "אסורים עלבונות אישיים, הטרדה, בריונות, הסתה, גזענות או שנאה כלפי אדם או קבוצה. חוסר הסכמה זה בסדר — התקפה אישית לא.",
  },
  {
    icon: "alert",
    title: "בלי מידע פרטי של אחרים",
    body: "אין לפרסם פרטים אישיים של אדם אחר — טלפון, כתובת, מספר לקוח, צילום חשבון עם שם מלא — בלי רשותו. הגנו על הפרטיות של כולם, כולל שלכם.",
  },
  {
    icon: "alert",
    title: "בלי תוכן לא חוקי או פוגעני",
    body: "אין לשתף תוכן מיני, אלים, מפר זכויות יוצרים או בלתי חוקי בכל דרך אחרת. מדיה שאתם מעלים חייבת להיות שלכם או ברשותכם לשתף.",
  },
];

export default function CommunityGuidelinesPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "קהילה", url: "/community" },
    { name: "כללי הקהילה", url: "/community-guidelines" },
  ];

  // Article structured data — an honest description of this policy page. No claims
  // beyond the guidelines themselves; no figures, ratings or testimonials.
  const articleSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "כללי הקהילה — קהילת חוסך",
    description:
      "מדיניות התוכן וההתנהגות של קהילת חוסך: כבוד הדדי, איסור ספאם והונאות, " +
      "איסור הטרדה ושנאה, דרישת אמת במחירים ובחוויות, ואופן הפיקוח על התוכן.",
    url: `${SITE_URL}/community-guidelines`,
    inLanguage: "he-IL",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* Structured data: Article + Breadcrumb. */}
      <JsonLd data={articleSchema} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <Link href="/community" className="interactive underline underline-offset-2 hover:text-accent">
          קהילה
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">כללי הקהילה</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="sw-reveal inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-text">
          <Icon name="check" size={14} aria-hidden="true" />
          קהילה בטוחה · שיח מכובד
        </p>
        <h1 className="sw-reveal mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          כללי הקהילה
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          קהילת חוסך נשענת על אמון: אנשים אמיתיים שמשתפים חוויות אמיתיות כדי
          שכולנו נחסוך. כדי לשמור על המקום הזה מכובד, בטוח ומועיל — הנה הכללים
          שכולנו שומרים עליהם. ההרשמה והשימוש בקהילה משמעם הסכמה לכללים האלה.
        </p>
      </header>

      {/* ── What we expect (Do's) ─────────────────────────────────────────── */}
      <section aria-labelledby="dos-h" className="mt-14">
        <h2
          id="dos-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מה אנחנו מצפים
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {DOS.map((item, i) => (
            <li
              key={item.title}
              className="sw-reveal sw-lift card flex h-full gap-4 p-5 sm:p-6"
              style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-text"
              >
                <Icon name="check" size={20} />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── What isn't allowed (Don'ts) ───────────────────────────────────── */}
      <section aria-labelledby="donts-h" className="mt-16">
        <h2
          id="donts-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מה אסור
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          התוכן הבא יוסר, והפרסום שלו עלול להוביל להשעיית החשבון. הכללים חלים על
          פוסטים, תגובות, מדיה (תמונות, סרטונים והקלטות קול) ושמות תצוגה כאחד.
        </p>
        <ul className="mt-6 space-y-3">
          {DONTS.map((item, i) => (
            <li
              key={item.title}
              className="sw-reveal card flex items-start gap-4 p-5 sm:p-6"
              style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger-text"
              >
                <Icon name={item.icon} size={20} />
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Truth in prices & experiences ─────────────────────────────────── */}
      <section
        aria-labelledby="truth-h"
        className="sw-reveal bento mt-16 p-6 sm:p-8"
        style={{ animationDelay: "60ms" }}
      >
        <h2
          id="truth-h"
          className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink"
        >
          <Icon name="info" size={22} aria-hidden="true" className="text-accent" />
          מחירים וחוויות — רק אמת
        </h2>
        <p className="mt-4 max-w-prose leading-relaxed text-foreground">
          כל הערך של הקהילה הוא שאפשר לסמוך על מה שכתוב בה. לכן:
        </p>
        <ul className="mt-5 space-y-3">
          {[
            "שתפו מחירים אמיתיים ומדויקים — מה שילמתם בפועל, כולל מה קורה למחיר אחרי תום המבצע. אל תמציאו סכומים ואל תגזימו.",
            "ספרו על חוויה שבאמת עברתם. אין לפרסם המלצה בתשלום, ביקורת מזויפת או חוות דעת בשם מישהו אחר.",
            "אם אתם לא בטוחים בפרט — אמרו זאת. ׳נדמה לי׳ עדיף על מספר שגוי שמישהו יסתמך עליו.",
            "מחירים משתנים בין ספקים, לפי זמן ולפי התאמה אישית. מה שהיה נכון לכם עשוי להיות שונה עבור אחרים.",
          ].map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 leading-relaxed text-foreground"
            >
              <Icon
                name="check"
                size={18}
                className="mt-0.5 shrink-0 text-accent-text"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── How moderation works ──────────────────────────────────────────── */}
      <section aria-labelledby="mod-h" className="mt-16">
        <h2
          id="mod-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          איך פועל הפיקוח על התוכן
        </h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-foreground">
          אנחנו מפעילים שילוב של בדיקה אוטומטית ושיקול דעת אנושי, כדי שהקהילה
          תישאר בטוחה בלי לפגוע בשיח פתוח.
        </p>
        <ol className="mt-6 space-y-4">
          {[
            {
              t: "סימון אוטומטי",
              d: "מערכת אוטומטית סורקת תוכן חדש ומסמנת פוסטים או תגובות שנראים חשודים — למשל ספאם או ניסוח פוגעני.",
            },
            {
              t: "בדיקת מנהל",
              d: "תוכן שסומן עובר לבדיקה של אדם מהצוות. עד להשלמת הבדיקה הוא מוסתר משאר הקהילה, ואצלכם מופיע עם הסימון ׳בבדיקת מנהל׳ כדי שתדעו שהוא ממתין.",
            },
            {
              t: "החלטה",
              d: "אם התוכן תקין — הוא חוזר להיות גלוי לכולם. אם הוא מפר את הכללים — הוא מוסר. במקרים חוזרים או חמורים, ננקוט צעדים נוספים מול החשבון.",
            },
          ].map((step, i) => (
            <li
              key={step.t}
              className="sw-reveal card flex items-start gap-4 p-5 sm:p-6"
              style={{ animationDelay: `${Math.min(i * 60, 180)}ms` }}
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent-text"
              >
                {i + 1}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  {step.t}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">
                  {step.d}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 rounded-xl border border-border/60 bg-background/60 p-4 text-sm leading-relaxed text-muted">
          שקיפות: כשתוכן שלכם ממתין לבדיקה תראו לצידו הערה ברורה ש״התוכן בבדיקת
          מנהל״. הוא נשאר גלוי לכם בזמן הבדיקה — כך אתם יודעים מה קורה, בלי הפתעות.
        </p>
      </section>

      {/* ── Reporting & blocking ──────────────────────────────────────────── */}
      <section
        aria-labelledby="report-h"
        className="sw-reveal bento mt-16 p-6 sm:p-8"
        style={{ animationDelay: "60ms" }}
      >
        <h2
          id="report-h"
          className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink"
        >
          <Icon name="lock" size={22} aria-hidden="true" className="text-accent" />
          דיווח וחסימה — הכלים שלכם
        </h2>
        <p className="mt-4 max-w-prose leading-relaxed text-foreground">
          אתם עוזרים לנו לשמור על הקהילה. אם משהו לא בסדר, יש לכם שני כלים ישירים
          בכל פוסט ותגובה:
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
              דיווח
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">
              פותחים את תפריט הפעולות (⋯) שליד הפוסט או התגובה ובוחרים ״דיווח״.
              הדיווח מגיע לצוות לבדיקה. דווחו על ספאם, הטרדה, מידע שקרי או כל דבר
              שנראה לכם מפר את הכללים.
            </p>
          </div>
          <div className="card p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
              חסימה
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">
              מאותו תפריט אפשר לחסום משתמש. לאחר חסימה לא תראו יותר את התוכן שלו
              בפיד — שקט מיידי, בלי צורך להמתין לבדיקה. אפשר לבטל חסימה בכל עת.
            </p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          דיווח אינו מבטיח הסרה אוטומטית — כל דיווח נבדק לגופו מול הכללים. אנחנו
          לא חושפים מי דיווח על מי.
        </p>
      </section>

      {/* ── Enforcement / our discretion ──────────────────────────────────── */}
      <section aria-labelledby="enforce-h" className="mt-16">
        <h2
          id="enforce-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          אכיפה
        </h2>
        <ul className="mt-6 space-y-3">
          {[
            "Switchy AI רשאית להסיר כל תוכן שמפר את הכללים האלה, ולפי שיקול דעתה גם תוכן שפוגע בבטיחות הקהילה או באמון שלה.",
            "בהפרות חוזרות או חמורות אנחנו רשאים להגביל, להשעות או לחסום חשבון.",
            "אתם אחראים לתוכן שאתם מפרסמים — כולל טקסט, תמונות, סרטונים והקלטות קול. פרסמו רק תוכן שמותר לכם לשתף.",
            "הכללים עשויים להתעדכן מעת לעת כדי לשמור על קהילה בריאה. המשך שימוש בקהילה משמעו הסכמה לגרסה המעודכנת.",
          ].map((point) => (
            <li
              key={point}
              className="flex items-start gap-3 leading-relaxed text-foreground"
            >
              <Icon
                name="chevron"
                size={18}
                className="mt-1 shrink-0 text-accent-text"
                aria-hidden="true"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm leading-relaxed text-muted">
          כללי הקהילה משלימים את המסמכים המחייבים שלנו — הם אינם מחליפים אותם.
          לפרטים המלאים ראו את{" "}
          <Link
            href="/terms"
            className="interactive text-accent-text underline-offset-4 hover:text-accent-hover hover:underline"
          >
            תנאי השימוש
          </Link>{" "}
          ואת{" "}
          <Link
            href="/privacy"
            className="interactive text-accent-text underline-offset-4 hover:text-accent-hover hover:underline"
          >
            מדיניות הפרטיות
          </Link>
          .
        </p>
      </section>

      {/* ── CTA — into the community ──────────────────────────────────────── */}
      <section
        aria-labelledby="cta-h"
        className="sw-reveal mt-16 rounded-3xl border border-border/50 bg-accent/[0.03] p-6 text-center sm:p-8"
        style={{ animationDelay: "60ms" }}
      >
        <h2
          id="cta-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מוכנים להצטרף לשיח?
        </h2>
        <p className="mx-auto mt-3 max-w-prose leading-relaxed text-foreground">
          עכשיו שאתם מכירים את הכללים — בואו לקרוא, לשאול ולשתף. ביחד חוסכים יותר.
        </p>
        <Link
          href="/community"
          className="press mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          לקהילת חוסך
          <Icon name="chevron" size={18} aria-hidden="true" />
        </Link>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16 border-t border-border pt-8"
        links={[
          {
            href: "/community",
            label: "קהילת חוסך",
            hint: "דיונים אמיתיים וחוויות לקוחות על מסלולי סלולר, אינטרנט, טלוויזיה וחו״ל.",
          },
          {
            href: "/terms",
            label: "תנאי השימוש",
            hint: "התנאים המחייבים לשימוש בשירות ובקהילה.",
          },
          {
            href: "/privacy",
            label: "מדיניות הפרטיות",
            hint: "איך אנחנו אוספים, שומרים ומגנים על המידע שלכם.",
          },
          {
            href: "/about",
            label: "על Switchy AI",
            hint: "מי אנחנו, איך אנחנו עובדים ולמה השירות נשאר חינמי.",
          },
        ]}
      />
    </main>
  );
}
