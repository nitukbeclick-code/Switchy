// ────────────────────────────────────────────────────────────────────────────
// /negotiate — "לפני שעוזבים: כך משיגים מהספק את המחיר". A retention coach that
// turns the REAL catalogue into a GROUNDED negotiation script for a user who
// wants to STAY with their provider but pay less.
//
// This server component owns the SEO shell (self-canonical metadata, WebPage +
// HowTo + Breadcrumb JSON-LD, the SGE summary, honest trust signals) and renders
// the client <NegotiateClient> for the interactive part. The script the client
// builds (via /api/negotiate → app/negotiate/lib.ts) is grounded in real
// catalogue prices: the cheapest comparable plan (market floor) + the user's own
// provider's cheapest comparable plan.
//
// HONESTY (E-E-A-T): the market rate is a NEGOTIATION STARTING POINT, NOT a
// promise — the decision to match it is the provider's. Every number is a real
// catalogue figure; nothing is fabricated. Self-canonical metadata via lib/seo.
// RTL + dark-mode safe + premium-2026.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import { breadcrumbSchema, webPageSchema, howToSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";
import { ils, priceUnitLabel } from "@/lib/format";
import { NEGOTIATE_CATEGORIES } from "./lib";
import NegotiateClient from "./NegotiateClient";

const PAGE_PATH = "/negotiate";
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

export const metadata: Metadata = pageMetadata({
  title: "לפני שעוזבים: כך משיגים מהספק את המחיר",
  description:
    "רוצים להישאר אצל הספק אבל לשלם פחות? בנו תוך שניות תסריט מיקוח אמיתי " +
    "למחלקת השימור — מבוסס על המחיר הזול ביותר בשוק מתוך הקטלוג שלנו ועל המסלול " +
    "הזול ביותר של הספק שלכם עצמו. נקודת פתיחה למשא ומתן, לא הבטחה — ההחלטה בידי הספק.",
  path: PAGE_PATH,
});

