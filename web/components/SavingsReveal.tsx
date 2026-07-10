"use client";

// ────────────────────────────────────────────────────────────────────────────
// <SavingsReveal> — the signature clip-path before/after on the /bills result.
//
// A genuine, data-honest showpiece: the user scrubs a handle and a green "after"
// layer wipes across the grey "today" layer, revealing — in real ₪ — the gap
// between what they pay now (annual) and what they'd pay on the cheapest real
// plan we surfaced. The wipe is a single `clip-path: inset()` on the after-layer
// (transform/opacity/clip-path only, GPU-cheap, zero layout).
//
// HONESTY (E-E-A-T, ABSOLUTE): every figure is derived from the SAME server read
// already shown above — `currentSpend × 12` (annual today) and that minus the REAL
// headline `annualSaving`. It fabricates NOTHING and adds no number the result
// page didn't already state. It only renders when there is a real positive gap.
//
// INTERACTION (Emil): a clip-path reveal scrubber.
//   • Drag the handle (pointer-capture, so the drag continues off the rail and
//     extra touch points after drag-start are ignored) OR use the keyboard
//     (ArrowLeft/Right, Home/End, PageUp/Down) — it is a real ARIA slider.
//   • The position drives `clip-path: inset()` on the after-layer; the ₪ readout
//     interpolates between today's cost and the post-saving cost as you scrub.
//   • Only clip-path / transform / opacity animate. The committed resting state
//     is fully revealed (the win is the point), so no-JS / SSR shows the saving.
//   • Reduced-motion: the handle still works, but the eased clip transition is
//     dropped — position changes apply instantly (no travel), keeping it usable.
//
// A11y: labelled slider (role="slider" via the input range fallback is avoided in
// favour of an explicit ARIA slider so the visual handle IS the control), an
// aria-live readout of the revealed saving, RTL-correct (the rail reads right→
// left so "more reveal" grows from the start edge), dark via tokens.
// ────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { ils } from "@/lib/format";

export interface SavingsRevealProps {
  /** Current monthly spend read from the bill (₪/month). */
  currentSpend: number;
  /** The REAL headline annual saving (largest real suggestion saving), ₪/year. */
  annualSaving: number;
  /** Optional extra classes on the wrapper. */
  className?: string;
}

