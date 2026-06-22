"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MarketPulseCharts> — CURRENT-STATE market charts (recharts). Renders, per
// category, the average and minimum headline price as grouped bars, plus a list
// of the cheapest current deal in each category.
//
// HONESTY (E-E-A-T): this shows the REAL CURRENT snapshot of our catalogue only —
// it is explicitly labelled "מצב שוק נוכחי". There are NO trend / history lines,
// because we have no price history yet; once we start capturing it, real trends
// can be added. Nothing here is fabricated: every figure is computed by the
// server from the live catalogue and passed in via props.
// ────────────────────────────────────────────────────────────────────────────

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** One category's current price snapshot (server-computed from the catalogue). */
export interface MarketPulseCategory {
  /** Category id (e.g. "cellular"). */
  category: string;
  /** Hebrew display label (e.g. "סלולר"). */
  label: string;
  /** Average headline price in ILS across the category. */
  avg: number;
  /** Minimum headline price in ILS in the category. */
  min: number;
  /** Maximum headline price in ILS in the category. */
  max: number;
  /** Number of plans in the category. */
  count: number;
  /** The cheapest current deal in the category (or null when none). */
  cheapest: {
    plan: string;
    provider: string;
    price: number;
    /** Canonical on-site compare-page url for the category. */
    href: string;
  } | null;
}

export interface MarketPulseChartsProps {
  /** Per-category current-state rows. */
  data: MarketPulseCategory[];
  /** Optional extra classes on the outer wrapper. */
  className?: string;
}

const ILS = (n: number) => `₪${Math.round(n)}`;

/** ILS formatter for recharts <LabelList> (its value may be undefined/string). */
function labelIls(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? ILS(n) : "";
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/** Custom RTL tooltip (recharts default is LTR / English-styled). */
function PriceTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      dir="rtl"
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-md"
    >
      <p className="mb-1 font-display font-semibold text-ink">{label}</p>
      {payload.map((item) => (
        <p key={String(item.dataKey)} className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-muted">{item.name}:</span>
          <span className="font-medium">
            {typeof item.value === "number" ? ILS(item.value) : item.value}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function MarketPulseCharts({
  data,
  className,
}: MarketPulseChartsProps) {
  // Recharts reads CSS-variable colors fine, but Cell/fill want concrete values;
  // we reference the brand tokens via var() so theme stays the single source.
  const ACCENT = "var(--accent)"; // green = the "average" series
  const VALUE = "var(--value)"; // amber = the "minimum / best value" series

  const chartData = data.map((d) => ({
    label: d.label,
    avg: Math.round(d.avg),
    min: Math.round(d.min),
  }));

  return (
    <div
      className={["flex flex-col gap-8", className ?? ""].join(" ").trim()}
      data-market-pulse
    >
      {/* ── Current-state label (honesty: no history yet) ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-accent"
          />
          מצב שוק נוכחי
        </span>
        <span className="text-xs text-muted">
          תמונת מצב עדכנית מהקטלוג — ללא קווי מגמה היסטוריים (טרם נצבר היסטוריית
          מחירים).
        </span>
      </div>

      {/* ── Grouped bar chart: avg vs. min per category ───────────────────── */}
      <figure className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <figcaption className="mb-4 font-display text-base font-semibold text-ink">
          מחיר ממוצע מול המחיר הזול ביותר, לפי קטגוריה
        </figcaption>
        <div className="h-[340px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 16, right: 8, bottom: 8, left: 8 }}
              barGap={4}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => ILS(v)}
                width={56}
              />
              <Tooltip
                content={<PriceTooltip />}
                cursor={{ fill: "var(--border)", opacity: 0.3 }}
              />
              <Bar
                dataKey="avg"
                name="מחיר ממוצע"
                fill={ACCENT}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              >
                <LabelList
                  dataKey="avg"
                  position="top"
                  formatter={labelIls}
                  fontSize={11}
                  fill="var(--muted)"
                />
              </Bar>
              <Bar
                dataKey="min"
                name="המחיר הזול ביותר"
                fill={VALUE}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              >
                <LabelList
                  dataKey="min"
                  position="top"
                  formatter={labelIls}
                  fontSize={11}
                  fill="var(--muted)"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Legend (RTL, brand-coloured) */}
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm bg-accent"
            />
            מחיר ממוצע
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm bg-value"
            />
            המחיר הזול ביותר
          </li>
        </ul>
      </figure>

      {/* ── Cheapest current deal per category ────────────────────────────── */}
      <figure className="rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <figcaption className="mb-4 font-display text-base font-semibold text-ink">
          העסקה הזולה ביותר כרגע, לפי קטגוריה
        </figcaption>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((d) =>
            d.cheapest ? (
              <li key={d.category}>
                <a
                  href={d.cheapest.href}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-accent"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">{d.label}</span>
                    <span className="block truncate font-medium text-foreground group-hover:text-accent">
                      {d.cheapest.provider} — {d.cheapest.plan}
                    </span>
                    <span className="block text-xs text-muted">
                      {d.count.toLocaleString("he-IL")} מסלולים בקטגוריה
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-value/10 px-2.5 py-1 font-display text-base font-bold text-value-contrast">
                    <span className="text-value">{ILS(d.cheapest.price)}</span>
                  </span>
                </a>
              </li>
            ) : null,
          )}
        </ul>
      </figure>
    </div>
  );
}
