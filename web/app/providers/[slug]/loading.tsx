// ────────────────────────────────────────────────────────────────────────────
// app/providers/[slug]/loading.tsx — the provider-page loading state.
//
// WHY A ROUTE-LEVEL ONE. app/loading.tsx is the app's only loading file and is
// deliberately homepage-shaped. The measure matches here (`max-w-5xl`), the
// content does not: a provider page opens with a logo + name row and a summary
// paragraph, then the provider's plan list — not a hero panel, a savings-hook
// field and a 2×2 category tile grid.
//
// The skeleton is the first paint, so its largest block is the LCP candidate;
// drawing a hero the real page never renders means that candidate is thrown away
// on swap.
//
// Server Component: ships zero JS. a11y mirrors app/loading.tsx.
// ────────────────────────────────────────────────────────────────────────────

/** Decorative skeleton bar; caller owns the radius. Same contract as the Bar in
 *  app/loading.tsx. */
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
      // Identical container to app/providers/[slug]/page.tsx.
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6"
    >
      <span role="status" className="sr-only">
        טוען…
      </span>

      {/* Breadcrumb. */}
      <Bar className="h-4 w-56 rounded-md" />

      {/* Logo tile + provider name — the `flex items-start gap-4` identity row. */}
      <div className="mt-6 flex items-start gap-4">
        <Bar className="h-16 w-16 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1">
          <Bar className="h-9 w-full max-w-xs rounded-md sm:h-10" />
          <Bar className="mt-2 h-4 w-40 rounded-md" />
        </div>
      </div>

      {/* Summary paragraph (text-lg, max-w-2xl). */}
      <Bar className="mt-4 h-5 w-full max-w-2xl rounded-md" />
      <Bar className="mt-2 h-5 w-full max-w-xl rounded-md" />
      <Bar className="mt-2 h-5 w-3/5 max-w-lg rounded-md" />

      {/* Stat / capability strip. */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-2 px-4 py-4">
            <Bar className="h-4 w-16 rounded-md" />
            <Bar className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>

      {/* The provider's plan list — rows, the page's real body. */}
      <Bar className="mt-14 h-6 w-48 rounded-md" />
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="card flex items-center gap-4 px-5 py-4"
          >
            <div className="min-w-0 flex-1">
              <Bar className="h-5 w-2/5 rounded-md" />
              <Bar className="mt-2 h-4 w-3/5 rounded-md" />
            </div>
            <Bar className="h-7 w-20 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </main>
  );
}
