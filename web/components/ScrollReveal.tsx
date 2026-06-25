"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ScrollReveal> — the SIGNATURE Emil "scroll-into-view" reveal, as a tiny
// progressive-enhancement wrapper. Sections / cards / images fade in + rise
// 8px (transform + opacity ONLY) the first time they enter the viewport.
//
// MOTION (Emil Kowalski):
//   • PURPOSE: orient the eye to content as it scrolls in — an occasional,
//     once-per-element event (standard tier), never a high-frequency loop.
//   • EASING: enter is ease-out (var(--ease-out) = cubic-bezier(0.23,1,0.32,1)).
//   • PROPS: only opacity (0→1) + transform translateY(8px→0). Zero layout / size
//     animation → zero CLS. Compositor-only.
//   • STAGGER: when several items reveal together, pass `index` — delay sits in
//     Emil's 30–80ms band (60ms/step), capped so long lists don't drift.
//   • { once: true }: we disconnect after the first reveal — no idle re-fire.
//   • REDUCED MOTION: we KEEP content visible and simply DON'T arm the reveal,
//     so there is no transform travel (drop transform, keep the content).
//
// SEO / NO-JS / CRAWLER SAFETY (ABSOLUTE):
//   The element renders at its RESTING, fully-visible state by default. The
//   pre-reveal (dimmed + offset) state is applied ONLY on the client, after
//   mount, and ONLY when IntersectionObserver exists and motion is allowed — so
//   server HTML, no-JS, and crawlers always see the content. The reveal is pure
//   progressive enhancement; it can never hide content from a bot or a user
//   without JS.
// ────────────────────────────────────────────────────────────────────────────

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

export interface ScrollRevealProps {
  children: ReactNode;
  /**
   * Position within a group that reveals together — drives the stagger delay
   * (60ms/step, Emil's 30–80ms band), capped at 8 steps so long lists settle.
   */
  index?: number;
  /** The rendered element. Defaults to a <div>; pass "li" / "section" to wrap. */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /**
   * Vertical travel distance in px (transform only). Default 8 (Emil's reveal).
   * Honour layout: this never changes the box, only the painted position.
   */
  distance?: number;
}

const STAGGER_STEP_MS = 60; // within Emil's 30–80ms reveal band
const STAGGER_CAP = 8; // beyond this, items share the last step (no drift)
const REVEAL_MS = 420; // matches the global .reveal duration for one vocabulary

export default function ScrollReveal({
  children,
  index = 0,
  as,
  className,
  style,
  distance = 8,
}: ScrollRevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement | null>(null);

  // `armed` = the pre-reveal (dimmed + offset) state. It starts FALSE so the
  // first (SSR + hydration) paint is the fully-visible resting state — content
  // is never hidden for no-JS / crawlers. We only arm after confirming the
  // browser supports IntersectionObserver and the user allows motion.
  const [armed, setArmed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Capability + preference gate. If either fails, leave the content visible
    // and un-animated (reduced-motion: keep opacity, drop transform → no arm).
    if (typeof IntersectionObserver === "undefined") return;
    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    // If the element is ALREADY in view on mount (above-the-fold), don't dip it
    // to hidden first — that would flash. Arm only elements that are still below
    // the fold, so they animate as the user scrolls to them.
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const alreadyInView = rect.top < vh * 0.9 && rect.bottom > 0;
    if (alreadyInView) return;

    setArmed(true);

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setRevealed(true);
          io.disconnect(); // { once: true } — no idle re-fire.
        }
      },
      // Trigger a touch before the element is fully on-screen so the rise lands
      // as it settles into view, not after it's already parked.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const delayMs = Math.min(index, STAGGER_CAP) * STAGGER_STEP_MS;

  // When not armed (default / reduced-motion / no-IO / above-fold) we emit NO
  // transform or opacity overrides → the element keeps its natural visible state.
  const motionStyle: CSSProperties = armed
    ? {
        opacity: revealed ? 1 : 0,
        transform: revealed ? "translateY(0)" : `translateY(${distance}px)`,
        transition: `opacity ${REVEAL_MS}ms var(--ease-out) ${delayMs}ms, transform ${REVEAL_MS}ms var(--ease-out) ${delayMs}ms`,
        // Only paint props animate → promote to its own layer, zero layout cost.
        willChange: revealed ? undefined : "opacity, transform",
      }
    : {};

  return (
    <Tag ref={ref} className={className} style={{ ...style, ...motionStyle }}>
      {children}
    </Tag>
  );
}
