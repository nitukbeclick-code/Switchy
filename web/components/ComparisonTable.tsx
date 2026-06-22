// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — a NATIVE, semantic comparison <table> for a list of plans.
// Real <table>/<caption>/<th scope> markup (great for a11y + GEO; AI engines and
// screen-readers parse it cleanly). Price shown in ₪ with the correct per-unit
// suffix, an "after promo" column, and a labeled "promoted/editor's pick" row.
//
// HONESTY: a featured/sponsored row is ALWAYS visibly labeled ("מקודם" /
// "בחירת העורך") — never covert. The label is set by the caller per plan via the
// `featured` map; this component only renders the disclosure it is told to.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan, PriceUnit } from "@/lib/types";

/** What kind of editorial label, if any, a row carries. */
export type FeatureLabel = "promoted" | "editor";

export interface ComparisonTableProps {
  /** The plans to compare, in the order to display (caller pre-ranks). */
  plans: Plan[];
  /** Accessible table caption (also visible) — describes what is compared. */
  caption: string;
  /**
   * Optional per-plan editorial label keyed by plan id. A present entry renders a
   * visible "מקודם" / "בחירת העורך" badge on that row — honesty requirement.
   */
  featured?: Record<string, FeatureLabel>;
  /** Optional extra classes on the outer scroll wrapper. */
  className?: string;
}

/** Hebrew per-unit suffix for a plan's headline price. */
function priceUnitShort(plan: Plan): string {
  // Abroad plans default to per-package when the unit is unset.
  const unit: PriceUnit | undefined =
    plan.priceUnit ?? (plan.cat === "abroad" ? "package" : "month");
  switch (unit) {
    case "package":
      return "לחבילה";
    case "day":
      return "ליום";
    case "minute":
      return "לדקה";
    case "month":
    default:
      return "לחודש";
  }
}

/** Format a number as an ILS amount, e.g. 69.9 → "₪69.9", 70 → "₪70". */
function shekel(n: number): string {
  return `₪${Number.isInteger(n) ? n : n.toFixed(1)}`;
}

const LABEL_HE: Record<FeatureLabel, string> = {
  promoted: "מקודם",
  editor: "בחירת העורך",
};

export default function ComparisonTable({
  plans,
  caption,
  featured,
  className,
}: ComparisonTableProps) {
  return (
    <div
      // Mobile horizontal-scroll wrapper; focusable so keyboard users can scroll.
      // `scroll-shadow` (defined in globals.css) fades in soft edge shadows ONLY
      // when there's hidden content to scroll to — a discoverability affordance so
      // phone users know the table extends sideways. It shadows whichever physical
      // edge is clipped, so it's RTL-correct. Pure CSS, no JS, no layout shift.
      className={[
        "scroll-shadow w-full overflow-x-auto rounded-2xl border border-border bg-surface",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-[640px] border-collapse text-right">
        <caption className="px-4 pt-4 text-start font-display text-sm font-semibold text-ink">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            <th scope="col" className="px-4 py-3 text-start font-medium">
              ספק
            </th>
            <th scope="col" className="px-4 py-3 text-start font-medium">
              מסלול
            </th>
            <th scope="col" className="px-4 py-3 text-start font-medium">
              מחיר
            </th>
            <th scope="col" className="px-4 py-3 text-start font-medium">
              מחיר אחרי מבצע
            </th>
            <th scope="col" className="px-4 py-3 text-start font-medium">
              מאפיינים
            </th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const label = featured?.[plan.id];
            return (
              <tr
                key={plan.id}
                className={[
                  "border-b border-border last:border-b-0 align-top",
                  // Editor's-pick / promoted row: a subtle tint PLUS an inset
                  // start-border (logical, RTL-correct) so the labeled row reads
                  // at a glance without raising the fill opacity.
                  label
                    ? "bg-accent/[0.04] ring-1 ring-inset ring-accent/20 border-s-2 border-s-accent"
                    : "",
                ]
                  .join(" ")
                  .trim()}
              >
                {/* Provider name is the row header for a11y. */}
                <th
                  scope="row"
                  className="px-4 py-3 text-start font-medium text-foreground"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    {plan.provider}
                    {label ? (
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          label === "editor"
                            ? "bg-value/15 text-value-contrast"
                            : "bg-accent/15 text-accent",
                        ].join(" ")}
                      >
                        {LABEL_HE[label]}
                      </span>
                    ) : null}
                  </span>
                </th>

                <td className="px-4 py-3 text-start text-foreground">
                  {plan.plan}
                </td>

                <td className="px-4 py-3 text-start whitespace-nowrap">
                  <span className="font-display text-base font-bold text-ink">
                    {shekel(plan.price)}
                  </span>{" "}
                  <span className="text-xs text-muted">
                    {priceUnitShort(plan)}
                  </span>
                </td>

                <td className="px-4 py-3 text-start whitespace-nowrap">
                  {typeof plan.after === "number" && plan.after > 0 ? (
                    <span className="font-medium text-foreground">
                      {shekel(plan.after)}{" "}
                      <span className="text-xs text-muted">
                        {priceUnitShort(plan)}
                      </span>
                    </span>
                  ) : (
                    <span
                      className="text-muted"
                      aria-label="ללא שינוי מחיר"
                      title="ללא שינוי מחיר"
                    >
                      —
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 text-start">
                  {/* Neutral feature tags (NOT brand-colored — these aren't
                      accents). A hairline border makes each read as a discrete
                      chip rather than a single grey blob. */}
                  <span className="flex flex-wrap gap-1.5">
                    {plan.is5G ? (
                      <span className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-foreground">
                        5G
                      </span>
                    ) : null}
                    {plan.noCommit ? (
                      <span className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-foreground">
                        ללא התחייבות
                      </span>
                    ) : null}
                    {plan.hasAbroad ? (
                      <span className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-foreground">
                        כולל חו״ל
                      </span>
                    ) : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
