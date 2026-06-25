// ────────────────────────────────────────────────────────────────────────────
// <AeoAnswerBlock> — the ZERO-CLICK direct answer that sits directly below the
// page H1. It is the single block AI answer engines (Google AI Overviews, SGE,
// LLMs) lift verbatim, so it is in the INITIAL SSR/ISR HTML (server component, no
// client JS) and marked up semantically:
//
//   • the answer paragraph carries [data-direct-answer] + a stable id
//     ("aeo-answer") so a speakable/voice schema can target it;
//   • a visible "עודכן לאחרונה" dateModified;
//   • the honest <FactCheckBadge> line ("נבדק ע״י מנוע-הנתונים של Switchy").
//
// HONESTY: the `answer` text is produced by lib/aeo `directAnswerFor(...)` from
// the SAME real plan list the page renders + schemas, so it can never disagree.
// This component renders only what it is told; it fabricates nothing. When
// `answer` is empty (no priced plan) it renders nothing.
// ────────────────────────────────────────────────────────────────────────────

import FactCheckBadge from "./FactCheckBadge";

export interface AeoAnswerBlockProps {
  /** The 2–3 sentence factual answer (from `directAnswerFor`). Empty → no render. */
  answer: string;
  /** Real "data as of" / last-modified date (Date or ISO string). */
  dateModified?: Date | string;
  /**
   * Optional eyebrow label above the answer (e.g. "התשובה הקצרה"). Defaults to a
   * neutral Hebrew label.
   */
  heading?: string;
  /** DOM id — defaults to "aeo-answer" (target for speakable schema). */
  id?: string;
  /** When true the bundled fallback is in use → show an honest freshness note. */
  stale?: boolean;
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

/** Format a Date in UTC: dd/mm/yyyy (+ hh:mm when it carries a real time). */
function formatStamp(d: Date, dateOnly: boolean): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return dateOnly ? date : `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function AeoAnswerBlock({
  answer,
  dateModified,
  heading = "התשובה הקצרה",
  id = "aeo-answer",
  stale = false,
  className,
}: AeoAnswerBlockProps) {
  // No priced plan → no honest answer to give; render nothing.
  if (!answer || !answer.trim()) return null;

  const headingId = `${id}-heading`;
  const date = dateModified != null ? toDate(dateModified) : null;
  const dateOnly = dateModified != null && isDateOnly(dateModified);
  const machineStamp = date
    ? dateOnly
      ? date.toISOString().slice(0, 10)
      : date.toISOString()
    : "";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-aeo-answer-block
      className={["bento glow-accent p-6 sm:p-7", className ?? ""].join(" ").trim()}
    >
      <h2
        id={headingId}
        className="mb-2.5 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-1.5 rounded-full bg-accent"
        />
        {heading}
      </h2>

      {/* The block engines lift. Stable id-able node for speakable schema. */}
      <p
        data-direct-answer
        className="text-[15px] font-medium leading-relaxed text-foreground sm:text-base"
      >
        {answer}
      </p>

      {/* Honest freshness note when serving the bundled fallback. */}
      {stale && (
        <p className="mt-3 text-xs text-muted">
          ייתכן שהמחירים מעט מאחור — מוצג עותק שמור של הקטלוג.
        </p>
      )}

      {/* Verification line + visible dateModified. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <FactCheckBadge dateModified={dateModified} inline />
        {date && (
          <p className="text-xs text-muted">
            עודכן לאחרונה:{" "}
            <time dateTime={machineStamp} className="font-medium text-foreground">
              {formatStamp(date, dateOnly)}
            </time>
          </p>
        )}
      </div>
    </section>
  );
}
