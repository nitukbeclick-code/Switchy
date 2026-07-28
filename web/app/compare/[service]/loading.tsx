// ────────────────────────────────────────────────────────────────────────────
// app/compare/[service]/loading.tsx — the category-comparison loading state.
//
// WHY A ROUTE-LEVEL ONE. app/loading.tsx is the app's only loading file and is
// deliberately homepage-shaped. The measure happens to match here (`max-w-5xl`),
// but the CONTENT does not: it draws a hero panel, a savings-hook input and a
// 2×2 category tile grid, none of which exist on a compare page. This page is a
// breadcrumb, an H1 + lede, then the plan comparison TABLE — rows, not tiles.
//
// The skeleton is the first paint, so its biggest block is the LCP candidate.
// Promising a hero panel and delivering a table means the largest element is
// discarded and re-measured on swap.
//
// Also covers /compare/[service]/[city]: a child segment with no loading.tsx of
// its own inherits the nearest ancestor's, and the city page is the same
// table-led layout with one extra city line.
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
      // Identical container to app/compare/[service]/page.tsx.
      className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6"
    >
      <span role="status" className="sr-only">
        טוען…
      </span>

      {/* Breadcrumb. */}
      <Bar className="h-4 w-56 rounded-md" />

      {/* H1 + lede. */}
      <Bar className="mt-6 h-9 w-full max-w-lg rounded-md sm:h-10" />
      <Bar className="mt-3 h-4 w-full max-w-2xl rounded-md" />
      <Bar className="mt-2 h-4 w-4/5 max-w-xl rounded-md" />

      {/* Filter / sort control row. */}
      <div className="mt-5 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bar key={i} className="h-9 w-28 rounded-xl" />
        ))}
      </div>

      {/* The comparison table — this page's real LCP candidate. A header row
          then eight plan rows, full-width, which is the silhouette the homepage
          skeleton's tile grid got wrong. */}
      <div className="mt-8">
        <Bar className="h-6 w-48 rounded-md" />
        <div className="mt-5 overflow-hidden rounded-2xl border border-border/60">
          <Bar className="h-11 w-full" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-t border-border/60 px-4 py-4"
            >
              <Bar className="h-4 w-32 rounded-md" />
              <Bar className="h-4 w-24 rounded-md" />
              <Bar className="ms-auto h-6 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* The first band below the table. */}
      <Bar className="mt-10 h-6 w-56 rounded-md" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
