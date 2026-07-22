// Shareable plan-selection state for the comparison table and the lead form.
// The URL is the source of truth so a shortlist survives refresh, can be copied,
// and reaches the CRM hand-off without a global store.

export const MAX_COMPARE_PLANS = 3;
export const COMPARISON_CHANGE_EVENT = "switchy:comparison-change";

export interface PlanIntentOption {
  id: string;
  provider: string;
  name: string;
}

/** Parse, de-duplicate and cap the `?plans=` shortlist. Unknown ids are dropped
 * when an allowlist is provided, so stale/shared URLs never create fake plans. */
export function comparisonPlanIds(
  search: string,
  allowedIds?: ReadonlySet<string>,
): string[] {
  const raw = new URLSearchParams(search).get("plans") ?? "";
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of raw.split(",")) {
    const id = value.trim();
    if (!id || seen.has(id) || (allowedIds && !allowedIds.has(id))) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length === MAX_COMPARE_PLANS) break;
  }
  return ids;
}

/** Return the same query string with the shortlist updated (or removed). */
export function withComparisonPlans(search: string, ids: readonly string[]): string {
  const params = new URLSearchParams(search);
  const clean = [...new Set(ids.filter(Boolean))].slice(0, MAX_COMPARE_PLANS);
  if (clean.length) params.set("plans", clean.join(","));
  else params.delete("plans");
  const value = params.toString();
  return value ? `?${value}` : "";
}

/** Resolve the selected URL ids to trusted, server-provided catalogue options. */
export function selectedPlanIntent(
  search: string,
  options: readonly PlanIntentOption[],
): PlanIntentOption[] {
  const byId = new Map(options.map((option) => [option.id, option]));
  return comparisonPlanIds(search, new Set(byId.keys()))
    .map((id) => byId.get(id))
    .filter((option): option is PlanIntentOption => option != null);
}

/** Compact CRM context; values come from the trusted catalogue mapping. */
export function comparisonIntentNote(options: readonly PlanIntentOption[]): string {
  if (!options.length) return "";
  return `מסלולים שנבחרו להשוואה: ${options
    .map((option) => `${option.provider} — ${option.name} (${option.id})`)
    .join("; ")}`;
}
