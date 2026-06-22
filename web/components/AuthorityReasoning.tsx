// ────────────────────────────────────────────────────────────────────────────
// <AuthorityReasoning> — an editorial "למה זה מומלץ" (why this is recommended)
// reasoning block, structured for LLM / answer-engine extraction. Renders a
// semantic <section> with a heading and an ordered list of explicit, factual
// reasons, wrapped in a <details> so the chain-of-reasoning is both human-
// collapsible and fully present in the DOM for crawlers.
//
// Server component (no state). Renders nothing when given no reasons.
//
// HONESTY (E-E-A-T): the reasons are editorial JUDGEMENT supplied by the caller
// and must be grounded in verifiable catalogue facts (price, commitment, 5G…).
// This block makes the reasoning transparent and labeled — it never fabricates a
// reason or implies an undisclosed sponsorship.
// ────────────────────────────────────────────────────────────────────────────

/** A titled reasoning point (richer form: a bolded title + its explanation). */
export interface ReasoningPoint {
  /** Short label for the reason, rendered bold. */
  title: string;
  /** The factual explanation for this point. */
  reason: string;
}

export interface AuthorityReasoningProps {
  /**
   * Visible heading. Defaults to "למה זה מומלץ". `heading` is an accepted alias
   * for call sites that pass it under that name.
   */
  title?: string;
  /** Alias of `title`. */
  heading?: string;
  /**
   * The ordered reasons. Either a list of plain strings, or a list of titled
   * `{ title, reason }` points — whichever the caller has. Renders nothing when
   * empty / omitted.
   */
  reasons?: string[];
  /** Titled-point form (alias of `reasons`); rendered with a bold title each. */
  points?: ReasoningPoint[];
  /**
   * Optional one-line lead-in shown above the list (e.g. names the subject:
   * "ההמלצה מבוססת על הנתונים הבאים מהקטלוג:").
   */
  lead?: string;
  /** Start the <details> open. Defaults to true so reasoning is visible by default. */
  defaultOpen?: boolean;
  /** DOM id (anchor-/deep-link-able). Defaults to "why-recommended". */
  id?: string;
  /** Optional extra classes on the outer section. */
  className?: string;
}

/** A normalized renderable item: a plain string or a titled point. */
type Item = { title?: string; text: string };

export default function AuthorityReasoning({
  title,
  heading,
  reasons,
  points,
  lead,
  defaultOpen = true,
  id = "why-recommended",
  className,
}: AuthorityReasoningProps) {
  // Normalize the two accepted shapes into a single list of items.
  const items: Item[] = [
    ...(points ?? []).map((p) => ({ title: p.title, text: p.reason })),
    ...(reasons ?? []).map((r) => ({ text: r })),
  ].filter((it) => it.text && it.text.trim().length > 0);

  if (items.length === 0) return null;

  const resolvedTitle = title ?? heading ?? "למה זה מומלץ";
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-authority-reasoning
      className={[
        "rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 marker:hidden">
          <span
            aria-hidden="true"
            className="inline-block h-4 w-1 rounded-full bg-accent"
          />
          <h2
            id={headingId}
            className="font-display text-base font-semibold text-ink"
          >
            {resolvedTitle}
          </h2>
          <span
            aria-hidden="true"
            className="ms-auto text-muted transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>

        {lead ? (
          <p className="mt-3 text-[15px] leading-relaxed text-foreground">
            {lead}
          </p>
        ) : null}

        <ol className="mt-3 list-decimal space-y-2 ps-5 text-[15px] leading-relaxed text-foreground marker:text-accent marker:font-semibold">
          {items.map((item, i) => (
            <li key={i}>
              {item.title ? (
                <>
                  <strong className="font-semibold text-ink">
                    {item.title}
                  </strong>
                  {" — "}
                  {item.text}
                </>
              ) : (
                item.text
              )}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
