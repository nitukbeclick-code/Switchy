// ────────────────────────────────────────────────────────────────────────────
// <SiteHeader> — the global, sticky site masthead, intended to render on EVERY
// route (place it in app/layout.tsx, before {children}). Provides:
//   • brand wordmark ("חוסך / Switchy") linking home,
//   • primary internal nav (השוואה · ספקים · דופק השוק · מעבר ספק),
//   • one green ACTION CTA (שיחת ייעוץ חינם → /#lead).
//
// Server component (no state). Uses next/link for internal nav.
//
// Design: the glass language already used across cards — a translucent, blurred
// surface with a hairline bottom border (`bg-surface/80 backdrop-blur`). Green is
// reserved for the single CTA (ACTION), per the two-accent system.
//
// a11y: a real <header><nav aria-label> landmark. The layout's skip-link target
// (#main) stays valid — this header sits above it. Nav links collapse on small
// screens (the primary links hide; the brand + CTA stay), so the masthead never
// wraps awkwardly on a phone; the full nav still lives in the footer.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

/** A primary nav link. */
interface NavLink {
  href: string;
  label: string;
}

/** Default primary nav — the highest-intent internal hubs. */
const NAV_LINKS: NavLink[] = [
  { href: "/compare/cellular", label: "השוואה" },
  { href: "/providers", label: "ספקים" },
  { href: "/market-pulse", label: "דופק השוק" },
  { href: "/switch", label: "מעבר ספק" },
];

export interface SiteHeaderProps {
  /** Optional extra classes on the <header>. */
  className?: string;
}

export default function SiteHeader({ className }: SiteHeaderProps) {
  return (
    <header
      data-site-header
      className={[
        "sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Brand wordmark → home (RTL start = right edge). */}
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-lg font-bold text-ink transition-colors hover:text-accent"
        >
          <span
            aria-hidden="true"
            className="inline-block h-5 w-1.5 rounded-full bg-accent"
          />
          חוסך
          <span className="text-sm font-semibold text-muted">/ Switchy</span>
        </Link>

        {/* Primary nav — hidden on small screens (footer carries the full set). */}
        <nav
          aria-label="ניווט ראשי"
          className="hidden items-center gap-1 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/[0.06] hover:text-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* CTA — the single green ACTION in the masthead. Pushed to the far end. */}
        <Link
          href="/#lead"
          className="ms-auto rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-all hover:bg-accent-hover hover:shadow-md hover:shadow-accent/20"
        >
          שיחת ייעוץ חינם
        </Link>
      </div>
    </header>
  );
}
