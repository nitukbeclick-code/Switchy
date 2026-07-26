// ────────────────────────────────────────────────────────────────────────────
// <PlanCard> — the ONE mobile plan card, shared by <ComparisonTable> (its mobile
// list) and <ProviderCarousels> (the per-provider carousel), so the two can never
// drift. Renders from a pre-computed {@link PlanDisplay} bundle (lib/plan-display).
//
// SERVER component (no "use client"): it imports <ProviderLogo>, which pulls in
// lib/data (node:fs at module load), so it MUST stay server-rendered. The carousel
// keeps its interactivity in a tiny client shell that receives these server-
// rendered cards as `children` (the RSC client-wrapper pattern) — no fs in the
// client bundle.
//
// HONESTY: a featured/sponsored card is ALWAYS visibly labeled ("מקודם" / "בחירת
// העורך"). Provider brand colors are the carrier's REAL hue (never the app accent).
// TRUTH-ONLY: only fields that exist on a plan are shown — nothing fabricated.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Plan } from "@/lib/types";
import { priceUnitLabel } from "@/lib/format";
import Icon from "@/components/Icon";
import { ProviderLogo } from "@/components/ProviderLogo";
import TrackedCtaLink from "@/components/TrackedCtaLink";
import type { PlanDisplay, PlanField } from "@/lib/plan-display";
import type { PriceDrop } from "@/lib/price-history";
import PriceDropBadge from "@/components/PriceDropBadge";
import { calculateTwelveMonthCost, formatAnnualCost } from "@/lib/plan-cost";

/** What kind of editorial label, if any, a card/row carries. */
export type FeatureLabel = "promoted" | "editor";

const LABEL_HE: Record<FeatureLabel, string> = {
  promoted: "מקודם",
  editor: "בחירת העורך",
};

/** Shared price-drop props threaded through both comparison views. */
export interface DropProps {
  priceDrops?: Record<string, PriceDrop | null>;
  autoPriceDrops?: boolean;
  priceDropSparkline?: boolean;
}

/** An editorial "מומלץ" + precise-label pill pair — rendered ONLY when labeled. */
export function FeatureBadges({ label }: { label: FeatureLabel }) {
  return (
    <>
      <span className="inline-flex items-center rounded-full bg-value px-2 py-0.5 text-[12px] font-bold text-value-contrast">
        מומלץ
      </span>
      <span
        className={[
          "inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold",
          label === "editor"
            ? "bg-value/15 text-value-text"
            : "bg-accent/15 text-accent-text",
        ].join(" ")}
      >
        {LABEL_HE[label]}
      </span>
    </>
  );
}

/** The honest post-promo line: an "לאחר המבצע" jump, or a neutral "מחיר קבוע". */
export function AfterLine({ after }: { after: PlanDisplay["after"] }) {
  if (after.kind === "jump") {
    return (
      <span className="text-foreground">
        לאחר המבצע:{" "}
        <span className="font-semibold text-ink">{after.text}</span>
      </span>
    );
  }
  return (
    <span className="text-muted" title="המחיר אינו עולה לאחר תום המבצע">
      {after.text}
    </span>
  );
}

/**
 * Transparent first-year service cost, as a FOOTNOTE — one borderless hairline
 * row under the headline price. It used to be a tinted, bordered amber panel
 * carrying its own bold figure and a nested "איך חישבנו?" disclosure, which put
 * a second money block in the same card as the price and out-shouted the very
 * number it annotates. A card can only have one loudest thing; amber survives
 * here on the FIGURE alone, at footnote size.
 *
 * Equipment/installation stay separate (they are not service cost), and the
 * qualifier says so on the same line rather than in a paragraph of its own —
 * the full sentence remains available as the row's title/tooltip.
 */
export function AnnualCostLine({ plan }: { plan: Plan }) {
  const cost = calculateTwelveMonthCost(plan);
  const extras = cost.recurringExtras.length + cost.oneTimeFees.length;
  return (
    <div
      className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border/60 pt-2.5"
      title={cost.disclosure}
    >
      <span className="text-[12px] text-muted">
        עלות השירות ל־12 חודשים
        {extras > 0
          ? ` · ${extras} חיובי ציוד/התקנה בנפרד`
          : cost.hasUnpricedFees
            ? " · חיוב ללא סכום מופיע בפרטים"
            : ""}
      </span>
      <strong className="text-[13px] font-semibold text-value-text tabular-nums">
        {formatAnnualCost(cost)}
      </strong>
    </div>
  );
}

