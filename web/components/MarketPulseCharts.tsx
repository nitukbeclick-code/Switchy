// ────────────────────────────────────────────────────────────────────────────
// <MarketPulseCharts> — CURRENT-STATE market chart, hand-rolled as a lightweight,
// SSR-able inline-SVG bar chart (NO recharts, NO client JS). Renders, per category,
// the average and minimum headline price as grouped bars, plus a list of the
// cheapest current deal in each category.
//
// Why hand-rolled: recharts was ~100KB gz and forced a client ("use client") +
// dynamic-import skeleton. This component is a pure server component — the bars are
// plain SVG <rect>s sized from the server-computed data, so the numbers are in the
// SSR HTML (GEO/SEO + no CLS, no hydration cost). The a11y data <table>, the
// <figcaption>, the legend, and the fixed chart height are all preserved.
//
// HONESTY (E-E-A-T): this shows the REAL CURRENT snapshot of our catalogue only —
// explicitly labelled "מצב שוק נוכחי". There are NO trend / history lines (we have
// no price history yet). Every figure is server-computed from the live catalogue
// and passed in via props; nothing is fabricated.
// ────────────────────────────────────────────────────────────────────────────

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

// ── SVG chart geometry (a fixed viewBox keeps it CLS-safe + responsive) ───────
// The SVG scales to its container width via `width=100%` + a fixed viewBox, so the
// aspect ratio (and therefore reserved height) is constant — no layout shift.
const VB_W = 720; // viewBox width (arbitrary units; scales to container)
const VB_H = 340; // viewBox height
const PAD_TOP = 28; // headroom for the value labels above the tallest bar
const PAD_BOTTOM = 44; // room for the category x-axis labels
const PAD_X = 16; // left/right inset
const PLOT_H = VB_H - PAD_TOP - PAD_BOTTOM;
const PLOT_W = VB_W - PAD_X * 2;
const BAR_GAP = 6; // gap between the two bars within a group
const GROUP_PAD = 0.34; // fraction of each group slot used as inter-group spacing

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  /** Center x of the bar (for the value label). */
  cx: number;
}

interface Group {
  label: string;
  /** Center x of the whole group (for the x-axis label). */
  cx: number;
  avg: Bar;
  min: Bar;
}

/** Build the bar geometry for the grouped (avg vs min) chart. */
function layout(data: MarketPulseCategory[]): {
  groups: Group[];
  ticks: { y: number; value: number }[];
  maxValue: number;
} {
  const rows = data.map((d) => ({
    label: d.label,
    avg: Math.round(d.avg),
    min: Math.round(d.min),
  }));

  const maxValueRaw = rows.reduce(
    (m, r) => Math.max(m, r.avg, r.min),
    0,
  );
  // Round the axis max up to a "nice" step so gridlines land on round numbers.
  const niceMax = niceCeil(maxValueRaw);
  const maxValue = niceMax > 0 ? niceMax : 1;

  const groupCount = rows.length || 1;
  const slot = PLOT_W / groupCount; // horizontal space per category
  const innerW = slot * (1 - GROUP_PAD); // usable width inside a slot
  const barW = Math.max(2, (innerW - BAR_GAP) / 2);

  const baseY = PAD_TOP + PLOT_H; // y of the x-axis (bottom of bars)
  const scale = (v: number) => (v / maxValue) * PLOT_H;

  const groups: Group[] = rows.map((r, i) => {
    const slotStart = PAD_X + i * slot + (slot - innerW) / 2;
    const avgX = slotStart;
    const minX = slotStart + barW + BAR_GAP;
    const avgH = scale(r.avg);
    const minH = scale(r.min);
    const cx = PAD_X + i * slot + slot / 2;
    return {
      label: r.label,
      cx,
      avg: {
        x: avgX,
        y: baseY - avgH,
        w: barW,
        h: avgH,
        value: r.avg,
        cx: avgX + barW / 2,
      },
      min: {
        x: minX,
        y: baseY - minH,
        w: barW,
        h: minH,
        value: r.min,
        cx: minX + barW / 2,
      },
    };
  });

  // 4 horizontal gridlines/ticks (incl. 0 and max).
  const TICK_COUNT = 4;
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const value = (maxValue / TICK_COUNT) * i;
    const y = baseY - scale(value);
    return { y, value: Math.round(value) };
  });

  return { groups, ticks, maxValue };
}

/** Round up to a visually pleasant axis maximum (e.g. 137 → 150, 412 → 450). */
function niceCeil(n: number): number {
  if (n <= 0) return 0;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) {
    const candidate = s * pow;
    if (candidate >= n) return candidate;
  }
  return 10 * pow;
}

