// ────────────────────────────────────────────────────────────────────────────
// lib/recommend.ts — the web app's copy of THE single, provider-neutral plan
// ranking brain. This MUST stay byte-for-byte equivalent in behaviour to
// supabase/functions/_shared/scoring.ts (the cross-surface source of truth) and
// to lib/services/recommendation_engine.dart in the Flutter app, so the quiz on
// the site, the WhatsApp bot, and the app all rank identical plans identically.
//
// WHY a copy and not an import: _shared/scoring.ts is a Deno module that lives
// outside the Next app's module graph (it has no web build step and is type-
// checked under Deno). Re-implementing the EXACT same pure formula here keeps the
// Next bundle self-contained while a parity test (lib/__tests__/recommend.test.ts)
// guards the two against drift on representative profiles.
//
// E-E-A-T GUARANTEES (identical to scoring.ts):
//   • PROVIDER NEUTRALITY — scorePlan never reads plan.provider; rankPlans breaks
//     score ties with a DETERMINISTIC, seeded (provider-free) shuffle so no brand
//     gets a structural edge AND the order is reproducible across surfaces.
//   • HONEST RATINGS — a plan's rating is a real signal only once reviews > 0;
//     otherwise a neutral 0.6 midpoint (no fabricated social proof).
//   • HONEST SAVINGS — annualSaving is computed ONLY against a real current bill
//     and only for monthly plans; never a promised figure for a named person.
//
// Pure, dependency-free, deterministic. No network, no env, no node:fs — safe to
// import from a client component, a route handler, or a server component.
// ────────────────────────────────────────────────────────────────────────────

/**
 * The catalogue Plan shape this engine scores. A SUPERSET of the fields the
 * formula reads; everything optional so it accepts rows from the bundled
 * catalogue (web/data/catalogue.json) or any caller-built object. Unknown fields
 * are ignored.
 *
 * NOTE on `net`: the bundled catalogue stores `net` in mixed Hebrew/English
 * ("סיב אופטי" | "כבלים" | "בינלאומי" | "5G" | "4G" | "eSIM" | "סטרימינג"),
 * whereas the shared formula keys off English tokens. {@link normalizeNet}
 * folds both into one English vocabulary so speed/coverage score correctly.
 */
export type ScorablePlan = {
  id?: string;
  cat?: string;
  provider?: string;
  plan?: string;
  price?: number;
  after?: number | null; // post-promo monthly price; null = no step-up
  priceUnit?: string; // month | package | day | minute (drives saving eligibility)
  is5G?: boolean;
  noCommit?: boolean;
  hasAbroad?: boolean;
  net?: string; // fiber | 5g | 4G | lte | cable | esim | adsl | satellite | streaming …
  rating?: number; // 0..5 — only a real signal when reviews > 0
  reviews?: number; // count backing `rating`; 0 ⇒ rating is a placeholder
  term?: number | null; // commitment months (for caveats)
  feats?: string[]; // free-text feature blurbs (gig-fiber detection)
  specs?: Record<string, string>;
};

/** What the user is optimising for. One normalized set across every surface. */
export type MatchPriority =
  | "price"
  | "speed"
  | "coverage"
  | "service"
  | "flexibility"
  | "balanced";

/** A snapshot of the user's needs, fed to the engine to score plans. */
export type MatchProfile = {
  category: string; // cellular | internet | tv | triple | abroad ('' = any)
  currentBill?: number; // current monthly spend; 0/undef = unknown
  budget?: number; // desired monthly ceiling; 0/undef = no ceiling
  priority?: MatchPriority;
  lines?: number;
  wants5G?: boolean;
  wantsAbroad?: boolean;
  wantsNoCommit?: boolean;
};

/** A scored plan: 0..100 match score + annual saving + Hebrew reasons/caveats. */
export type PlanMatch = {
  plan: ScorablePlan;
  score: number; // 0..100
  scorePct: number; // score rounded + clamped to 0..100 (what UIs show)
  label: string; // short Hebrew band label
  annualSaving: number; // ₪/year vs current bill, clamped at 0
  reasons: string[];
  caveats: string[];
};

