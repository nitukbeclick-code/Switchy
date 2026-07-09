// ────────────────────────────────────────────────────────────────────────────
// /bills — "צלמו את החשבון" → savings. The user photographs a phone/internet/TV
// bill; we read the provider + monthly total + service category from it (Gemini
// Vision, via the site-bill-analyzer edge fn behind /api/analyze-bill) and surface
// up to 3 REAL cheaper plans from the catalogue with the annual saving.
//
// This is a server component: it renders the page shell (breadcrumb, heading, SGE
// summary, trust signals, §7b commission disclosure) and hosts the client
// <BillUploader> for the interactive capture/compress/analyze/result flow.
//
// HONESTY (E-E-A-T): trust counts are REAL catalogue figures. The commission
// disclosure (§7b) is shown prominently. The uploader itself surfaces the OCR read
// confidence + warnings and a privacy note (photo sent to Google, not stored).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import SgeSummary from "@/components/SgeSummary";
import TrustSignals from "@/components/TrustSignals";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import RelatedAuthorityPages from "@/components/RelatedAuthorityPages";
import BillUploader from "@/components/BillUploader";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import Icon from "@/components/Icon";
import type { ForensicsPlan } from "@/lib/bill-forensics";
import { getPlans, getProviders, getCategories } from "@/lib/data";
import { priceText } from "@/lib/plan-display";
import { breadcrumbSchema, webPageSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "צלמו את החשבון — בדקו כמה אפשר לחסוך",
  description:
    "מעלים תמונה של חשבון הסלולר / האינטרנט / הטלוויזיה, ואנחנו קוראים ממנה את " +
    "הספק והסכום החודשי ומציגים מסלולים זולים יותר מהקטלוג — עם החיסכון השנתי. " +
    "חינם, בלי התחייבות, והתמונה אינה נשמרת.",
  path: "/bills",
});