/** A small labelled chip used on the card for one rich field. */
function FieldChip({ field }: { field: PlanField }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg border border-border/70 bg-background px-2 py-1 text-[12px] leading-tight">
      <span className="text-muted">{field.label}</span>
      <span className="font-medium text-foreground">{field.value}</span>
    </span>
  );
}

/** The price-drop badge cell (pre-resolved map OR self-fetching), shared by views. */
export function PriceDropCell({
  plan,
  priceDrops,
  autoPriceDrops = false,
  priceDropSparkline = false,
}: { plan: Plan } & DropProps) {
  if (priceDrops) {
    const drop = priceDrops[plan.id];
    return drop ? (
      <span className="mt-1 block">
        <PriceDropBadge planId={plan.id} drop={drop} sparkline={priceDropSparkline} />
      </span>
    ) : null;
  }
  if (autoPriceDrops) {
    return (
      <span className="mt-1 block">
        <PriceDropBadge planId={plan.id} sparkline={priceDropSparkline} />
      </span>
    );
  }
  return null;
}

/**
 * The fine-print to show in the "פרטים מלאים" disclosure — the plan's fineLines
 * MINUS anything already shown on the perks line (so the disclosure adds detail
 * rather than repeating it). Truth-only: real catalogue text only.
 */
export function extraFineLines(d: PlanDisplay): string[] {
  const shown = new Set(d.perks);
  return d.fineLines.filter((line) => !shown.has(line));
}

export interface PlanCardProps extends DropProps {
  /** The pre-computed display bundle for this plan. */
  display: PlanDisplay;
  /** Optional editorial label → renders the honest "מקודם"/"בחירת העורך" badges. */
  label?: FeatureLabel;
  /** Extra classes on the card root (e.g. carousel snap width). */
  className?: string;
}

/**
 * One plan as a self-contained card. Rendered as an <article> so callers wrap it
 * in whatever list item they need (<li> in a flat list OR a snap item in a
 * carousel). Layout width is the caller's job (className); the card owns its own
 * surface, border, and internal spacing.
 */
