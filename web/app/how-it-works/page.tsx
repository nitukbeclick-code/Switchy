// ────────────────────────────────────────────────────────────────────────────
// /how-it-works — the "איך זה עובד" explainer route. Mirrors the static
// site/how-it-works.html for content + structure (a 3-step process → what to
// expect → consent/§30A framing → CTAs), adapted to the web app's components and
// mobile-first, RTL design system.
//
// HONESTY (TRUTH-ONLY): this is a process page, not a data surface. It renders
// NO prices, NO plan/provider counts, NO ratings, NO testimonials — nothing that
// could fabricate a figure. Every claim is the service's real, verifiable
// promise: the comparison is free, there is no commitment, and we contact a
// provider in the user's name ONLY after they leave details and approve it in the
// form (the §7b consent + Spam-Law §30A model). Number-port timing copy is stated
// qualitatively ("ימי עסקים בודדים"), without inventing exact figures.
//
// The 3-step strip reuses the shared <HowItWorks> component (single source of the
// canonical compare → choose → switch-with-consent copy, so the homepage and this
// page never drift). The page promotes it to an <h2> via `as`.
//
// Disclosures: <CommissionDisclosure/> (§7b paid-relationship) sits next to the
// lead CTA hand-off; <PriceCaveat/> (§17) sits next to the prices-related promise.
//
// Server component — pure presentation. Metadata is self-canonical at
// /how-it-works; a HowTo JSON-LD is natural here (a genuine ordered procedure),
// plus a Breadcrumb and a small FAQPage mirroring the static page's FAQ.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { HowItWorks, HOW_IT_WORKS_STEPS } from "@/components/HowItWorks";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import {
  breadcrumbSchema,
  howToSchema,
  faqPageSchema,
  speakableSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "איך זה עובד — משווים, בוחרים ועוברים בהסכמה",
  description:
    "איך Switchy עובד? שלושה צעדים: משווים בשבילכם את כל הספקים, בוחרים יחד את " +
    "המסלול המשתלם, ועוברים רק אחרי שתאשרו בטופס — כולל ליווי וניוד מספר. חינם, " +
    "בלי התחייבות ובלי פנייה לא מבוקשת.",
  path: "/how-it-works",
});

// ── "What to expect" — honest, qualitative expectations (no fabricated figures).
// Mirrors the static page's reassurance/feature copy: free, explained ranking,
// number kept on port, no surprises. Stated as real promises, not metrics.
const EXPECTATIONS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "חינם לכם — תמיד",
    body:
      "השוואת המסלולים והליווי חינמיים לחלוטין. אנחנו מקבלים דמי תיווך מהספק רק " +
      "כשעוברים דרכנו — לא מכם, וזה לא משפיע על המחיר שתשלמו.",
  },
  {
    title: "דירוג שקוף ומוסבר",
    body:
      "רואים בדיוק לפי מה כל מסלול דורג — לפי המחיר ההתחלתי וגמישות, בלי ציון " +
      "איכות סמוי ובלי תשלום על מיקום. ההמלצה לפי ההתאמה לכם, לא לפי מי שמשלם.",
  },
  {
    title: "המספר שלכם נשמר",
    body:
      "ניוד המספר שומר על המספר הקיים — הספק החדש מבצע את הניוד מול הספק הישן, " +
      "תוך ימי עסקים בודדים, ואתם נשארים מחוברים עד שהמעבר מושלם.",
  },
  {
    title: "בלי הפתעות",
    body:
      "מציגים גם את המחיר שאחרי המבצע, לא רק את מחיר הפתיחה — ומלווים אתכם לאורך " +
      "כל המעבר. אם יש לכם התחייבות פעילה, נבדוק אותה יחד לפני שמתקדמים.",
  },
];

