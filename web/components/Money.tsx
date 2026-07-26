// ────────────────────────────────────────────────────────────────────────────
// <Money> — the ONE bidi-safe renderer for ILS price strings on RTL surfaces.
//
// Problem: a bare "₪69" inside a Hebrew (RTL) paragraph can be re-ordered by the
// Unicode bidi algorithm depending on its neighbours, so the ₪ sign flips sides
// between contexts. Fix: render the formatted amount inside a dir="ltr" span —
// the HTML dir attribute creates a first-strong ISOLATE (unicode-bidi: isolate),
// so the sign always sits on the same side of the digits, everywhere.
//
// Server component, presentation-only. Formatting itself stays in lib/format's
// ils() (the single source of the ₪ + rounding rules); this only adds the
// direction isolation. Pages must not hand-roll `₪${n}` in JSX — use <Money>.
// ────────────────────────────────────────────────────────────────────────────

import { ils } from "@/lib/format";

/**
 * Either a raw amount (formatted here by ils(), the rounding single-source) or a
 * PRE-FORMATTED figure string. The second form exists because the catalogue's
 * decimal-preserving helper `priceText()` returns a string — "10.90", not 10.9 —
 * so the highest-value ₪ sites on the site could not use <Money> at all and
 * hand-rolled `₪{str}` instead, losing the bidi isolate. Accepting the string
 * removes that blocker without touching the display contract. The union keeps it
 * honest: exactly one of the two, never both, never neither.
 */
export type MoneyProps = { className?: string } & (
  | { amount: number; text?: never }
  | { text: string; amount?: never }
);

export default function Money({ amount, text, className }: MoneyProps) {
  return (
    <span dir="ltr" className={className}>
      {text === undefined ? ils(amount as number) : `₪${text}`}
    </span>
  );
}
