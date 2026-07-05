// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — the RICH, category-aware plan comparison for a list of
// plans. MOBILE-FIRST: phones get one clean card per plan (<PlanCard>); lg+
// screens get a native semantic <table> whose columns adapt to the plans'
// category. Both views render from the SAME per-plan {@link PlanDisplay} bundle
// (lib/plan-display) so they can never drift.
//
// GROUPED MOBILE (opt-in): pass `groupByProvider` and the mobile view becomes a
// per-provider carousel (<ProviderCarousels>) instead of one long vertical stack
// — turning "scroll past 59 cards" into "~8 provider strips you swipe". The
// desktop table is unchanged. The flat list is still used for skeleton/empty.
//
// The single mobile card lives in <PlanCard> (shared with the carousel); the
// desktop table stays here. Provider brand colors are the carrier's REAL hue
// (never the app accent). TRUTH-ONLY: only fields that exist on a plan are shown.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Plan } from "@/lib/types";
import { priceUnitLabel } from "@/lib/format";
import { ProviderLogo } from "@/components/ProviderLogo";
import { planDisplay, type PlanDisplay } from "@/lib/plan-display";
import type { PriceDrop } from "@/lib/price-history";
import PlanCard, {
  FeatureBadges,
  PriceDropCell,
  type FeatureLabel,
} from "@/components/PlanCard";
import ProviderCarousels from "@/components/ProviderCarousels";

export type { FeatureLabel };

export interface ComparisonTableProps {
  /** The plans to compare, in the order to display (caller pre-ranks). */
  plans: Plan[];
  /** Accessible table caption (also visible) — describes what is compared. */
  caption: string;
  /**
   * Optional per-plan editorial label keyed by plan id. A present entry renders a
   * visible "מקודם" / "בחירת העורך" badge on that row/card — honesty requirement.
   */
  featured?: Record<string, FeatureLabel>;
  /**
   * Optional per-plan REAL price-drop summary, keyed by plan id (from
   * public.plan_price_history). A non-null entry shows an honest "ירד ₪X השבוע"
   * badge; a null/missing entry shows none.
   */
  priceDrops?: Record<string, PriceDrop | null>;
  /**
   * When true AND `priceDrops` is NOT provided, each card/row self-fetches its own
   * history from /api/price-history and shows the badge only if a real drop exists.
   */
  autoPriceDrops?: boolean;
  /** Show the tiny trend sparkline inside any rendered drop badge. */
  priceDropSparkline?: boolean;
  /**
   * MOBILE grouping: when true, the mobile view renders per-provider carousels
   * (<ProviderCarousels>) instead of one flat vertical card list. Off by default
   * (home teasers / short lists keep the simple stack). The desktop table is
   * unaffected. Skeleton/empty states always use the flat path.
   */
  groupByProvider?: boolean;
  /**
   * When the table can render before its data has arrived, set this true to show a
   * pulsing skeleton (matching the real layout, zero layout shift). `loadingRows`
   * sizes the placeholder; ignored once real `plans` are passed.
   */
  loading?: boolean;
  /** How many skeleton rows/cards to render while `loading`. Defaults to 4. */
  loadingRows?: number;
  /** Optional extra classes on the outer wrapper. */
  className?: string;
}

/**
 * The DESKTOP column order shown BEFORE the category's rich fields. The price /
 * post-promo columns are always present; the rich category fields follow,
 * computed per-plan and unioned across the visible plans so a category never
 * shows a column that is empty for every plan (mirrors the static `keep` logic).
 */
const BASE_COLUMNS = ["ספק", "מסלול", "מחיר", "מחיר אחרי תקופה"] as const;

