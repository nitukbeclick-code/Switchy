"use client";

// ────────────────────────────────────────────────────────────────────────────
// <SmartTimerLazy> — defers the below-the-fold <SmartTimer> contract calculator
// to the client. As with <LeadFormLazy>, `ssr: false` must live in a Client
// Component (page.tsx is a Server Component in Next 16).
//
// CLS-safe: the skeleton reserves the calculator's collapsed height (heading +
// two inputs, before any result is computed), so no shift on hydration.
// ────────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import type { SmartTimerProps } from "./SmartTimer";

/** Fixed-height placeholder for the timer's pre-result (collapsed) state. */
function SmartTimerSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[230px] animate-pulse rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="h-5 w-1/2 rounded bg-border" />
      <div className="mt-3 h-4 w-3/4 rounded bg-border" />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="h-16 rounded-lg bg-border" />
        <div className="h-16 rounded-lg bg-border" />
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
