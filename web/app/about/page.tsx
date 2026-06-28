// ────────────────────────────────────────────────────────────────────────────
// /about — the "על Switchy AI" brand/trust page. Mirrors the static site/about.html
// (mission · what we do · how it works · why trust us · the honest model), adapted
// to the web app's components + design tokens, mobile-first and RTL.
//
// HONESTY / E-E-A-T: every figure on this page is catalogue-derived (plan /
// provider / category counts via the data getters) — NO fabricated stats,
// ratings or testimonials. The business model is disclosed prominently with
// <CommissionDisclosure>: the comparison is free to the user, we are paid a
// referral fee by the provider on a switch, and that fee does NOT change the
// price the user pays nor the (transparent, stated) ranking. The shared
// <HowItWorks> explains the consent-only switch model.
//
// Server component — pure render from the build-time catalogue + static copy.
// Motion: the global `.sw-reveal` entrance (opacity + lift, GPU only) staggered
// 30–80ms via inline animationDelay, plus the global `.sw-lift` desktop hover —
// both reduced-motion safe (collapse to the resting state in globals.css).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import Icon from "@/components/Icon";
import { HowItWorks } from "@/components/HowItWorks";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import {
  orgSchema,
  breadcrumbSchema,
  SITE_URL,
  SITE_NAME,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_EMAIL, CONTACT_WHATSAPP, CONTACT_WHATSAPP_INTL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  title: "על Switchy AI — מי אנחנו ואיך אנחנו עובדים",
  description:
    "Switchy AI היא פלטפורמה ישראלית להשוואת מחירי תקשורת — סלולר, אינטרנט, " +
    "טלוויזיה, חבילות משולבות וחו״ל. כך אנחנו עובדים, למה השירות נשאר חינמי, " +
    "ולמה אפשר לסמוך עלינו: דירוג שקוף, גילוי עמלה מלא, וללא נתונים מומצאים.",
  path: "/about",
});

// AboutPage structured data (+ Organization) — declares the brand entity and that
// this page is *about* it. Honest: no claims beyond the real, disclosed model.
function aboutPageSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "על Switchy AI",
    description:
      "Switchy AI היא פלטפורמה ישראלית להשוואת מחירי תקשורת. כך אנחנו עובדים, " +
      "איך השירות נשאר חינמי, ולמה אפשר לסמוך עלינו.",
    url: `${SITE_URL}/about`,
    inLanguage: "he-IL",
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

