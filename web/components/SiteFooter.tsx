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
    // Compare-category hubs → the dynamic /compare/[service] routes (real,
    // indexable service slugs: cellular, internet, tv, triple, abroad).
    title: "השוואת מסלולים",
    links: [
      { href: "/plans", label: "כל המסלולים" },
      { href: "/compare/cellular", label: "סלולר" },
      { href: "/compare/internet", label: "אינטרנט" },
      { href: "/compare/tv", label: "טלוויזיה" },
      { href: "/compare/triple", label: "חבילה משולבת" },
      { href: "/compare/abroad", label: "חבילות חו״ל" },
    ],
  },
  {
    title: "מסלולים פופולריים",
    links: [
      { href: "/cellular-5g", label: "מסלולי 5G" },
      { href: "/cellular-budget", label: "סלולר זול" },
      { href: "/cellular-esim", label: "eSIM" },
      { href: "/internet-fiber-only", label: "סיב אופטי" },
      { href: "/kosher-plans", label: "מסלולים כשרים" },
      { href: "/plans-no-commitment", label: "ללא התחייבות" },
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
      { href: "/about", label: "אודות" },
      { href: "/how-it-works", label: "איך זה עובד" },
      { href: "/faq", label: "שאלות נפוצות" },
      { href: "/community", label: "קהילה" },
      { href: "/bills", label: "צילום חשבון" },
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
        // Distinct footer ZONE: a firmer full-opacity top border separates it
        // from the content above, and a subtle tinted background (surface mixed
        // a touch toward ink) sets it apart from the plain surface without
        // breaking the white-glass brand. Token-relative, so it's dark-safe.
        "mt-auto border-t border-border bg-[color-mix(in_srgb,var(--surface)_94%,var(--ink))]",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 md:py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                      // Faint hover background turns each link into a discrete,
                      // tappable target. The negative inline-start margin offsets
                      // the inline padding so the resting text stays flush with
                      // the column edge (RTL-correct via logical -ms/ps).
                      className="-ms-2 inline-block rounded-md px-2 py-1 text-sm text-foreground transition-colors duration-200 ease-[var(--ease-out)] hover:bg-accent/10 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
              className="inline-block rounded py-1 font-medium text-accent-text transition-colors duration-200 ease-[var(--ease-out)] hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              פרטיות
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/terms"
              className="inline-block rounded py-1 font-medium text-accent-text transition-colors duration-200 ease-[var(--ease-out)] hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              תנאי שימוש
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/accessibility"
              className="inline-block rounded py-1 font-medium text-accent-text transition-colors duration-200 ease-[var(--ease-out)] hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              נגישות
            </Link>
            <span aria-hidden="true">·</span>
            <Link
              href="/transparency"
              className="inline-block rounded py-1 font-medium text-accent-text transition-colors duration-200 ease-[var(--ease-out)] hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              שקיפות
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
