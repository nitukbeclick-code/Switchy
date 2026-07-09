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
import type { PlanDisplay, PlanField } from "@/lib/plan-display";
import type { PriceDrop } from "@/lib/price-history";
import PriceDropBadge from "@/components/PriceDropBadge";

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
      <span className="inline-flex items-center rounded-full bg-value px-2 py-0.5 text-[11px] font-bold text-value-contrast">
        מומלץ
      </span>
      <span
        className={[
          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
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

      {/* Plan name — links to the plan's full detail page. */}
      <p className="mt-2">
        <Link
          href={`/plans/${plan.id}`}
          aria-label={`לפרטים מלאים על ${plan.plan} מ${plan.provider}`}
          className="interactive inline-block rounded-sm font-display text-base font-semibold tracking-tight text-ink underline underline-offset-4 transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {plan.plan}
        </Link>
      </p>

      {/* Price big + unit, then the honest post-promo line. tabular-nums aligns ₪. */}
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-bold tracking-tight text-ink tabular-nums">
          ₪{d.price}
        </span>
        <span className="text-sm text-muted">{priceUnitLabel(plan)}</span>
      </div>
      <div className="mt-0.5 text-[13px] tabular-nums">
        <AfterLine after={d.after} />
      </div>
      <PriceDropCell plan={plan} {...drop} />

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

      {/* Always-present navigation to the plan's full detail page — pinned to the
          card bottom (mt-auto) so cards in a carousel row share a tidy baseline. */}
      <Link
        href={`/plans/${plan.id}`}
        aria-label={`לעמוד המסלול המלא של ${plan.plan} מ${plan.provider}`}
        className="interactive press mt-auto inline-flex items-center gap-1 self-start rounded-lg pt-3 text-[13px] font-semibold text-accent-text underline underline-offset-4 transition-colors hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        פרטים מלאים
        <Icon name="chevron" size={14} aria-hidden="true" />
      </Link>
    </article>
  );
}
