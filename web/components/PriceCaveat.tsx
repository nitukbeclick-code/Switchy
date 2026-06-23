// ────────────────────────────────────────────────────────────────────────────
// <PriceCaveat> — Consumer Protection Law §17 price-accuracy caveat.
//
// A short, visible note placed near comparison prices/tables: prices are VAT-
// inclusive, accurate as of the update date, and should be verified with the
// provider before signing. Copy lives in lib/legal.ts (single source of truth,
// unit-tested). Server component — no client state.
//
// Prices in the catalogue are already presented VAT-inclusive; this caveat makes
// that explicit and sets honest expectations about freshness + verification.
// ────────────────────────────────────────────────────────────────────────────

import { PRICE_ACCURACY_CAVEAT } from "@/lib/legal";

export interface PriceCaveatProps {
  /** Optional extra classes on the wrapper. */
  className?: string;
}

export default function PriceCaveat({ className }: PriceCaveatProps) {
  return (
    <p
      className={["text-xs leading-relaxed text-muted", className ?? ""]
        .join(" ")
        .trim()}
    >
      <span aria-hidden="true">ℹ️ </span>
      {PRICE_ACCURACY_CAVEAT}
    </p>
  );
}
