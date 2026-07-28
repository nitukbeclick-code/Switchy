// ────────────────────────────────────────────────────────────────────────────
// app/plans/[id]/loading.tsx — the plan-detail loading state.
//
// WHY A ROUTE-LEVEL ONE. app/loading.tsx is the only loading file in the app and
// it is deliberately homepage-shaped ("it mirrors the silhouette of the route
// people actually land on — the homepage"). That is right for the homepage and
// wrong here, in two measurable ways:
//
//   • measure — the homepage skeleton is `max-w-5xl pt-6 pb-20`; this page is
//     `max-w-3xl py-10`. The skeleton was two container sizes wider than the
//     page replacing it, so the whole column jumped inward on swap.
//   • content — it draws a hero panel, a savings-hook field and a 2×2 category
//     tile grid. A plan page has none of those. Its first screen is a
//     breadcrumb, a provider link + H1, ONE big price figure, then perk/terms
//     sections.
//
// Since the skeleton is the first paint, its largest block is the LCP candidate.
// A hero panel that the real page then replaces wholesale is the exact failure
// the app-wide file's own comment warns about — inherited by the money route.
//
// Server Component (no "use client"): ships zero JS. Reached on client-side
// navigation into a plan (the common path is /compare → a plan row) while the
// segment's RSC payload streams.
//
// a11y: mirrors app/loading.tsx — one honest role="status" announcement, every
// decorative bar aria-hidden. `animate-pulse` is already neutralised by the
// global prefers-reduced-motion rule in globals.css.
// ────────────────────────────────────────────────────────────────────────────

/** A single neutral skeleton bar. Decorative, so hidden from the a11y tree. The
 *  caller owns the radius — same contract as the Bar in app/loading.tsx. */
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
      // Identical container to app/plans/[id]/page.tsx — the swap must not move
      // the column.
      className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6"
    >
      <span role="status" className="sr-only">
        טוען…
      </span>

      {/* Breadcrumb: בית / מחירון / <plan>. */}
      <Bar className="h-4 w-64 rounded-md" />

      {/* Provider link + H1 (text-3xl/sm:text-4xl) + category line. */}
      <Bar className="mt-6 h-4 w-28 rounded-md" />
      <Bar className="mt-2 h-9 w-full max-w-md rounded-md sm:h-10" />
      <Bar className="mt-2 h-4 w-24 rounded-md" />

      {/* The price row — the page's largest type and its real LCP candidate:
          one text-4xl figure, its unit suffix, then the saving note. */}
      <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
        <Bar className="h-10 w-36 rounded-md" />
        <Bar className="mb-1 h-4 w-20 rounded-md" />
      </div>

      {/* Badge pills (commitment / after-promo / tags). */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bar key={i} className="h-6 w-24 rounded-full" />
        ))}
      </div>

      {/* Primary CTA. */}
      <Bar className="mt-6 h-12 w-full max-w-xs rounded-xl" />

      {/* The 2-up spec grid. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex flex-col gap-2 px-5 py-4">
            <Bar className="h-4 w-24 rounded-md" />
            <Bar className="h-5 w-32 rounded-md" />
          </div>
        ))}
      </div>

      {/* Perks / terms sections: an H2 then a few lines each. */}
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="mt-8">
          <Bar className="h-6 w-40 rounded-md" />
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Bar key={i} className="h-4 w-full max-w-lg rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
