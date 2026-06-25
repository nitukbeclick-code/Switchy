// ────────────────────────────────────────────────────────────────────────────
// <FactCheckBadge> — an HONEST verification line for AEO/E-E-A-T:
//
//   ✓ נבדק ע״י מנוע-הנתונים של Switchy · עודכן: <dd/mm/yyyy>
//
// The "reviewer" string is EXACTLY "נבדק ע״י מנוע-הנתונים של Switchy" — the data
// engine, NOT a fabricated human reviewer. It tells engines (and people) that the
// figures on the page were checked against the real catalogue, and shows the real
// dateModified so the recency of the check is transparent.
//
// Server component (no state). Emits a machine-readable <time dateTime>.
//
// HONESTY: the only claim made is the literal data-engine review + the real date
// the caller passes. It asserts no human review, no rating, nothing else.
// ────────────────────────────────────────────────────────────────────────────

/** The single canonical reviewer string. Do NOT change to imply a human. */
export const FACT_CHECK_REVIEWER = "נבדק ע״י מנוע-הנתונים של Switchy";

export interface FactCheckBadgeProps {
  /**
   * When the facts were last verified — a Date or ISO/parsable string. A
   * date-only string ("YYYY-MM-DD") renders as dd/mm/yyyy; a full timestamp adds
   * hh:mm (UTC, deterministic).
   */
  dateModified?: Date | string;
  /** Render inline (a <span>) instead of the default block. Defaults to false. */
  inline?: boolean;
  /** Optional extra classes. */
  className?: string;
}

/** Coerce a Date | string into a Date, or null if unparsable. */
function toDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when the source is a date-only string (no time part). */
function isDateOnly(value: Date | string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/** Format a Date in UTC: dd/mm/yyyy, plus hh:mm when it carries a real time. */
function formatStamp(d: Date, dateOnly: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return dateOnly ? date : `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function FactCheckBadge({
  dateModified,
  inline = false,
  className,
}: FactCheckBadgeProps) {
  const date = dateModified != null ? toDate(dateModified) : null;
  const dateOnly = dateModified != null && isDateOnly(dateModified);
  const machineStamp = date
    ? dateOnly
      ? date.toISOString().slice(0, 10)
      : date.toISOString()
    : "";

  const Tag = inline ? "span" : "p";

  return (
    <Tag
      data-fact-check
      className={[
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent-text"
      >
        ✓
      </span>
      <span className="font-medium text-foreground">{FACT_CHECK_REVIEWER}</span>
      {date && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            עודכן:{" "}
            <time dateTime={machineStamp} className="font-medium text-foreground">
              {formatStamp(date, dateOnly)}
            </time>
          </span>
        </>
      )}
    </Tag>
  );
}
