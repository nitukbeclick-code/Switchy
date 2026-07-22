"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — the RICH, category-aware plan comparison for a list of
// plans. MOBILE-FIRST: phones get one clean card per plan (<PlanCard>); lg+
// screens get a native semantic <table> whose columns adapt to the plans'
// category. Both views render from the SAME per-plan {@link PlanDisplay} bundle
// (lib/plan-display) so they can never drift.
//
// GROUPED MOBILE (opt-in): pass `groupByProvider` and the mobile view becomes a
// per-provider carousel (<ProviderCarousels>) instead of one long vertical stack
// — turning "scroll past 59 cards" into "~8 provider strips you swipe". The
// desktop table is unchanged. The flat list is still used for skeleton/empty.
//
// The single mobile card lives in <PlanCard> (shared with the carousel); the
// desktop table stays here. Provider brand colors are the carrier's REAL hue
// (never the app accent). TRUTH-ONLY: only fields that exist on a plan are shown.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Plan } from "@/lib/types";
import { priceUnitLabel } from "@/lib/format";
import { ProviderLogo } from "@/components/ProviderLogo";
import { planDisplay, type PlanDisplay } from "@/lib/plan-display";
import type { PriceDrop } from "@/lib/price-history";
import PlanCard, {
  FeatureBadges,
  PriceDropCell,
  type FeatureLabel,
} from "@/components/PlanCard";
import ProviderCarousels from "@/components/ProviderCarousels";
import Icon from "@/components/Icon";
import {
  filterAndSortPlans,
  type ComparisonSort,
} from "@/lib/comparison-filter";
import { isDataOnlyPlan } from "@/lib/plan-classification";
import { trackEvent } from "@/lib/tracking";
import {
  COMPARISON_CHANGE_EVENT,
  MAX_COMPARE_PLANS,
  comparisonPlanIds,
  withComparisonPlans,
} from "@/lib/comparison-intent";

export type { FeatureLabel };

export interface ComparisonTableProps {
  /** The plans to compare, in the order to display (caller pre-ranks). */
  plans: Plan[];
  /** Accessible table caption (also visible) — describes what is compared. */
  caption: string;
  /**
   * Optional per-plan editorial label keyed by plan id. A present entry renders a
   * visible "מקודם" / "בחירת העורך" badge on that row/card — honesty requirement.
   */
  featured?: Record<string, FeatureLabel>;
  /**
   * Optional per-plan REAL price-drop summary, keyed by plan id (from
   * public.plan_price_history). A non-null entry shows an honest "ירד ₪X השבוע"
   * badge; a null/missing entry shows none.
   */
  priceDrops?: Record<string, PriceDrop | null>;
  /**
   * When true AND `priceDrops` is NOT provided, each card/row self-fetches its own
   * history from /api/price-history and shows the badge only if a real drop exists.
   */
  autoPriceDrops?: boolean;
  /** Show the tiny trend sparkline inside any rendered drop badge. */
  priceDropSparkline?: boolean;
  /**
   * MOBILE grouping: when true, the mobile view renders per-provider carousels
   * (<ProviderCarousels>) instead of one flat vertical card list. Off by default
   * (home teasers / short lists keep the simple stack). The desktop table is
   * unaffected. Skeleton/empty states always use the flat path.
   */
  groupByProvider?: boolean;
  /** Add client-side search, provider, feature and sorting controls. */
  interactiveFilters?: boolean;
  /**
   * When the table can render before its data has arrived, set this true to show a
   * pulsing skeleton (matching the real layout, zero layout shift). `loadingRows`
   * sizes the placeholder; ignored once real `plans` are passed.
   */
  loading?: boolean;
  /** How many skeleton rows/cards to render while `loading`. Defaults to 4. */
  loadingRows?: number;
  /** Optional extra classes on the outer wrapper. */
  className?: string;
}

/**
 * The DESKTOP column order shown BEFORE the category's rich fields. The price /
 * post-promo columns are always present; the rich category fields follow,
 * computed per-plan and unioned across the visible plans so a category never
 * shows a column that is empty for every plan (mirrors the static `keep` logic).
 */
const BASE_COLUMNS = ["ספק", "מסלול", "מחיר", "מחיר אחרי תקופה"] as const;