// ── FAQ — a small, honest subset mirroring the static how-it-works.html FAQ.
// Kept qualitative; no invented timelines beyond what the catalogue/process
// genuinely supports.
const FAQS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "כמה זמן לוקח מעבר ספק?",
    answer:
      "בסלולר הניוד מתבצע לרוב במהירות; באינטרנט וטלוויזיה זה אורך ימי עסקים " +
      "בודדים, לעיתים עם תיאום טכנאי. אתם נשארים מחוברים עד שהמעבר מושלם.",
  },
  {
    question: "האם המספר שלי נשמר במעבר?",
    answer:
      "כן. ניוד המספר שומר על המספר הקיים — הספק החדש מבצע את הניוד מול הספק " +
      "הישן, בלי שתצטרכו לבטל ידנית.",
  },
  {
    question: "האם אשלם קנס אם אעבור?",
    answer:
      "רק אם יש לכם התחייבות פעילה. הרבה מהמסלולים היום הם ללא התחייבות כלל — " +
      "בדקו מול הספק לפני שאתם עוברים, ואנחנו נעזור לכם לבדוק.",
  },
  {
    question: "מתי תיצרו איתי קשר?",
    answer:
      "רק אחרי שתשאירו פרטים ותאשרו בטופס. אין פנייה לא מבוקשת — ההסכמה ליצירת " +
      "קשר היא יזומה שלכם, ודיוור שיווקי נשלח רק אם בחרתם בכך בנפרד.",
  },
];

