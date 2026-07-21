// ────────────────────────────────────────────────────────────────────────────
// /book — email-verified, self-serve Zoom consultation booking.
//
// This server component owns the SEO shell (self-canonical metadata, WebPage +
// HowTo + Breadcrumb JSON-LD, the SGE summary, honest trust signals) and renders
// the client <BookClient> for the interactive 4-step flow (details + day/time →
// email code → verify → book). The booking talks DIRECTLY to the `meeting-book`
// Supabase edge function; the DB trigger meetings_guard remains the authority on
// the schedule + rate limits.
//
// HONESTY (E-E-A-T): the consultation is FREE and the §7b commission disclosure
// is shown inside the form (we're paid a referral fee by providers on a switch,
// which does NOT change the price the user pays). The day/time picker only offers
// slots the server would accept. Self-canonical metadata via lib/seo. RTL +
// dark-mode safe + premium-2026.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import BookClient from "@/components/BookClient";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import { getMeetingProviders } from "@/lib/meeting-providers";
import { breadcrumbSchema, webPageSchema, howToSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

const PAGE_PATH = "/book";
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

// ISR: regenerate hourly so the static HTML picks up owner edits to
// public.provider_capabilities (the Zoom-supported provider list) on a schedule.
export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: "קביעת שיחת ייעוץ — Switchy AI",
  description:
    "קובעים שיחת ייעוץ חינמית בזום (30 דקות) עם נציג Switchy AI — בוחרים יום ושעה, " +
    "מאמתים את כתובת המייל בקוד חד-פעמי, ומקבלים קישור Zoom למייל לאחר אישור נציג. " +
    "ללא התחייבות.",
  path: PAGE_PATH,
});

export default async function BookPage() {
  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const planCount = getPlans().length;
  const providerCount = getProviders().length;
  const categoryCount = getCategories().length;

  // The Zoom-supported providers — read LIVE from public.provider_capabilities
  // (single source of truth), with the bundled 10-provider const as a resilient
  // fallback. Threaded into <BookClient> so the dropdown only ever offers
  // providers that can actually be booked. NEVER throws.
  const supportedProviders = await getMeetingProviders();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "קביעת שיחת ייעוץ", url: PAGE_PATH },
  ];

  const summary =
    "אפשר לקבוע שיחת ייעוץ חינמית בזום עם נציג Switchy AI ישירות מהאתר. בוחרים יום " +
    "ושעה פנויים (א׳–ה׳ 09:00–20:30, יום שישי עד 12:30, שעון ישראל), מאמתים את כתובת " +
    "המייל בקוד בן 6 ספרות, והבקשה עוברת לנציג. קישור ה-Zoom נשלח למייל לאחר אישור " +
    "הנציג. השיחה חינמית ואינה מחייבת — מטרתה לעזור לכם לבחור מסלול שמתאים לכם.";

  // HowTo: the real steps the page walks the user through.
  const howTo = howToSchema({
    name: "איך קובעים שיחת ייעוץ בזום עם Switchy AI",
    description:
      "ארבעה שלבים לקביעת שיחת ייעוץ חינמית: פרטים ומועד, אימות מייל בקוד חד-פעמי, אישור, וקבלת קישור Zoom.",
    url: PAGE_PATH,
    steps: [
      {
        name: "מילוי פרטים ובחירת מועד",
        text: "ממלאים שם, טלפון ומייל, בוחרים את השירות שעליו תרצו לדבר, ואת היום והשעה שנוחים לכם מתוך המועדים הפנויים.",
      },
      {
        name: "שליחת קוד אימות למייל",
        text: "שולחים קוד אימות בן 6 ספרות לכתובת המייל שהוזנה, כדי לוודא שהיא בשליטתכם.",
      },
      {
        name: "אימות הקוד",
        text: "מזינים את הקוד שהתקבל במייל ומאמתים את הכתובת.",
      },
      {
        name: "קביעת הפגישה",
        text: "מאשרים את הפרטים וקובעים את הפגישה. הבקשה עוברת לנציג, וקישור ה-Zoom נשלח למייל לאחר אישורו.",
      },
    ],
  });

  const related = [
    {
      title: "שאלון התאמה אישי",
      href: "/quiz",
      description: "5 שאלות → מסלולים אמיתיים מדורגים לפי הצרכים שלכם.",
    },
    {
      title: "השוואת כל המסלולים",
      href: "/compare",
      description: "מרכז ההשוואה — כל שירות וכל הספקים, מחירים בשקלים.",
    },
    {
      title: "ארנק התקשורת",
      href: "/wallet",
      description: "מחשבון חיסכון אישי מול המסלול הזול ביותר בקטלוג.",
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: WebPage + HowTo + Breadcrumb. */}
      <JsonLd
        data={webPageSchema({
          name: "קביעת שיחת ייעוץ בזום — Switchy AI",
          description:
            "קובעים שיחת ייעוץ חינמית בזום עם נציג Switchy AI: בוחרים מועד, מאמתים מייל בקוד חד-פעמי, ומקבלים קישור Zoom לאחר אישור נציג.",
          url: PAGE_PATH,
          lastReviewed: REVIEWED_AT,
          about: "קביעת שיחת ייעוץ בזום",
        })}
      />
      {howTo && <JsonLd data={howTo} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">קביעת שיחת ייעוץ</span>
      </nav>

      {/* ── Heading — single focal point: the H1, lifted by an ACTION eyebrow ── */}
      <header className="mt-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-text">
          {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static brand asset from /public (same rationale as ProviderLogo); the official Zoom mark shown as-is, never recolored. */}
          <img src="/assets/logos/zoom.png" alt="" width={14} height={14} aria-hidden />
          שיחת ייעוץ חינמית בזום
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[2.65rem]">
          קביעת שיחת ייעוץ
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          בוחרים יום ושעה, מאמתים את כתובת המייל בקוד חד-פעמי, ונציג Switchy AI
          יחזור אליכם עם קישור Zoom למייל. השיחה חינמית, 30 דקות, וללא התחייבות.
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: קביעת שיחת ייעוץ">
          {summary}
        </SgeSummary>
      </div>

      {/* ── Trust signals — real catalogue counts + §7b + §17 caveat ──────── */}
      <div className="mt-8">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── The booking card ──────────────────────────────────────────────── */}
      <section aria-labelledby="book-h" className="mt-10">
        <h2 id="book-h" className="sr-only">
          טופס קביעת שיחת ייעוץ
        </h2>
        <BookClient supportedProviders={supportedProviders} />
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />

      <p className="mt-8 text-xs text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
    </main>
  );
}
