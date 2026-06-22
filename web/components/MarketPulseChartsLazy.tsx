"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MarketPulseChartsLazy> — defers the heavy recharts bundle. recharts is large
// and below the fold on /market-pulse, so we code-split it with `ssr: false`
// (the chart is an interactive SVG that needs the browser; the underlying
// numbers are already in the server HTML via the page's AuthorityBlock truth
// table + the "onward links" list, so SEO/GEO content is not lost).
//
// CLS-safe: the skeleton reserves the chart figure's height (340px chart +
// caption + legend), matching the real component's footprint.
// ────────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import type {
  MarketPulseChartsProps,
  MarketPulseCategory,
} from "./MarketPulseCharts";

// Re-export the data type so callers can keep importing it from this module.
export type { MarketPulseCategory };

/** Fixed-height placeholder matching the chart figure's footprint (no shift). */
function ChartsSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="h-6 w-40 animate-pulse rounded-full bg-border" />
      <div className="animate-pulse rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-4 h-5 w-2/3 rounded bg-border" />
        <div className="h-[340px] w-full rounded-lg bg-border/60" />
        <div className="mt-3 flex justify-center gap-4">
          <div className="h-3 w-20 rounded bg-border" />
          <div className="h-3 w-24 rounded bg-border" />
        </div>
      </div>
    </div>
  );
}

const MarketPulseCharts = dynamic(() => import("./MarketPulseCharts"), {
  ssr: false,
  loading: () => <ChartsSkeleton />,
});

export default function MarketPulseChartsLazy(props: MarketPulseChartsProps) {
  return <MarketPulseCharts {...props} />;
}
