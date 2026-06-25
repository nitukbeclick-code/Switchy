// ────────────────────────────────────────────────────────────────────────────
// <StreetPriceChart> — the honest "מחיר הרחוב" visualization. For each category
// with ENOUGH real reports it renders a median marker inside a min–max range bar
// (a hand-rolled, SSR-able inline-SVG; NO recharts, NO client JS). For categories
// BELOW the threshold it renders NOTHING (an honest empty-state line, never a
// misleading tiny-sample band). Every figure carries the mandatory provenance
// label: "מבוסס דיווחי משתמשים, לא מחירון רשמי".
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • The numbers come ONLY from the threshold-gated get_street_prices_by_category
//     RPC (via GET /api/street-price). An unpublished category shows the
//     "be the first / N more reports" copy, never a fabricated figure.
//   • The headline is the MEDIAN (robust to outliers); the bar shows the real
//     min–max range so the spread is visible — this is reported reality, NOT an
//     official tariff and NOT a promise. The disclaimer says so on every card.
//
// Pure presentational server component: the aggregates are computed server-side
// (or fetched client-side and passed in) — this component only renders them. RTL +
// dark-mode safe (CSS-variable colors). a11y: an SVG `role="img"` + label per bar,
// plus a hidden data <table> mirror for screen readers.
// ────────────────────────────────────────────────────────────────────────────

import {
  STREET_PRICE_DISCLAIMER,
  belowThresholdNote,
  ils,
  reportsNeeded,
  type StreetPriceAggregate,
} from "@/lib/street-price";

export interface StreetPriceChartProps {
  /** One aggregate per category (published or not). */
  aggregates: StreetPriceAggregate[];
  /** Optional extra classes on the outer wrapper. */
  className?: string;
}

// ── Range-bar geometry (a fixed viewBox keeps it CLS-safe + responsive) ───────
const VB_W = 720;
const BAR_H = 26;
const PAD_X = 56; // left/right inset so end labels never clip
const TRACK_Y = 18;

/** A single published category's median-in-range bar. */
function RangeBar({ agg }: { agg: StreetPriceAggregate }) {
  const span = Math.max(1, agg.max - agg.min);
  const x = (v: number) =>
    PAD_X + ((v - agg.min) / span) * (VB_W - PAD_X * 2);
  const medianX = x(agg.median);
  const avgX = x(agg.avg);

  return (
    <svg
      viewBox={`0 0 ${VB_W} 64`}
      width="100%"
      role="img"
      aria-label={`מחיר רחוב ב${agg.categoryHe}: חציון ${ils(
        agg.median,
      )} לחודש, טווח ${ils(agg.min)} עד ${ils(agg.max)}, לפי ${
        agg.count
      } דיווחים`}
      className="mt-3 overflow-visible"
    >
      {/* Range track (min–max) */}
      <rect
        x={PAD_X}
        y={TRACK_Y}
        width={VB_W - PAD_X * 2}
        height={BAR_H}
        rx={BAR_H / 2}
        fill="color-mix(in srgb, var(--value) 16%, transparent)"
        stroke="color-mix(in srgb, var(--value) 35%, transparent)"
        strokeWidth={1}
      />
      {/* Mean marker (subtle) */}
      <line
        x1={avgX}
        x2={avgX}
        y1={TRACK_Y - 4}
        y2={TRACK_Y + BAR_H + 4}
        stroke="var(--muted)"
        strokeWidth={1.5}
        strokeDasharray="3 3"
      />
      {/* Median marker (the headline) */}
      <line
        x1={medianX}
        x2={medianX}
        y1={TRACK_Y - 6}
        y2={TRACK_Y + BAR_H + 6}
        stroke="var(--value)"
        strokeWidth={3}
      />
      <circle cx={medianX} cy={TRACK_Y + BAR_H / 2} r={6} fill="var(--value)" />

      {/* End labels: min (start) + max (end). dir-aware via text-anchor. */}
      <text
        x={PAD_X - 8}
        y={TRACK_Y + BAR_H / 2 + 4}
        textAnchor="end"
        fontSize={13}
        fill="var(--muted)"
      >
        {ils(agg.min)}
      </text>
      <text
        x={VB_W - PAD_X + 8}
        y={TRACK_Y + BAR_H / 2 + 4}
        textAnchor="start"
        fontSize={13}
        fill="var(--muted)"
      >
        {ils(agg.max)}
      </text>

      {/* Median value label above its marker, clamped inside the plot. */}
      <text
        x={Math.min(VB_W - PAD_X, Math.max(PAD_X, medianX))}
        y={TRACK_Y - 12}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        fill="var(--value-text)"
      >
        {ils(agg.median)}
      </text>
    </svg>
  );
}

