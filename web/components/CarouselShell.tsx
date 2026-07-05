"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CarouselShell> — the ONLY client piece of the per-provider carousel. It wraps
// SERVER-rendered cards (passed as `children`) in an accessible horizontal
// scroll-snap track and adds prev/next controls. Because the cards come in as
// children, no fs-bound server component (ProviderLogo → lib/data) leaks into the
// client bundle — this shell imports only React + the pure <Icon>.
//
// ACCESSIBILITY (built to the highest bar):
//  • Native horizontal scroll + CSS scroll-snap → works with touch, trackpad,
//    mouse wheel, AND keyboard (Tab moves focus card-to-card; the browser scrolls
//    the focused card into view).
//  • The <section> is the labelled group (named by the provider heading via
//    aria-labelledby); the track stays an explicit role="list" so screen readers
//    still announce "list, N items" + per-card position (a plain <ul> loses that
//    under Tailwind's list-style:none in Safari, so role="list" is set back).
//  • Prev/next controls are NEVER `disabled` (which would yank keyboard focus to
//    <body> at an end — WCAG 2.4.3): they stay focusable, expose aria-disabled at
//    the ends, and no-op there. 44×44px comfortable touch targets.
//  • RTL-correct: the whole site is dir="rtl", so the first card sits at the RIGHT
//    and scrollLeft runs 0 → −max leftward; the math below is RTL-specific.
//  • prefers-reduced-motion → button scrolls jump instantly (no smooth animation).
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Icon from "@/components/Icon";

export interface CarouselShellProps {
  /** Provider display name — used only for the button aria-labels. */
  provider: string;
  /** id of the visible provider heading — names the group via aria-labelledby. */
  labelId: string;
  /** Server-rendered header (provider identity + count + "all plans" link). */
  header: ReactNode;
  /** Server-rendered <li> cards. */
  children: ReactNode;
}

export default function CarouselShell({
  provider,
  labelId,
  header,
  children,
}: CarouselShellProps) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  // RTL: scrollLeft ∈ [−max, 0]. 0 = start (first card, rightmost); −max = end.
  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setScrollable(max > 4);
    const sl = el.scrollLeft; // ≤ 0 in RTL
    setAtStart(sl >= -4);
    setAtEnd(sl <= -max + 4);
  }, []);

  useEffect(() => {
    sync();
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);

  // dir = +1 → next (advance toward the end: content moves left, scrollLeft ↓);
  // dir = −1 → prev (back toward the start: scrollLeft ↑ toward 0). Guards read
  // the LIVE DOM (no stale closure) and no-op at the ends so focus is never lost.
  const scrollByDir = useCallback((dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const sl = el.scrollLeft;
    if (dir === 1 && sl <= -max + 4) return; // already at end
    if (dir === -1 && sl >= -4) return; // already at start
    const first = el.querySelector<HTMLElement>(":scope > li");
    const step = first ? first.offsetWidth + 12 : Math.max(el.clientWidth * 0.8, 240);
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: -dir * step, behavior: reduce ? "auto" : "smooth" });
  }, []);

  const btnBase =
    "interactive press grid h-11 w-11 place-items-center rounded-full border border-border bg-surface text-ink transition-colors hover:border-accent/50 hover:text-accent-text aria-disabled:cursor-not-allowed aria-disabled:opacity-35 aria-disabled:hover:border-border aria-disabled:hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <section aria-labelledby={labelId} className="mt-4">
      {/* Header row: provider identity (server) + the scroll controls (client). */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        {scrollable && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollByDir(-1)}
              aria-disabled={atStart}
              aria-label={`המסלולים הקודמים של ${provider}`}
              className={btnBase}
            >
              {/* RTL "prev" points to the start = right. */}
              <Icon name="chevron" size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollByDir(1)}
              aria-disabled={atEnd}
              aria-label={`המסלולים הבאים של ${provider}`}
              className={btnBase}
            >
              {/* RTL "next" points to the end = left. */}
              <Icon name="chevron" size={18} aria-hidden="true" className="rotate-180" />
            </button>
          </div>
        )}
      </div>

      {/* The scroll track — an explicit list (role="list" survives Tailwind's
          list-style:none in Safari) so cards keep listitem/position semantics.
          Scrollbar hidden (the peek + buttons are the affordance); still fully
          scrollable by touch, wheel, trackpad, and keyboard. */}
      <ul
        ref={trackRef}
        onScroll={sync}
        role="list"
        className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  );
}