export default function MarketPulseCharts({
  data,
  className,
}: MarketPulseChartsProps) {
  // Brand tokens via CSS variables so the theme stays the single source of truth.
  const ACCENT = "var(--accent)"; // green = the "average" series
  const VALUE = "var(--value)"; // amber = the "minimum / best value" series

  const { groups, ticks } = layout(data);
  const baseY = PAD_TOP + PLOT_H;

  return (
    <div
      className={["flex flex-col gap-8", className ?? ""].join(" ").trim()}
      data-market-pulse
    >
      {/* ── Current-state label (honesty: no history yet) ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-text">
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
      <figure className="bento p-5 sm:p-6">
        <figcaption className="mb-4 font-display text-base font-semibold tracking-tight text-ink">
          מחיר ממוצע מול המחיר הזול ביותר, לפי קטגוריה
        </figcaption>
        {/* a11y (WCAG 1.1.1): the SVG bars are image-only, so we expose the same
            figures as a visually-hidden data table for screen readers, and label
            the chart region with role="img" + aria-label. */}
        <table className="sr-only">
          <caption>מחיר ממוצע והמחיר הזול ביותר בכל קטגוריה, בשקלים</caption>
          <thead>
            <tr>
              <th scope="col">קטגוריה</th>
              <th scope="col">מחיר ממוצע</th>
              <th scope="col">המחיר הזול ביותר</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.label}>
                <th scope="row">{g.label}</th>
                <td>{ILS(g.avg.value)}</td>
                <td>{ILS(g.min.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Fixed-aspect SVG: width=100% + a constant viewBox → constant reserved
            height (CLS-safe). dir="ltr" so the numeric axis reads left-to-right;
            category labels are Hebrew but center-anchored so they stay legible. */}
        <div
          className="w-full"
          dir="ltr"
          role="img"
          aria-label="תרשים עמודות: מחיר ממוצע מול המחיר הזול ביותר בכל קטגוריה. הנתונים המלאים זמינים בטבלה הנלווית."
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            width="100%"
            className="h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Horizontal gridlines + y-axis tick labels. */}
            {ticks.map((t) => (
              <g key={t.value}>
                <line
                  x1={PAD_X}
                  x2={VB_W - PAD_X}
                  y1={t.y}
                  y2={t.y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray={t.value === 0 ? undefined : "3 3"}
                />
                <text
                  x={PAD_X - 4}
                  y={t.y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {ILS(t.value)}
                </text>
              </g>
            ))}

            {/* Grouped bars + value labels + category labels. */}
            {groups.map((g) => (
              <g key={g.label}>
                {/* average (accent / green) */}
                <rect
                  x={g.avg.x}
                  y={g.avg.y}
                  width={g.avg.w}
                  height={g.avg.h}
                  rx={4}
                  fill={ACCENT}
                />
                <text
                  x={g.avg.cx}
                  y={g.avg.y - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {ILS(g.avg.value)}
                </text>

                {/* minimum / best value (value / amber) */}
                <rect
                  x={g.min.x}
                  y={g.min.y}
                  width={g.min.w}
                  height={g.min.h}
                  rx={4}
                  fill={VALUE}
                />
                <text
                  x={g.min.cx}
                  y={g.min.y - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {ILS(g.min.value)}
                </text>

                {/* category x-axis label */}
                <text
                  x={g.cx}
                  y={baseY + 20}
                  textAnchor="middle"
                  fontSize={13}
                  fill="var(--muted)"
                >
                  {g.label}
                </text>
              </g>
            ))}
          </svg>
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
      <figure className="bento p-5 sm:p-6">
        <figcaption className="mb-4 font-display text-base font-semibold tracking-tight text-ink">
          העסקה הזולה ביותר כרגע, לפי קטגוריה
        </figcaption>
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((d) =>
            d.cheapest ? (
              <li key={d.category}>
                <a
                  href={d.cheapest.href}
                  className="group interactive press flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background p-3.5 hover:-translate-y-0.5 hover:border-accent hover:shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">{d.label}</span>
                    <span className="block truncate font-medium text-foreground transition-colors group-hover:text-accent">
                      {d.cheapest.provider} — {d.cheapest.plan}
                    </span>
                    <span className="block text-xs text-muted">
                      {d.count.toLocaleString("he-IL")} מסלולים בקטגוריה
                    </span>
                  </span>
                  {/* AA: amber-as-text uses the darker text-grade amber (≥4.5:1
                      on the near-white bg-value/10 pill); #F59E0B is 2.15:1. */}
                  <span className="shrink-0 rounded-lg bg-value/10 px-2.5 py-1 font-display text-base font-bold text-value-text">
                    {ILS(d.cheapest.price)}
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
