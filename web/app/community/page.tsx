// ────────────────────────────────────────────────────────────────────────────
// /community — "קהילת חוסך". Mirrors the static site/community.html (community
// discussions + per-provider ratings) but adapted to the web app's components,
// design tokens, and mobile-first RTL layout.
//
// HONESTY (E-E-A-T / TRUTH-ONLY): the static page hydrates a LIVE community feed
// and live provider star-ratings from Supabase at runtime. This server page has
// no access to that runtime data at build time, so — rather than fabricate posts,
// counts, star averages or testimonials — it renders a tasteful static intro,
// honest VALUE framing, the real topic channels, and a clear CTA into the actual
// community (the app + WhatsApp). The only numbers shown are catalogue-derived
// (provider / category counts via the data getters). No invented figures.
//
// The §7b commission disclosure (<CommissionDisclosure>) and the §17 price caveat
// (<PriceCaveat>) appear where pricing / the paid relationship is referenced, as
// on the other pages.
//
// Server component — pure render from the build-time catalogue + static copy.
// Motion: the global `.sw-reveal` entrance (opacity + 8px lift, GPU only) staggered
// 30–80ms via inline animationDelay, plus the global `.sw-lift` desktop hover —
// both reduced-motion safe (collapse to the resting state in globals.css).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import Icon from "@/components/Icon";
import SgeSummary from "@/components/SgeSummary";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getProviders, getCategories } from "@/lib/data";
import { collectionPageSchema, breadcrumbSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { CONTACT_WHATSAPP, CONTACT_WHATSAPP_INTL } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  title: "קהילת חוסך — דיונים אמיתיים על מסלולי תקשורת",
  description:
    "קהילת חוסך: דיונים אמיתיים מאנשים שכבר עברו ספק — מה עבד, מה לא, ואיזה מסלול " +
    "באמת שווה. שאלות וחוויות על סלולר, אינטרנט, טלוויזיה וחבילות חו״ל. הצטרפו דרך " +
    "האפליקציה או הוואטסאפ.",
  path: "/community",
});

// Pre-built WhatsApp deep link (Hebrew opener) — same number used site-wide.
const WHATSAPP_HREF = `https://wa.me/${CONTACT_WHATSAPP_INTL}?text=${encodeURIComponent(
  "היי, אשמח להצטרף לקהילת חוסך ולשאול על מסלולי תקשורת",
)}`;

// The real topic channels from the static community page — qualitative framing
// only (what each channel is FOR), no fabricated post counts or activity.
const CHANNELS: { title: string; blurb: string }[] = [
  {
    title: "המלצות",
    blurb: "מי כדאי ומי לא — חוויות אמיתיות לפני שעוברים ספק.",
  },
  {
    title: "סלולר",
    blurb: "מסלולים, כיסוי, 5G וניוד מספר — שאלות מהשטח.",
  },
  {
    title: "אינטרנט",
    blurb: "סיב אופטי מול כבלים, מהירויות, ראוטרים ויציבות חיבור.",
  },
  {
    title: "טלוויזיה",
    blurb: "חבילות, סטרימינג וחיתוך הכבלים — מה באמת שווה לכם.",
  },
  {
    title: "חו״ל",
    blurb: "חבילות eSIM ונתונים לפי יעד — מה עבד בנסיעה האחרונה.",
  },
  {
    title: "עזרה בניתוק",
    blurb: "ביטול התחייבות, חיובים מיותרים וקריאת חשבון — נעזרים אחד בשני.",
  },
];