/** One category card — published (bar) or below-threshold (honest empty state). */
function CategoryCard({ agg }: { agg: StreetPriceAggregate }) {
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-bold tracking-tight text-ink">
          {agg.categoryHe}
        </h3>
        {agg.published ? (
          <span className="text-xs text-muted">{agg.count} דיווחים</span>
        ) : (
          <span className="text-xs text-muted">
            {agg.count > 0
              ? `${agg.count}/${agg.threshold} דיווחים`
              : "אין דיווחים עדיין"}
          </span>
        )}
      </div>

      {agg.published ? (
        <>
          <p className="mt-1 text-sm text-foreground">
            חציון:{" "}
            <span className="font-display text-xl font-bold text-value-text">
              {ils(agg.median)}
            </span>{" "}
            <span className="text-muted">לחודש</span>
            <span className="mx-1.5 text-muted">·</span>
            <span className="text-muted">
              ממוצע {ils(agg.avg)} · טווח {ils(agg.min)}–{ils(agg.max)}
            </span>
          </p>
          <RangeBar agg={agg} />
        </>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {belowThresholdNote(agg)}
          {agg.count > 0 && reportsNeeded(agg.count) > 0 ? (
            <span className="mt-2 block text-xs">
              עוד {reportsNeeded(agg.count)} דיווחים והמחיר יוצג כאן.
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

export default function StreetPriceChart({
  aggregates,
  className,
}: StreetPriceChartProps) {
  const published = aggregates.filter((a) => a.published);
  const pending = aggregates.filter((a) => !a.published);

  return (
    <figure
      className={["m-0", className ?? ""].join(" ").trim()}
      aria-labelledby="street-price-figcaption"
    >
      {/* Mandatory provenance — shown above the whole figure, never hidden. */}
      <figcaption
        id="street-price-figcaption"
        className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-value/30 bg-value/5 px-3 py-1 text-xs font-medium text-value-text"
      >
        <span aria-hidden="true">ℹ️</span>
        {STREET_PRICE_DISCLAIMER}
      </figcaption>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Published categories first, then the honest empty-state cards. */}
        {published.map((agg) => (
          <CategoryCard key={agg.category} agg={agg} />
        ))}
        {pending.map((agg) => (
          <CategoryCard key={agg.category} agg={agg} />
        ))}
      </div>

      {/* Screen-reader data mirror of the published figures (sr-only). */}
      {published.length > 0 ? (
        <table className="sr-only">
          <caption>
            מחיר הרחוב לפי דיווחי משתמשים (₪ לחודש) — חציון, ממוצע וטווח, לכל קטגוריה
            עם מספיק דיווחים
          </caption>
          <thead>
            <tr>
              <th scope="col">קטגוריה</th>
              <th scope="col">חציון</th>
              <th scope="col">ממוצע</th>
              <th scope="col">מינימום</th>
              <th scope="col">מקסימום</th>
              <th scope="col">דיווחים</th>
            </tr>
          </thead>
          <tbody>
            {published.map((agg) => (
              <tr key={agg.category}>
                <th scope="row">{agg.categoryHe}</th>
                <td>{ils(agg.median)}</td>
                <td>{ils(agg.avg)}</td>
                <td>{ils(agg.min)}</td>
                <td>{ils(agg.max)}</td>
                <td>{agg.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
