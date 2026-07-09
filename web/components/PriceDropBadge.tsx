"use client";

// ────────────────────────────────────────────────────────────────────────────
// <PriceDropBadge> — an HONEST "ירד ₪X השבוע" pill that appears next to a plan's
// price ONLY when public.plan_price_history shows a REAL, material week-over-week
// drop (≥ ₪5 OR ≥ 10%). It fetches /api/price-history (which owns the threshold
// logic via lib/price-history) and renders NOTHING when there's no qualifying
// drop, no history, or the fetch fails. It is a pure presentational enhancement:
// it never blocks paint, never throws, and carries no fabricated data.
//
// E-E-A-T: the figure shown is the actual shekel decrease from the snapshot ~7
// days earlier to the latest snapshot — surfaced by the server, not invented
// here. An optional tiny inline-SVG sparkline visualises the same real series.
//
// Design: amber = VALUE per the brand system (a price drop is a value/win state),
// using the AA text-grade amber token (--value-text). Dark-mode safe (all colors
// are CSS variables). a11y: the pill has an aria-label spelling the change in
// full; the sparkline is aria-hidden (decorative — the text carries the meaning).
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import {
  dropBadgeLabel,
  type PriceDrop,
  type PricePoint,
} from "@/lib/price-history";

export interface PriceDropBadgeProps {
  /** Catalogue plan id to look up history for. */
  planId: string;
  /**
   * Optional pre-fetched drop (e.g. from a server component that already read the
   * history). When provided, the component renders it directly and does NOT fetch.
   * Pass `null` to mean "known: no drop" (renders nothing, no request).
   */
  drop?: PriceDrop | null;
  /** Optional pre-fetched points for the sparkline (used with `drop`). */
  points?: PricePoint[];
  /** Show the tiny trend sparkline next to the pill. Default false. */
  sparkline?: boolean;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

interface PlanHistory {
  drop: PriceDrop | null;
  points: PricePoint[];
}

/** Build a smooth-ish polyline path for the sparkline from a price series. */
function sparkPath(points: PricePoint[], w: number, h: number, pad = 2): string {
  const prices = points.map((p) => p.price).filter((n) => Number.isFinite(n));
  if (prices.length < 2) return "";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const stepX = innerW / (prices.length - 1);
  return prices
    .map((price, i) => {
      const x = pad + i * stepX;
      // Higher price → higher on screen (smaller y). Invert within the band.
      const y = pad + innerH - ((price - min) / span) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function PriceDropBadge({
  planId,
  drop: dropProp,
  points: pointsProp,
  sparkline = false,
  className,
}: PriceDropBadgeProps) {
  // When the caller already resolved the drop (even to null), trust it and skip
  // the network entirely.
  const provided = dropProp !== undefined;

  const [history, setHistory] = useState<PlanHistory | null>(
    provided ? { drop: dropProp ?? null, points: pointsProp ?? [] } : null,
  );
  const reqRef = useRef(false);

  useEffect(() => {
    if (provided || reqRef.current || !planId) return;
    reqRef.current = true;
    const controller = new AbortController();
    fetch(`/api/price-history?plan_id=${encodeURIComponent(planId)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const entry = data?.plans?.[planId] as
          | { drop?: PriceDrop | null; points?: PricePoint[] }
          | undefined;
        setHistory({
          drop: entry?.drop ?? null,
          points: Array.isArray(entry?.points) ? entry!.points : [],
        });
      })
      .catch(() => {
        // Fail-soft: no badge. The enhancement is never load-bearing.
        setHistory({ drop: null, points: [] });
      });
    return () => controller.abort();
  }, [planId, provided]);

  const drop = history?.drop ?? null;
  // Honesty gate: render nothing unless there is a real qualifying drop.
  if (!drop) return null;

  const label = dropBadgeLabel(drop);
  const fullLabel = `המחיר ירד ב-₪${
    Number.isInteger(drop.amount) ? drop.amount : drop.amount.toFixed(1)
  } (${drop.pct}%) בשבוע האחרון`;

  const showSpark =
    sparkline && (history?.points?.length ?? 0) >= 2;
  const SPARK_W = 40;
  const SPARK_H = 16;
  const d = showSpark ? sparkPath(history!.points, SPARK_W, SPARK_H) : "";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full bg-value/10 px-2 py-0.5",
        "text-[12px] font-semibold text-value-text",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-label={fullLabel}
      title={fullLabel}
      data-price-drop
    >
      {/* Down-trend caret (decorative — the text carries the meaning). */}
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 1.5v6.2M2.2 5.1 5 8l2.8-2.9" />
      </svg>
      <span>{label}</span>
      {showSpark && d ? (
        <svg
          width={SPARK_W}
          height={SPARK_H}
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          aria-hidden="true"
          className="shrink-0"
          preserveAspectRatio="none"
        >
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        </svg>
      ) : null}
    </span>
  );
}
