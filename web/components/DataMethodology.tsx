// ────────────────────────────────────────────────────────────────────────────
// <DataMethodology> — a transparent "מקורות ומתודולוגיה" footer block (E-E-A-T).
// States, in plain Hebrew, HOW the page ranks plans (the stated methodology from
// lib/aeo `methodologyText()`), WHERE the data comes from (the real catalogue /
// live DB), and WHEN it was last checked (real date + the honest <FactCheckBadge>
// data-engine line). Server component (no state), in the initial SSR/ISR HTML.
//
// HONESTY: this is the "show your work" block — it discloses the basis for every
// "זול ביותר"/comparison claim on the page so nothing is covert. It adds no new
// claim about the plans themselves; it only describes the method + provenance.
// ────────────────────────────────────────────────────────────────────────────

import FactCheckBadge from "./FactCheckBadge";
import { methodologyText } from "@/lib/aeo";

export interface DataMethodologyProps {
  /** Real "data as of" / last-checked date (Date or ISO string). */
  dateModified?: Date | string;
  /**
   * Whether the page is serving the bundled fallback snapshot (vs the live DB).
   * Drives an honest "source" line. Defaults to false (live).
   */
  stale?: boolean;
  /** How many real plans back the page's claims (shown for transparency). */
  planCount?: number;
  /** Override the methodology sentence (defaults to lib/aeo `methodologyText`). */
  methodology?: string;
  /** Visible heading. Defaults to "מקורות ומתודולוגיה". */
  heading?: string;
  /** DOM id — defaults to "data-methodology". */
  id?: string;
  /** Optional extra classes. */
  className?: string;
}

export default function DataMethodology({
  dateModified,
  stale = false,
  planCount,
  methodology,
  heading = "מקורות ומתודולוגיה",
  id = "data-methodology",
  className,
}: DataMethodologyProps) {
  const headingId = `${id}-heading`;
  const sourceLine = stale
    ? "המחירים מוצגים מתוך עותק שמור (snapshot) של קטלוג המסלולים שלנו, " +
      "ומתעדכנים אוטומטית."
    : "המחירים נקראים בזמן אמת מתוך מסד הנתונים החי של קטלוג המסלולים שלנו, " +
      "ומתעדכנים אוטומטית.";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-data-methodology
      className={[
        "rounded-xl border border-border/70 bg-surface/40 p-5 sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h2
        id={headingId}
        className="mb-2 font-display text-sm font-semibold tracking-tight text-ink"
      >
        {heading}
      </h2>

      <p className="text-[13px] leading-relaxed text-muted">
        {methodology ?? methodologyText()}
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        {sourceLine}
        {typeof planCount === "number" && planCount > 0
          ? ` בעמוד זה הושוו ${planCount} מסלולים.`
          : ""}
      </p>

      <div className="mt-3">
        <FactCheckBadge dateModified={dateModified} />
      </div>
    </section>
  );
}
