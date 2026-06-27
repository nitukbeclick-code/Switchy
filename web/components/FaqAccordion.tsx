// ────────────────────────────────────────────────────────────────────────────
// <FaqAccordion> — the shared, accessible FAQ accordion (reused by /faq and the
// homepage). MOBILE-FIRST, RTL-native, and PRESENTATIONAL: it imports no data and
// invents nothing — it renders exactly the question/answer pairs it is handed.
//
// MECHANISM: native <details>/<summary> so it works with zero JS (open/close in
// the SSR/ISR HTML, keyboard- and screen-reader-correct out of the box, each
// answer parseable by AI engines). The summary is the toggle; the chevron is
// aria-hidden decoration. The native disclosure is the single source of truth for
// open state — no client JS, no hydration cost.
//
// MOTION (Emil rules): on open, the answer panel runs the app's canonical enter —
// opacity:0 + translateY(6px) → settled — driven by @starting-style (Tailwind's
// `starting:` variant), the SAME no-JS path as `.popover` in globals.css. The
// chevron rotates with `group-open:`. Only `transform`/`opacity` animate, on
// `--ease-out`, <250ms, and both collapse to instant under prefers-reduced-motion
// (the global reduce rule strips transform; `motion-reduce:` drops the rest).
// Never scale(0): the enter starts at translateY(6px), so no infinitesimal flash.
//
// HONESTY: no figures, ratings, or testimonials live here — answers are passed in
// from real copy. Empty `items` → renders nothing.
// ────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";

export interface FaqItem {
  /** The question (visible in the <summary>, the click/keyboard toggle). */
  q: string;
  /** The answer. Plain string, or rich nodes when the caller needs links/emphasis. */
  a: ReactNode;
}

export interface FaqAccordionProps {
  /** The Q&A pairs to render, in display order. Empty → no render. */
  items: FaqItem[];
  /** Optional extra classes on the outer list wrapper. */
  className?: string;
}

/**
 * A chevron that rotates 180° when its parent <details> is open. Decorative
 * (aria-hidden) — the open/closed state is already conveyed natively by <details>
 * to assistive tech. Only `transform` animates, on the brand ease, <250ms.
 */
function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-180 motion-reduce:transition-none"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FaqAccordion({ items, className }: FaqAccordionProps) {
  if (!items || items.length === 0) return null;

  return (
    <ul className={["flex flex-col gap-3", className ?? ""].join(" ").trim()}>
      {items.map((item, i) => (
        <li key={i}>
          <details className="group bento overflow-hidden">
            {/* The toggle. `list-none` + marker:hidden removes the native triangle
                so our own chevron is the only affordance. The whole row is the
                hit target (mobile-first); focus-visible draws an AA outline. */}
            <summary
              className="interactive flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-start marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-6 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink"
            >
              <span className="font-display text-[15px] font-semibold tracking-tight text-ink sm:text-base">
                {item.q}
              </span>
              <Chevron />
            </summary>

            {/* The answer panel. It only mounts when the <details> is open, so we
                animate its ENTER: it starts at opacity:0 + translateY(6px) (via
                @starting-style → Tailwind `starting:`) and settles on the brand
                ease. transform/opacity only; instant under reduced-motion. */}
            <div className="px-5 pb-5 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] starting:translate-y-1.5 starting:opacity-0 sm:px-6 sm:pb-6 motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
              <p className="text-[15px] leading-relaxed text-foreground">
                {item.a}
              </p>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

export default FaqAccordion;
