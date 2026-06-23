// ────────────────────────────────────────────────────────────────────────────
// app/loading.tsx — the app-wide instant loading state.
//
// Shown immediately on navigation while a route segment's server content streams
// in (React Suspense fallback). Server Component (no 'use client'): it ships zero
// JS — it's a static skeleton swapped out the moment the real page is ready.
//
// Renders BETWEEN the layout's <SiteHeader> and <SiteFooter>, so it only owns the
// <main> region — the masthead + footer stay visible/interactive during load.
//
// Design: a neutral, content-shaped skeleton built from existing tokens (.card,
// --border, --surface). It mirrors the common page silhouette (breadcrumb → H1 →
// intro → a small card grid) so the swap to real content is low-jank. The pulse
// uses Tailwind `animate-pulse`, which the global prefers-reduced-motion rule in
// globals.css already neutralizes (animations forced to ~0ms), so it's
// accessible by default.
//
// a11y: an aria-busy region with an sr-only "טוען…" label + aria-hidden bars, so
// screen readers hear a single, honest "loading" announcement rather than a wall
// of empty boxes.
// ────────────────────────────────────────────────────────────────────────────

/** A single neutral skeleton bar. Decorative — hidden from the a11y tree. */
function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-foreground/[0.08] ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <main
      id="main"
      aria-busy="true"
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6"
    >
      {/* One honest, audible status for assistive tech. */}
      <span role="status" className="sr-only">
        טוען…
      </span>

      {/* Breadcrumb line. */}
      <Bar className="h-4 w-40" />

      {/* H1. */}
      <Bar className="mt-6 h-9 w-3/4 max-w-md" />

      {/* Intro paragraph (two lines). */}
      <Bar className="mt-5 h-4 w-full max-w-2xl" />
      <Bar className="mt-3 h-4 w-5/6 max-w-xl" />

      {/* A small card grid — mirrors the common content silhouette. */}
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-3 px-5 py-5">
            <Bar className="h-5 w-2/3" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </main>
  );
}