/** A single pulsing skeleton bar — neutral `--border` fill, theme-aware. */
function SkelBar({ className }: { className?: string }) {
  return (
    <span
      className={["block h-3.5 rounded-md bg-border", className ?? ""].join(" ").trim()}
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
  groupByProvider = false,
  loading = false,
  loadingRows = 4,
  className,
}: ComparisonTableProps) {
  // Only treat as "loading" when asked AND there's no real data yet, so a late
  // `loading` flag can never blank out plans that already arrived.
  const showSkeleton = loading && plans.length === 0;
  const isEmpty = !showSkeleton && plans.length === 0;

  // Build every plan's display bundle ONCE; both the mobile cards and the desktop
  // table render from these so the two views can never disagree.
  const displays: PlanDisplay[] = plans.map(planDisplay);

  // Desktop rich columns: the UNION of the category field labels actually present
  // across the visible plans, in first-seen order (mirrors the static `keep` rule).
  const richColumns: string[] = [];
  const seenCol = new Set<string>();
  for (const d of displays) {
    for (const f of d.fields) {
      if (!seenCol.has(f.label)) {
        seenCol.add(f.label);
        richColumns.push(f.label);
      }
    }
  }
  const hasPerksColumn = displays.some((d) => d.perks.length > 0);
  const desktopColumns = [
    ...BASE_COLUMNS,
    ...richColumns,
    ...(hasPerksColumn ? ["מידע נוסף"] : []),
  ];
  const totalCols = desktopColumns.length;

  const sharedDropProps = { priceDrops, autoPriceDrops, priceDropSparkline };
  // Grouped carousels only when explicitly enabled AND there's real data to group
  // (skeleton/empty keep the flat path, which renders those states).
  const useCarousels = groupByProvider && !showSkeleton && !isEmpty;

  return (
    <div
      className={["w-full", className ?? ""].join(" ").trim()}
      role="region"
      aria-label={caption}
    >
      {/* Visible + accessible caption, shared by both views. */}
      <p className="mb-3 text-start font-display text-sm font-semibold tracking-tight text-ink lg:sr-only">
        {caption}
      </p>

      {/* ══ MOBILE / TABLET (default) ════════════════════════════════════════
          Grouped per-provider carousels when opted-in with real data; otherwise
          one card per plan (also the skeleton / empty path). */}
      {useCarousels ? (
        <ProviderCarousels
          plans={plans}
          featured={featured}
          {...sharedDropProps}
          className="lg:hidden"
        />
      ) : (
        <ul className="flex flex-col gap-3 lg:hidden">
          {showSkeleton
            ? Array.from({ length: Math.max(1, loadingRows) }).map((_, i) => (
                <li
                  key={`m-skel-${i}`}
                  aria-hidden="true"
                  className="rounded-2xl border border-border/60 bg-surface p-4 elevate-card"
                >
                  <span className="flex animate-pulse items-center gap-2 motion-reduce:animate-none">
                    <span className="block h-8 w-8 shrink-0 rounded-full bg-border" />
                    <SkelBar className="w-24" />
                  </span>
                  <SkelBar className="mt-3 h-6 w-20" />
                  <span className="mt-3 flex gap-1.5">
                    <SkelBar className="w-16" />
                    <SkelBar className="w-12" />
                  </span>
                </li>
              ))
            : null}

          {isEmpty ? (
            <li>
              <EmptyCard />
            </li>
          ) : null}

          {displays.map((d) => (
            <li key={d.plan.id}>
              <PlanCard
                display={d}
                label={featured?.[d.plan.id]}
                {...sharedDropProps}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ══ DESKTOP (lg+) — rich, category-aware semantic table ══════════════ */}
      <div
        className="scroll-shadow hidden w-full overflow-x-auto rounded-2xl border border-border/60 bg-surface elevate-card lg:block"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table className="w-full min-w-[720px] border-collapse text-right">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-background/60 text-[11px] font-medium uppercase tracking-wide text-muted">
              {desktopColumns.map((col) => (
                <th key={col} scope="col" className="px-4 py-3 text-start font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: Math.max(1, loadingRows) }).map((_, i) => (
                  <tr
                    key={`d-skel-${i}`}
                    aria-hidden="true"
                    className="border-b border-border/70 last:border-b-0 align-top"
                  >
                    {desktopColumns.map((col, ci) => (
                      <td key={col} className="px-4 py-3">
                        <span className="block animate-pulse motion-reduce:animate-none">
                          <SkelBar className={ci === 0 ? "w-24" : "w-16"} />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              : null}

            {isEmpty ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 sm:py-12">
                  <EmptyCard />
                </td>
              </tr>
            ) : null}

            {displays.map((d) => {
              const plan = d.plan;
              const label = featured?.[plan.id];
              const byLabel = new Map(d.fields.map((f) => [f.label, f.value]));
              return (
                <tr
                  key={plan.id}
                  className={[
                    "border-b border-border/70 last:border-b-0 align-top transition-colors duration-150 ease-[var(--ease-out)]",
                    label
                      ? "bg-accent/[0.12] ring-1 ring-inset ring-accent/25 border-s-2 border-s-accent"
                      : "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/[0.03]",
                  ]
                    .join(" ")
                    .trim()}
                >
                  {/* ספק — row header for a11y, brand-colored avatar anchor. */}
                  <th
                    scope="row"
                    className="px-4 py-3 text-start font-medium text-foreground"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <ProviderLogo provider={plan.provider} />
                      {plan.provider}
                      {label ? <FeatureBadges label={label} /> : null}
                    </span>
                  </th>

                  {/* מסלול — links to the plan's full detail page. */}
                  <td className="px-4 py-3 text-start text-foreground">
                    <Link
                      href={`/plans/${plan.id}`}
                      aria-label={`לפרטים מלאים על ${plan.plan} מ${plan.provider}`}
                      className="interactive rounded-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {plan.plan}
                    </Link>
                  </td>

                  {/* מחיר — tabular-nums aligns the ₪ digits down the column. */}
                  <td className="px-4 py-3 text-start whitespace-nowrap tabular-nums">
                    <span className="font-display text-base font-bold text-ink">
                      ₪{d.price}
                    </span>{" "}
                    <span className="text-xs text-muted">{priceUnitLabel(plan)}</span>
                    <PriceDropCell plan={plan} {...sharedDropProps} />
                  </td>

                  {/* מחיר אחרי תקופה — the honest post-promo jump / fixed marker. */}
                  <td className="px-4 py-3 text-start whitespace-nowrap text-[13px] tabular-nums">
                    {d.after.kind === "jump" ? (
                      <span className="font-medium text-foreground">{d.after.text}</span>
                    ) : (
                      <span
                        className="text-muted"
                        title="המחיר אינו עולה לאחר תום המבצע"
                      >
                        {d.after.text}
                      </span>
                    )}
                  </td>

                  {/* Rich category fields, in the unioned column order. */}
                  {richColumns.map((col) => {
                    const value = byLabel.get(col);
                    return (
                      <td
                        key={col}
                        className="px-4 py-3 text-start text-[13px] text-foreground"
                      >
                        {value ?? <span className="text-muted">—</span>}
                      </td>
                    );
                  })}

                  {/* מידע נוסף (perks) — only when the column exists. */}
                  {hasPerksColumn ? (
                    <td className="max-w-[20rem] break-words px-4 py-3 text-start text-[13px] text-muted">
                      {d.perks.length > 0 ? d.perks.join(" · ") : "—"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A branded, card-wrapped empty state (glyph + headline + a link to broaden the
 * search). Reused by both the mobile list and the desktop table's spanning body
 * cell, so SSR always emits a complete, parseable structure (never a bare header).
 */
function EmptyCard() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-surface px-4 py-10 text-center sm:py-12">
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
        className="interactive press mt-5 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        חזרה לדף הבית
      </Link>
    </div>
  );
}
