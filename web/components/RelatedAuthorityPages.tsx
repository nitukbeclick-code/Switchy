// ────────────────────────────────────────────────────────────────────────────
// <RelatedAuthorityPages> — an "עמודים קשורים" (related pages) internal-link block
// for semantic interlinking. Cross-links each page to related compare/provider/
// glossary pages so the knowledge graph has no dead-ends (better crawl depth,
// topical authority, and LLM topology). Server component (no state).
//
// Uses next/link for client-side nav on internal hrefs and a plain <a> for
// external ones (rel="noopener"). Renders nothing when given no links.
//
// HONESTY: links are real internal/known URLs supplied by the caller (derived
// from the catalogue) — no cloaking, no misleading anchor text.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";

/**
 * A single related-page link. `external` opts into a plain anchor + noopener.
 * Anchor text accepts either `label` or `title`; sub-text accepts either `hint`
 * or `description` (whichever the caller has).
 */
export interface RelatedLink {
  /** Destination href (internal "/..." or absolute "https://..."). */
  href: string;
  /** Visible, descriptive anchor text (truthful). Alias: `title`. */
  label?: string;
  /** Alias of `label`. */
  title?: string;
  /** Optional sub-label / context shown under the label. Alias: `description`. */
  hint?: string;
  /** Alias of `hint`. */
  description?: string;
  /** Treat as external (renders <a target/rel>) instead of next/link. */
  external?: boolean;
}

export interface RelatedAuthorityPagesProps {
  /** The related links to render. Renders nothing when empty. */
  links: RelatedLink[];
  /** Visible heading. Defaults to "עמודים קשורים". */
  heading?: string;
  /** Accessible label for the nav landmark. Defaults to the heading. */
  ariaLabel?: string;
  /** DOM id (anchor-/deep-link-able). Defaults to "related". */
  id?: string;
  /** Optional extra classes on the outer section. */
  className?: string;
}

export default function RelatedAuthorityPages({
  links,
  heading = "עמודים קשורים",
  ariaLabel,
  id = "related",
  className,
}: RelatedAuthorityPagesProps) {
  if (!links || links.length === 0) return null;

  const headingId = `${id}-heading`;

  return (
    <nav
      id={id}
      aria-labelledby={headingId}
      aria-label={ariaLabel ?? heading}
      data-related-pages
      className={[
        "rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h2
        id={headingId}
        className="mb-4 flex items-center gap-2 font-display text-base font-semibold text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-4 w-1 rounded-full bg-accent"
        />
        {heading}
      </h2>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {links.map((link, i) => {
          const label = link.label ?? link.title ?? link.href;
          const hint = link.hint ?? link.description;
          const inner = (
            <>
              <span className="flex items-center gap-1.5 font-medium text-foreground group-hover:text-accent">
                {label}
                <span aria-hidden="true" className="text-accent">
                  ←
                </span>
              </span>
              {hint ? (
                <span className="mt-0.5 block text-xs text-muted">{hint}</span>
              ) : null}
            </>
          );

          const itemClass =
            "group block rounded-xl border border-border bg-background px-4 py-3 " +
            "transition-colors hover:border-accent/40 hover:bg-accent/[0.04] " +
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

          return (
            <li key={`${link.href}-${i}`}>
              {link.external ? (
                <a
                  href={link.href}
                  className={itemClass}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {inner}
                </a>
              ) : (
                <Link href={link.href} className={itemClass}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
