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
// --border, --surface). It mirrors the silhouette of the route people actually
// land on — the homepage: the same `max-w-5xl` / `px-4 pt-6 pb-20` measure, a
// rounded hero panel (eyebrow → two H1 lines → counts row → the savings-hook
// field), a 2×2 launcher tile grid and the closing CTA. That matters for more
// than polish: the skeleton is the first paint, so a generic `max-w-3xl` article
// shape made the LCP candidate a block the real hero then replaced wholesale.
// The pulse uses Tailwind `animate-pulse`, which the global prefers-reduced-motion
// rule in globals.css already neutralizes (animations forced to ~0ms), so it's
// accessible by default.
//
// a11y: an aria-busy region with an sr-only "טוען…" label + aria-hidden bars, so
// screen readers hear a single, honest "loading" announcement rather than a wall
// of empty boxes.
// ────────────────────────────────────────────────────────────────────────────

/**
 * A single neutral skeleton bar. Decorative — hidden from the a11y tree. The
 * caller owns the radius (no default): a hero tile and a pill are the same bar
 * at different corner radii, and two competing rounded-* utilities in the same
 * Tailwind layer would resolve by stylesheet order, not by intent.
 */
function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-foreground/[0.08] ${className}`}
    />
  );
}

export default function Loading() {
  return (
    <main
      id="main"
      aria-busy="true"
      className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-20 sm:px-6 sm:pt-10"
    >
      {/* One honest, audible status for assistive tech. */}
      <span role="status" className="sr-only">
        טוען…
      </span>

      {/* Hero panel — same rounded-3xl surface, padding and inner rhythm as the
          real fold, so the swap moves as little as possible. */}
      <div className="rounded-3xl border border-border/60 bg-surface px-5 py-7 sm:px-10 sm:py-14">
        {/* Eyebrow pill. */}
        <Bar className="h-6 w-44 rounded-full" />
        {/* H1 (two lines at the mobile 2rem/1.15 tier). */}
        <Bar className="mt-4 h-9 w-full max-w-lg rounded-md" />
        <Bar className="mt-2 h-9 w-4/5 max-w-md rounded-md" />
        {/* Counts row. */}
        <Bar className="mt-3 h-4 w-3/4 max-w-sm rounded-md" />
        {/* The savings-hook field (label + min-h-12 input + button). */}
        <Bar className="mt-6 h-4 w-56 rounded-md" />
        <Bar className="mt-2 h-12 w-64 rounded-xl" />
        {/* Launcher prompt + the 2×2 (4-up from sm) category tile grid. */}
        <Bar className="mt-8 h-6 w-40 rounded-md" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-32 rounded-3xl sm:h-36" />
          ))}
        </div>
        {/* Closing primary CTA. */}
        <Bar className="mt-6 h-13 w-56 rounded-xl" />
      </div>

      {/* The first band under the fold — the cheapest-plans proof block. */}
      <Bar className="mt-12 h-7 w-64 rounded-md" />
      <Bar className="mt-3 h-4 w-full max-w-xl rounded-md" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-3 px-5 py-5">
            <Bar className="h-5 w-2/3 rounded-md" />
            <Bar className="h-4 w-full rounded-md" />
            <Bar className="h-4 w-4/5 rounded-md" />
          </div>
        ))}
      </div>
    </main>
  );
}
