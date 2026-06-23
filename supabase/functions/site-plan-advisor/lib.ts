// Pure, dependency-free ranking + parsing helpers for site-plan-advisor, split
// out of index.ts so they can be unit-tested without booting the Deno.serve
// entrypoint or importing the bundled snapshot (mirrors site-bill-analyzer/lib.ts
// and whatsapp-webhook/intents.ts). No network, no env, no I/O.

export type Plan = {
  id?: string;
  cat?: string;
  provider?: string;
  plan?: string;
  price?: number;
  is5G?: boolean;
  noCommit?: boolean;
  hasAbroad?: boolean;
  priceUnit?: string;
};

export type Answers = {
  category: string;
  budget: number | null;
  priority: string;
  lines: number;
  abroad: boolean;
};

// Valid plan categories (see lib/data.dart). Anything else is clipped to ''.
export const CATEGORIES = ["cellular", "internet", "tv", "triple", "abroad"];
export const PRIORITIES = ["price", "data", "abroad", "noCommit", "5g", "balanced"];

export const CANDIDATES_PER_CAT = 12;

export function unitLabel(p: Plan): string {
  return p.priceUnit === "package"
    ? "לחבילה"
    : p.priceUnit === "day"
    ? "ליום"
    : p.priceUnit === "minute"
    ? "לדקה"
    : "לחודש";
}

// Validate/clip everything the client sends — never trust raw input.
export function parseAnswers(raw: unknown): Answers {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const category = CATEGORIES.includes(String(a.category)) ? String(a.category) : "";
  let budget: number | null = null;
  const b = Number(a.budget);
  if (Number.isFinite(b) && b > 0) budget = Math.min(Math.round(b), 5000);
  const priority = PRIORITIES.includes(String(a.priority)) ? String(a.priority) : "balanced";
  let lines = Number(a.lines);
  lines = Number.isFinite(lines) ? Math.min(Math.max(Math.round(lines), 1), 20) : 1;
  const abroad = a.abroad === true || a.abroad === "true";
  return { category, budget, priority, lines, abroad };
}

// Fisher–Yates in-place shuffle (used only to break score ties, see below).
// Accepts an injectable RNG so tests can make the tie-break deterministic.
export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// The score for a plan given the user's answers. Depends ONLY on price + the
// features the user asked for — NEVER on the provider (no brand weighting).
export function scorePlan(p: Plan, ans: Answers): number {
  let s = 0;
  // Cheaper is better, scaled so price dominates a "price" priority.
  s -= (p.price ?? 0) * (ans.priority === "price" ? 1.5 : 1);
  if (ans.abroad && p.hasAbroad) s += 40;
  if (ans.priority === "abroad" && p.hasAbroad) s += 40;
  if (ans.priority === "5g" && p.is5G) s += 30;
  if (ans.priority === "noCommit" && p.noCommit) s += 30;
  // Budget fit: reward plans at/under budget, lightly penalise overruns.
  if (ans.budget != null) s += p.price! <= ans.budget ? 25 : -(p.price! - ans.budget);
  return s;
}

// Rank the catalogue for these answers and keep the top handful per the user's
// category (or, if unset, the cheapest across all). This is what bounds the
// model: it picks ONLY from these rows, so it can't invent plans/prices.
//
// PROVIDER NEUTRALITY: the score (scorePlan) never looks at the provider. When two
// plans score equally we must NOT let snapshot order decide (that would silently,
// persistently favour whichever brand happens to sort first). We shuffle FIRST so
// the stable sort preserves a RANDOM order within each equal-score group — higher
// scores still win, only genuine ties are randomized. (E-E-A-T: no hidden bias.)
export function pickCandidates(plans: Plan[], ans: Answers, rnd: () => number = Math.random): Plan[] {
  const inScope = plans.filter((p) => {
    if (typeof p.price !== "number" || !p.id) return false;
    if (ans.category && p.cat !== ans.category) return false;
    return true;
  });
  const scored = shuffle(inScope.map((p) => ({ p, s: scorePlan(p, ans) })), rnd);
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.p).slice(0, CANDIDATES_PER_CAT);
}

// Compact pipe-delimited rows — small prompt, only real data, with the stable id
// so the model can echo planId back without us trusting a free-text name.
export function buildCatalogueContext(candidates: Plan[]): string {
  return candidates
    .map((p) => {
      const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && "כולל חו״ל"]
        .filter(Boolean)
        .join(", ");
      return `${p.id} | ${p.cat} | ${p.provider} | ${p.plan} | ₪${p.price} ${unitLabel(p)}${flags ? " | " + flags : ""}`;
    })
    .join("\n");
}

// annualSaving must be plausible and snapshot-derived: only computed when the
// user gave a monthly budget (treated as their current bill) and the plan is
// monthly. Otherwise omitted (null). Never client-supplied.
export function annualSaving(plan: Plan, ans: Answers): number | null {
  if (ans.budget == null) return null;
  if (plan.priceUnit && plan.priceUnit !== "month") return null;
  const monthly = ans.budget - (plan.price ?? 0);
  if (monthly <= 0) return null;
  return Math.round(monthly * 12);
}
