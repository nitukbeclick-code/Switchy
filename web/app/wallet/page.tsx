import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
import JsonLd from "@/components/JsonLd";
import EmptyState from "@/components/EmptyState";
import SocialProof from "@/components/SocialProof";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import PriceCaveat from "@/components/PriceCaveat";
import WalletClient, { type WalletCategory } from "./WalletClient";
import { priceStats } from "@/lib/data";
import { CATEGORY_HE } from "@/lib/categories";
import {
  collectionPageSchema,
  breadcrumbSchema,
} from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// ────────────────────────────────────────────────────────────────────────────
// /wallet — the "ארנק התקשורת" (Telecom Wallet): a PERSONAL savings view + an
// HONEST aggregate social-proof block.
//
//   • Personal view (<WalletClient>): the user enters their own current bill per
//     category; we show the REAL cheapest catalogue plan and the honest annual
//     saving ((bill − cheapest) × 12, clamped) — an estimate based on their input,
//     never a promise. All comparison prices come from the bundled catalogue.
//   • Social proof (<SocialProof>): a REAL aggregate of recorded savings
//     (leads.actual_saving via /api/wallet-stats → get_savings_stats), shown ONLY
//     above a genuine publish threshold. Below it: a neutral, claim-free fallback.
//
// The page reads ONLY the bundled catalogue at build time (no secrets); the social
// proof figures are fetched client-side from /api/wallet-stats. Self-canonical
// metadata via lib/seo. RTL + dark-mode safe + premium-2026.
// ────────────────────────────────────────────────────────────────────────────

// Static shell: the catalogue is bundled; the social-proof block hydrates client-
// side from /api/wallet-stats (which is itself force-dynamic).
export const dynamic = "force-static";

const PAGE_PATH = "/wallet";
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

/** Build the per-category REAL cheapest options the personal view compares against. */
function buildCategories(): WalletCategory[] {
  const stats = priceStats();
  const out: WalletCategory[] = [];
  for (const [cat, s] of Object.entries(stats)) {
    if (!s || s.count <= 0 || !s.cheapest) continue;
    out.push({
      cat,
      label: CATEGORY_HE[cat] ?? cat,
      cheapestPrice: s.min,
      cheapestPlan: String(s.cheapest.plan),
      cheapestProvider: String(s.cheapest.provider),
      compareHref: `/compare/${cat}`,
    });
  }
  // Stable order: cheapest entry point first, then Hebrew label.
  out.sort((a, b) => a.cheapestPrice - b.cheapestPrice || a.label.localeCompare(b.label, "he"));
  return out;
}

export function generateMetadata(): Metadata {
  const cats = buildCategories();
  return pageMetadata({
    title: "ארנק התקשורת — כמה אתם יכולים לחסוך",
    description:
      `הזינו את החשבון החודשי שלכם בכל קטגוריה וראו הערכת חיסכון שנתי מול המסלול ` +
      `הזול ביותר מתוך ${cats.length} קטגוריות תקשורת. הערכה לפי החשבון שתזינו — ` +
      `שקופה, חינמית וללא התחייבות.`,
    path: PAGE_PATH,
  });
}

export default function WalletPage() {
  const categories = buildCategories();
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "ארנק התקשורת", url: PAGE_PATH },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={collectionPageSchema({
          name: "ארנק התקשורת — מחשבון חיסכון אישי",
          description:
            "מחשבון חיסכון אישי בתקשורת: החשבון שלכם מול המסלול הזול ביותר בקטלוג, לכל קטגוריה.",
          url: PAGE_PATH,
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">ארנק התקשורת</span>
      </nav>

      {/* ── Heading — VALUE eyebrow (this page is about money saved) ──────── */}
      <header className="mt-5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-value/40 bg-value/10 px-3 py-1 text-xs font-semibold text-value-text">
          <Icon name="spark" size={14} aria-hidden />
          מחשבון חיסכון אישי
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-[2.65rem]">
          ארנק התקשורת שלכם
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          הזינו את החשבון החודשי הנוכחי שלכם בכל קטגוריה, ונראה לכם כמה אפשר לחסוך
          מול המסלול הזול ביותר בקטלוג — חישוב שקוף לפי הנתונים שתזינו.
        </p>
      </header>

      {/* ── Personal savings view ─────────────────────────────────────────── */}
      <section aria-labelledby="wallet-h" className="mt-8">
        <h2 id="wallet-h" className="sr-only">
          מחשבון החיסכון האישי
        </h2>
        {categories.length > 0 ? (
          <WalletClient categories={categories} />
        ) : (
          <div className="bento p-2">
            <EmptyState
              icon={<Icon name="search" size={32} aria-hidden />}
              title="אין כרגע מסלולים לחישוב"
              description="לא נמצאו מסלולים בקטלוג לחישוב החיסכון כרגע. אפשר לעבור להשוואה המלאה ולראות את כל המסלולים לפי קטגוריה."
              cta={{ label: "לעמוד ההשוואה", href: "/compare" }}
            />
          </div>
        )}
      </section>

      {/* ── Honest aggregate social proof (renders nothing below threshold; here
            we opt into the neutral, claim-free fallback so the section never
            shows a fabricated number). ──────────────────────────────────────── */}
      <section aria-labelledby="proof-h" className="mt-12">
        <h2
          id="proof-h"
          className="mb-4 font-display text-xl font-bold tracking-tight text-ink"
        >
          חיסכון אמיתי, לא הבטחות
        </h2>
        <SocialProof fallback="neutral" />
      </section>

      {/* ── Honesty: commission disclosure (§7b) + price caveat (§17). ──────── */}
      <div className="mt-10">
        <CommissionDisclosure variant="inline" />
        <PriceCaveat className="mt-2" />
      </div>

      {/* ── Onward links — no dead-ends. ──────────────────────────────────── */}
      <nav
        aria-label="המשך באתר"
        className="mt-12 border-t border-border/40 pt-8"
      >
        <h2 className="mb-5 font-display text-lg font-bold tracking-tight text-ink">
          המשיכו מכאן
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {[
            { href: "/quiz", label: "התאמה אישית ב-5 שאלות", sub: "מסלולים אמיתיים + הסבר" },
            { href: "/bills", label: "צילום חשבון לניתוח", sub: "העלו חשבון וקבלו חלופות" },
            { href: "/market-pulse", label: "מצב שוק התקשורת", sub: "מחירים נוכחיים לפי קטגוריה" },
            { href: "/transparency", label: "שקיפות ומתודולוגיה", sub: "איך אנחנו מדרגים וממליצים" },
          ].map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="card card-interactive group flex items-center justify-between gap-3 p-4"
              >
                <span>
                  <span className="block font-medium text-foreground transition-colors group-hover:text-accent">
                    {l.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{l.sub}</span>
                </span>
                <Icon
                  name="arrow"
                  size={18}
                  aria-hidden
                  className="shrink-0 text-muted transition-colors group-hover:text-accent"
                />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
      </nav>
    </main>
  );
}
