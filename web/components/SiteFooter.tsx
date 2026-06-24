// ────────────────────────────────────────────────────────────────────────────
// <SiteFooter> — the global site footer, intended to render on EVERY route (place
// it in app/layout.tsx). Provides:
//   • brand identity ("Switchy AI" + tagline "סוכן השוואה חכם"),
//   • a real internal-nav grid (no dead-ends → topical authority + crawl depth),
//   • prominent links to /transparency and /glossary (authority hubs),
//   • a short, TRUTHFUL disclosure line about the service.
//
// Server component (no state). Uses next/link for internal nav.
//
// HONESTY (E-E-A-T): the footer states plainly that comparison is free and that
// contact happens only with consent, and links to the /transparency page where
// the methodology + any editorial labels are explained. No unverifiable claims.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

/** A footer nav link. */
interface FooterLink {
  href: string;
  label: string;
}

/** A labeled column of footer links. */
interface FooterColumn {
  title: string;
  links: FooterLink[];
}

export interface SiteFooterProps {
  /**
   * Optional override of the link columns. Defaults to a sensible site-wide set
   * (categories, authority hubs, company). Pass your own to customize per deploy.
   */
  columns?: FooterColumn[];
  /** Optional extra classes on the <footer>. */
  className?: string;
}

/** Default footer columns — real internal routes, plus the authority hubs. */
const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    title: "השוואת מסלולים",
    links: [
      { href: "/compare/cellular", label: "סלולר" },
      { href: "/compare/internet", label: "אינטרנט" },
      { href: "/compare/tv", label: "טלוויזיה" },
      { href: "/compare/triple", label: "חבילה משולבת" },
      { href: "/compare/abroad", label: "חבילות חו״ל" },
    ],
  },
  {
    title: "ידע ושקיפות",
    links: [
      { href: "/guides", label: "מדריכים" },
      { href: "/vs", label: "השוואות ראש בראש" },
      { href: "/glossary", label: "מילון מונחים" },
      { href: "/transparency", label: "שקיפות ומתודולוגיה" },
      { href: "/providers", label: "ספקים" },
    ],
  },
  {
    title: "השירות",
    links: [
      { href: "/", label: "דף הבית" },
      { href: "/bills", label: "צילום חשבון" },
      { href: "/transparency", label: "איך אנחנו ממליצים" },
    ],
  },
  {
    title: "מידע משפטי ונגישות",
    links: [
      { href: "/privacy", label: "מדיניות פרטיות" },
      { href: "/terms", label: "תנאי שימוש" },
      { href: "/rights", label: "מימוש זכויות" },
      { href: "/accessibility", label: "הצהרת נגישות" },
    ],
  },
];

export default function SiteFooter({ columns, className }: SiteFooterProps) {
  const cols = columns ?? DEFAULT_COLUMNS;
  const year = new Date().getFullYear();

  return (
    <footer
      data-site-footer
      className={[
        // Subtle top divider (border/60, not harsh) + generous whitespace.
        "mt-auto border-t border-border/60 bg-surface",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand identity. */}
          <div className="lg:col-span-1">
            <p className="font-display text-lg font-bold tracking-tight text-ink">
              Switchy AI
            </p>
            <p className="mt-1 text-sm text-muted">סוכן השוואה חכם</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-foreground">
              השוואה חינמית של מסלולי תקשורת בישראל. יצירת קשר מתבצעת רק לאחר
              אישורכם.
            </p>
          </div>

          {/* Link columns. */}
          {cols.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="font-display text-sm font-semibold tracking-tight text-ink">
                {col.title}
              </h2>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={`${col.title}-${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="inline-block text-sm text-foreground transition-colors duration-200 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom row: copyright + legal/accessibility links (always present). */}
        <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} Switchy AI. כל הזכויות שמורות.</p>
          <nav
            aria-label="קישורים משפטיים ונגישות"
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <Link
              href="/privacy"
              className="font-medium text-accent-text transition-colors duration-200 hover:text-accent-hover"
            >
              פרטיות
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/terms"
              className="font-medium text-accent-text transition-colors duration-200 hover:text-accent-hover"
            >
              תנאי שימוש
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/accessibility"
              className="font-medium text-accent-text transition-colors duration-200 hover:text-accent-hover"
            >
              נגישות
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/transparency"
              className="font-medium text-accent-text transition-colors duration-200 hover:text-accent-hover"
            >
              שקיפות
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
