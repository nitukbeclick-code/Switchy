// ────────────────────────────────────────────────────────────────────────────
// <SiteHeader> — the global, sticky site masthead, intended to render on EVERY
// route (place it in app/layout.tsx, before {children}). Provides:
//   • brand wordmark ("Switchy AI") linking home,
//   • primary internal nav (השוואה · ספקים · דופק השוק · מעבר ספק),
//   • one green ACTION CTA (שיחת ייעוץ בזום → /book, the Zoom consultation
//     scheduler; the homepage LeadForm (#lead) is its own section lower down).
//
// Server component (no state). Uses next/link for internal nav.
//
// Design: bank-grade solid masthead — an opaque theme surface (white in light,
// dark ink in dark) with backdrop-blur and a 1px bottom hairline, so content
// never scrolls through the controls. Green is reserved for the single CTA
// (ACTION), per the accent system. Brand lockup = spark + "Switchy AI" as one
// LTR-isolated unit.
//
// a11y: a real <header><nav aria-label> landmark. The layout's skip-link target
// (#main) stays valid — this header sits above it. On small screens the primary
// links collapse into a native <details> disclosure ("menu" button → panel), so
// the full nav is reachable on a phone without any client JS — the masthead stays
// a Server Component, works without hydration, and is keyboard + screen-reader
// operable out of the box (summary is a real button; Esc/Enter/Space all work).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import TrackedCtaLink from "./TrackedCtaLink";
import ThemeToggle from "./ThemeToggle";
import Icon from "./Icon";

/** A primary nav link. */
interface NavLink {
  href: string;
  label: string;
}

/** Default primary nav — the highest-intent internal hubs (השוואה · ספקים ·
 *  דופק השוק · מעבר ספק), matching the masthead contract above. Real routes only:
 *  /compare/[service] (dynamic), /providers, /market-pulse, /switch. */
const NAV_LINKS: NavLink[] = [
  { href: "/compare/cellular", label: "השוואה" },
  { href: "/providers", label: "ספקים" },
  { href: "/market-pulse", label: "דופק השוק" },
  { href: "/switch", label: "מעבר ספק" },
];

/** Category landings — surfaced behind a "categories" affordance on desktop and
 *  as a labelled group inside the mobile menu. Real, indexable routes only. */
const CATEGORY_LINKS: NavLink[] = [
  { href: "/cellular", label: "סלולר" },
  { href: "/internet", label: "אינטרנט" },
  { href: "/tv", label: "טלוויזיה" },
  { href: "/triple", label: "חבילה משולבת" },
  { href: "/abroad", label: "חבילות חו״ל" },
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
        // Solid masthead (bank-grade): an OPAQUE theme surface (white / dark ink)
        // with backdrop-blur and a 1px bottom hairline, so page content and the
        // provider-logo strip can never read through the controls. z-50 keeps it
        // above every in-page layer (FAB z-30/40, sticky bars z-40).
        "sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/90",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Brand wordmark → home (RTL start = right edge). */}
        <Link
          href="/"
          className="group flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink transition-colors hover:text-accent"
        >
          {/* Single brand lockup: the spark mark + "Switchy AI" as ONE LTR unit
              (dir isolate) so RTL bidi can never reorder it into "AI Switchy". */}
          <Icon
            name="spark"
            size={18}
            className="shrink-0 text-accent"
          />
          <span dir="ltr" className="whitespace-nowrap">
            Switchy AI
          </span>
        </Link>

        {/* Primary nav — hidden on small screens (the mobile <details> menu below
            carries the full set). The categories affordance is a same-language
            <details> dropdown so the 5 category landings stay one tap away. */}
        <nav
          aria-label="ניווט ראשי"
          className="hidden items-center gap-1 md:flex"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-[color,background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.06] hover:text-accent active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {link.label}
            </Link>
          ))}

          {/* Categories dropdown — native <details> (no client JS). */}
          <details className="group relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-[color,background-color] duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.06] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              קטגוריות
              <Icon
                name="chevron"
                size={16}
                className="rotate-90 transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-open:-rotate-90"
              />
            </summary>
            <div className="absolute end-0 top-full z-50 mt-2 min-w-44 rounded-xl border border-border/60 bg-surface/95 p-1.5 shadow-float backdrop-blur">
              {CATEGORY_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.06] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </details>
        </nav>

        {/* Light/dark toggle — pushed to the far end (RTL: left edge), with the
            CTA. Stays visible on every breakpoint (unlike the primary nav). */}
        <ThemeToggle className="ms-auto" />

        {/* CTA — the single green ACTION in the masthead → the Zoom consultation
            scheduler (/book), labelled so it's clearly a Zoom video meeting (not
            just a callback form). The homepage LeadForm (#lead) remains its own
            section lower on the page. */}
        <TrackedCtaLink
          href="/book"
          location="header"
          label="consult"
          className="rounded-xl border border-accent/40 bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-[color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-out)] hover:bg-accent-hover hover:shadow-float hover:shadow-accent/30 active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          שיחת ייעוץ בזום
        </TrackedCtaLink>

        {/* Mobile menu — a native <details> disclosure, shown only < md (the
            desktop <nav> above takes over at md). No client JS: the <summary> is
            a real button (keyboard + SR operable), and the panel is plain markup.
            Only opacity/transform animate, so it's reduced-motion safe. */}
        <details
          data-mobile-menu
          className="group relative md:hidden"
        >
          <summary
            aria-label="תפריט ניווט"
            className="flex cursor-pointer list-none items-center justify-center rounded-xl border border-border/60 p-2 text-ink transition-colors duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.06] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden"
          >
            <Icon
              name="chevron"
              size={20}
              className="rotate-90 transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-open:-rotate-90"
            />
          </summary>

          {/* Dropdown panel — anchored to the masthead's inline-start edge. */}
          <nav
            aria-label="ניווט נייד"
            className="absolute end-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border/60 bg-surface/95 p-2 shadow-float backdrop-blur"
          >
            <ul className="space-y-0.5">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.06] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* Category landings — labelled group, divided from the main links. */}
            <p className="mt-2 border-t border-border/60 px-3 pb-1 pt-3 text-xs font-semibold text-muted">
              קטגוריות
            </p>
            <ul className="space-y-0.5">
              {CATEGORY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.06] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
