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
import type { ForensicsPlan } from "@/lib/bill-forensics";
import { getPlans, getProviders, getCategories } from "@/lib/data";
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
  const providerCount = getProviders().length;
  const categoryCount = getCategories().length;

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
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">צילום חשבון</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          צלמו את החשבון, ראו כמה אפשר לחסוך
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-foreground">
          מעלים תמונה של החשבון החודשי — אנחנו קוראים ממנה את הספק, הסכום וסוג
          השירות, ומציגים מסלולים זולים יותר מהקטלוג, עם החיסכון השנתי.
        </p>
      </header>

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
