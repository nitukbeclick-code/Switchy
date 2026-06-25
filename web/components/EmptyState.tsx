// ────────────────────────────────────────────────────────────────────────────
// <EmptyState> — a centered, branded "nothing here yet" pattern, mirroring the
// Flutter app's `EmptyState` widget (lib/widgets/empty_state.dart):
//   • a soft circular icon/glyph badge — a green brandAccent wash with a faint
//     green ring (ACTION energy, never amber/value, never a provider color),
//   • a display-type headline,
//   • a muted description,
//   • an optional CTA button (green ACTION fill) linking somewhere useful.
//
// Reusable across the site (empty results, "no data yet", pre-action prompts).
// Server component — no client state. RTL + dark inherit from the brand tokens;
// the badge glyph is decorative and hidden from assistive tech (the headline +
// description carry the meaning, per the a11y convention).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import SwitchyMascot from "./SwitchyMascot";

export interface EmptyStateCta {
  /** Visible button label. */
  label: string;
  /** Destination — internal route (e.g. "/compare") or absolute URL. */
  href: string;
}

export interface EmptyStateProps {
  /**
   * The badge glyph. A short emoji/string (e.g. "📷", "🔍") OR any React node
   * (e.g. an inline SVG icon). Rendered decoratively inside the circular badge.
   * Optional when `mascot` is set.
   */
  icon?: React.ReactNode;
  /** Show the Switchy brand mascot in the badge instead of an icon/emoji. */
  mascot?: boolean;
  /** Display-type headline below the badge. */
  title: string;
  /** Muted description below the headline. */
  description: string;
  /** Optional call-to-action button. */
  cta?: EmptyStateCta;
  /** Optional extra classes on the wrapper. */
  className?: string;
}

/** Is this an internal (same-origin) route we should render with next/link? */
function isInternal(href: string): boolean {
  return href.startsWith("/") && !href.startsWith("//");
}

export default function EmptyState({
  icon,
  mascot,
  title,
  description,
  cta,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={[
        "flex flex-col items-center px-6 py-12 text-center sm:py-14",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Soft circular badge — green brandAccent wash + faint green ring, soft
          shadow. Decorative: the headline/description carry the meaning, so the
          glyph is hidden from assistive tech. */}
      <span
        aria-hidden="true"
        className="elevate-soft flex h-24 w-24 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-4xl text-accent-text"
      >
        {mascot ? <SwitchyMascot size={56} /> : icon}
      </span>

      <h2 className="mt-6 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted sm:text-base">
        {description}
      </p>

      {cta &&
        (isInternal(cta.href) ? (
          <Link
            href={cta.href}
            className="interactive press mt-8 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {cta.label}
          </Link>
        ) : (
          <a
            href={cta.href}
            className="interactive press mt-8 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {cta.label}
          </a>
        ))}
    </div>
  );
}
