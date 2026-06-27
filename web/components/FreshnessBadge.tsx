// ────────────────────────────────────────────────────────────────────────────
// <FreshnessBadge> — a tiny, HONEST "data as of" stamp for AEO/E-E-A-T:
//
//   • מחירים עודכנו 28.06.2026        (default — a real DD.MM.YYYY date)
//   • נכון ל-06/2026                  (label="month" — a real MM/YYYY stamp)
//
// It does NOT fetch or hardcode a date. The page computes the REAL freshness via
// lib/aeo → lastDataDate() (or the catalogue's updated_at) and passes it in as the
// `date` prop; this component is purely presentational — it formats + displays the
// date the caller already resolved, and emits a machine-readable <time dateTime>
// (ISO YYYY-MM-DD) so engines read the same stamp the human sees.
//
// Server component (no state, no effects). Renders nothing when the date is
// missing/unparsable — it never guesses or shows "today".
//
// Design: muted, small metadata with a tiny leading dot (--muted token). No
// animation, so it's reduced-motion safe by construction.
// ────────────────────────────────────────────────────────────────────────────

/** Hebrew month names (1–12 → index). Mirrors lib/aeo's HE_MONTHS for the stamp. */
const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

/** How the date is phrased. "day" → DD.MM.YYYY · "month" → MM/YYYY. */
export type FreshnessLabel = "day" | "month";

export interface FreshnessBadgeProps {
  /**
   * The REAL "data as of" date — a Date or ISO/parsable string (e.g. the value
   * from lib/aeo → lastDataDate(), which is "YYYY-MM-DD"). The component formats
   * this; it does not compute or default it.
   */
  date: string | Date;
  /**
   * Phrasing:
   *  • "day"   (default) → "מחירים עודכנו DD.MM.YYYY"
   *  • "month"           → "נכון ל-MM/YYYY"
   */
  label?: FreshnessLabel;
  /** Optional extra classes on the wrapper. */
  className?: string;
}

/** Coerce a Date | string into a Date, or null when unparsable. */
function toDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Zero-pad a number to two digits. */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function FreshnessBadge({
  date,
  label = "day",
  className,
}: FreshnessBadgeProps) {
  const d = toDate(date);
  // Honesty gate: with no real date there is nothing truthful to show.
  if (!d) return null;

  // UTC throughout so the output is deterministic across runtimes (matches the
  // ISO date lib/aeo produces).
  const day = pad(d.getUTCDate());
  const month = pad(d.getUTCMonth() + 1);
  const year = d.getUTCFullYear();

  // Machine-readable stamp: ISO date (YYYY-MM-DD) — what engines parse.
  const machineStamp = d.toISOString().slice(0, 10);

  const text =
    label === "month"
      ? `נכון ל-${month}/${year}`
      : `מחירים עודכנו ${day}.${month}.${year}`;

  // A full, human-readable accessible label (Hebrew month spelled out).
  const ariaLabel =
    label === "month"
      ? `נכון ל${HE_MONTHS[d.getUTCMonth()]} ${year}`
      : `מחירים עודכנו ב-${Number(day)} ב${HE_MONTHS[d.getUTCMonth()]} ${year}`;

  return (
    <span
      data-freshness
      aria-label={ariaLabel}
      className={[
        "inline-flex items-center gap-1.5 text-xs text-muted",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Tiny leading dot (decorative — the text carries the meaning). */}
      <span
        aria-hidden="true"
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70"
      />
      <time dateTime={machineStamp}>{text}</time>
    </span>
  );
}

export { FreshnessBadge };