export default function SavingsReveal({
  currentSpend,
  annualSaving,
  className,
}: SavingsRevealProps) {
  const annualNow = Math.round(currentSpend * 12);
  const annualAfter = Math.max(0, annualNow - Math.round(annualSaving));

  // Resting state shows the full win (pct = 1). The user can scrub back toward
  // "today" to feel the gap, then release — but the committed/SSR state is the
  // revealed saving, never a hidden number.
  const [pct, setPct] = useState(1);
  const [scrubbing, setScrubbing] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // Guard: only a real positive gap is worth a showpiece. (Parent also gates,
  // but keep the component self-protecting.)
  const hasGap = annualSaving > 0 && annualNow > annualAfter;

  // Interpolated readout: at pct=0 you see today's full cost; at pct=1 you see the
  // post-saving cost. The "saved so far" line interpolates the same way.
  const shownCost = Math.round(annualNow - (annualNow - annualAfter) * pct);
  const shownSaved = annualNow - shownCost;

  // Map a clientX on the rail to a 0..1 reveal fraction. RTL: the rail's start
  // (visually right) edge is "today"; dragging toward the end (left) reveals the
  // saving — so the fraction grows as we move away from the right edge.
  const fractionFromClientX = useCallback((clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return pct;
    const rect = rail.getBoundingClientRect();
    if (rect.width <= 0) return pct;
    // Distance from the RIGHT edge (RTL start), normalized.
    const fromRight = (rect.right - clientX) / rect.width;
    return Math.min(1, Math.max(0, fromRight));
  }, [pct]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!hasGap) return;
      // Ignore secondary buttons.
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const rail = railRef.current;
      // pointer-capture: the drag keeps tracking even off the rail; extra
      // pointers that arrive after capture are ignored by the browser.
      rail?.setPointerCapture?.(e.pointerId);
      setScrubbing(true);
      setPct(fractionFromClientX(e.clientX));
    },
    [hasGap, fractionFromClientX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      setPct(fractionFromClientX(e.clientX));
    },
    [scrubbing, fractionFromClientX],
  );

  const endScrub = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!scrubbing) return;
      railRef.current?.releasePointerCapture?.(e.pointerId);
      setScrubbing(false);
    },
    [scrubbing],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!hasGap) return;
      const step = 0.1;
      let next = pct;
      // RTL-aware: ArrowLeft reveals MORE saving (moves toward the end), ArrowRight
      // moves back toward today — mirroring how the rail reads on screen.
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowUp":
          next = pct + step;
          break;
        case "ArrowRight":
        case "ArrowDown":
          next = pct - step;
          break;
        case "PageUp":
          next = pct + step * 2.5;
          break;
        case "PageDown":
          next = pct - step * 2.5;
          break;
        case "Home":
          // Home = start of rail (today, no reveal).
          next = 0;
          break;
        case "End":
          // End = full reveal (the win).
          next = 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      setPct(Math.min(1, Math.max(0, next)));
    },
    [hasGap, pct],
  );

  // Safety net: if a pointer-capture is lost (e.g. the element unmounts mid-drag),
  // make sure we are not stuck in the scrubbing state on next mount.
  useEffect(() => {
    if (!scrubbing) return;
    const stop = () => setScrubbing(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [scrubbing]);

  if (!hasGap) return null;

  // The after-layer is clipped from the END edge inward: at pct=1 it is fully
  // shown (inset 0), at pct=0 it is fully clipped away. In a RTL flow the logical
  // "end" is the LEFT side, so we inset from the left.
  const clipLeft = `${(1 - pct) * 100}%`;
  // Handle sits at the reveal boundary, measured from the RTL start (right) edge.
  const handleRight = `${pct * 100}%`;
  const pctLabel = Math.round(pct * 100);

  return (
    <section
      aria-label="הדגמת החיסכון — מהיום למסלול הזול ביותר"
      className={["bento p-6", className ?? ""].join(" ").trim()}
    >
      <header>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink">
          כמה תחסכו? גררו לראות
        </h3>
        <p id={labelId} className="mt-1 text-sm leading-relaxed text-muted">
          העלות השנתית שלכם היום מול העלות במסלול הזול ביותר שמצאנו — גררו את
          הידית (או השתמשו במקלדת) כדי לחשוף את הפער.
        </p>
      </header>

      {/* Reduced-motion: keep the control fully usable, but drop the eased
          clip-path / handle-scale travel so position changes apply instantly with
          no animation. Opacity/color easing elsewhere is untouched (the global
          rule already preserves those). Scoped to this component's classes. */}
      <style>{`@media (prefers-reduced-motion: reduce){.sw-reveal-after,.sw-reveal-handle{transition:none !important}}`}</style>

      {/* ── The reveal rail ─────────────────────────────────────────────────── */}
      {/* Two stacked full-width layers; the GREEN "after" layer is clip-path-wiped
          over the grey "today" layer as the handle moves. The rail itself is the
          ARIA slider — the visible handle IS the control (keyboard + pointer). */}
      <div className="mt-5 select-none">
        <div
          ref={railRef}
          role="slider"
          tabIndex={hasGap ? 0 : -1}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pctLabel}
          aria-valuetext={`נחשף ${pctLabel}% מהחיסכון — עלות שנתית ${ils(
            shownCost,
          )}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onKeyDown={onKeyDown}
          className="relative h-24 w-full cursor-ew-resize touch-none overflow-hidden rounded-2xl border border-border/60 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {/* BEFORE layer — "today" (neutral). Sits underneath, always full-width. */}
          <div className="absolute inset-0 flex items-center justify-between gap-3 bg-surface px-5">
            <span className="font-display text-xs font-medium uppercase tracking-wide text-muted">
              היום
            </span>
            <span className="font-display text-xl font-bold tabular-nums text-ink sm:text-2xl">
              {ils(annualNow)}
              <span className="ms-1 align-baseline text-xs font-normal text-muted">
                לשנה
              </span>
            </span>
          </div>

          {/* AFTER layer — "with the cheapest plan" (green win), clip-wiped in.
              Only clip-path animates (eased); reduced-motion drops the transition
              (see the scoped <style> below) so the wipe is instant but still
              controllable. clip-path + its transition live in inline style — the
              value is dynamic and this avoids arbitrary-class build quirks. */}
          <div
            aria-hidden="true"
            className="sw-reveal-after absolute inset-0 flex items-center justify-between gap-3 bg-accent/12 px-5"
            style={{
              clipPath: `inset(0 ${clipLeft} 0 0)`,
              transition: "clip-path 120ms var(--ease-out)",
            }}
          >
            <span className="font-display text-xs font-medium uppercase tracking-wide text-accent-text">
              במסלול הזול
            </span>
            <span className="font-display text-xl font-bold tabular-nums text-ink sm:text-2xl">
              {ils(annualAfter)}
              <span className="ms-1 align-baseline text-xs font-normal text-muted">
                לשנה
              </span>
            </span>
          </div>

          {/* The handle — sits on the reveal boundary. Scales slightly while
              scrubbing for tactile feedback (transform only). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 z-10 flex w-0 items-center justify-center"
            style={{ insetInlineEnd: handleRight }}
          >
            <span className="absolute top-0 bottom-0 w-0.5 bg-accent/70" />
            <span
              className="sw-reveal-handle relative flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-background text-accent-text shadow-sm"
              style={{
                transform: scrubbing ? "scale(1.1)" : "scale(1)",
                transition: "transform 120ms var(--ease-out)",
              }}
            >
              {/* Decorative ⇄ glyph hinting the drag affordance. */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 7 4 11l4 4" />
                <path d="M16 7l4 4-4 4" />
                <path d="M4 11h16" />
              </svg>
            </span>
          </div>
        </div>

        {/* ── Live readout — the revealed saving so far (announced). ─────────── */}
        <p
          aria-live="polite"
          className="mt-4 text-center text-sm leading-relaxed text-foreground"
        >
          חוסכים עד{" "}
          <strong className="text-value-text tabular-nums">
            {ils(shownSaved)}
          </strong>{" "}
          בשנה
          <span className="text-muted">
            {" "}
            ({pctLabel}% מהפער נחשף)
          </span>
        </p>
      </div>
    </section>
  );
}
