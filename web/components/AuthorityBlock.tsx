// ────────────────────────────────────────────────────────────────────────────
// <AuthorityBlock> — a high-authority, GEO/answer-engine-optimized block:
//   1. a single-sentence DIRECT ANSWER (what AI engines lift as the answer),
//   2. a native, semantic "Truth Table" <table> (factor → winner → reason), and
//   3. a visible "עודכן לאחרונה" verification timestamp (dd/mm/yyyy, formatted in
//      UTC so it's deterministic; date-only sources omit the meaningless time).
//
// Real <table>/<caption>/<th scope> markup so screen-readers and AI engines parse
// it cleanly. Server component (no state).
//
// HONESTY (E-E-A-T): every cell is supplied by the caller and MUST be a truthful,
// verifiable claim drawn from the catalogue (e.g. lowest real price). This
// component invents nothing — it only renders the answer, table, and timestamp it
// is told to, and shows the timestamp so the recency of the claim is transparent.
// ────────────────────────────────────────────────────────────────────────────

/** One row of the truth table: which entity wins on a given factor, and why. */
export interface AuthorityRow {
  /** The comparison factor, e.g. "המחיר הזול ביותר" / "ללא התחייבות". */
  factor: string;
  /** The winning entity for this factor, e.g. provider or plan name. */
  winner: string;
  /** A short, factual reason the winner wins on this factor. */
  reason: string;
}

export interface AuthorityBlockProps {
  /** The single-sentence direct answer (factual). Shown first, lifted by engines. */
  answer: string;
  /** Truth-table rows (factor / winner / reason). Renders nothing if empty. */
  rows: AuthorityRow[];
  /**
   * When the underlying facts were last verified. Accepts a Date or an ISO/parsable
   * string. A date-only string ("YYYY-MM-DD") renders as dd/mm/yyyy (no time); a
   * full timestamp renders as dd/mm/yyyy hh:mm (UTC). Also emitted as a
   * machine-readable <time dateTime>.
   */
  updatedAt?: Date | string;
  /** Alias of `updatedAt` (kept for call sites that pass `reviewedAt`). */
  reviewedAt?: Date | string;
  /** Visible heading. Defaults to a neutral Hebrew label. */
  heading?: string;
  /** Accessible caption for the truth table. */
  tableCaption?: string;
  /** DOM id (anchor-/deep-link-able). Defaults to "authority". */
  id?: string;
  /** Optional extra classes on the outer section. */
  className?: string;
}

/** Coerce a Date | string into a Date, or null if unparsable. */
function toDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when the source is a date-only string (e.g. "2026-06-23"), no time part. */
function isDateOnly(value: Date | string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * Format a Date for display, in UTC so the output is deterministic regardless of
 * the build/runtime timezone. Date-only sources render as dd/mm/yyyy (no time) —
 * a date-only value carries no meaningful clock time, so we don't fabricate one
 * (a date-only string parses to UTC-midnight, which would otherwise print a
 * spurious TZ-shifted hh:mm). Full timestamps render as dd/mm/yyyy hh:mm.
 */
function formatStamp(d: Date, dateOnly: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  if (dateOnly) return date;
  return `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function AuthorityBlock({
  answer,
  rows,
  updatedAt,
  reviewedAt,
  heading = "התשובה הקצרה",
  tableCaption = "טבלת אמת — מי מנצח בכל פרמטר ולמה",
  id = "authority",
  className,
}: AuthorityBlockProps) {
  const headingId = `${id}-heading`;
  const stamp = updatedAt ?? reviewedAt;
  const date = stamp != null ? toDate(stamp) : null;
  const dateOnly = stamp != null && isDateOnly(stamp);
  // Machine-readable value: a date-only source stays date-only (YYYY-MM-DD); a
  // full timestamp keeps the full ISO instant.
  const machineStamp = date
    ? dateOnly
      ? date.toISOString().slice(0, 10)
      : date.toISOString()
    : "";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-authority-block
      className={[
        "rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h2
        id={headingId}
        className="mb-2 flex items-center gap-2 font-display text-base font-semibold text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-4 w-1 rounded-full bg-accent"
        />
        {heading}
      </h2>

      {/* 1 — single-sentence direct answer (the part engines lift). */}
      <p
        data-direct-answer
        className="text-[15px] font-medium leading-relaxed text-foreground sm:text-base"
      >
        {answer}
      </p>

      {/* 2 — native truth table (factor / winner / reason). */}
      {rows.length > 0 && (
        <div
          className="mt-5 w-full overflow-x-auto rounded-xl border border-border"
          tabIndex={0}
          role="region"
          aria-label={tableCaption}
        >
          <table className="w-full min-w-[480px] border-collapse text-right">
            <caption className="px-4 pt-3 text-start text-sm font-semibold text-ink">
              {tableCaption}
            </caption>
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  פרמטר
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  המנצח
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  הסיבה
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.factor}-${i}`}
                  className="border-b border-border align-top last:border-b-0"
                >
                  <th
                    scope="row"
                    className="px-4 py-3 text-start font-medium text-foreground"
                  >
                    {row.factor}
                  </th>
                  <td className="px-4 py-3 text-start">
                    <span className="font-display font-semibold text-ink">
                      {row.winner}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-start text-foreground">
                    {row.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3 — verification timestamp (recency transparency for E-E-A-T). */}
      {date && (
        <p className="mt-4 text-xs text-muted">
          עודכן לאחרונה:{" "}
          <time dateTime={machineStamp} className="font-medium text-foreground">
            {formatStamp(date, dateOnly)}
          </time>
        </p>
      )}
    </section>
  );
}
