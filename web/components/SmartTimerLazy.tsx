"use client";

// ────────────────────────────────────────────────────────────────────────────
// <SmartTimerLazy> — defers the below-the-fold <SmartTimer> contract calculator
// to the client. As with <LeadFormLazy>, `ssr: false` must live in a Client
// Component (page.tsx is a Server Component in Next 16).
//
// CLS-safe: the skeleton reserves the calculator's collapsed height (heading +
// two inputs, before any result is computed), so no shift on hydration. That is
// ~18rem on a single-column mobile layout — the two date/length fields STACK
// there (`sm:grid-cols-2` only splits them from the sm breakpoint up), which the
// old 230px reservation missed by a full field, guaranteeing a shift on the
// narrow viewport that matters most.
// ────────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import type { SmartTimerProps } from "./SmartTimer";

/** Fixed-height placeholder for the timer's pre-result (collapsed) state. */
function SmartTimerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="min-h-72 animate-pulse rounded-2xl border border-border bg-surface p-5 shadow-sm sm:min-h-64 sm:p-6"
    >
      <div className="h-5 w-1/2 rounded bg-border" />
      <div className="mt-3 h-4 w-3/4 rounded bg-border" />
      {/* Each block is one label + input pair (~4.5rem), stacked on mobile and
          side-by-side from sm — mirroring the real field grid exactly. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="h-18 rounded-lg bg-border" />
        <div className="h-18 rounded-lg bg-border" />
      </div>
    </div>
  );
}

const SmartTimer = dynamic(() => import("./SmartTimer"), {
  ssr: false,
  loading: () => <SmartTimerSkeleton />,
});

export default function SmartTimerLazy(props: SmartTimerProps) {
  return <SmartTimer {...props} />;
}
