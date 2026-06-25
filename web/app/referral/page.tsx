import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import ReferralCard from "@/components/ReferralCard";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import { webPageSchema, breadcrumbSchema } from "@/lib/schema";
import { pageMetadata } from "@/lib/seo";

// ────────────────────────────────────────────────────────────────────────────
// /referral — "הזמינו חבר" — the share-the-tool referral page. It hosts
// <ReferralCard>, which mints a REAL, persisted, attributable code (SW-XXXXXX via
// /api/referral → public.referral_codes) and renders a shareable code + invite
// link. The framing is strictly share-the-tool: invite a friend to a FREE
// comparison tool.
//
// TRUTH-ONLY / E-E-A-T (ABSOLUTE):
//   • Real code, real attribution — nothing fabricated, no fabricated counts.
//   • NO advertised monetary reward anywhere on the page. We never promise "get
//     ₪X" (Israeli Spam-Law §30A + consumer-protection + honesty bar). A reward,
//     if ever defined, is owner config — never invented by a surface.
//   • Sharing is opt-in by nature (the user chooses to share). The invite link
//     carries only the code (?ref=) for later attribution — no PII, no messaging.
//
// Static shell (no secrets read at build time); the card hydrates client-side and
// calls the force-dynamic /api/referral on demand. Self-canonical metadata via
// lib/seo. RTL + dark-mode safe + premium-2026.
// ────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-static";

const PAGE_PATH = "/referral";
const REVIEWED_AT = new Date().toISOString().slice(0, 10);

export function generateMetadata(): Metadata {
  return pageMetadata({
    title: "הזמינו חבר לחסוך — שיתוף Switchy AI",
    description:
      "קבלו קוד הזמנה אישי ושתפו את Switchy AI עם חברים. כלי חינמי להשוואת מסלולי " +
      "תקשורת בישראל — שיתוף הכלי, ללא עלות וללא הבטחת תגמול כספי.",
    path: PAGE_PATH,
  });
}

export default function ReferralPage() {
  const crumbs = [
    { name: "בית", url: "/" },
    { name: "הזמינו חבר", url: PAGE_PATH },
  ];

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <JsonLd
        data={webPageSchema({
          name: "הזמינו חבר לחסוך — שיתוף Switchy AI",
          description:
            "קבלו קוד הזמנה אישי ושתפו את Switchy AI, כלי חינמי להשוואת מסלולי תקשורת בישראל. שיתוף הכלי בלבד — ללא הבטחת תגמול כספי.",
          url: PAGE_PATH,
          lastReviewed: REVIEWED_AT,
          about: "הזמנת חברים לכלי השוואת תקשורת",
        })}
      />
      <JsonLd data={breadcrumbSchema(crumbs)} />

      {/* ── Breadcrumb (visible) ──────────────────────────────────────────── */}
      <nav aria-label="פירורי לחם" className="text-sm text-muted">
        <Link href="/" className="interactive hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">הזמינו חבר</span>
      </nav>

      {/* ── Heading ───────────────────────────────────────────────────────── */}
      <header className="mt-4">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          שתפו את Switchy AI עם חברים
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          אם Switchy AI עזר לכם לבדוק כמה אתם יכולים לחסוך, יש סיכוי טוב שהוא יעזור גם
          לחברים שלכם. קבלו קוד הזמנה אישי ושתפו אותו — חינם, בלי התחייבות.
        </p>
      </header>

      {/* ── The referral card (mints a real code; share-the-tool framing) ──── */}
      <section aria-labelledby="referral-card-h" className="mt-8">
        <ReferralCard />
      </section>

      {/* ── How it works — three honest steps (no reward language). ───────── */}
      <section aria-labelledby="how-h" className="mt-12">
        <h2
          id="how-h"
          className="mb-4 font-display text-xl font-bold tracking-tight text-ink"
        >
          איך זה עובד
        </h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "קבלו קוד",
              d: "לחצו על הכפתור וקבלו קוד הזמנה אישי וקישור לשיתוף.",
            },
            {
              n: "2",
              t: "שתפו עם חבר",
              d: "שלחו את הקוד או הקישור למי שעשוי להרוויח מהשוואה.",
            },
            {
              n: "3",
              t: "הם בודקים וחוסכים",
              d: "החבר בודק את החשבון שלו בכלי החינמי — בדיוק כמוכם.",
            },
          ].map((s) => (
            <li key={s.n} className="card p-5">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 font-display text-sm font-bold text-accent-text"
              >
                {s.n}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold tracking-tight text-ink">
                {s.t}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Honesty: commission disclosure (§7b). ──────────────────────────── */}
      <div className="mt-10">
        <CommissionDisclosure variant="inline" />
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
            { href: "/wallet", label: "ארנק התקשורת", sub: "כמה אתם יכולים לחסוך" },
            { href: "/quiz", label: "התאמה אישית ב-5 שאלות", sub: "מסלולים אמיתיים + הסבר" },
            { href: "/compare", label: "השוואת כל המסלולים", sub: "לפי קטגוריה" },
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
                <span aria-hidden="true" className="text-muted">←</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted">עודכן לאחרונה: {REVIEWED_AT}</p>
      </nav>
    </main>
  );
}
