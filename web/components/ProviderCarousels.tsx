// ────────────────────────────────────────────────────────────────────────────
// <ProviderCarousels> — the MOBILE deal browser: instead of one long vertical
// stack of every plan, plans are grouped BY PROVIDER and each provider gets its
// own horizontal carousel of plan cards. Turns "scroll past 59 cards" into "~8
// provider strips you swipe". SERVER component: it builds the grouping + the
// server-rendered <PlanCard>s and hands them to the client <CarouselShell> as
// children (so no fs-bound import reaches the client bundle).
//
// ORDERING (truthful, value-first): plans within a provider are cheapest-first;
// providers are ordered by their own cheapest plan (cheapest provider first), so
// the best value leads. Every figure is catalogue-derived.
//
// ACCESSIBILITY: each provider is a labelled group with its real count; a "כל
// המסלולים של X" link gives a full-list fallback (nothing is trapped in the
// carousel); the interactive scroll lives in <CarouselShell> (see its header).
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Plan } from "@/lib/types";
import { providerSlug } from "@/lib/data";
import { planDisplay } from "@/lib/plan-display";
import Icon from "@/components/Icon";
import { ProviderLogo } from "@/components/ProviderLogo";
import PlanCard, { type FeatureLabel, type DropProps } from "@/components/PlanCard";
import CarouselShell from "@/components/CarouselShell";

export interface ProviderCarouselsProps extends DropProps {
  /** The plans to group + display (already scoped to the service/category). */
  plans: Plan[];
  /** Optional per-plan editorial label (honesty badge), keyed by plan id. */
  featured?: Record<string, FeatureLabel>;
  /** Extra classes on the outer wrapper (e.g. `lg:hidden`). */
  className?: string;
}

interface Group {
  provider: string;
  slug: string;
  plans: Plan[];
  /** Numeric cheapest (exact-aware) — for ordering providers. */
  minNum: number | null;
  /** The cheapest plan's DISPLAY price string — matches the card verbatim. */
  minDisplay: string | null;
}

/** The exact-aware headline price used everywhere the price is SHOWN (mirrors
 * planDisplay's exact-first rule), so the header min == the cheapest card price. */
function shownPrice(p: Plan): number {
  if (typeof p.priceExact === "number") return p.priceExact;
  if (typeof p.price === "number") return p.price;
  return Number.POSITIVE_INFINITY;
}

/** Group plans by provider; cheapest-first within, cheapest-provider-first across. */
function groupByProvider(plans: Plan[]): Group[] {
  const byProvider = new Map<string, Plan[]>();
  for (const p of plans) {
    const arr = byProvider.get(p.provider);
    if (arr) arr.push(p);
    else byProvider.set(p.provider, [p]);
  }
  const groups: Group[] = [];
  for (const [provider, ps] of byProvider) {
    const sorted = [...ps].sort((a, b) => shownPrice(a) - shownPrice(b));
    const cheapest = sorted.find((p) => typeof p.price === "number");
    groups.push({
      provider,
      slug: providerSlug(provider),
      plans: sorted,
      minNum: cheapest ? shownPrice(cheapest) : null,
      // The SAME string the cheapest card renders (planDisplay is exact-aware), so
      // the "החל מ-₪X" header can never disagree with the card below it.
      minDisplay: cheapest ? planDisplay(cheapest).price : null,
    });
  }
  // Cheapest provider first; providers with no priced plan sink to the end.
  groups.sort((a, b) => {
    const am = a.minNum ?? Number.POSITIVE_INFINITY;
    const bm = b.minNum ?? Number.POSITIVE_INFINITY;
    if (am !== bm) return am - bm;
    return b.plans.length - a.plans.length;
  });
  return groups;
}

export default function ProviderCarousels({
  plans,
  featured,
  className,
  ...drop
}: ProviderCarouselsProps) {
  const groups = groupByProvider(plans);

  return (
    <div className={["flex flex-col gap-8", className ?? ""].join(" ").trim()}>
      {groups.map((g) => {
        const count = g.plans.length;
        const single = count === 1;
        // The visible heading names the whole group (aria-labelledby in the shell).
        const labelId = `carousel-${g.slug}`;
        // The provider identity header (server-rendered; passed into the client
        // shell so it can sit beside the scroll controls).
        const header = (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ProviderLogo provider={g.provider} size={36} />
            <div className="min-w-0">
              <h3
                id={labelId}
                className="font-display text-lg font-bold tracking-tight text-ink"
              >
                {g.provider}
              </h3>
              <p className="nums-tabular text-[13px] text-muted">
                {count} {count === 1 ? "מסלול" : "מסלולים"}
                {g.minDisplay != null ? (
                  <>
                    {" · החל מ-"}
                    <span className="font-semibold text-value-text">
                      ₪{g.minDisplay}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <Link
              href={`/providers/${g.slug}`}
              className="interactive ms-auto inline-flex items-center gap-1 rounded-md text-[13px] font-semibold text-accent-text underline-offset-4 hover:text-accent-hover hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              כל המסלולים
              <Icon name="chevron" size={14} aria-hidden="true" />
            </Link>
          </div>
        );

        return (
          <CarouselShell
            key={g.slug}
            provider={g.provider}
            labelId={labelId}
            header={header}
          >
            {g.plans.map((p) => (
              <li
                key={p.id}
                className={
                  single
                    ? "shrink-0 basis-full"
                    : "snap-start shrink-0 basis-[82%] max-w-[20rem] sm:basis-[46%]"
                }
              >
                <PlanCard
                  display={planDisplay(p)}
                  label={featured?.[p.id]}
                  {...drop}
                />
              </li>
            ))}
          </CarouselShell>
        );
      })}
    </div>
  );
}