export default function PlanCard({
  display: d,
  label,
  className,
  ...drop
}: PlanCardProps) {
  const plan = d.plan;
  return (
    <article
      className={[
        // overflow-hidden + break-words below keep long benefit lists / fine-print
        // from blowing out the card width (RTL-safe).
        "flex h-full flex-col overflow-hidden rounded-2xl border bg-surface p-4 elevate-card",
        label
          ? "border-accent/30 bg-accent/[0.06] ring-1 ring-inset ring-accent/25"
          : "border-border/60",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Header: provider badge + name, optional editorial label. */}
      <div className="flex flex-wrap items-center gap-2">
        <ProviderLogo provider={plan.provider} />
        <span className="min-w-0 break-words font-medium text-foreground">
          {plan.provider}
        </span>
        {label ? <FeatureBadges label={label} /> : null}
      </div>

      {/* Plan name — links to the plan's full detail page. The invisible
          before:-inset-y-2.5 pseudo extends the ~24px text line to a ≥44px tap
          target (mobile guideline) without moving a pixel visually — the same
          pseudo-hit-area pattern as PostComposer; it only reaches into the
          non-interactive provider header above / price block below. */}
      <p className="mt-2">
        <Link
          href={`/plans/${plan.id}`}
          aria-label={`לפרטים מלאים על ${plan.plan} מ${plan.provider}`}
          className="interactive relative inline-block rounded-sm font-display text-base font-semibold tracking-tight text-ink underline underline-offset-4 transition-colors before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {plan.plan}
        </Link>
      </p>

      {/* THE MONEY TIER, ROW RANK. The price used to be set byte-for-byte like
          every section H2 on the site (font-display text-2xl font-bold text-ink)
          and coloured with the ACTION green — so on a page of headings, nothing
          read as money. `.price-row` (globals.css) is the money tier for figures
          that REPEAT: a card grid or a table renders dozens of these, so it is
          deliberately quieter than `.price-hero` (which at most one figure per
          page may use) while staying larger, heavier, tabular and amber enough
          that it can never be read as a heading. `text-value-text` is the one
          amber that means VALUE, the ₪ is a demoted sibling span so the digits
          carry the optical mass, and the unit drops BELOW as a spaced
          micro-label so the number stays one solid block. `d.price` is a
          pre-formatted STRING from planDisplay (exact-aware: "69.90" vs "69"),
          so it is rendered as-is — <Money> takes a number and would re-round it.

          The gap to the line-clamped plan name above is a plain mt-2.5 and needs
          no defensive padding: `.price-sign` is aligned to the top of its own
          line box (globals.css), so the raised ₪ is contained by this <p>'s box
          and cannot paint into the min-h-10 name block. */}
      <p className="price-row mt-2.5 text-value-text">
        <span className="price-sign">₪</span>
        {d.price}
      </p>
      <p className="price-unit mt-1">{priceUnitLabel(plan)}</p>
      <div className="mt-1.5 text-[13px] tabular-nums">
        <AfterLine after={d.after} />
      </div>
      <PriceDropCell plan={plan} {...drop} />
      <AnnualCostLine plan={plan} />

      {/* Category-relevant rich fields as compact labelled chips. */}
      {d.fields.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {d.fields.map((f) => (
            <FieldChip key={f.label} field={f} />
          ))}
        </div>
      ) : null}

      {/* Perks line ("מידע נוסף"). break-words so a long list wraps in the card. */}
      {d.perks.length > 0 ? (
        <p className="mt-3 break-words text-[13px] leading-relaxed text-muted">
          {d.perks.join(" · ")}
        </p>
      ) : null}

      {/* Extra fine-print behind a native, no-JS disclosure — only when the plan
          carries fine-lines NOT already shown as perks. */}
      {extraFineLines(d).length > 0 ? (
        <details className="group mt-3">
          <summary className="interactive flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md text-[13px] font-semibold text-accent-text marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            אותיות קטנות
            <Icon
              name="chevron"
              size={14}
              aria-hidden="true"
              className="rotate-90 transition-transform group-open:-rotate-90"
            />
          </summary>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-[13px] leading-relaxed text-foreground">
            {extraFineLines(d).map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* Card foot — pinned to the bottom (mt-auto) so cards in a carousel row
          share a tidy baseline. TWO distinct affordances: both used to point at
          the very same /plans/[id] route, which left the most-repeated unit in a
          lead-generation product with no path to a lead at all. "פרטים מלאים" is
          the READ path; the pill beside it is the REVENUE path, deep-linking to
          the plan page's always-rendered #lead section so the request arrives
          already attached to this plan. It is BORDERED, never filled — the page
          keeps exactly one primary green action, and this is not it.
          min-h-11 on both grows the ~32px text lines to the 44px mobile
          tap-target guideline (matching the אותיות קטנות summary above). */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
        <Link
          href={`/plans/${plan.id}`}
          aria-label={`לעמוד המסלול המלא של ${plan.plan} מ${plan.provider}`}
          className="interactive press inline-flex min-h-11 items-center gap-1 rounded-lg text-[13px] font-semibold text-accent-text underline underline-offset-4 transition-colors hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          פרטים מלאים
          <Icon name="chevron" size={14} aria-hidden="true" />
        </Link>
        {/* TrackedCtaLink is the existing "use client" next/link wrapper, so this
            server-rendered card can measure per-card lead intent without becoming
            a client component itself. */}
        <TrackedCtaLink
          href={`/plans/${plan.id}#lead`}
          location="plan_card"
          label="lead"
          aria-label={`בקשת חזרה טלפונית בנוגע ל${plan.plan} מ${plan.provider}`}
          className="interactive press inline-flex min-h-11 items-center rounded-xl border border-accent/40 px-3.5 text-[13px] font-semibold text-accent-text transition-colors hover:border-accent hover:bg-accent/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          שנחזור אליכם על המסלול הזה
        </TrackedCtaLink>
      </div>
    </article>
  );
}
