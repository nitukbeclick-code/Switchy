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

import type { Plan } from "@/lib/types";
import { priceUnitLabel } from "@/lib/format";
import type { PriceDrop } from "@/lib/price-history";
import PriceDropBadge from "@/components/PriceDropBadge";

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
  /**
   * Optional per-plan REAL price-drop summary, keyed by plan id. When an entry is
   * a non-null {@link PriceDrop}, the row's price cell shows an honest
   * "ירד ₪X השבוע" badge (presentation only — the drop is decided upstream from
   * public.plan_price_history; this component renders only what it's told). A
   * `null` entry, or a missing key, shows no badge.
   */
  priceDrops?: Record<string, PriceDrop | null>;
  /**
   * When true AND `priceDrops` is NOT provided, each row's badge self-fetches its
   * own history from /api/price-history (client-side) and shows the badge only if a
   * real drop exists. Off by default so SSR pages opt in explicitly.
   */
  autoPriceDrops?: boolean;
  /** Show the tiny trend sparkline inside any rendered drop badge. */
  priceDropSparkline?: boolean;
  /** Optional extra classes on the outer scroll wrapper. */
  className?: string;
}

/** Format a number as an ILS amount, e.g. 69.9 → "₪69.9", 70 → "₪70". */
function shekel(n: number): string {
  return `₪${Number.isInteger(n) ? n : n.toFixed(1)}`;
}

const LABEL_HE: Record<FeatureLabel, string> = {
  promoted: "מקודם",
  editor: "בחירת העורך",
};

/**
 * The visible column headers, in display order. Single source of truth so the
 * <thead> and the empty-state row's colSpan can never drift apart — a crawler/LLM
 * always sees a well-formed table whose body spans every column. Presentation
 * only; changing copy here does not touch data, props, or logic.
 */
const COLUMNS = ["ספק", "מסלול", "מחיר", "מחיר אחרי מבצע", "מאפיינים"] as const;

export default function ComparisonTable({
  plans,
  caption,
  featured,
  priceDrops,
  autoPriceDrops = false,
  priceDropSparkline = false,
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
        "scroll-shadow w-full overflow-x-auto rounded-2xl border border-border/60 bg-surface elevate-card",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      tabIndex={0}
      role="region"
      aria-label={caption}
    >
      <table className="w-full min-w-[640px] border-collapse text-right">
        <caption className="px-4 pt-5 text-start font-display text-sm font-semibold tracking-tight text-ink">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted">
            {COLUMNS.map((col) => (
              <th
                key={col}
                scope="col"
                className="px-4 py-3 text-start font-medium"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Empty-state row keeps the <tbody> non-empty so SSR always emits a
              complete, parseable table (thead + a spanning body cell) for
              crawlers/LLMs/screen-readers — never a bare header skeleton. */}
          {plans.length === 0 ? (
            <tr>
              <td
                colSpan={COLUMNS.length}
                className="px-4 py-6 text-center text-sm text-muted"
              >
                אין מסלולים להשוואה כרגע
              </td>
            </tr>
          ) : null}
          {plans.map((plan) => {
            const label = featured?.[plan.id];
            return (
              <tr
                key={plan.id}
                className={[
                  "border-b border-border/70 last:border-b-0 align-top transition-colors",
                  // Editor's-pick / promoted row: a firmer accent tint PLUS an
                  // inset start-border (logical, RTL-correct) so the labeled row
                  // scans instantly without overwhelming the table.
                  label
                    ? "bg-accent/[0.12] ring-1 ring-inset ring-accent/25 border-s-2 border-s-accent"
                    : "hover:bg-accent/[0.03]",
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
                      <>
                        {/* "מומלץ" pill — amber VALUE accent so a genuine
                            editorial/featured pick is recognisable at a glance.
                            Renders ONLY when the caller marked the row (honesty:
                            §7b/§17), alongside the precise editorial label. */}
                        <span className="inline-flex items-center rounded-full bg-value px-2 py-0.5 text-[11px] font-bold text-value-contrast">
                          מומלץ
                        </span>
                        <span
                          className={[
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            label === "editor"
                              ? "bg-value/15 text-value-text"
                              : "bg-accent/15 text-accent",
                          ].join(" ")}
                        >
                          {LABEL_HE[label]}
                        </span>
                      </>
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
                    {priceUnitLabel(plan)}
                  </span>
                  {/* Honest price-drop badge — renders ONLY when a real
                      week-over-week drop exists (decided upstream from
                      plan_price_history). Either driven by a pre-resolved
                      `priceDrops` map, or self-fetched when `autoPriceDrops`. */}
                  {priceDrops
                    ? (() => {
                        const drop = priceDrops[plan.id];
                        return drop ? (
                          <span className="mt-1 block">
                            <PriceDropBadge
                              planId={plan.id}
                              drop={drop}
                              sparkline={priceDropSparkline}
                            />
                          </span>
                        ) : null;
                      })()
                    : autoPriceDrops ? (
                        <span className="mt-1 block">
                          <PriceDropBadge
                            planId={plan.id}
                            sparkline={priceDropSparkline}
                          />
                        </span>
                      ) : null}
                </td>

                <td className="px-4 py-3 text-start whitespace-nowrap">
                  {typeof plan.after === "number" && plan.after > 0 ? (
                    <span className="font-medium text-foreground">
                      {shekel(plan.after)}{" "}
                      <span className="text-xs text-muted">
                        {priceUnitLabel(plan)}
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
                      <span className="inline-flex items-center rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-[11px] text-foreground">
                        5G
                      </span>
                    ) : null}
                    {plan.noCommit ? (
                      <span className="inline-flex items-center rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-[11px] text-foreground">
                        ללא התחייבות
                      </span>
                    ) : null}
                    {plan.hasAbroad ? (
                      <span className="inline-flex items-center rounded-md border border-border/70 bg-background px-1.5 py-0.5 text-[11px] text-foreground">
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