export default function BillsPage() {
  // REAL catalogue totals for the honest trust block (no fabricated figures).
  const plans = getPlans();
  const planCount = plans.length;
  const providers = getProviders();
  const providerCount = providers.length;
  const categoryCount = getCategories().length;

  // The real cheapest catalogue entry PLAN — the ONLY figure that carries the
  // green VALUE emphasis in the hero. Never a fabricated/promised number. We keep
  // the cheapest priced plan OBJECT (not just its rounded number) so the hero floor
  // renders via priceText — the same decimal-preserving helper the comparison rows
  // use — and never rounds a ₪10.90 plan UP to ₪11, which would overstate the floor.
  const priced = plans.filter((p) => typeof p.price === "number");
  const cheapest = priced.length
    ? priced.reduce((a, b) => (b.price < a.price ? b : a))
    : undefined;

  // Slim, serializable catalogue projection for the bill-forensics expired-promo
  // detection (needs the promo→post-promo `after` step-up). Only plans that carry
  // a real `after` price are useful, so we ship just those — never the full rich
  // payload across the RSC → client boundary, and never any fabricated row.
  const promoPlans: ForensicsPlan[] = plans
    .filter((p) => typeof p.after === "number" && (p.after as number) > 0)
    .map((p) => ({
      cat: p.cat,
      provider: p.provider,
      plan: p.plan,
      price: p.price,
      after: typeof p.after === "number" ? p.after : null,
      kind: p.kind,
    }));

  const crumbs = [
    { name: "בית", url: "/" },
    { name: "צילום חשבון", url: "/bills" },
  ];

  const summary =
    `מעלים תמונה של החשבון החודשי — סלולר, אינטרנט, טלוויזיה או חבילה משולבת — ` +
    `ואנחנו קוראים ממנה אוטומטית את הספק, התשלום החודשי וסוג השירות. מיד נציג ` +
    `מסלולים זולים יותר באותה קטגוריה מתוך הקטלוג שלנו, כולל החיסכון השנתי הצפוי. ` +
    `הקריאה אוטומטית וכדאי לוודא מול החשבון; התמונה נשלחת לקריאה בלבד ואינה נשמרת.`;

  const related = [
    {
      title: "השוואת מסלולים",
      href: "/compare",
      description: "כל שירותי התקשורת במקום אחד — בחרו שירות והשוו מסלולים.",
    },
    {
      title: "דופק השוק",
      href: "/market-pulse",
      description: "מחיר ממוצע, מינימלי ומקסימלי בכל קטגוריה — מצב נוכחי.",
    },
    {
      title: "שקיפות ומתודולוגיה",
      href: "/transparency",
      description: "איך אנחנו ממליצים, ואיך אנחנו מרוויחים.",
    },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      {/* Structured data: WebPage + Breadcrumb. */}
      <JsonLd
        data={webPageSchema({
          name: "צלמו את החשבון — בדקו כמה אפשר לחסוך",
          description:
            "העלאת תמונת חשבון תקשורת לקריאה אוטומטית של הספק והסכום החודשי, והצגת מסלולים זולים יותר מהקטלוג.",
          url: "/bills",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">צילום חשבון</span>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────────
          Flat-ink editorial hero (bank-grade, mirrored from the home hero): a
          solid deep-ink panel (#111827 in BOTH themes) with the white headline
          set directly on it — NO photo behind the text. The headline is a CHECK
          ("צלמו… בדקו כמה אפשר לחסוך"), never a promised amount; green is applied
          ONLY to the real catalogue entry-price clause (VALUE). Exactly ONE
          primary CTA (down to the uploader) + ONE quiet secondary text link. */}
      <section className="relative isolate mt-3 overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            צלמו את החשבון, בדקו כמה אפשר לחסוך.
            {cheapest ? (
              <>
                {" "}
                <span className="text-[#4ade80]">מסלולים מ-₪{priceText(cheapest)} לחודש.</span>
              </>
            ) : null}
          </h1>
          <p
            className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
            style={{ animationDelay: "60ms" }}
          >
            מעלים תמונה של החשבון החודשי — אנחנו קוראים ממנה את הספק, הסכום וסוג
            השירות, ומציגים מסלולים זולים יותר מהקטלוג.
          </p>
          {/* CTA row — exactly ONE primary (solid green, glow, press) that jumps
              to the uploader; the /book consult path is a quiet SECONDARY link. */}
          <div
            className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
            style={{ animationDelay: "120ms" }}
          >
            <TrackedCtaLink
              href="#bill-upload"
              location="bills-hero"
              label="upload"
              className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
            >
              צלמו את החשבון
              <Icon name="chevron" size={18} aria-hidden="true" />
            </TrackedCtaLink>
            <TrackedCtaLink
              href="/book"
              location="bills-hero"
              label="consult"
              className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
            >
              או דברו עם יועץ
            </TrackedCtaLink>
          </div>
          {/* Trust band — REAL catalogue counts; the entry price carries the green
              VALUE emphasis (text on ink), NOT a button. */}
          <p
            className="sw-reveal mt-8 text-sm text-white/85"
            style={{ animationDelay: "150ms" }}
          >
            {planCount} מסלולים · {providerCount} ספקים
            {cheapest ? (
              <>
                {" · "}החל מ-
                <span className="font-display font-bold text-[#4ade80]">
                  ₪{priceText(cheapest)}
                </span>{" "}
                לחודש
              </>
            ) : null}
          </p>
          {/* Quiet qualitative value line — muted, small green tick, honest (no
              fabricated figure). */}
          <p
            className="sw-reveal mt-2 inline-flex items-center gap-1.5 text-sm text-white/75"
            style={{ animationDelay: "180ms" }}
          >
            <Icon name="check" size={16} className="shrink-0 text-accent" />
            הקריאה אוטומטית, חינם, וההשוואה בלי התחייבות — התמונה אינה נשמרת
          </p>
        </div>
      </section>

      {/* ── SGE summary ───────────────────────────────────────────────────── */}
      <div className="mt-8">
        <SgeSummary heading="השורה התחתונה: צילום חשבון">{summary}</SgeSummary>
      </div>

      {/* ── §7b commission disclosure — prominent, never buried. ──────────── */}
      <CommissionDisclosure variant="banner" className="mt-8" />

      {/* ── Zero-state intro ──────────────────────────────────────────────── */}
      {/* Before any photo is picked there is no bill / result yet — surface a
          branded EmptyState (soft green badge + headline + description + a CTA to
          the manual comparison) instead of an ad-hoc grey lead-in. The uploader
          itself sits directly below; this sets the expectation honestly. */}
      <div className="mt-8 bento">
        <EmptyState
          icon="📷"
          title="עדיין לא העליתם חשבון"
          description="צלמו או העלו תמונה ברורה של החשבון החודשי — נקרא ממנה את הספק, הסכום וסוג השירות, ונציג מסלולים זולים יותר מהקטלוג. אין לכם חשבון ביד? אפשר גם להשוות ידנית."
          cta={{ label: "להשוואה ידנית", href: "/compare" }}
        />
      </div>

      {/* ── The interactive uploader (client) ─────────────────────────────── */}
      {/* promoPlans: REAL catalogue rows with a post-promo `after` price, projected
          to a slim serializable shape, so the in-result forensics can spot a likely
          expired promo.

          Suspense + SkeletonCard: while the client analyzer boundary streams in /
          hydrates, a branded pulsing card placeholder (matching the .card shape)
          holds the space — no blank gap, no layout-shifting grey text. */}
      <Suspense fallback={<SkeletonCard className="mt-8" lines={4} />}>
        <BillUploader promoPlans={promoPlans} />
      </Suspense>

      {/* ── Trust signals — real catalogue counts + §7b + §17 caveat. ─────── */}
      <div className="mt-12">
        <TrustSignals
          planCount={planCount}
          providerCount={providerCount}
          categoryCount={categoryCount}
        />
      </div>

      {/* ── Related — no dead-ends ────────────────────────────────────────── */}
      <RelatedAuthorityPages
        heading="עוד באתר"
        links={related}
        className="mt-16 border-t border-border pt-8"
      />
    </main>
  );
}
