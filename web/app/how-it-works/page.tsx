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
import Icon from "@/components/Icon";
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

      {/* ── Hero (flat-ink panel) ─────────────────────────────────────────────
          Premium-2026 hero, mirroring the home: a solid deep-ink panel (#111827
          in BOTH themes so "white on ink" always holds) with the white H1 set
          directly on it — NO photo/video behind — an eyebrow pill, and exactly
          ONE green primary CTA + ONE quiet secondary text link (single-CTA
          discipline). This is a process page, so it renders NO prices/counts —
          nothing that could fabricate a figure. The intro keeps its stable id
          (#how-it-works-intro) so the speakable/voice schema still targets this
          exact rendered paragraph. Entrance staggers via the global `.sw-reveal`
          alias. A hairline border keeps the panel defined on the dark page bg. */}
      <header className="mt-4">
        <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <p
              className="sw-reveal mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/85"
              style={{ animationDelay: "0ms" }}
            >
              <Icon name="check" size={14} className="shrink-0 text-accent" />
              פשוט כמו 1·2·3 · חינם · בלי התחייבות
            </p>
            <h1 className="sw-reveal mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              איך זה עובד
            </h1>
            {/* The concise "what Switchy does" answer — a stable id so the
                speakable (voice) schema can target this exact rendered paragraph
                for read-aloud. On the ink panel the text is white. */}
            <p
              id="how-it-works-intro"
              className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl [text-wrap:pretty]"
              style={{ animationDelay: "60ms" }}
            >
              אנחנו מרכזים את כל מסלולי התקשורת בישראל — סלולר, אינטרנט, טלוויזיה,
              חבילות משולבות וחו״ל — במקום אחד, משווים בשבילכם ומלווים את המעבר.
              הנה כל התהליך, מההשוואה ועד החיסכון.
            </p>
            {/* CTA row — exactly ONE primary (solid green, glow, press). The
                consult path is a quiet SECONDARY white text link so only one
                action reads as primary per viewport. Tracked with non-PII labels. */}
            <div
              className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
              style={{ animationDelay: "120ms" }}
            >
              <TrackedCtaLink
                href="/compare"
                location="how-it-works-hero"
                label="compare"
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                השוו ותחסכו
                <Icon name="chevron" size={18} aria-hidden="true" />
              </TrackedCtaLink>
              <TrackedCtaLink
                href="/book"
                location="how-it-works-hero"
                label="book"
                className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
              >
                או דברו עם יועץ
              </TrackedCtaLink>
            </div>
          </div>
        </section>
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
        className="mt-16 rounded-3xl border border-border/60 bg-surface p-6 shadow-soft sm:p-8"
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
              <Icon
                name="check"
                size={18}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent-text"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        {/* §7b paid-relationship disclosure — prominent, before the hand-off. */}
        <CommissionDisclosure variant="inline" className="mt-5 max-w-2xl" />
        {/* ONE primary (solid green, glow, press) + ONE ghost secondary — the
            three-tier button grammar, so only one action reads as primary. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <TrackedCtaLink
            href="/compare"
            location="how-it-works-consent"
            label="compare"
            className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            להשוואת מסלולים
            <Icon name="chevron" size={18} aria-hidden="true" />
          </TrackedCtaLink>
          <TrackedCtaLink
            href="/book"
            location="how-it-works-consent"
            label="book"
            className="interactive press inline-flex items-center justify-center rounded-xl border border-border/60 bg-surface px-6 py-3.5 font-medium text-ink hover:border-accent/40 hover:text-accent hover:shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
