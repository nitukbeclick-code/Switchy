// ────────────────────────────────────────────────────────────────────────────
// <SkeletonCard> — a loading placeholder that mirrors the repo's `.card` shape
// (soft border + soft shadow + lg radius) with a set of pulsing grey bars, so a
// pending result reads as "content is coming" rather than a blank gap or ad-hoc
// grey text.
//
// The shimmer is a single `animate-pulse` on the bars; the bar fills use the
// `--border` token (a neutral hairline grey that re-skins for dark mode), so the
// skeleton stays legible in both themes. Reduced-motion-safe: `motion-reduce:
// animate-none` stills the pulse (the layout still communicates "loading"). RTL
// is inherited (logical widths only, no physical-side bias). The whole block is
// decorative + announced via the host's status region, so it is hidden from
// assistive tech here (aria-hidden) to avoid a meaningless node tree.
// ────────────────────────────────────────────────────────────────────────────

export interface SkeletonCardProps {
  /** Number of body lines (pulsing bars) under the title bar. Defaults to 3. */
  lines?: number;
  /** Optional extra classes on the card wrapper. */
  className?: string;
}

/** A single grey bar — neutral `--border` fill, theme-aware, rounded. */
function Bar({ className }: { className?: string }) {
  return (
    <span
      className={["block h-3 rounded-md bg-border", className ?? ""]
        .join(" ")
        .trim()}
    />
  );
}

export default function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  // Vary the body-line widths so the placeholder reads as text, not a block.
  const widths = ["w-11/12", "w-full", "w-9/12", "w-10/12", "w-8/12"];

  return (
    <div
      aria-hidden="true"
      className={["card p-6 sm:p-7", className ?? ""].join(" ").trim()}
    >
      <div className="animate-pulse motion-reduce:animate-none">
        {/* Title bar — taller + ~half width. */}
        <Bar className="h-5 w-1/2" />

        {/* Body lines — varied widths for a natural text rhythm. */}
        <div className="mt-5 space-y-3">
          {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
            <Bar key={i} className={widths[i % widths.length]} />
          ))}
        </div>
      </div>
    </div>
  );
}