// ── Priority normalization (every surface's id → one MatchPriority) ──────────
export function priorityFromId(id: string | undefined): MatchPriority {
  switch ((id ?? "").toLowerCase()) {
    case "speed":
    case "5g":
      return "speed";
    case "coverage":
      return "coverage";
    case "service":
    case "rating":
      return "service";
    case "flexibility":
    case "flex":
    case "nocommit":
    case "no_commit":
      return "flexibility";
    case "price":
    case "data":
      return "price";
    case "abroad":
    case "balanced":
    default:
      return "balanced";
  }
}

type Weights = {
  price: number;
  saving: number;
  rating: number;
  speed: number;
  coverage: number;
  flex: number;
};

// Base weights sum to 1.0; each priority re-tilts them. Ported VERBATIM from
// _shared/scoring.ts (and the Flutter engine's _weights) so every surface scores
// IDENTICALLY. Do not retune one copy without the other (the parity test guards).
function weightsFor(priority: MatchPriority): Weights {
  switch (priority) {
    case "price":
      return { price: 0.34, saving: 0.34, rating: 0.12, speed: 0.08, coverage: 0.06, flex: 0.06 };
    case "speed":
      return { price: 0.2, saving: 0.16, rating: 0.14, speed: 0.34, coverage: 0.1, flex: 0.06 };
    case "coverage":
      return { price: 0.2, saving: 0.16, rating: 0.16, speed: 0.12, coverage: 0.3, flex: 0.06 };
    case "service":
      return { price: 0.2, saving: 0.18, rating: 0.36, speed: 0.1, coverage: 0.1, flex: 0.06 };
    case "flexibility":
      return { price: 0.24, saving: 0.2, rating: 0.14, speed: 0.08, coverage: 0.06, flex: 0.28 };
    case "balanced":
    default:
      return { price: 0.3, saving: 0.24, rating: 0.16, speed: 0.12, coverage: 0.1, flex: 0.08 };
  }
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/**
 * Fold the catalogue's mixed Hebrew/English `net` value into the single English
 * vocabulary the speed/coverage sub-scores key off. The bundled catalogue uses
 * Hebrew for some technologies ("סיב אופטי" = fiber, "כבלים" = cable,
 * "בינלאומי" = international/eSIM-style abroad, "סטרימינג" = streaming) and
 * English for others ("5G"/"4G"/"eSIM"). Unknown values pass through unchanged
 * (the sub-scores' default branch then applies). PURE — no provider lookup.
 */
export function normalizeNet(net: string | undefined): string | undefined {
  if (!net) return net;
  switch (net) {
    case "סיב אופטי":
      return "fiber";
    case "כבלים":
      return "cable";
    case "סטרימינג":
      return "streaming";
    case "בינלאומי":
      return "esim"; // abroad/international roaming tech — same speed tier as eSIM
    case "5G":
      return "5g";
    case "4G":
      return "4G";
    case "eSIM":
      return "esim";
    default:
      return net;
  }
}

/**
 * Annual saving: ((bill - price) * 12) clamped ≥ 0. Computed ONLY against a real
 * current bill, and only for monthly plans (a per-day/per-package abroad plan
 * can't be compared to a monthly bill). Mirrors the Dart planSaveYear, the site
 * annualSaving, and _shared/scoring.ts — never a promised figure for a person.
 */
export function annualSaving(plan: ScorablePlan, currentBill: number): number {
  if (!(currentBill > 0)) return 0;
  if (plan.priceUnit && plan.priceUnit !== "month") return 0;
  const monthly = currentBill - num(plan.price);
  return Math.max(0, Math.round(monthly * 12));
}

// ── Sub-scores (each 0..1) — ported from recommendation_engine.dart ──────────

function priceScore(plan: ScorablePlan, profile: MatchProfile): number {
  const price = num(plan.price);
  const budget = num(profile.budget);
  const bill = num(profile.currentBill);
  if (budget > 0) {
    if (price <= budget) {
      const under = (budget - price) / budget; // reward headroom under budget
      return clamp(0.7 + under, 0, 1);
    }
    const over = (price - budget) / budget;
    return clamp(0.7 - over, 0, 0.7);
  }
  if (bill > 0) {
    if (price >= bill) return 0.3;
    const cut = (bill - price) / bill;
    return clamp(0.5 + cut, 0, 1);
  }
  // No budget and no bill: cheaper-is-better on an absolute curve.
  return clamp(1 - price / 400, 0.1, 1);
}

function savingScore(saving: number, profile: MatchProfile): number {
  const bill = num(profile.currentBill);
  if (saving <= 0 || bill <= 0) return 0;
  const yearlyBill = bill * 12;
  if (yearlyBill <= 0) return 0;
  return clamp(saving / yearlyBill, 0, 1);
}

// Honest rating signal on 0..1. A plan's `rating` is a real signal only once at
// least one review backs it (reviews > 0); until then it's a placeholder, so we
// return a NEUTRAL 0.6 that neither rewards nor penalises — no fabricated social
// proof. (Identical to the Dart _ratingSignal and _shared/scoring.ts.)
function ratingSignal(plan: ScorablePlan): number {
  if (num(plan.reviews) > 0) return clamp(num(plan.rating) / 5, 0, 1);
  return 0.6;
}

function isGigFiber(plan: ScorablePlan): boolean {
  if (normalizeNet(plan.net) !== "fiber") return false;
  const hay = `${plan.plan ?? ""} ${(plan.feats ?? []).join(" ")} ${Object.values(
    plan.specs ?? {},
  ).join(" ")}`;
  return (
    hay.includes("1000") ||
    hay.includes("2000") ||
    hay.includes("2500") ||
    hay.includes("5000") ||
    hay.includes("גיגה") ||
    hay.includes("1,000Mb") ||
    hay.includes("2,000Mb")
  );
}

function speedScore(plan: ScorablePlan): number {
  if (plan.is5G) return 1.0;
  switch (normalizeNet(plan.net)) {
    case "fiber":
      return isGigFiber(plan) ? 1.0 : 0.82;
    case "5g":
    case "5G":
      return 1.0;
    case "4G":
    case "lte":
    case "LTE":
      return 0.62;
    case "cable":
      return 0.6;
    case "esim":
    case "eSIM":
      return 0.7;
    case "adsl":
      return 0.32;
    case "satellite":
      return 0.45;
    default:
      return 0.6;
  }
}

function coverageScore(plan: ScorablePlan): number {
  let base: number;
  switch (normalizeNet(plan.net)) {
    case "fiber":
    case "5g":
    case "5G":
      base = 0.95;
      break;
    case "4G":
    case "cable":
      base = 0.75;
      break;
    case "lte":
    case "LTE":
      base = 0.7;
      break;
    case "esim":
    case "eSIM":
      base = 0.72;
      break;
    case "satellite":
      base = 0.7;
      break;
    case "adsl":
      base = 0.45;
      break;
    case "streaming":
      base = 0.6;
      break;
    default:
      base = 0.7;
  }
  // Blend in the rating as a real-world reliability proxy (same as the app).
  return clamp(base * 0.7 + ratingSignal(plan) * 0.3, 0, 1);
}

// Short Hebrew label for the score band (mirrors PlanMatch.label in the app).
function bandLabel(score: number): string {
  if (score >= 85) return "התאמה מושלמת";
  if (score >= 70) return "התאמה מצוינת";
  if (score >= 55) return "התאמה טובה";
  return "התאמה סבירה";
}

// ── scorePlan — the single explainable score for one plan ────────────────────
// NEVER looks at plan.provider. Identical math to _shared/scoring.ts + the
// Flutter engine, so every surface produces the same 0..100 score + reasons.
export function scorePlan(plan: ScorablePlan, profile: MatchProfile): PlanMatch {
  const priority = profile.priority ?? "balanced";
  const abroad = profile.category === "abroad";
  const bill = num(profile.currentBill);
  const budget = num(profile.budget);
  const price = num(plan.price);
  const saving = bill > 0 ? annualSaving(plan, bill) : 0;

  const w = weightsFor(priority);
  let score =
    (w.price * priceScore(plan, profile) +
      w.saving * savingScore(saving, profile) +
      w.rating * ratingSignal(plan) +
      w.speed * speedScore(plan) +
      w.coverage * coverageScore(plan) +
      w.flex * (plan.noCommit ? 1.0 : 0.45)) *
    100;

  // Needs-met bonuses (additive) — exactly the app's bumps.
  if (profile.wants5G && plan.is5G) score += 6;
  if (profile.wantsAbroad && plan.hasAbroad) score += 6;
  if (profile.wantsNoCommit && plan.noCommit) score += 5;
  // Budget-overrun penalty.
  if (budget > 0 && price > budget) {
    const over = (price - budget) / budget;
    score -= clamp(over * 40, 0, 35);
  }

  const reasons: string[] = [];
  const caveats: string[] = [];
  if (saving > 0) reasons.push(`חוסך ₪${saving} בשנה`);
  if (budget > 0 && price <= budget) reasons.push("בתוך התקציב שלך");
  // No rating-based reason: rating is a placeholder until reviews > 0, so a
  // "מדורג X★" claim would be fabricated social proof.
  if (plan.is5G) reasons.push("5G מהיר");
  if (isGigFiber(plan)) reasons.push("סיב אופטי במהירות גיגה");
  if (plan.noCommit) reasons.push("ללא התחייבות — ביטול בכל עת");
  if (plan.hasAbroad && !abroad) reasons.push('כולל גלישה בחו"ל');

  const after = num(plan.after);
  if (after > 0 && after !== price) caveats.push(`מחיר מבצע — עולה ל-₪${after} בהמשך`);
  if (!plan.noCommit && num(plan.term) > 0) caveats.push(`התחייבות ל-${num(plan.term)} חודשים`);
  if (budget > 0 && price > budget) caveats.push(`₪${Math.round(price - budget)} מעל התקציב`);

  const clamped = clamp(score, 0, 100);
  return {
    plan,
    score: clamped,
    scorePct: Math.round(clamped),
    label: bandLabel(clamped),
    annualSaving: saving,
    reasons,
    caveats,
  };
}

// ── Deterministic provider-neutral tie-break ─────────────────────────────────
// A small string hash → a seeded RNG. We shuffle equal-score groups so no brand
// gets a structural edge, but the seed makes it REPRODUCIBLE: the same profile
// ranks the same way on every surface. Seed derives from the profile only —
// never from any provider — so it carries no brand bias. (Identical to scoring.ts.)
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromProfile(profile: MatchProfile): number {
  // Provider-free key: only the user's stated inputs.
  const key = [
    profile.category ?? "",
    profile.priority ?? "balanced",
    num(profile.budget),
    num(profile.currentBill),
    num(profile.lines),
    profile.wants5G ? 1 : 0,
    profile.wantsAbroad ? 1 : 0,
    profile.wantsNoCommit ? 1 : 0,
  ].join("|");
  return hashSeed(key);
}

// In-place Fisher–Yates with an injectable RNG (tests pass a fixed RNG).
function shuffleInPlace<T>(arr: T[], rnd: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export type RankOptions = {
  limit?: number; // keep only the top N matches
  /** Test hook: inject a deterministic RNG for the tie-break shuffle. */
  rnd?: () => number;
};

// ── rankPlans — score every plan in the profile's category, best match first ──
// Filters to in-category priced rows, scores each, then sorts by score desc with
// a deterministic provider-neutral tie-break (shuffle FIRST so the stable sort
// preserves a seeded-random order within each equal-score group; then break
// remaining exact ties by higher saving, then lower price — all provider-free).
export function rankPlans(
  plans: ScorablePlan[],
  profile: MatchProfile,
  opts: RankOptions = {},
): PlanMatch[] {
  const inScope = plans.filter((p) => {
    if (typeof p.price !== "number" || !Number.isFinite(p.price)) return false;
    if (profile.category && p.cat !== profile.category) return false;
    return true;
  });

  const rnd = opts.rnd ?? mulberry32(seedFromProfile(profile));
  const scored = inScope.map((p) => scorePlan(p, profile));
  // Shuffle BEFORE sorting so equal-score groups land in seeded-random order
  // (the stable sort then preserves that order within each group). Higher scores
  // still win — only genuine ties are randomized, and the seed makes it
  // reproducible across surfaces.
  shuffleInPlace(scored, rnd);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.annualSaving !== a.annualSaving) return b.annualSaving - a.annualSaving;
    return num(a.plan.price) - num(b.plan.price);
  });

  if (opts.limit != null && opts.limit >= 0 && scored.length > opts.limit) {
    return scored.slice(0, opts.limit);
  }
  return scored;
}

// The single best plan for the profile, or null if the category is empty.
export function bestMatch(
  plans: ScorablePlan[],
  profile: MatchProfile,
  opts: RankOptions = {},
): PlanMatch | null {
  const ranked = rankPlans(plans, profile, { ...opts, limit: 1 });
  return ranked.length ? ranked[0] : null;
}
