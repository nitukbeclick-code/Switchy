// ────────────────────────────────────────────────────────────────────────────
// <HowItWorks> — the "איך זה עובד" 3-step visual.
//
// Mirrors the static home "how" section / how-it-works.html: three numbered step
// cards that walk the user from comparison → choice → a consent-only switch. It
// is the shared explainer reused by BOTH the homepage and the /how-it-works page,
// so the copy/structure stay in ONE place and can't drift between the two.
//
// HONESTY (TRUTH-ONLY): this is a process explainer, not a data surface. It
// renders NO prices, NO counts, NO ratings, NO testimonials — nothing that could
// fabricate a figure. The only claims here are the service's real, verifiable
// promises: the comparison is free, there's no commitment, and we contact a
// provider in your name ONLY after you leave details and approve it in the form
// (the §7b consent model). Pricing / commission disclosures belong next to the
// figures + lead hand-off on the consuming page, not on this steps strip.
//
// Server component — pure presentation from props, no client state. Default
// `steps` are the canonical three; a caller may pass its own to retitle/reorder.
//
// Motion (Emil rules): each card composes the global `.sw-reveal` entrance
// (opacity + translateY only, GPU) with an inline `animationDelay` stagger inside
// the 30–80ms band. `.card` carries the resting surface; `.sw-lift` adds the
// desktop-only hover-lift (gated on a fine pointer in globals.css). Under
// prefers-reduced-motion the reveal/lift collapse globally, so cards render
// statically at their fully visible resting state — content is never hidden.
//
// RTL/a11y: the document direction is already RTL, so the inline flow + the
// ms-/pe- logical utilities mirror correctly. The step number is decorative
// (aria-hidden) since the heading carries the meaning; the list is an ordered
// <ol> so the sequence is conveyed semantically and to AT. AA contrast via the
// theme tokens (text-ink / text-muted / accent).
// ────────────────────────────────────────────────────────────────────────────

export interface HowItWorksStep {
  /** Short step title (e.g. "השוואה"). */
  title: string;
  /** One-line, honest description of what happens in this step. */
  description: string;
}

export interface HowItWorksProps {
  /** Optional eyebrow above the heading. */
  eyebrow?: string;
  /** Section heading (rendered as the chosen heading level). */
  heading?: string;
  /** Optional intro line under the heading. */
  intro?: string;
  /**
   * Heading level for the section title — lets the homepage nest it as an <h2>
   * while /how-it-works can promote it. Defaults to "h2".
   */
  as?: "h2" | "h3";
  /** The steps to render. Defaults to the canonical three. */
  steps?: HowItWorksStep[];
  /** Extra classes on the <section> wrapper. */
  className?: string;
}

/**
 * The canonical three steps: compare → choose → switch with consent. Copy is the
 * service's real, verifiable promise — free, no commitment, contact only after
 * the user approves in the form. No figures, nothing fabricated.
 */
export const HOW_IT_WORKS_STEPS: readonly HowItWorksStep[] = [
  {
    title: "השוואה",
    description:
      "משווים בשבילכם את כל הספקים בקטגוריה — מחיר התחלתי, המחיר אחרי המבצע ויחידת החיוב, במקום אחד. ההשוואה חינמית וללא התחייבות.",
  },
  {
    title: "בחירה",
    description:
      "בוחרים את המסלול שמתאים לכם לפי מחיר וגמישות. הדירוג שקוף ועובדתי — לפי המחיר ההתחלתי, בלי ציון איכות סמוי ובלי תשלום על מיקום.",
  },
  {
    title: "מעבר בהסכמה",
    description:
      "משאירים פרטים ומאשרים בטופס — ורק אז ניצור קשר ונלווה את המעבר וניוד המספר. בלי פנייה לא מבוקשת ובלי הפתעות.",
  },
];

export function HowItWorks({
  eyebrow = "שלושה צעדים",
  heading = "איך זה עובד",
  intro = "שלוש דקות מהצד שלכם — את כל השאר אנחנו עושים: משווים, בוחרים יחד, ועוברים רק בהסכמתכם.",
  as: Heading = "h2",
  steps = HOW_IT_WORKS_STEPS as HowItWorksStep[],
  className,
}: HowItWorksProps) {
  return (
    <section
      aria-labelledby="how-it-works-h"
      className={["", className ?? ""].join(" ").trim() || undefined}
    >
      {/* ── Heading block ─────────────────────────────────────────────────── */}
      <header>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-text">
            {eyebrow}
          </p>
        )}
        <Heading
          id="how-it-works-h"
          className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
        >
          {heading}
        </Heading>
        {intro && (
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-foreground">
            {intro}
          </p>
        )}
      </header>

      {/* ── Numbered step cards ───────────────────────────────────────────────
          Ordered list so the sequence is semantic. Mobile-first: one column,
          two-up on sm, three-up on lg. Each card reveals with a 30–80ms stagger
          (capped) and lifts on desktop hover. ──────────────────────────────── */}
      <ol className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="sw-reveal sw-lift card flex h-full flex-col p-6"
            style={{ animationDelay: `${Math.min(i * 60, 240)}ms` }}
          >
            {/* Brand-accent numbered badge — decorative; the heading carries the
                meaning, and the <ol> already conveys order to AT. */}
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-display text-lg font-bold text-accent-text"
            >
              {i + 1}
            </span>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-ink">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground">
              {step.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
