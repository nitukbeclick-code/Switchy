"use client";

// ────────────────────────────────────────────────────────────────────────────
// <LeadFormLazy> — a thin "use client" wrapper that defers loading the
// below-the-fold <LeadForm> (react-hook-form) until the client. page.tsx is a
// Server Component and `ssr: false` is NOT allowed there (Next 16), so the
// dynamic import lives here.
//
// CLS-safe: the skeleton reserves a fixed min-height matching the form's first
// step, so swapping in the real form does not shift the page.
// ────────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import type { LeadFormProps } from "./LeadForm";

/** Fixed-height placeholder shown while the form chunk loads (no layout shift). */
function LeadFormSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="min-h-[420px] animate-pulse rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      <div className="h-6 w-2/3 rounded bg-border" />
      <div className="mt-5 h-1.5 w-full rounded-full bg-border" />
      <div className="mt-6 h-4 w-1/3 rounded bg-border" />
      <div className="mt-2 h-11 w-full rounded-xl bg-border" />
      <div className="mt-6 h-11 w-full rounded-xl bg-border" />
    </div>
  );
}

const LeadForm = dynamic(() => import("./LeadForm"), {
  ssr: false,
  loading: () => <LeadFormSkeleton />,
});

export default function LeadFormLazy(props: LeadFormProps) {
  return <LeadForm {...props} />;
}
