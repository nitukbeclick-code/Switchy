// ────────────────────────────────────────────────────────────────────────────
// <PlanSpecGrid> — the at-a-glance specs grid for the plan detail page. A clean
// 2-column grid of the plan's headline specs (נפח / מהירות / דקות / SMS / תוקף /
// חו״ל), the web counterpart of the Flutter detail's spec rows
// (lib/pages/plan_detail/plan_detail_widget.dart). Where PlanFeesBreakdown covers
// the one-time costs, this covers WHAT YOU GET — the recurring allowance.
//
// PRESENTATIONAL + TRUTH-ONLY: it renders exactly the `specs` rows it is handed
// (each already a real `{label, value}` derived from the catalogue via
// `spec()` / `planFieldsForCategory` in lib/plan-display). It fabricates nothing,
// and returns `null` when there are no specs so the page never shows an empty box.
//
// App tokens (surface / ink / muted / border), RTL by default, AA contrast, and
// NO animation. Server-renderable (no client hooks).
// ────────────────────────────────────────────────────────────────────────────

/** One labelled spec cell, e.g. `{ label: "נפח", value: "1500GB" }`. */
export interface PlanSpec {
  /** The Hebrew spec label, e.g. "נפח" / "מהירות" / "דקות" / "SMS" / "תוקף". */
  label: string;
  /** The non-empty display value, e.g. "1500GB" / "עד 300Mb" / "ללא הגבלה". */
  value: string;
}

export interface PlanSpecGridProps {
  /** The real spec cells to show. Empty → renders nothing. */
  specs: PlanSpec[];
  /** Optional extra classes on the outer card. */
  className?: string;
}

/**
 * Renders the plan's specs as a responsive 2-column grid (single column on the
 * narrowest phones, two from `xs`/`sm` up). Returns `null` when `specs` is empty
 * so the detail page omits the block entirely — the "omit absent" truth rule.
 */
export function PlanSpecGrid({ specs, className }: PlanSpecGridProps) {
  if (!specs || specs.length === 0) return null;

  return (
    <section
      dir="rtl"
      aria-label="מפרט המסלול"
      className={[
        "rounded-2xl border border-border/60 bg-surface p-4 elevate-card sm:p-5",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h3 className="font-display text-sm font-semibold tracking-tight text-ink">
        מפרט המסלול
      </h3>

      <dl className="mt-3 grid grid-cols-2 gap-2.5">
        {specs.map((s, i) => (
          <div
            key={`${s.label}-${i}`}
            className="flex flex-col rounded-xl border border-border/60 bg-background px-3 py-2.5"
          >
            <dt className="text-[12px] font-medium leading-tight text-muted">
              {s.label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold leading-tight text-foreground">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default PlanSpecGrid;
