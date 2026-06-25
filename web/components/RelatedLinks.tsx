// ────────────────────────────────────────────────────────────────────────────
// <RelatedLinks> — a GROUPED contextual internal-link block for deeper crawl
// topology + topical authority. Where <RelatedAuthorityPages> renders one flat
// list, this renders SECTIONED groups ("ספקים דומים", "ערים קרובות", "השוואות
// רלוונטיות") so the cross-links read as a labelled topical web rather than an
// undifferentiated pile. Server component (no state).
//
// Uses the design-system utilities only (.card / .card-interactive / .interactive)
// and next/link for internal hrefs. Renders nothing when handed no non-empty
// group — so a page never shows an empty "related" shell.
//
// HONESTY (E-E-A-T): every link is a real on-site URL derived from the catalogue
// (lib/data) and every count/figure in a hint is catalogue-derived. There is no
// cloaking, no misleading anchor text, and no fabricated data.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

/**
 * A single contextual cross-link. `label` is the visible (truthful) anchor text;
 * `hint` is optional catalogue-derived context (e.g. "3 מסלולים, החל מ-₪29").
 */
export interface RelatedLinkItem {
  /** Destination href — internal "/..." path (real on-site URL). */
  href: string;
  /** Visible, descriptive anchor text (truthful). */
  label: string;
  /** Optional sub-label / context shown under the label (catalogue-derived). */
  hint?: string;
}

/** A titled group of related links (e.g. "ספקים דומים"). */
export interface RelatedLinkGroup {
  /** Group heading (e.g. "ספקים דומים", "ערים קרובות"). */
  title: string;
  /** The group's links. A group with no links is dropped (never rendered empty). */
  links: RelatedLinkItem[];
}

export interface RelatedLinksProps {
  /** The groups to render. Empty groups are skipped; all-empty → renders nothing. */
  groups: RelatedLinkGroup[];
  /** Visible block heading. Defaults to "המשיכו לחקור". */
  heading?: string;
  /** Accessible label for the nav landmark. Defaults to the heading. */
  ariaLabel?: string;
  /** DOM id (anchor-/deep-link-able). Defaults to "related-links". */
  id?: string;
  /** Optional extra classes on the outer section. */
  className?: string;
}

/**
 * Grouped contextual internal-link block. Drops empty groups, and renders
 * nothing at all when no group has links (so pages can pass derived groups
 * unconditionally without guarding for the empty case).
 */
export default function RelatedLinks({
  groups,
  heading = "המשיכו לחקור",
  ariaLabel,
  id = "related-links",
  className,
}: RelatedLinksProps) {
  const shown = (groups ?? []).filter((g) => g.links && g.links.length > 0);
  if (shown.length === 0) return null;

  const headingId = `${id}-heading`;

  return (
    <nav
      id={id}
      aria-labelledby={headingId}
      aria-label={ariaLabel ?? heading}
      data-related-links
      className={["card p-6 sm:p-7", className ?? ""].join(" ").trim()}
    >
      <h2
        id={headingId}
        className="mb-5 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-1.5 rounded-full bg-accent"
        />
        {heading}
      </h2>

      <div className="space-y-6">
        {shown.map((group, gi) => {
          const groupHeadingId = `${id}-g${gi}`;
          return (
            <section key={`${group.title}-${gi}`} aria-labelledby={groupHeadingId}>
              <h3
                id={groupHeadingId}
                className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {group.title}
              </h3>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {group.links.map((link, li) => (
                  <li key={`${link.href}-${li}`}>
                    <Link
                      href={link.href}
                      className={
                        "group card card-interactive interactive press block px-4 py-3.5 " +
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      }
                    >
                      <span className="flex items-center gap-1.5 font-medium text-foreground transition-colors group-hover:text-accent">
                        {link.label}
                        <span
                          aria-hidden="true"
                          className="text-accent transition-transform duration-200 ease-[var(--ease-out)] motion-safe:group-hover:-translate-x-0.5"
                        >
                          ←
                        </span>
                      </span>
                      {link.hint ? (
                        <span className="mt-0.5 block text-xs text-muted">
                          {link.hint}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </nav>
  );
}