function planSelectionLabel(plan: Plan, selected: boolean): string {
  return `${selected ? "הסרת" : "הוספת"} ${plan.plan} של ${plan.provider} ${
    selected ? "מההשוואה" : "להשוואה"
  }`;
}

/** A single pulsing skeleton bar — neutral `--border` fill, theme-aware. */
function SkelBar({ className }: { className?: string }) {
  return (
    <span
      className={["block h-3.5 rounded-md bg-border", className ?? ""].join(" ").trim()}
    />
  );
}

function FilterToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "interactive min-h-11 rounded-full border px-3.5 text-sm font-semibold transition",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent bg-accent text-white shadow-sm"
          : "border-border bg-background text-foreground hover:border-accent/50 hover:bg-accent/[0.04]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export default function ComparisonTable({
  plans,
  caption,
  featured,
  priceDrops,
  autoPriceDrops = false,
  priceDropSparkline = false,
  groupByProvider = false,
  interactiveFilters = false,
  loading = false,
  loadingRows = 4,
  className,
}: ComparisonTableProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [provider, setProvider] = useState("");
  const [sort, setSort] = useState<ComparisonSort>("price-asc");
  const [noCommit, setNoCommit] = useState(false);
  const [fiveG, setFiveG] = useState(false);
  const [fixedPrice, setFixedPrice] = useState(false);
  const [includeDataOnly, setIncludeDataOnly] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );

  const selectableIds = useMemo(() => new Set(plans.map((plan) => plan.id)), [plans]);
  const selectionStorageKey = `switchy:comparison:${caption}`;

  // Restore a shared URL first, then the page-scoped local shortlist. The state
  // update is queued so the effect remains a browser-sync subscription and does
  // not perform a synchronous setState during its setup phase.
  useEffect(() => {
    if (!interactiveFilters) return;
    let ids = comparisonPlanIds(window.location.search, selectableIds);
    const hadUrlSelection = ids.length > 0;
    if (!ids.length) {
      try {
        ids = comparisonPlanIds(
          `?plans=${localStorage.getItem(selectionStorageKey) ?? ""}`,
          selectableIds,
        );
      } catch {
        // Storage may be unavailable in hardened/private contexts; URL state
        // remains fully functional.
      }
    }
    if (!ids.length) return;
    if (!hadUrlSelection) {
      const nextSearch = withComparisonPlans(window.location.search, ids);
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${nextSearch}${window.location.hash}`,
      );
    }
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setSelectedIds(ids);
        window.dispatchEvent(
          new CustomEvent(COMPARISON_CHANGE_EVENT, { detail: { planIds: ids } }),
        );
      }
    });
    return () => {
      active = false;
    };
  }, [interactiveFilters, selectableIds, selectionStorageKey]);

  const selectedPlans = useMemo(() => {
    const byId = new Map(plans.map((plan) => [plan.id, plan]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((plan): plan is Plan => plan != null);
  }, [plans, selectedIds]);

  function persistSelection(ids: string[]) {
    const clean = ids.filter((id) => selectableIds.has(id)).slice(0, MAX_COMPARE_PLANS);
    setSelectedIds(clean);
    setShareStatus("idle");
    const nextSearch = withComparisonPlans(window.location.search, clean);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${nextSearch}${window.location.hash}`,
    );
    try {
      if (clean.length) localStorage.setItem(selectionStorageKey, clean.join(","));
      else localStorage.removeItem(selectionStorageKey);
    } catch {
      // Non-essential persistence only.
    }
    window.dispatchEvent(
      new CustomEvent(COMPARISON_CHANGE_EVENT, { detail: { planIds: clean } }),
    );
  }

  function togglePlan(plan: Plan) {
    const selected = selectedIds.includes(plan.id);
    if (!selected && selectedIds.length >= MAX_COMPARE_PLANS) return;
    const next = selected
      ? selectedIds.filter((id) => id !== plan.id)
      : [...selectedIds, plan.id];
    persistSelection(next);
    trackEvent(selected ? "compare_plan_remove" : "compare_plan_add", {
      category: plan.cat,
      selection_count: next.length,
    });
  }

  async function copyComparisonLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("copied");
      trackEvent("compare_shortlist_share", { selection_count: selectedIds.length });
    } catch {
      setShareStatus("error");
    }
  }

  const providers = useMemo(
    () => [...new Set(plans.map((plan) => plan.provider))].sort((a, b) =>
      a.localeCompare(b, "he"),
    ),
    [plans],
  );
  const dataOnlyCount = useMemo(
    () => plans.filter(isDataOnlyPlan).length,
    [plans],
  );
  const visiblePlans = useMemo(
    () =>
      interactiveFilters
        ? filterAndSortPlans(plans, {
            query: deferredQuery,
            provider,
            sort,
            noCommit,
            fiveG,
            fixedPrice,
            includeDataOnly,
          })
        : plans,
    [
      deferredQuery,
      fixedPrice,
      fiveG,
      includeDataOnly,
      interactiveFilters,
      noCommit,
      plans,
      provider,
      sort,
    ],
  );
  const hasActiveFilters = Boolean(
    query || provider || noCommit || fiveG || fixedPrice || includeDataOnly,
  );
  const resetFilters = () => {
    setQuery("");
    setProvider("");
    setSort("price-asc");
    setNoCommit(false);
    setFiveG(false);
    setFixedPrice(false);
    setIncludeDataOnly(false);
  };

  // Only treat as "loading" when asked AND there's no real data yet, so a late
  // `loading` flag can never blank out plans that already arrived.
  const showSkeleton = loading && visiblePlans.length === 0;
  const isEmpty = !showSkeleton && visiblePlans.length === 0;

  // Build every plan's display bundle ONCE; both the mobile cards and the desktop
  // table render from these so the two views can never disagree.
  const displays: PlanDisplay[] = visiblePlans.map(planDisplay);

  // Desktop rich columns: the UNION of the category field labels actually present
  // across the visible plans, in first-seen order (mirrors the static `keep` rule).
  const richColumns: string[] = [];
  const seenCol = new Set<string>();
  for (const d of displays) {
    for (const f of d.fields) {
      if (!seenCol.has(f.label)) {
        seenCol.add(f.label);
        richColumns.push(f.label);
      }
    }
  }
  const hasPerksColumn = displays.some((d) => d.perks.length > 0);
  const selectionEnabled = interactiveFilters && plans.length > 1;
  const desktopColumns = [
    ...(selectionEnabled ? ["להשוואה"] : []),
    ...BASE_COLUMNS,
    ...richColumns,
    ...(hasPerksColumn ? ["מידע נוסף"] : []),
  ];
  const totalCols = desktopColumns.length;

  const sharedDropProps = { priceDrops, autoPriceDrops, priceDropSparkline };
  // Grouped carousels only when explicitly enabled AND there's real data to group
  // (skeleton/empty keep the flat path, which renders those states).
  const useCarousels =
    groupByProvider && !selectionEnabled && !showSkeleton && !isEmpty;

  return (
    <div
      className={["w-full", className ?? ""].join(" ").trim()}
      role="region"
      aria-label={caption}
    >
      {interactiveFilters ? (
        <div className="mb-5 rounded-2xl border border-border/70 bg-surface p-4 elevate-card sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[15rem] flex-1">
              <span className="mb-1.5 block text-sm font-semibold text-foreground">
                חיפוש מסלול או ספק
              </span>
              <span className="relative block">
                <Icon
                  name="search"
                  size={17}
                  aria-hidden="true"
                  className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="לדוגמה: 5G, סלקום, Fiber"
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 pe-10 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </span>
            </label>
            <label className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
              <span className="mb-1.5 block text-sm font-semibold text-foreground">ספק</span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="">כל הספקים</option>
                {providers.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="min-w-[11rem] flex-1 sm:max-w-[15rem]">
              <span className="mb-1.5 block text-sm font-semibold text-foreground">מיון</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as ComparisonSort)}
                className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              >
                <option value="price-asc">מחיר התחלתי — מהנמוך</option>
                <option value="long-term-asc">מחיר לטווח ארוך — מהנמוך</option>
                <option value="provider">שם הספק</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="סינון מהיר">
            <FilterToggle active={noCommit} onClick={() => setNoCommit((v) => !v)}>
              ללא התחייבות
            </FilterToggle>
            <FilterToggle active={fixedPrice} onClick={() => setFixedPrice((v) => !v)}>
              מחיר קבוע
            </FilterToggle>
            {plans.some((plan) => plan.is5G) ? (
              <FilterToggle active={fiveG} onClick={() => setFiveG((v) => !v)}>
                5G בלבד
              </FilterToggle>
            ) : null}
            {dataOnlyCount > 0 ? (
              <FilterToggle
                active={includeDataOnly}
                onClick={() => setIncludeDataOnly((v) => !v)}
              >
                כולל SIM לגלישה בלבד ({dataOnlyCount})
              </FilterToggle>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-sm">
            <p className="text-muted" aria-live="polite">
              מציגים <strong className="text-foreground">{visiblePlans.length}</strong> מתוך {plans.length} מסלולים
              {dataOnlyCount > 0 && !includeDataOnly ? " · חבילות גלישה בלבד מוסתרות כברירת מחדל" : ""}
            </p>
            {hasActiveFilters || sort !== "price-asc" ? (
              <button
                type="button"
                onClick={resetFilters}
                className="interactive min-h-11 rounded-lg px-3 font-semibold text-accent-text underline underline-offset-4 hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                איפוס סינון
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {selectionEnabled && selectedPlans.length > 0 ? (
        <aside
          aria-label="המסלולים שבחרתם להשוואה"
          className="mb-5 overflow-hidden rounded-2xl border border-accent/30 bg-accent/[0.05] shadow-soft"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-accent/20 px-4 py-3.5 sm:px-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-accent-text">
                ההשוואה האישית שלכם
              </p>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">
                {selectedPlans.length} מתוך {MAX_COMPARE_PLANS} מסלולים נבחרו
              </h3>
              <p className="mt-0.5 text-sm text-muted">
                {selectedPlans.length === 1
                  ? "בחרו עוד מסלול כדי לראות את ההבדלים זה מול זה."
                  : "הבחירה נשמרת בקישור ותעבור לנציג יחד עם הבקשה."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => persistSelection([])}
              className="interactive min-h-11 rounded-lg px-3 text-sm font-semibold text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              ניקוי הבחירה
            </button>
          </div>

          <div className="grid gap-px bg-border/70 sm:grid-cols-3">
            {selectedPlans.map((plan) => {
              const display = planDisplay(plan);
              return (
                <article key={plan.id} className="relative bg-surface p-4">
                  <button
                    type="button"
                    onClick={() => togglePlan(plan)}
                    aria-label={planSelectionLabel(plan, true)}
                    className="interactive absolute end-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-lg text-muted hover:bg-danger/10 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                  <div className="flex items-center gap-2 pe-10">
                    <ProviderLogo provider={plan.provider} size={28} />
                    <p className="truncate text-sm font-semibold text-foreground">
                      {plan.provider}
                    </p>
                  </div>
                  <p className="mt-2 line-clamp-2 min-h-10 font-display text-sm font-bold text-ink">
                    {plan.plan}
                  </p>
                  <p className="mt-2 font-display text-xl font-bold text-value-text tabular-nums">
                    ₪{display.price}
                    <span className="ms-1 text-xs font-normal text-muted">
                      {priceUnitLabel(plan)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {display.after.text}
                  </p>
                </article>
              );
            })}
            {Array.from({ length: MAX_COMPARE_PLANS - selectedPlans.length }).map(
              (_, index) => (
                <div
                  key={`empty-selection-${index}`}
                  aria-hidden="true"
                  className="hidden min-h-36 items-center justify-center bg-background/70 p-4 text-center text-sm text-muted sm:flex"
                >
                  + הוספת מסלול
                </div>
              ),
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3.5 sm:px-5">
            <a
              href="#lead"
              onClick={() =>
                trackEvent("compare_shortlist_lead", {
                  selection_count: selectedPlans.length,
                })
              }
              className="interactive press inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-bold text-accent-contrast shadow-soft hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              קבלת המלצה על הבחירה
            </a>
            <button
              type="button"
              onClick={() => void copyComparisonLink()}
              className="interactive min-h-11 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {shareStatus === "copied" ? "הקישור הועתק ✓" : "העתקת קישור להשוואה"}
            </button>
            {shareStatus === "error" ? (
              <span role="status" className="text-xs text-danger">
                לא הצלחנו להעתיק. אפשר להעתיק משורת הכתובת.
              </span>
            ) : null}
          </div>
        </aside>
      ) : null}

      {/* Visible + accessible caption, shared by both views. */}
      <p className="mb-3 text-start text-sm font-normal text-muted lg:sr-only">
        {caption}
      </p>

      {/* ══ MOBILE / TABLET (default) ════════════════════════════════════════
          Grouped per-provider carousels when opted-in with real data; otherwise
          one card per plan (also the skeleton / empty path). */}
      {useCarousels ? (
        <ProviderCarousels
          plans={visiblePlans}
          featured={featured}
          {...sharedDropProps}
          className="lg:hidden"
        />
      ) : (
        <ul className="flex flex-col gap-3 lg:hidden">
          {showSkeleton
            ? Array.from({ length: Math.max(1, loadingRows) }).map((_, i) => (
                <li
                  key={`m-skel-${i}`}
                  aria-hidden="true"
                  className="rounded-2xl border border-border/60 bg-surface p-4 elevate-card"
                >
                  <span className="flex animate-pulse items-center gap-2 motion-reduce:animate-none">
                    <span className="block h-8 w-8 shrink-0 rounded-full bg-border" />
                    <SkelBar className="w-24" />
                  </span>
                  <SkelBar className="mt-3 h-6 w-20" />
                  <span className="mt-3 flex gap-1.5">
                    <SkelBar className="w-16" />
                    <SkelBar className="w-12" />
                  </span>
                </li>
              ))
            : null}

          {isEmpty ? (
            <li>
              <EmptyCard />
            </li>
          ) : null}

          {displays.map((d) => (
            <li key={d.plan.id}>
              <PlanCard
                display={d}
                label={featured?.[d.plan.id]}
                {...sharedDropProps}
              />
              {selectionEnabled ? (
                <button
                  type="button"
                  aria-pressed={selectedIds.includes(d.plan.id)}
                  aria-label={planSelectionLabel(
                    d.plan,
                    selectedIds.includes(d.plan.id),
                  )}
                  disabled={
                    !selectedIds.includes(d.plan.id) &&
                    selectedIds.length >= MAX_COMPARE_PLANS
                  }
                  onClick={() => togglePlan(d.plan)}
                  className={[
                    "interactive mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                    selectedIds.includes(d.plan.id)
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-surface text-foreground hover:border-accent/50",
                  ].join(" ")}
                >
                  <span aria-hidden="true">
                    {selectedIds.includes(d.plan.id) ? "✓" : "+"}
                  </span>
                  {selectedIds.includes(d.plan.id)
                    ? "נבחר להשוואה"
                    : selectedIds.length >= MAX_COMPARE_PLANS
                      ? "ניתן לבחור עד 3"
                      : "הוספה להשוואה"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ══ DESKTOP (lg+) — rich, category-aware semantic table ══════════════ */}
      <div
        className="scroll-shadow hidden w-full overflow-x-auto rounded-2xl border border-border/60 bg-surface elevate-card lg:block"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table className="w-full min-w-[720px] border-collapse text-right">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-background/60 text-[12px] font-medium uppercase tracking-wide text-muted">
              {desktopColumns.map((col) => (
                <th key={col} scope="col" className="px-4 py-3 text-start font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showSkeleton
              ? Array.from({ length: Math.max(1, loadingRows) }).map((_, i) => (
                  <tr
                    key={`d-skel-${i}`}
                    aria-hidden="true"
                    className="border-b border-border/70 last:border-b-0 align-top"
                  >
                    {desktopColumns.map((col, ci) => (
                      <td key={col} className="px-4 py-3">
                        <span className="block animate-pulse motion-reduce:animate-none">
                          <SkelBar className={ci === 0 ? "w-24" : "w-16"} />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              : null}

            {isEmpty ? (
              <tr>
                <td colSpan={totalCols} className="px-4 py-10 sm:py-12">
                  <EmptyCard />
                </td>
              </tr>
            ) : null}

            {displays.map((d) => {
              const plan = d.plan;
              const label = featured?.[plan.id];
              const byLabel = new Map(d.fields.map((f) => [f.label, f.value]));
              return (
                <tr
                  key={plan.id}
                  className={[
                    "border-b border-border/70 last:border-b-0 align-top transition-colors duration-150 ease-[var(--ease-out)]",
                    selectedIds.includes(plan.id)
                      ? "bg-accent/[0.08] ring-1 ring-inset ring-accent/25"
                      : label
                      ? "bg-accent/[0.12] ring-1 ring-inset ring-accent/25 border-s-2 border-s-accent"
                      : "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/[0.03]",
                  ]
                    .join(" ")
                    .trim()}
                >
                  {selectionEnabled ? (
                    <td className="px-3 py-2 text-center align-middle">
                      <button
                        type="button"
                        aria-pressed={selectedIds.includes(plan.id)}
                        aria-label={planSelectionLabel(
                          plan,
                          selectedIds.includes(plan.id),
                        )}
                        disabled={
                          !selectedIds.includes(plan.id) &&
                          selectedIds.length >= MAX_COMPARE_PLANS
                        }
                        onClick={() => togglePlan(plan)}
                        className={[
                          "interactive inline-flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40",
                          selectedIds.includes(plan.id)
                            ? "border-accent bg-accent text-accent-contrast"
                            : "border-border bg-background text-accent-text hover:border-accent/50",
                        ].join(" ")}
                      >
                        <span aria-hidden="true">
                          {selectedIds.includes(plan.id) ? "✓" : "+"}
                        </span>
                      </button>
                    </td>
                  ) : null}
                  {/* ספק — row header for a11y, brand-colored avatar anchor. */}
                  <th
                    scope="row"
                    className="px-4 py-3 text-start font-medium text-foreground"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <ProviderLogo provider={plan.provider} />
                      {plan.provider}
                      {label ? <FeatureBadges label={label} /> : null}
                    </span>
                  </th>

                  {/* מסלול — links to the plan's full detail page. */}
                  <td className="px-4 py-3 text-start text-foreground">
                    <Link
                      href={`/plans/${plan.id}`}
                      aria-label={`לפרטים מלאים על ${plan.plan} מ${plan.provider}`}
                      className="interactive rounded-sm font-medium text-foreground underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {plan.plan}
                    </Link>
                  </td>

                  {/* מחיר — tabular-nums aligns the ₪ digits down the column. */}
                  <td className="px-4 py-3 text-start whitespace-nowrap tabular-nums">
                    <span className="font-display text-base font-bold text-ink">
                      ₪{d.price}
                    </span>{" "}
                    <span className="text-xs text-muted">{priceUnitLabel(plan)}</span>
                    <PriceDropCell plan={plan} {...sharedDropProps} />
                  </td>

                  {/* מחיר אחרי תקופה — the honest post-promo jump / fixed marker. */}
                  <td className="px-4 py-3 text-start whitespace-nowrap text-[13px] tabular-nums">
                    {d.after.kind === "jump" ? (
                      <span className="font-medium text-foreground">{d.after.text}</span>
                    ) : (
                      <span
                        className="text-muted"
                        title="המחיר אינו עולה לאחר תום המבצע"
                      >
                        {d.after.text}
                      </span>
                    )}
                  </td>

                  {/* Rich category fields, in the unioned column order. */}
                  {richColumns.map((col) => {
                    const value = byLabel.get(col);
                    return (
                      <td
                        key={col}
                        className="px-4 py-3 text-start text-[13px] text-foreground"
                      >
                        {value ?? <span className="text-muted">—</span>}
                      </td>
                    );
                  })}

                  {/* מידע נוסף (perks) — only when the column exists. */}
                  {hasPerksColumn ? (
                    <td className="max-w-[20rem] break-words px-4 py-3 text-start text-[13px] text-muted">
                      {d.perks.length > 0 ? d.perks.join(" · ") : "—"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A branded, card-wrapped empty state (glyph + headline + a link to broaden the
 * search). Reused by both the mobile list and the desktop table's spanning body
 * cell, so SSR always emits a complete, parseable structure (never a bare header).
 */
function EmptyCard() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border/60 bg-surface px-4 py-10 text-center sm:py-12">
      <span
        aria-hidden="true"
        className="elevate-soft flex h-16 w-16 items-center justify-center rounded-full border border-accent/20 bg-accent/10 text-2xl text-accent-text"
      >
        🔍
      </span>
      <p className="mt-4 font-display text-base font-bold tracking-tight text-ink sm:text-lg">
        אין התאמות כרגע
      </p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-muted">
        נסו להרחיב את הסינון או לחזור לדף הבית כדי לראות עוד מסלולים.
      </p>
      <Link
        href="/"
        className="interactive press mt-5 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast ease-[var(--ease-out)] hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        חזרה לדף הבית
      </Link>
    </div>
  );
}
