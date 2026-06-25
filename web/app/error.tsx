"use client"; // Error boundaries must be Client Components.

// ────────────────────────────────────────────────────────────────────────────
// app/error.tsx — the app-wide error boundary.
//
// Wraps every route segment below the root layout in a React Error Boundary.
// When a Server/Client Component throws while rendering a page (or a nested
// segment with no closer error.tsx), this fallback shows instead of a blank
// screen. It does NOT catch errors in the root layout itself — those bubble to
// app/global-error.tsx.
//
// Recovery: Next 16.2 exposes `unstable_retry()` (re-fetches + re-renders the
// failed segment — the right first move for transient failures) and the older
// `reset()` (re-renders without re-fetching). We prefer retry and fall back to
// reset on older runtimes, so the "נסו שוב" button always does something useful.
//
// Honest copy: we say a technical problem occurred (true) and that it may be
// temporary (often true for transient fetch/render failures) — we do NOT promise
// it's fixed. We surface the error `digest` (a non-sensitive hash) so a user can
// quote it to support; we never render the raw error message (it can leak
// internals in production). We log to console for client-side debugging.
//
// Renders BETWEEN the layout's <SiteHeader> and <SiteFooter>, so it owns only the
// <main> region. RTL/Hebrew + dark-mode tokens, focusable heading for a11y.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  // Added in Next 16.2 — optional so the build is safe on older type defs.
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    // Surface for client-side debugging / any future error-reporting hook.
    console.error(error);
  }, [error]);

  // Prefer retry (re-fetch + re-render); fall back to reset (re-render only).
  const recover = () => (unstable_retry ? unstable_retry() : reset());

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6"
    >
      <h1
        tabIndex={-1}
        className="font-display text-2xl font-bold tracking-tight text-ink outline-none sm:text-3xl"
      >
        משהו השתבש
      </h1>

      <p className="mt-4 max-w-lg text-lg leading-relaxed text-foreground">
        נתקלנו בתקלה טכנית בטעינת הדף. לרוב מדובר בבעיה זמנית — שווה לנסות שוב.
        אם זה חוזר, אפשר לחזור לדף הבית או לפנות אלינו.
      </p>

      {/* Actions: retry (green ACTION) + a real fallback link home. */}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={recover}
          className="interactive inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-base font-semibold text-accent-contrast hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-md hover:shadow-accent/25 active:translate-y-0 active:scale-[.98]"
        >
          נסו שוב
        </button>
        <Link
          href="/"
          className="interactive inline-flex items-center justify-center rounded-xl border border-border px-6 py-3 text-base font-semibold text-ink hover:-translate-y-0.5 hover:border-accent hover:text-accent active:translate-y-0"
        >
          חזרה לדף הבית
        </Link>
      </div>

      {/* Non-sensitive error id — lets a user quote it to support; matches
          server-side logs. Only shown when Next attaches a digest. */}
      {error.digest ? (
        <p className="mt-8 text-sm text-muted">
          קוד שגיאה לפנייה לתמיכה:{" "}
          <code className="rounded bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-foreground">
            {error.digest}
          </code>
        </p>
      ) : null}
    </main>
  );
}