export default function AboutPage() {
  // Catalogue-derived figures — the only numbers on the page. No fabrication.
  const planCount = getPlans().length;
  const providerCount = getProviders().length;
  const categoryCount = getCategories().length;

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "על Switchy AI", url: "/about" },
  ];

  // "מה אנחנו עושים בשבילכם" — the service's real, verifiable promises (mirrors
  // the static about.html list). Process claims only — no figures, nothing
  // fabricated; each is something the product actually does.
  const whatWeDo: { icon: "check" | "spark" | "lock"; title: string; body: string }[] = [
    {
      icon: "spark",
      title: "משווים את כל השוק בשניות",
      body: "כל מסלולי הספקים בקטגוריה במקום אחד — מחיר התחלתי, המחיר אחרי המבצע ויחידת החיוב.",
    },
    {
      icon: "check",
      title: "ממליצים לפי הצרכים שלכם",
      body: "הדירוג עובדתי ושקוף — לפי המחיר ההתחלתי, בלי ציון איכות סמוי ובלי תשלום על מיקום.",
    },
    {
      icon: "check",
      title: "מלווים את המעבר",
      body: "כולל ניוד מספר — ורק אחרי שתשאירו פרטים ותאשרו בטופס. בלי עמלות נסתרות ובלי פנייה לא מבוקשת.",
    },
    {
      icon: "lock",
      title: "מזכירים לפני שמבצע נגמר",
      body: "כדי שלא תשלמו יותר מדי כשהמחיר המוזל מתחלף במחיר הקבוע.",
    },
  ];

  // "למה לסמוך עלינו" — honest trust pillars (mirrors about.html), framed as the
  // real, disclosed model rather than a neutral-advocate claim.
  const trust: string[] = [
    "מחירים מעודכנים מכל החברות במקום אחד — בשקלים, כולל מע״מ.",
    "המלצה מוסברת: רואים בדיוק לפי איזה קריטריון עובדתי מסלול דורג גבוה.",
    "גילוי נאות מלא — אנו מקבלים עמלה מהספק, וזה לא משפיע על המחיר שלכם ולא על הדירוג.",
    "ללא נתונים מומצאים: אין דירוגי כוכבים או מדדים שאין מאחוריהם נתון אמיתי.",
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: AboutPage (+ Organization) + Organization + Breadcrumb. */}
      <JsonLd data={aboutPageSchema()} />
      <JsonLd data={orgSchema()} />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">על Switchy AI</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="sw-reveal text-xs font-semibold uppercase tracking-wide text-accent-text">
          מי אנחנו
        </p>
        <h1 className="sw-reveal mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          על Switchy AI
        </h1>
        <p
          className="sw-reveal mt-4 max-w-prose text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          משווים, חוסכים, עוברים — בלי כאב ראש. Switchy AI מרכזת את כל מסלולי
          התקשורת בישראל — סלולר, אינטרנט, טלוויזיה, חבילות משולבות וחו״ל — במקום
          אחד, ועוזרת לכם למצוא את המסלול המשתלם ביותר ולעבור אליו בקלות.
        </p>

        {/* Catalogue stat line — the only figures on the page, all real. */}
        <dl
          className="sw-reveal mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm"
          style={{ animationDelay: "120ms" }}
        >
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">מסלולים בקטלוג</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {planCount}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">ספקים</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {providerCount}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">קטגוריות שירות</dt>
            <dd className="font-display text-xl font-bold tracking-tight text-ink">
              {categoryCount}
            </dd>
          </div>
        </dl>
      </header>

      {/* ── The honest model (free service · referral fee) ─────────────────── */}
      <section
        aria-labelledby="model-h"
        className="sw-reveal bento mt-10 p-6 sm:p-8"
        style={{ animationDelay: "150ms" }}
      >
        <h2
          id="model-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          המודל שלנו — והשירות חינמי לכם
        </h2>
        <p className="mt-4 max-w-prose leading-relaxed text-foreground">
          השירות חינמי לחלוטין למשתמשים. אנחנו מקבלים דמי תיווך מחברת התקשורת כשעוברים
          דרכנו — אבל המחיר שאתם משלמים זהה, והעמלה אינה משפיעה על הדירוג. אנחנו מדרגים
          מסלולים לפי ההתאמה לכם, לא לפי מי שמשלם לנו.
        </p>
        {/* §7b / §17 — prominent commission disclosure (links /transparency). */}
        <CommissionDisclosure className="mt-5" />
      </section>

      {/* ── How it works (shared explainer — consent-only switch) ─────────── */}
      <section aria-label="איך זה עובד" className="mt-12">
        <HowItWorks
          eyebrow="שלושה צעדים"
          heading="איך זה עובד"
          intro="שלוש דקות מהצד שלכם — את כל השאר אנחנו עושים: משווים, בוחרים יחד, ועוברים רק בהסכמתכם."
        />
      </section>

      {/* ── What we do for you ─────────────────────────────────────────────── */}
      <section aria-labelledby="do-h" className="mt-12">
        <h2
          id="do-h"
          className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          מה אנחנו עושים בשבילכם
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {whatWeDo.map((item, i) => (
            <li
              key={item.title}
              className="sw-reveal sw-lift card flex h-full gap-4 p-5 sm:p-6"
              style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-text"
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

      {/* ── Why trust us (E-E-A-T / transparency stance) ───────────────────── */}
      <section
        aria-labelledby="trust-h"
        className="sw-reveal bento mt-12 p-6 sm:p-8"
        style={{ animationDelay: "60ms" }}
      >
        <h2
          id="trust-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          למה לסמוך עלינו
        </h2>
        <ul className="mt-5 space-y-3">
          {trust.map((point) => (
            <li key={point} className="flex items-start gap-3 leading-relaxed text-foreground">
              <Icon
                name="check"
                size={18}
                className="mt-0.5 shrink-0 text-accent-text"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-muted">
          רוצים את הפרטים המלאים? קראו את{" "}
          <Link
            href="/transparency"
            className="interactive text-accent-text underline-offset-4 hover:text-accent-hover hover:underline"
          >
            מדיניות השקיפות והמתודולוגיה
          </Link>{" "}
          שלנו.
        </p>
      </section>

      {/* ── Contact / WhatsApp ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="contact-h"
        className="sw-reveal bento mt-12 p-6 sm:p-8"
        style={{ animationDelay: "60ms" }}
      >
        <h2
          id="contact-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מדברים איתנו
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-foreground">
          יש שאלה לפני שעוברים? רוצים שנעזור לכם להשוות? כתבו לנו — נשמח ללוות אתכם.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <a
            href={`https://wa.me/${CONTACT_WHATSAPP_INTL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name="spark" size={18} aria-hidden="true" />
            וואטסאפ — {CONTACT_WHATSAPP}
          </a>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="interactive inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 font-semibold text-ink transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {CONTACT_EMAIL}
          </a>
        </div>
        <p className="mt-5 text-sm text-muted">
          השירות מופעל על-ידי אריאל תקשורת (עוסק מורשה 322253618), מרחוב ליאו בק
          64, נהריה.
        </p>
      </section>

      {/* ── CTA — start comparing ──────────────────────────────────────────── */}
      <section
        aria-labelledby="cta-h"
        className="sw-reveal mt-12 rounded-xl border border-accent/20 bg-accent/5 p-6 text-center sm:p-8"
        style={{ animationDelay: "60ms" }}
      >
        <h2
          id="cta-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מוכנים לחסוך?
        </h2>
        <p className="mx-auto mt-3 max-w-prose leading-relaxed text-foreground">
          השוואה חינם בשניות, בלי התחייבות.
        </p>
        <Link
          href="/compare"
          className="interactive press mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          להשוואת המסלולים
          <Icon name="arrow" size={18} aria-hidden="true" className="rotate-180" />
        </Link>
      </section>

      {/* Keep the entity web connected — never dead-end. */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16 border-t border-border pt-8"
        links={[
          {
            href: "/transparency",
            label: "שקיפות ומתודולוגיה",
            hint: "איך אנו אוספים נתונים, איך נקבעת בחירת העורך, ולמה כל תוכן מקודם מסומן בגלוי.",
          },
          {
            href: "/providers",
            label: "כל הספקים",
            hint: "אינדקס כל ספקי התקשורת בקטלוג, עם מספר מסלולים ומחיר התחלתי לכל ספק.",
          },
          {
            href: "/compare",
            label: "מרכז ההשוואה",
            hint: "השוו מסלולים בכל קטגוריה — בשקלים, מהקטלוג, חינם ובלי התחייבות.",
          },
          {
            href: "/glossary",
            label: "מילון מונחים",
            hint: "5G, eSIM, סיב אופטי, ניוד מספר ועוד — בעברית פשוטה.",
          },
        ]}
      />
    </main>
  );
}
