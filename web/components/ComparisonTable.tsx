// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — the RICH, category-aware plan comparison for a list of
// plans. MOBILE-FIRST: phones get one clean card per plan; lg+ screens get a
// native semantic <table> whose columns adapt to the plans' category (mirroring
// the static site's `comparisonTable`). Both views render from the SAME
// per-plan {@link PlanDisplay} bundle (lib/plan-display) so they can never drift.
//
// DATA: price (₪ + per-unit suffix), the post-promo line (an honest "לאחר המבצע:
// ₪X" jump or a "מחיר קבוע" marker — never a meaningless bare dash), the
// category's rich fields (נפח / מהירות / נתב / ממיר / התקנה / חו״ל / …) and the
// qualitative perks ("מידע נוסף"). Long fine-print sits behind a "פרטים מלאים ▾"
// native <details> disclosure (no JS, server-rendered).
//
// HONESTY: a featured/sponsored row is ALWAYS visibly labeled ("מקודם" /
// "בחירת העורך") — never covert. Provider brand colors are the carrier's REAL
// hue (providerBrandColor) and are NEVER recolored to the app accent. TRUTH-ONLY:
// only fields that exist on a plan are shown — nothing is fabricated.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Plan } from "@/lib/types";
import { priceUnitLabel } from "@/lib/format";
import { ProviderLogo } from "@/components/ProviderLogo";
import { planDisplay, type PlanDisplay, type PlanField } from "@/lib/plan-display";
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
   * visible "מקודם" / "בחירת העורך" badge on that row/card — honesty requirement.
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
   * pulsing skeleton (matching the real layout, zero layout shift) instead of a
   * blank or premature empty state. Defaults to false. `loadingRows` sizes the
   * placeholder; ignored once real `plans` are passed.
   */
  loading?: boolean;
  /** How many skeleton rows/cards to render while `loading`. Defaults to 4. */
  loadingRows?: number;
  /** Optional extra classes on the outer wrapper. */
  className?: string;
}

const LABEL_HE: Record<FeatureLabel, string> = {
  promoted: "מקודם",
  editor: "בחירת העורך",
};

/**
 * The DESKTOP column order shown BEFORE the category's rich fields. The price /
 * post-promo columns are always present; the rich category fields follow,
 * computed per-plan and unioned across the visible plans so a category never
 * shows a column that is empty for every plan (mirrors the static `keep` logic).
 */
const BASE_COLUMNS = ["ספק", "מסלול", "מחיר", "מחיר אחרי תקופה"] as const;

// The provider brand mark (real carrier logo, else a brand-colored monogram) is
// the shared <ProviderLogo>, used here at the default 32px circle.

/** An editorial "מומלץ" + precise-label pill pair — rendered ONLY when labeled. */
function FeatureBadges({ label }: { label: FeatureLabel }) {
  return (
    <>
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
  );
}

/** The honest post-promo line: an "לאחר המבצע" jump, or a neutral "מחיר קבוע". */
function AfterLine({ after }: { after: PlanDisplay["after"] }) {
  if (after.kind === "jump") {
    return (
      <span className="text-foreground">
        לאחר המבצע:{" "}
        <span className="font-semibold text-ink">{after.text}</span>
      </span>
    );
  }
  return (
    <span className="text-muted" title="המחיר אינו עולה לאחר תום המבצע">
      {after.text}
    </span>
  );
}

/** A small labelled chip used on the mobile card for one rich field. */
function FieldChip({ field }: { field: PlanField }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg border border-border/70 bg-background px-2 py-1 text-[12px] leading-tight">
      <span className="text-muted">{field.label}</span>
      <span className="font-medium text-foreground">{field.value}</span>
    </span>
  );
}

