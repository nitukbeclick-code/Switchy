import Link from "next/link";
import type { Metadata } from "next";
import Icon from "@/components/Icon";
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
        <Link href="/" className="interactive underline underline-offset-2 hover:text-accent">
          בית
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-foreground">הזמינו חבר</span>
      </nav>

      {/* ── Hero — FLAT-INK HERO PANEL (premium-2026) ──────────────────────────
          A solid deep-ink panel (#111827 in BOTH themes) with the white headline
          set directly on it — NO photo/video behind — and green applied ONLY to
          the VALUE word ("חינם"). TRUTH-ONLY: this is a share-the-tool page with
          no catalogue price to quote, so the hero promises a CHECK ("בדקו כמה
          תוכלו לחסוך") and never fabricates a figure or a reward. Exactly ONE
          primary CTA (jump to the card) + ONE quiet secondary text link. The
          .sw-reveal children stagger 60→150ms via inline animationDelay. */}
      <header className="mt-5">
        <section className="relative isolate overflow-hidden rounded-3xl border border-border/60 bg-[#111827] px-5 py-12 text-center sm:px-10 sm:py-16">
          <div className="mx-auto max-w-2xl">
            <h1 className="sw-reveal font-display text-4xl font-bold tracking-tight text-white sm:text-6xl">
              שתפו את Switchy AI עם חברים.{" "}
              <span className="text-[#4ade80]">חינם, בלי התחייבות.</span>
            </h1>
            <p
              className="sw-reveal mx-auto mt-5 max-w-2xl text-lg font-medium leading-relaxed text-white/85 sm:text-xl"
              style={{ animationDelay: "60ms" }}
            >
              אם Switchy AI עזר לכם לבדוק כמה אתם יכולים לחסוך, יש סיכוי טוב שהוא יעזור
              גם לחברים שלכם. קבלו קוד הזמנה אישי ושתפו אותו.
            </p>
            <div
              className="sw-reveal mt-8 flex flex-col items-center justify-center gap-4"
              style={{ animationDelay: "120ms" }}
            >
              {/* PRIMARY — solid green fill + accent glow + press feedback. Jumps
                  to the card, which mints the real code on demand. */}
              <Link
                href="#referral-card"
                className="press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-transform active:scale-[0.98]"
              >
                קבלו קוד הזמנה אישי
                <Icon name="chevron" size={18} aria-hidden="true" />
              </Link>
              {/* SECONDARY — quiet white text link, no fill, no glow. */}
              <Link
                href="/compare"
                className="interactive text-sm text-white/85 underline-offset-4 hover:underline"
              >
                או השוו מסלולים בעצמכם
              </Link>
            </div>
            {/* Quiet qualitative value line — muted, small green tick, no fabricated
                figure. "חינם" is a true value claim, not a promised amount. */}
            <p
              className="sw-reveal mt-8 inline-flex items-center gap-1.5 text-sm text-white/75"
              style={{ animationDelay: "150ms" }}
            >
              <Icon name="check" size={16} className="shrink-0 text-accent" />
              כלי חינמי להשוואת מסלולי תקשורת — שיתוף הכלי, ללא הבטחת תגמול כספי
            </p>
          </div>
        </section>
      </header>

      {/* ── The referral card (mints a real code; share-the-tool framing) ──── */}
      <section
        id="referral-card"
        aria-labelledby="referral-card-h"
        className="mt-8 scroll-mt-6"
      >
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
              icon: "spark" as const,
              t: "קבלו קוד",
              d: "לחצו על הכפתור וקבלו קוד הזמנה אישי וקישור לשיתוף.",
            },
            {
              n: "2",
              icon: "arrow" as const,
              t: "שתפו עם חבר",
              d: "שלחו את הקוד או הקישור למי שעשוי להרוויח מהשוואה.",
            },
            {
              n: "3",
              icon: "check" as const,
              t: "הם בודקים וחוסכים",
              d: "החבר בודק את החשבון שלו בכלי החינמי — בדיוק כמוכם.",
            },
          ].map((s) => (
            <li key={s.n} className="card p-5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-text"
                >
                  <Icon name={s.icon} size={18} aria-hidden />
                </span>
                <span
                  aria-hidden="true"
                  className="font-display text-xs font-bold uppercase tracking-wider text-muted"
                >
                  שלב {s.n}
                </span>
              </div>
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
