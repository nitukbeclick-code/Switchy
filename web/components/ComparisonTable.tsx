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

import Link from "next/link";
import type { Plan } from "@/lib/types";
import {
  priceUnitLabel,
  providerBrandColor,
  providerInitials,
} from "@/lib/format";
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
  /**
   * When the table can render before its data has arrived, set this true to show a
   * pulsing skeleton row grid (matching the real row layout, zero layout shift)
   * instead of a blank or premature empty state. Defaults to false. `rows` sizes
   * the placeholder; ignored once real `plans` are passed.
   */
  loading?: boolean;
  /** How many skeleton rows to render while `loading`. Defaults to 4. */
  loadingRows?: number;
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

/**
 * A 32px avatar anchoring a plan row — a circle filled with the provider's OWN
 * brand color carrying its Hebrew/latin monogram, so a row is scannable at a
 * glance without any image assets. The brand color comes from
 * {@link providerBrandColor}; it is the carrier's real hue, NOT the app accent,
 * and is never recolored. White glyph for contrast on the saturated fill.
 * Decorative (the adjacent provider name carries the meaning) → hidden from AT.
 */
function ProviderAvatar({ provider }: { provider: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-bold leading-none text-white shadow-sm ring-1 ring-inset ring-black/10"
      style={{ backgroundColor: providerBrandColor(provider) }}
    >
      {providerInitials(provider)}
    </span>
  );
}

/** A single pulsing skeleton bar — neutral `--border` fill, theme-aware. */
function SkelBar({ className }: { className?: string }) {
  return (
    <span
      className={["block h-3.5 rounded-md bg-border", className ?? ""]
        .join(" ")
        .trim()}
    />
  );
}

export default function ComparisonTable({
  plans,
  caption,
  featured,
  priceDrops,
  autoPriceDrops = false,
  priceDropSparkline = false,
  loading = false,
  loadingRows = 4,
  className,
}: ComparisonTableProps) {
  // Only treat as "loading" when asked AND there's no real data to show yet, so a
  // late `loading` flag can never blank out plans that already arrived.
  const showSkeleton = loading && plans.length === 0;
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
          {/* LOADING — a pulsing skeleton row grid that mirrors the real row
              layout (avatar + bars per column) so a pending table reads as
              "loading" with zero layout shift, never a blank body. Decorative +
              announced by the host's status region → aria-hidden. */}
          {showSkeleton
            ? Array.from({ length: Math.max(1, loadingRows) }).map((_, i) => (
                <tr
                  key={`skeleton-${i}`}
                  aria-hidden="true"
                  className="border-b border-border/70 last:border-b-0 align-top"
                >
                  {/* ספק — avatar dot + name bar */}
                  <td className="px-4 py-3">
                    <span className="flex animate-pulse items-center gap-2 motion-reduce:animate-none">
                      <span className="block h-8 w-8 shrink-0 rounded-full bg-border" />
                      <SkelBar className="w-20" />
                    </span>
                  </td>
                  {/* מסלול */}
                  <td className="px-4 py-3">
                    <span className="block animate-pulse motion-reduce:animate-none">
                      <SkelBar className="w-28" />
                    </span>
                  </td>
                  {/* מחיר */}
                  <td className="px-4 py-3">
                    <span className="block animate-pulse motion-reduce:animate-none">
                      <SkelBar className="h-5 w-16" />
                    </span>
                  </td>
                  {/* מחיר אחרי מבצע */}
                  <td className="px-4 py-3">
                    <span className="block animate-pulse motion-reduce:animate-none">
                      <SkelBar className="w-14" />
                    </span>
                  </td>
                  {/* מאפיינים — two short chip bars */}
                  <td className="px-4 py-3">
                    <span className="flex animate-pulse gap-1.5 motion-reduce:animate-none">
                      <SkelBar className="w-10" />
                      <SkelBar className="w-16" />
                    </span>
                  </td>
                </tr>
              ))
            : null}

          {/* EMPTY — a branded, card-wrapped empty state (glyph + headline + a
              link to broaden the search), kept inside a spanning body cell so SSR
              still emits a complete, parseable table (thead + body) for
              crawlers/LLMs/screen-readers — never a bare header. Shown only when
              there are no plans AND we are not loading. */}
          {!showSkeleton && plans.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-10 sm:py-12">
                <div className="flex flex-col items-center text-center">
                  {/* Soft green ACTION badge — decorative glyph, hidden from AT;
                      the headline carries the meaning. */}
                  <span
                    aria-hidden="true"
                    className="elevate-soft flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-2xl text-accent-text"
                  >
                    🔍
                  </span>
                  <p className="mt-4 font-display text-base font-bold tracking-tight text-ink sm:text-lg">
                    אין התאמות כרגע
                  </p>
                  <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
                    נסו להרחיב את הסינון או לחזור לדף הבית כדי לראות עוד מסלולים.
                  </p>
                  <Link
                    href="/"
                    className="interactive press mt-5 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    חזרה לדף הבית
                  </Link>
                </div>
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
                {/* Provider name is the row header for a11y. The brand-colored
                    avatar anchors the row for fast scanning (decorative — the
                    name beside it carries the meaning). */}
                <th
                  scope="row"
                  className="px-4 py-3 text-start font-medium text-foreground"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ProviderAvatar provider={plan.provider} />
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