/** The price-drop badge cell (pre-resolved map OR self-fetching), shared by views. */
function PriceDrop({
  plan,
  priceDrops,
  autoPriceDrops,
  priceDropSparkline,
}: {
  plan: Plan;
  priceDrops?: Record<string, PriceDrop | null>;
  autoPriceDrops: boolean;
  priceDropSparkline: boolean;
}) {
  if (priceDrops) {
    const drop = priceDrops[plan.id];
    return drop ? (
      <span className="mt-1 block">
        <PriceDropBadge planId={plan.id} drop={drop} sparkline={priceDropSparkline} />
      </span>
    ) : null;
  }
  if (autoPriceDrops) {
    return (
      <span className="mt-1 block">
        <PriceDropBadge planId={plan.id} sparkline={priceDropSparkline} />
      </span>
    );
  }
  return null;
}

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
  // across the visible plans, in first-seen order. This mirrors the static
  // `keep` rule — a column appears only if at least one plan has a value for it,
  // so a category never renders a column of dashes.
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
  // Whether any visible plan has perks → only then add the "מידע נוסף" column.
  const hasPerksColumn = displays.some((d) => d.perks.length > 0);
  const desktopColumns = [
    ...BASE_COLUMNS,
    ...richColumns,
    ...(hasPerksColumn ? ["מידע נוסף"] : []),
  ];
  const totalCols = desktopColumns.length;

  const sharedDropProps = { priceDrops, autoPriceDrops, priceDropSparkline };

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

      {/* ══ MOBILE / TABLET (default) — one card per plan ════════════════════ */}
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

        {displays.map((d) => {
          const plan = d.plan;
          const label = featured?.[plan.id];
          return (
            <li
              key={plan.id}
              className={[
                "rounded-2xl border bg-surface p-4 elevate-card",
                label
                  ? "border-accent/30 bg-accent/[0.06] ring-1 ring-inset ring-accent/25"
                  : "border-border/60",
              ]
                .join(" ")
                .trim()}
            >
              {/* Header: provider badge + name, optional editorial label. */}
              <div className="flex flex-wrap items-center gap-2">
                <ProviderLogo provider={plan.provider} />
                <span className="font-medium text-foreground">{plan.provider}</span>
                {label ? <FeatureBadges label={label} /> : null}
              </div>

              {/* Plan name. */}
              <p className="mt-2 font-display text-base font-semibold tracking-tight text-ink">
                {plan.plan}
              </p>

              {/* Price big + unit, then the honest post-promo line. */}
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-bold tracking-tight text-ink">
                  ₪{d.price}
                </span>
                <span className="text-sm text-muted">{priceUnitLabel(plan)}</span>
              </div>
              <div className="mt-0.5 text-[13px]">
                <AfterLine after={d.after} />
              </div>
              <PriceDrop plan={plan} {...sharedDropProps} />

              {/* Category-relevant rich fields as compact labelled chips. */}
              {d.fields.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.fields.map((f) => (
                    <FieldChip key={f.label} field={f} />
                  ))}
                </div>
              ) : null}

              {/* Perks line ("מידע נוסף"). */}
              {d.perks.length > 0 ? (
                <p className="mt-3 text-[13px] leading-relaxed text-muted">
                  {d.perks.join(" · ")}
                </p>
              ) : null}

              {/* Full fine-print behind a native, no-JS disclosure — only when the
                  plan carries fine-lines NOT already shown as perks. */}
              {extraFineLines(d).length > 0 ? (
                <details className="group mt-3">
                  <summary className="interactive flex cursor-pointer list-none items-center gap-1 text-[13px] font-semibold text-accent marker:hidden">
                    פרטים מלאים
                    <span
                      aria-hidden="true"
                      className="transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-[13px] leading-relaxed text-foreground">
                    {extraFineLines(d).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>

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
            <tr className="border-b border-border text-xs text-muted">
              {desktopColumns.map((col, i) => (
                <th
                  key={col}
                  scope="col"
                  className={[
                    "px-4 py-3 font-medium",
                    i === 2 || i === 3 ? "text-start" : "text-start",
                  ].join(" ")}
                >
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
              // Quick lookup of this plan's value per rich column label.
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

                  {/* מסלול */}
                  <td className="px-4 py-3 text-start text-foreground">{plan.plan}</td>

                  {/* מחיר */}
                  <td className="px-4 py-3 text-start whitespace-nowrap">
                    <span className="font-display text-base font-bold text-ink">
                      ₪{d.price}
                    </span>{" "}
                    <span className="text-xs text-muted">{priceUnitLabel(plan)}</span>
                    <PriceDrop plan={plan} {...sharedDropProps} />
                  </td>

                  {/* מחיר אחרי תקופה */}
                  <td className="px-4 py-3 text-start whitespace-nowrap text-[13px]">
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
                    <td className="px-4 py-3 text-start text-[13px] text-muted">
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
 * The fine-print to show in the "פרטים מלאים" disclosure — the plan's fineLines
 * MINUS anything already shown on the perks line (so the disclosure adds detail
 * rather than repeating it). Truth-only: real catalogue text only.
 */
function extraFineLines(d: PlanDisplay): string[] {
  const shown = new Set(d.perks);
  return d.fineLines.filter((line) => !shown.has(line));
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
