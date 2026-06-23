// Pure, dependency-free ranking + parsing helpers for site-plan-advisor, split
// out of index.ts so they can be unit-tested without booting the Deno.serve
// entrypoint or importing the bundled snapshot (mirrors site-bill-analyzer/lib.ts
// and whatsapp-webhook/intents.ts). No network, no env, no I/O.
//
// RANKING DRIFT FIX (2026-06): this file no longer carries its OWN scoring
// formula. The flat additive scorePlan that used to live here has been replaced
// by the single shared brain in ../_shared/scoring.ts (rankPlans), so the site
// advisor, the app's recommendation_engine, and the WhatsApp/site agent all rank
// plans IDENTICALLY for the same inputs. We keep this file's site-specific
// responsibilities — untrusted-input validation (parseAnswers), the
// catalogue-grounded candidate selection (pickCandidates) with its
// provider-neutral tie-break + never-empty guarantee, the compact catalogue
// prompt (buildCatalogueContext), and the model-writes-reasons-only savings math
// (annualSaving) — but it adapts the site's Answers shape to the shared
// MatchProfile and delegates the actual scoring/ordering to rankPlans.

import {
  annualSaving as sharedAnnualSaving,
  type MatchProfile,
  priorityFromId,
  rankPlans,
  type ScorablePlan,
} from "../_shared/scoring.ts";

// The site's catalogue row shape. A strict subset of the shared ScorablePlan
// (so a Plan[] flows straight into rankPlans), kept here as the snapshot's own
// type so index.ts and the tests don't need to import the richer shared type.
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

// Fisher–Yates in-place shuffle. The shared rankPlans owns the production
// tie-break now (a deterministic, seeded, provider-neutral shuffle); this stays
// exported as a small, separately-testable utility (injectable RNG hook) and is
// the same algorithm rankPlans uses internally.
export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Adapt the site quiz's Answers into the shared MatchProfile so the advisor
// scores through the same brain as the app + WhatsApp. The site's `priority` id
// ("price"/"data"/"abroad"/"noCommit"/"5g"/"balanced") is normalized to a shared
// MatchPriority via priorityFromId (the single mapping every surface uses). The
// quiz collects one money figure, so budget is treated as BOTH the desired ceiling
// AND the current monthly bill (what annualSaving keys off). wants5G/wantsNoCommit/
// wantsAbroad surface the needs-met bonuses for the matching priority/toggle.
export function toProfile(ans: Answers): MatchProfile {
  return {
    category: ans.category,
    currentBill: ans.budget ?? undefined,
    budget: ans.budget ?? undefined,
    priority: priorityFromId(ans.priority),
    lines: ans.lines,
    wants5G: ans.priority === "5g",
    wantsAbroad: ans.abroad || ans.priority === "abroad",
    wantsNoCommit: ans.priority === "noCommit",
  };
}

// Rank the catalogue for these answers and keep the top handful per the user's
// category (or, if unset, across all). This is what bounds the model: it picks
// ONLY from these rows, so it can't invent plans/prices.
//
// SCORING is delegated to the shared rankPlans (../_shared/scoring.ts) — the ONE
// formula every surface uses, so the advisor's order matches the app + WhatsApp.
// rankPlans already guarantees PROVIDER NEUTRALITY (its score never reads the
// provider) and breaks score ties with a deterministic, seeded, provider-free
// shuffle: higher scores always win, genuine ties are reproducibly randomized
// (no brand gets a structural edge, and the same inputs rank the same way on
// every surface). We pre-filter to priced rows that have a stable id — the
// advisor needs `id` to validate the model's planIds against the snapshot, which
// is a site-specific requirement rankPlans (which only needs a finite price)
// doesn't impose. An injectable RNG stays available for deterministic tests.
export function pickCandidates(plans: Plan[], ans: Answers, rnd?: () => number): Plan[] {
  const idPriced = plans.filter((p) => typeof p.price === "number" && !!p.id);
  const profile = toProfile(ans);
  const ranked = rankPlans(idPriced as ScorablePlan[], profile, {
    limit: CANDIDATES_PER_CAT,
    rnd,
  });
  return ranked.map((m) => m.plan as Plan);
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
// monthly. Otherwise OMITTED — index.ts only attaches the field when this returns
// non-null, so a recommendation never carries a fabricated/zero saving. The math
// itself is the shared sharedAnnualSaving ((bill - price) * 12, clamped ≥ 0, real
// monthly bill only), so the figure matches the app + agent; we map its "no real
// saving" sentinel (0) back to null to keep this site contract. Never client-supplied.
export function annualSaving(plan: Plan, ans: Answers): number | null {
  if (ans.budget == null) return null;
  const saving = sharedAnnualSaving(plan as ScorablePlan, ans.budget);
  return saving > 0 ? saving : null;
}
