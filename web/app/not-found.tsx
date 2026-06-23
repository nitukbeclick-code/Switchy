// ────────────────────────────────────────────────────────────────────────────
// app/not-found.tsx — the app-wide 404 page.
//
// Renders for two cases (per Next 16 routing):
//   1. any URL that matches no route in the app, and
//   2. any explicit `notFound()` call in a route segment that has no closer
//      not-found.tsx (providers/[slug], compare/[service], compare/[service]/[city],
//      glossary/[term] all call notFound() — they bubble up to this file).
//
// Server Component (no 'use client'): a 404 needs no interactivity, so it stays
// RSC and ships zero JS. It renders BETWEEN the layout's <SiteHeader> and
// <SiteFooter> (the layout wraps {children}), so it only owns the <main> region.
//
// Honest copy: we don't claim the page "moved" or "was deleted" — we don't know
// why it's missing. We just say it isn't here and point to real, existing hubs
// (home, ספקים, השוואה, מילון, דופק השוק). No fabricated links/search box (there
// is no /search route on this site).
//
// a11y/RTL: focusable <h1> (tabIndex={-1}) so the page announces its title on
// navigation; Hebrew copy under the RTL <html dir="rtl"> from the root layout;
// dark-mode-aware via existing tokens (text-ink / text-muted / .card / bg-accent).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Metadata } from "next";

// Next injects `<meta name="robots" content="noindex" />` for 404 responses
// automatically, but we set an explicit, honest title for the tab/share preview.
export const metadata: Metadata = {
  title: "הדף לא נמצא (404)",
  description: "הדף שחיפשתם לא קיים באתר. כאן כמה נקודות התחלה טובות.",
  robots: { index: false, follow: true },
};

/** Real, existing hubs to recover to — no dead links, no invented routes. */
const RECOVERY_LINKS: { href: string; label: string; hint: string }[] = [
  { href: "/", label: "לדף הבית", hint: "השוואת מסלולי תקשורת מההתחלה" },
  { href: "/compare/cellular", label: "השוואת מסלולים", hint: "סלולר, אינטרנט, טלוויזיה ועוד" },
  { href: "/providers", label: "כל הספקים", hint: "פרטי הספקים והמסלולים שלהם" },
  { href: "/glossary", label: "מילון מונחים", hint: "5G, eSIM, ניוד ועוד בעברית" },
];

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6"
    >
      <p className="font-display text-6xl font-bold tracking-tight text-accent sm:text-7xl">
        404
      </p>

      <h1
        tabIndex={-1}
        className="mt-4 font-display text-2xl font-bold tracking-tight text-ink outline-none sm:text-3xl"
      >
        הדף לא נמצא
      </h1>

      <p className="mt-4 max-w-lg text-lg leading-relaxed text-foreground">
        לא הצלחנו למצוא את הדף שחיפשתם. ייתכן שהכתובת הוקלדה לא במדויק, או שהדף כבר
        לא קיים. הנה כמה מקומות טובים להמשיך מהם:
      </p>

      {/* Recovery hubs — every href is a real route on this site. */}
      <nav
        aria-label="קישורי המשך"
        className="mt-8 grid w-full gap-3 text-start sm:grid-cols-2"
      >
        {RECOVERY_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="card card-interactive interactive group flex flex-col gap-1 px-5 py-4"
          >
            <span className="font-display text-base font-semibold text-ink transition-colors group-hover:text-accent">
              {link.label}
            </span>
            <span className="text-sm text-muted">{link.hint}</span>
          </Link>
        ))}
      </nav>

      {/* Primary CTA back home — the single green ACTION on the page. */}
      <Link
        href="/"
        className="interactive mt-10 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-base font-semibold text-accent-contrast hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md hover:shadow-accent/25 active:translate-y-0 active:scale-[.98]"
      >
        חזרה לדף הבית
      </Link>
    </main>
  );
}
