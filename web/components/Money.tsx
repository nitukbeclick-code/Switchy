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

export interface MoneyProps {
  /** The amount in ILS (rounded by ils()). */
  amount: number;
  /** Optional classes (typography/color) applied to the isolated span. */
  className?: string;
}

export default function Money({ amount, className }: MoneyProps) {
  return (
    <span dir="ltr" className={className}>
      {ils(amount)}
    </span>
  );
}
