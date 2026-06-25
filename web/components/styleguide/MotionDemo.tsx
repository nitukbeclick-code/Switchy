"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MotionDemo> — a LIVE, replayable demonstration of the brand motion system,
// driven entirely by the REAL CSS tokens (--ease-out / --ease-in-out /
// --ease-drawer + the --duration-* scale). Nothing here hardcodes a bézier or a
// millisecond value: every animated swatch reads its timing from a CSS variable
// via inline style, so this demo can never drift from globals.css.
//
// Used only by the internal /design styleguide. Client component because the
// "Replay" button re-triggers the transition by toggling state. Honors
// prefers-reduced-motion (the swatches still move to their end-state, just with
// the globals.css reduced-motion rules collapsing transform travel).
// ────────────────────────────────────────────────────────────────────────────

import { useState } from "react";

/** The real easing tokens — name + the CSS var the demo binds to. */
const EASINGS: { token: string; label: string; note: string }[] = [
  {
    token: "--ease-out",
    label: "ease-out",
    note: "כניסה / התיישבות — רוב ה-UI",
  },
  {
    token: "--ease-in-out",
    label: "ease-in-out",
    note: "תנועה סימטרית",
  },
  {
    token: "--ease-drawer",
    label: "ease-drawer",
    note: "מגירות / גיליונות תחתונים",
  },
];

export default function MotionDemo() {
  // Toggling this key re-mounts the track so the transition replays from start.
  const [playing, setPlaying] = useState(false);

  return (
    <div className="card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          כל פס נע לאורך אותו מרחק; ההבדל הוא ה-easing בלבד. משך:{" "}
          <code className="rounded bg-border/60 px-1.5 py-0.5 font-mono text-[0.8em] text-ink">
            var(--duration-modal)
          </code>
        </p>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="interactive press inline-flex items-center justify-center rounded-md border border-accent/40 bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {playing ? "אפס" : "הפעל אנימציה"}
        </button>
      </div>

      <div className="mt-6 space-y-5">
        {EASINGS.map((e) => (
          <div key={e.token}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <code className="font-mono text-sm font-semibold text-accent-text">
                {e.label}
              </code>
              <span className="text-xs text-muted">{e.note}</span>
            </div>
            {/* Track: the dot translates start→end on play, using the real
                easing token + the real modal duration. The logical inset-inline
                keeps it RTL-correct (starts at the inline-start edge). */}
            <div className="relative h-9 overflow-hidden rounded-full border border-border bg-background">
              <span
                aria-hidden="true"
                className="absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-accent shadow-[var(--glow-accent)]"
                style={{
                  insetInlineStart: playing ? "calc(100% - 1.5rem - 0.375rem)" : "0.375rem",
                  transitionProperty: "inset-inline-start",
                  transitionDuration: "var(--duration-modal)",
                  transitionTimingFunction: `var(${e.token})`,
                }}
              />
            </div>
            <code className="mt-1 block font-mono text-[0.7rem] text-muted">
              var({e.token})
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}
