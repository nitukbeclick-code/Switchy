// ────────────────────────────────────────────────────────────────────────────
// <SgeSummary> — a semantic, GEO/SGE-friendly conclusion block. Renders a concise
// (40–50 word) FACTUAL summary the caller supplies, in a labelled <section> that
// AI engines (Google SGE, AI Overviews, LLMs) and screen-readers can lift
// verbatim. Server component (no state).
//
// Renamed from <AiSummary> (the back-compat `AiSummary.tsx` alias has been
// retired). Keeps id="ai-summary" by default so the single primary summary per
// page stays anchor-/deep-link-able and back-compatible.
//
// HONESTY: the caller is responsible for passing only truthful, verifiable copy.
// This component adds no claims of its own beyond a neutral "תקציר" heading. To
// keep summaries extractable, the recommended length is 40–50 words; in dev we
// emit a console warning when the text count strays outside ~35–55 words.
// ────────────────────────────────────────────────────────────────────────────

import { isValidElement, type ReactNode } from "react";

export interface SgeSummaryProps {
  /** The factual conclusion (40–50 words). Plain text or inline nodes. */
  children: ReactNode;
  /**
   * Visible heading for the block. Defaults to a neutral Hebrew label.
   * Pass a more specific one (e.g. "השורה התחתונה: מסלולי סלולר") per page.
   */
  heading?: string;
  /**
   * DOM id of the section — defaults to "ai-summary" so a single primary summary
   * per page is anchor-/deep-link-able. Pass a unique id if you render several.
   */
  id?: string;
  /** Optional extra classes for layout tuning by the caller. */
  className?: string;
}

/** Best-effort plain-text extraction from arbitrary inline children. */
function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return extractText(props.children);
  }
  return "";
}

/** Count words in a Hebrew/Latin string (whitespace-delimited tokens). */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export default function SgeSummary({
  children,
  heading = "תקציר",
  id = "ai-summary",
  className,
}: SgeSummaryProps) {
  const headingId = `${id}-heading`;

  // Encourage the 40–50 word target for SGE/LLM extraction (dev-only warning).
  if (process.env.NODE_ENV !== "production") {
    const words = countWords(extractText(children));
    if (words > 0 && (words < 35 || words > 55)) {
      console.warn(
        `[SgeSummary] summary is ${words} words; aim for 40–50 so AI engines ` +
          `can lift it verbatim (id="${id}").`,
      );
    }
  }

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-ai-summary
      data-sge-summary
      className={[
        "bento glow-accent p-6 sm:p-7",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <h2
        id={headingId}
        className="mb-2.5 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-1.5 rounded-full bg-accent"
        />
        {heading}
      </h2>
      <p className="text-[15px] leading-relaxed text-foreground sm:text-base">
        {children}
      </p>
    </section>
  );
}