export default function CommunityPage() {
  // Catalogue-derived anchors only — the honest scope of what the community
  // compares. NO fabricated member counts, posts or star averages.
  const providers = getProviders();
  const categories = getCategories();

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "קהילה", url: "/community" },
  ];

  // GEO/SGE-extractable conclusion — factual, ~45 words, no invented metrics.
  const summary =
    `קהילת חוסך היא מרחב לדיונים אמיתיים על מסלולי תקשורת בישראל — סלולר, אינטרנט, ` +
    `טלוויזיה וחבילות חו״ל מ-${providers.length} ספקים. חברי הקהילה משתפים מה עבד, ` +
    `מה לא, ואיזה מסלול באמת שווה, כדי שתוכלו ללמוד מניסיון של אחרים לפני שאתם ` +
    `מחליטים לעבור. ההצטרפות והדיון מתבצעים דרך האפליקציה והוואטסאפ.`;

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* Structured data: CollectionPage + Breadcrumb. */}
      <JsonLd
        data={collectionPageSchema({
          name: "קהילת חוסך — דיונים אמיתיים על מסלולי תקשורת",
          description:
            "קהילה לדיונים אמיתיים וחוויות לקוחות על מסלולי סלולר, אינטרנט, טלוויזיה וחבילות חו״ל בישראל.",
          url: "/community",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">קהילה</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <p className="sw-reveal inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-text">
          <Icon name="spark" size={14} aria-hidden="true" />
          חוכמת ההמון · ניסיון אמיתי
        </p>
        <h1 className="sw-reveal mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
          קהילת <span className="text-accent-text">חוסך</span>
        </h1>
        <p
          className="sw-reveal mt-4 max-w-2xl text-lg leading-relaxed text-foreground"
          style={{ animationDelay: "60ms" }}
        >
          דיונים אמיתיים מאנשים שכבר עברו: מה עבד, מה לא, ואיזה מסלול באמת שווה.
          קראו, שאלו ולמדו מהניסיון של אחרים — לפני שאתם מחליטים לעבור ספק.
        </p>
        <div
          className="sw-reveal mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          style={{ animationDelay: "90ms" }}
        >
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive press sw-lift inline-flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-[var(--glow-accent)] hover:bg-accent-hover hover:shadow-float hover:shadow-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name="spark" size={18} aria-hidden="true" />
            הצטרפו בוואטסאפ — {CONTACT_WHATSAPP}
          </a>
          <a
            href="#channels"
            className="interactive press sw-lift inline-flex items-center justify-center gap-2 rounded-xl border border-border/60 px-6 py-3 font-medium text-ink hover:border-accent/40 hover:bg-surface hover:shadow-soft"
          >
            על מה מדברים בקהילה ↓
          </a>
        </div>
        {/* Catalogue-derived scope line — the only figures on the page. */}
        <p
          className="sw-reveal mt-4 text-sm text-muted"
          style={{ animationDelay: "120ms" }}
        >
          דיונים על {providers.length} ספקים ב-{categories.length} קטגוריות שירות
        </p>
      </header>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-10">
        <SgeSummary heading="השורה התחתונה: הקהילה">{summary}</SgeSummary>
      </div>

      {/* ── Channels / topics ─────────────────────────────────────────────── */}
      <section aria-labelledby="channels-h" className="mt-16 scroll-mt-6" id="channels">
        <h2
          id="channels-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          מה מדברים עכשיו בקהילה
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          הקהילה מאורגנת לפי נושאים — בחרו את מה שמעניין אתכם. הפרסום, התגובות
          ושיתוף צילומי מסך של חשבון מתבצעים מתוך האפליקציה, שם גם תקבלו התראה
          כשמישהו עונה לכם.
        </p>
        <ul className="bento-grid mt-8">
          {CHANNELS.map((c, i) => (
            <li
              key={c.title}
              className="sw-reveal bento card-interactive flex h-full flex-col p-5 sm:p-6"
              style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}
            >
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-1 shrink-0 rounded-full bg-accent"
                />
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {c.blurb}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Provider ratings (honest framing — live in the app) ───────────── */}
      <section aria-labelledby="ratings-h" className="mt-16">
        <div className="bento p-6 sm:p-9">
          <h2
            id="ratings-h"
            className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink"
          >
            <Icon name="star" size={22} aria-hidden="true" className="text-accent" />
            דירוגי ספקים מהקהילה
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-foreground">
            חברי הקהילה מדרגים את הספקים שעברו אליהם ומשתפים ביקורת אמיתית. הדירוגים
            נאספים ומתעדכנים בתוך האפליקציה — כך הם נשארים חיים ומשקפים חוויה עדכנית,
            ולא מספרים קבועים שמתיישנים. רוצים לראות את הדירוג העדכני או להוסיף את
            שלכם? זה קורה באפליקציה ובקהילת הוואטסאפ.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <a
              href={WHATSAPP_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="interactive press sw-lift inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover hover:shadow-float hover:shadow-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="spark" size={18} aria-hidden="true" />
              לדירוגים בקהילה — וואטסאפ
            </a>
            <Link
              href="/providers"
              className="interactive press sw-lift inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 py-2.5 font-semibold text-ink hover:border-accent/40 hover:text-accent hover:shadow-soft"
            >
              לכל הספקים בקטלוג ←
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why the community + the honest model ──────────────────────────── */}
      <section aria-labelledby="why-h" className="mt-16">
        <h2
          id="why-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          למה קהילה?
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              t: "ניסיון אמיתי",
              d: "חוויות מאנשים שכבר עברו — לא פרסומת, אלא מה קרה בפועל אחרי המעבר.",
            },
            {
              t: "שאלות בלי בושה",
              d: "לא בטוחים מה לבחור? שואלים את מי שכבר היה שם ומקבלים תשובה כנה.",
            },
            {
              t: "חיסכון משותף",
              d: "טיפים על מבצעים, ביטול התחייבות וקריאת חשבון — חוסכים יחד יותר.",
            },
          ].map((v, i) => (
            <li
              key={v.t}
              className="sw-reveal bento p-6"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink">
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-1 shrink-0 rounded-full bg-accent"
                />
                {v.t}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {v.d}
              </p>
            </li>
          ))}
        </ul>
        {/* §7b commission disclosure + §17 price caveat — the community discusses
            real prices, and the comparison service is a paid-referral model. */}
        <CommissionDisclosure variant="inline" className="mt-6 max-w-2xl" />
        <PriceCaveat className="mt-3 max-w-2xl" />
      </section>

      {/* ── Join CTA ──────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="join-h"
        className="sw-reveal mt-16 rounded-xl border border-accent/20 bg-accent/5 p-6 text-center sm:p-8"
      >
        <h2
          id="join-h"
          className="font-display text-2xl font-bold tracking-tight text-ink"
        >
          רוצים לפתוח דיון או לשתף חוויה?
        </h2>
        <p className="mx-auto mt-3 max-w-prose leading-relaxed text-foreground">
          ההצטרפות חינמית. כתבו לנו בוואטסאפ ונצרף אתכם לקהילה — שם תוכלו לשאול,
          להגיב, לדרג ספקים ולקבל התראה כשמישהו עונה.
        </p>
        <div className="mt-6 flex justify-center">
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="interactive press sw-lift inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover hover:shadow-float hover:shadow-accent/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Icon name="spark" size={18} aria-hidden="true" />
            להצטרף בוואטסאפ — {CONTACT_WHATSAPP}
          </a>
        </div>
      </section>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="המשיכו מכאן"
        className="mt-16 border-t border-border pt-8"
        links={[
          {
            href: "/providers",
            label: "כל הספקים",
            hint: "אינדקס כל ספקי התקשורת בקטלוג, עם מספר מסלולים ומחיר התחלתי.",
          },
          {
            href: "/compare/cellular",
            label: "השוואת מסלולי סלולר",
            hint: "השוו מחירים בשקלים מכל הספקים — חינם ובלי התחייבות.",
          },
          {
            href: "/guides",
            label: "מדריכים",
            hint: "איך עוברים ספק, מבטלים התחייבות וחוסכים — שלב אחר שלב.",
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
