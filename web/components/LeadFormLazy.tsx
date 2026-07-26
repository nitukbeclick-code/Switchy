"use client";

// ────────────────────────────────────────────────────────────────────────────
// <LeadFormLazy> — a thin "use client" wrapper that defers loading the
// below-the-fold <LeadForm> (react-hook-form) until the client. page.tsx is a
// Server Component and `ssr: false` is NOT allowed there (Next 16), so the
// dynamic import lives here.
//
// CLS-safe: the skeleton reserves the real form's first-render height, so
// swapping in the real form does not shift the page — at the exact moment of the
// ask, a form that grows under the thumb costs a tap.
// ────────────────────────────────────────────────────────────────────────────

import dynamic from "next/dynamic";
import type { LeadFormProps } from "./LeadForm";

/**
 * Placeholder shown while the form chunk loads. It carries the SAME wrapper
 * classes as the real <LeadForm> (`bento p-6 sm:p-7`), so padding, radius,
 * border and shadow match by construction instead of by a hand-copied guess.
 * The blocks mirror step 0's real boxes — heading, trust line, progress, then
 * the two stacked fields (name + phone) and the ≥48px primary button — which is
 * what makes ~30rem the honest reserved height rather than the old 420px.
 */
function LeadFormSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bento min-h-[30rem] animate-pulse p-6 sm:p-7"
    >
      <div className="h-6 w-2/3 rounded bg-border" />
      <div className="mt-2 h-4 w-1/2 rounded bg-border" />
      <div className="mt-5 h-1.5 w-full rounded-full bg-border" />
      <div className="mt-6 h-4 w-1/3 rounded bg-border" />
      <div className="mt-1 h-11 w-full rounded-xl bg-border" />
      <div className="mt-4 h-4 w-1/3 rounded bg-border" />
      <div className="mt-1 h-11 w-full rounded-xl bg-border" />
      <div className="mt-6 h-12 w-full rounded-xl bg-border" />
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