export default function NegotiatePage() {
  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const planCount = getPlans().length;
  const providerCount = getProviders().length;
  const categoryCount = getCategories().length;

  // The real provider display names for the client's (optional) provider picker.
  // Restrict to providers that actually run a plan in a negotiate category.
  const negotiateCats = new Set<string>(NEGOTIATE_CATEGORIES);
  const negotiatePlans = getPlans().filter((p) => negotiateCats.has(p.cat));
  const providerNames = [
    ...new Set(negotiatePlans.map((p) => p.provider)),
  ].sort((a, b) => a.localeCompare(b, "he"));

  // The REAL market floor: the cheapest comparable catalogue price across the
  // negotiate categories — the same starting-point number the grounded script is
  // built on (never a fabricated figure). It carries the green VALUE emphasis in
  // the hero. 0 → the hero simply omits the price clause.
  // Restricted to genuinely-MONTHLY rows so the hero's hardcoded "לחודש" suffix
  // stays truthful — negotiatePlans includes 'abroad' rows priced per-minute/
  // day/package (e.g. a ₪1 per-minute roaming tariff) that must never be shown
  // as "₪1 לחודש". The honest monthly floor is the cheapest per-month plan.
  const marketFloor = negotiatePlans
    .filter(
      (p) =>
        typeof p.price === "number" &&
        p.price > 0 &&
        priceUnitLabel(p) === "לחודש",
    )
    .reduce((min, p) => (min === 0 || p.price < min ? p.price : min), 0);

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "מיקוח על המחיר", url: PAGE_PATH },
  ];

  const summary =
    "לפני שעוזבים את הספק כדאי לנסות להוריד את המחיר אצלו. בעמוד הזה בוחרים שירות, " +
    "ומקבלים תסריט מיקוח אמיתי למחלקת השימור — מבוסס על המחיר הזול ביותר בשוק מתוך " +
    "הקטלוג שלנו ועל המסלול הזול ביותר של הספק שלכם עצמו. זו נקודת פתיחה למשא ומתן, " +
    "לא הבטחה: ההחלטה אם להתאים את המחיר היא של הספק — ואם הוא מסרב, יש לכם כבר חלופה זולה.";

  // HowTo: the real steps the page walks the user through (truthful — these are
  // exactly what the coach produces and how a retention call works).
  const howTo = howToSchema({
    name: "איך מתמקחים עם הספק על מחיר נמוך יותר",
    description:
      "ארבעה שלבים שמתרגמים את המחיר הזול בשוק לתסריט מיקוח אמיתי מול מחלקת השימור.",
    url: PAGE_PATH,
    steps: [
      {
        name: "בחירת שירות",
        text: "בחרו את השירות שעליו אתם רוצים להתמקח: סלולר, אינטרנט, טלוויזיה, חבילה משולבת או חו״ל.",
      },
      {
        name: "הוספת הספק והחשבון",
        text: "הוסיפו (לא חובה) את שם הספק הנוכחי ואת החשבון החודשי, כדי לקבל גם את המחיר הזול של הספק עצמו והערכת חיסכון.",
      },
      {
        name: "קבלת תסריט מבוסס נתונים",
        text: "קבלו תסריט מיקוח עם המחיר הזול ביותר בשוק מתוך הקטלוג — נקודת הייחוס שאתם מציגים למחלקת השימור.",
      },
      {
        name: "מיקוח עם נכונות לעזוב",
        text: "בקשו להתאים או להתקרב למחיר. אם הספק מסרב, היכולת לעבור לחלופה זולה היא מקור הכוח שלכם.",
      },
    ],
  });

  const related = [
    {
      title: "השוואת כל המסלולים",
      href: "/compare",
      description: "מרכז ההשוואה — כל שירות וכל הספקים, מחירים בשקלים.",
    },
    {
      title: "שאלון התאמה אישי",
      href: "/quiz",
      description: "5 שאלות → מסלולים אמיתיים מדורגים לפי הצרכים שלכם.",
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
          name: "מיקוח על מחיר מול הספק — תסריט שימור מבוסס נתונים",
          description:
            "בחרו שירות וקבלו תסריט מיקוח אמיתי למחלקת השימור, מבוסס על המחיר הזול ביותר בשוק מתוך הקטלוג.",
          url: PAGE_PATH,
          lastReviewed: REVIEWED_AT,
          about: "מיקוח על מחיר מול ספק תקשורת",
        })}
      />
      {howTo && <JsonLd data={howTo} />}
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">מיקוח על המחיר</span>
      </nav>

      {/* ── Hero — flat-ink editorial panel (premium-2026) ────────────────────
          A solid deep-ink panel (#111827 in BOTH themes) with the white H1 set
          directly on it — NO photo behind the text — and ONE green primary CTA.
          The H1 is a CHECK/promise ("כך משיגים מהספק את המחיר"), never a promised
          amount; green is applied ONLY to the real catalogue market-floor price
          (VALUE), which is exactly the number the grounded script anchors on. The
          Zoom /book path is demoted to a SECONDARY quiet white text link so only
          one action reads as primary. White-on-ink holds because the panel is a
          fixed ink fill in both themes. ─────────────────────────────────────── */}
      <section className="relative isolate mt-5 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <span className="sw-reveal inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-[#4ade80]">
            <Icon name="spark" size={14} aria-hidden />
            תסריט שימור מבוסס נתונים
          </span>
          <h1 className="sw-reveal mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-white sm:text-[2.65rem]">
            לפני שעוזבים: כך משיגים מהספק את המחיר.{" "}
            {marketFloor > 0 ? (
              <span className="text-[#4ade80]">
                המחיר הזול בשוק מ-{ils(marketFloor)} לחודש.
              </span>
            ) : null}
          </h1>
          <p
            className="sw-reveal mx-auto mt-4 max-w-2xl text-lg font-medium leading-relaxed text-white/85"
            style={{ animationDelay: "60ms" }}
          >
            רוצים להישאר אצל הספק אבל לשלם פחות? בחרו שירות וקבלו תסריט מיקוח אמיתי
            למחלקת השימור — מבוסס על המחיר הזול ביותר בשוק מתוך הקטלוג שלנו. זו נקודת
            פתיחה למשא ומתן, לא הבטחה.
          </p>
          <div
            className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
            style={{ animationDelay: "120ms" }}
          >
            <TrackedCtaLink
              href="#negotiate-h"
              location="hero"
              label="negotiate"
              className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
            >
              בנו לי תסריט מיקוח
              <Icon name="chevron" size={18} aria-hidden="true" />
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/book"
              location="hero"
              label="consult"
              className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
            >
              או דברו עם יועץ
            </TrackedCtaLink>
          </div>
          {/* Trust band — REAL catalogue counts; the market-floor entry price
              carries the green VALUE emphasis (text-accent), NOT a button. */}
          <p
            className="sw-reveal mt-8 text-sm text-white/85"
            style={{ animationDelay: "150ms" }}
          >
            {planCount} מסלולים · {providerCount} ספקים
            {marketFloor > 0 ? (
              <>
                {" · "}הזול בשוק מ-
                <span className="font-display font-bold text-[#4ade80]">
                  {ils(marketFloor)}
                </span>{" "}
                לחודש
              </>
            ) : null}
          </p>
        </div>
      </section>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: מיקוח על המחיר">{summary}</SgeSummary>
      </div>

      {/* ── Trust signals — real catalogue counts + §7b + §17 caveat ──────── */}
      <div className="mt-8">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── The coach ─────────────────────────────────────────────────────── */}
      <section aria-labelledby="negotiate-h" className="mt-10">
        <h2 id="negotiate-h" className="sr-only">
          מחולל תסריט המיקוח
        </h2>
        <NegotiateClient providers={providerNames} />
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