export default function HowItWorksPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "איך זה עובד", url: "/how-it-works" },
  ];

  // HowTo schema is natural here — this IS a genuine ordered procedure. Build it
  // from the SAME canonical steps the <HowItWorks> strip renders, so the markup
  // and the visible page can never disagree.
  const howTo = howToSchema({
    name: "איך לעבור ספק תקשורת ולחסוך עם Switchy",
    description:
      "שלושה צעדים: משווים את כל הספקים בקטגוריה, בוחרים את המסלול המשתלם, " +
      "ועוברים בהסכמה — כולל ליווי וניוד מספר. חינם ובלי התחייבות.",
    url: "/how-it-works",
    steps: HOW_IT_WORKS_STEPS.map((s) => ({ name: s.title, text: s.description })),
  });

  // Speakable (voice / pillar 7): the concise read-aloud region — the H1 + the
  // intro answer paragraph (#how-it-works-intro) that frames the procedure. Both
  // are real rendered nodes; the spec asserts nothing new.
  const speakable = speakableSchema(["h1", "#how-it-works-intro"]);

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: Breadcrumb + HowTo (real procedure) + FAQPage + Speakable. */}
      <JsonLd data={breadcrumbSchema(crumbs)} />
      {howTo && <JsonLd data={howTo} />}
      <JsonLd data={faqPageSchema(FAQS as { question: string; answer: string }[])} />
      {speakable ? <JsonLd data={speakable} /> : null}

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">איך זה עובד</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          פשוט כמו 1·2·3 · חינם · בלי התחייבות
        </p>
        <h1 className="sw-reveal mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          איך זה עובד
        </h1>
        {/* The concise "what Switchy does" answer — a stable id so the speakable
            (voice) schema can target this exact rendered paragraph for read-aloud. */}
        <p
          id="how-it-works-intro"
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
        >
          אנחנו מרכזים את כל מסלולי התקשורת בישראל — סלולר, אינטרנט, טלוויזיה,
          חבילות משולבות וחו״ל — במקום אחד, משווים בשבילכם ומלווים את המעבר. הנה
          כל התהליך, מההשוואה ועד החיסכון.
        </p>
        {/* Primary CTAs — one to the compare hub, one to book a consult. Tracked
            with non-PII labels only. Mobile-first: stack, then row on sm. */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <TrackedCtaLink
            href="/compare"
            location="how-it-works-hero"
            label="compare"
            className="interactive press sw-lift inline-flex items-center justify-center rounded-xl border border-accent/40 bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-[var(--glow-accent)] hover:bg-accent-hover hover:shadow-float hover:shadow-accent/30"
          >
            השוו ותחסכו ←
          </TrackedCtaLink>
          <TrackedCtaLink
            href="/book"
            location="how-it-works-hero"
            label="book"
            className="interactive press sw-lift inline-flex items-center justify-center rounded-xl border border-border/60 px-6 py-3 font-medium text-ink hover:border-accent/40 hover:bg-surface hover:shadow-soft"
          >
            תיאום שיחת ייעוץ
          </TrackedCtaLink>
        </div>
      </header>

      {/* ── 3-step process (shared component, promoted to <h2>) ───────────── */}
      <HowItWorks
        as="h2"
        className="mt-16"
        eyebrow="שלושה צעדים"
        heading="מההשוואה ועד מסלול חדש"
        intro="שלוש דקות מהצד שלכם — את כל השאר אנחנו עושים: משווים, בוחרים יחד, ועוברים רק בהסכמתכם."
      />

      {/* ── What to expect ────────────────────────────────────────────────── */}
      <section aria-labelledby="expect-h" className="mt-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          למה אפשר לסמוך עלינו
        </p>
        <h2
          id="expect-h"
          className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          למה לצפות
        </h2>
        <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {EXPECTATIONS.map((item, i) => (
            <li
              key={item.title}
              className="sw-reveal sw-lift card flex h-full flex-col p-6"
              style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
            >
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
        {/* §17 price-accuracy caveat — sits next to the price-related promises. */}
        <PriceCaveat className="mt-4" />
      </section>

      {/* ── Consent / §30A framing ────────────────────────────────────────── */}
      <section
        aria-labelledby="consent-h"
        className="mt-16 rounded-xl border border-border bg-surface p-6 sm:p-8"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          הסכמה ופרטיות
        </p>
        <h2
          id="consent-h"
          className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          פונים אליכם רק בהסכמתכם
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-foreground">
          ההשוואה זמינה לכם בלי להשאיר פרטים. ניצור איתכם קשר רק אחרי שתשאירו פרטים
          ותאשרו זאת בטופס — אין פנייה לא מבוקשת. ההסכמה ליצירת קשר בנוגע לפנייתכם
          נפרדת מהסכמה לדיוור שיווקי, שהיא אופציונלית לחלוטין וניתנת להסרה בכל עת
          (בהתאם לחוק התקשורת — תיקון 40, &quot;חוק הספאם&quot;, §30א).
        </p>
        <ul className="mt-5 flex flex-col gap-2 text-sm text-foreground">
          {[
            "אין עלות ואין התחייבות — רק השוואה",
            "פונים אליכם רק אחרי שתאשרו בטופס",
            "דיוור שיווקי אופציונלי, מסומן בנפרד וניתן להסרה בכל עת",
            "אפשר לבקש את הסרת הפרטים בכל עת",
          ].map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5 text-accent-text">
                ✓
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {/* §7b paid-relationship disclosure — prominent, before the hand-off. */}
        <CommissionDisclosure variant="inline" className="mt-5 max-w-2xl" />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <TrackedCtaLink
            href="/compare"
            location="how-it-works-consent"
            label="compare"
            className="interactive press sw-lift inline-flex items-center justify-center rounded-xl border border-accent/40 bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover hover:shadow-float hover:shadow-accent/20"
          >
            להשוואת מסלולים ←
          </TrackedCtaLink>
          <TrackedCtaLink
            href="/book"
            location="how-it-works-consent"
            label="book"
            className="interactive press sw-lift inline-flex items-center justify-center rounded-xl border border-border/60 px-6 py-3 font-medium text-ink hover:border-accent/40 hover:bg-surface hover:shadow-soft"
          >
            מעדיפים לדבר? תיאום שיחה
          </TrackedCtaLink>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="faq-h" className="mt-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
          שאלות נפוצות
        </p>
        <h2
          id="faq-h"
          className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          שאלות על השירות
        </h2>
        <dl className="mt-8 flex flex-col gap-3">
          {FAQS.map((qa) => (
            <div key={qa.question} className="card p-5 sm:p-6">
              <dt className="font-display text-base font-semibold tracking-tight text-ink">
                {qa.question}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-foreground">
                {qa.answer}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16 border-t border-border pt-8"
        links={[
          {
            href: "/compare",
            label: "מרכז ההשוואה",
            hint: "כל הקטגוריות — סלולר, אינטרנט, טלוויזיה, חבילות וחו״ל.",
          },
          {
            href: "/book",
            label: "תיאום שיחת ייעוץ",
            hint: "מעדיפים לדבר? נלווה אתכם אישית בבחירה ובמעבר.",
          },
          {
            href: "/providers",
            label: "כל הספקים",
            hint: "אינדקס כל ספקי התקשורת בישראל שבקטלוג שלנו.",
          },
          {
            href: "/guides",
            label: "מדריכים",
            hint: "איך עוברים ספק, בוחרים מסלול וחוסכים — שלב אחר שלב.",
          },
        ]}
      />
    </main>
  );
}
