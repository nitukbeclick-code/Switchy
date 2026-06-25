// ────────────────────────────────────────────────────────────────────────────
// <AeoQA> — the conversational Q&A block (AEO pillar 5). Renders an H2 + a list
// of question/answer pairs, each answer in a real <blockquote> so AI engines and
// screen-readers parse the structure cleanly. Server component (no state), in the
// INITIAL SSR/ISR HTML so scrapers read it instantly.
//
// Pairs with `faqPageSchema(...)`: pass the SAME `questions` (from lib/aeo
// `pageQuestions(...)`) into both this component and the FAQPage JSON-LD so the
// visible Q&A and the structured data always match.
//
// HONESTY: every answer is data-derived (it names a real plan + price + provider
// produced by `pageQuestions`). This component renders only what it is handed; it
// invents nothing. Empty `questions` → renders nothing.
// ────────────────────────────────────────────────────────────────────────────

import type { AeoQuestion } from "@/lib/aeo";

export interface AeoQAProps {
  /** The Q&A pairs (from `pageQuestions`). Empty → no render. */
  questions: AeoQuestion[];
  /** Visible heading. Defaults to a neutral Hebrew label. */
  heading?: string;
  /** DOM id — defaults to "aeo-qa" (anchor-/deep-link-able). */
  id?: string;
  /** Optional extra classes. */
  className?: string;
}

export default function AeoQA({
  questions,
  heading = "שאלות נפוצות",
  id = "aeo-qa",
  className,
}: AeoQAProps) {
  if (!questions || questions.length === 0) return null;
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-aeo-qa
      className={["bento p-6 sm:p-7", className ?? ""].join(" ").trim()}
    >
      <h2
        id={headingId}
        className="mb-4 flex items-center gap-2.5 font-display text-base font-semibold tracking-tight text-ink"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-1.5 rounded-full bg-accent"
        />
        {heading}
      </h2>

      <dl className="flex flex-col gap-5">
        {questions.map((qa, i) => (
          <div key={`${id}-${i}`} data-aeo-qa-item>
            <dt className="text-[15px] font-semibold text-foreground sm:text-base">
              {qa.question}
            </dt>
            <dd className="mt-1.5">
              <blockquote className="border-s-2 border-accent/60 ps-3 text-[15px] leading-relaxed text-foreground">
                {qa.answer}
              </blockquote>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
