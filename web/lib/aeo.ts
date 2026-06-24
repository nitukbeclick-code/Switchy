// ────────────────────────────────────────────────────────────────────────────
// AEO (Answer-Engine-Optimization) helpers — PURE functions over a plan list.
//
// These power the "zero-click" answer surfaces the AEO pages render in their
// INITIAL SSR/ISR HTML so AI answer engines (and humans) get the real answer
// instantly:
//
//   directAnswerFor()  — pillar: zero-click. A 2-3 sentence Hebrew answer that
//                        names the REAL cheapest plan + price + provider, dated
//                        "נכון ל-<חודש שנה>".
//   pageQuestions()    — pillar 5: 3-4 conversational Q + a FACTUAL blockquote A
//                        derived from the data (cheapest, no-commit, 5G, abroad).
//   llmDataFeed()      — pillar 3: a compact machine-readable snapshot of the
//                        comparison for <script type="application/json"
//                        id="llm-data-feed"> so scrapers lift structured truth.
//   methodologyText()  — transparent "how we rank" sentence (E-E-A-T).
//   lastDataDate()     — the real "data as of" date for the page.
//
// 🔴 TRUTH-ONLY: every number / "cheapest" / answer here is COMPUTED from the
// real plan list passed in. Nothing is fabricated. When the data can't support a
// claim (empty list, no qualifying plan), the helper OMITS it (returns "" / []),
// it never guesses. Callers pass the SAME plan list they render + schema, so the
// answer, the table and the JSON-LD always agree.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan } from "./types";
import { ils, priceUnitLabel } from "./format";
import { CATEGORY_HE } from "./categories";

/** Hebrew month names (1–12 → index). Used for the dated "נכון ל-…" stamp. */
const HE_MONTHS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
] as const;

/** "<חודש> <שנה>" for a Date (UTC so output is deterministic across runtimes). */
function heMonthYear(d: Date): string {
  return `${HE_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A finite, positive price guard (skips placeholder/zero rows). */
function priced(p: Plan): p is Plan & { price: number } {
  return typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0;
}

/** The single cheapest priced plan in the list, or undefined when none. */
function cheapest(plans: Plan[]): Plan | undefined {
  let best: Plan | undefined;
  for (const p of plans) {
    if (!priced(p)) continue;
    if (!best || p.price < (best.price as number)) best = p;
  }
  return best;
}

/** The cheapest priced plan matching a predicate, or undefined. */
function cheapestWhere(plans: Plan[], pred: (p: Plan) => boolean): Plan | undefined {
  let best: Plan | undefined;
  for (const p of plans) {
    if (!priced(p) || !pred(p)) continue;
    if (!best || p.price < (best.price as number)) best = p;
  }
  return best;
}

/** Hebrew label for a service: prefer the caller's label, else the category map. */
function serviceLabel(service: string): string {
  return CATEGORY_HE[service] ?? service;
}

/** "₪69 לחודש" — the real headline price + the plan's own per-unit suffix. */
function priceWithUnit(plan: Plan): string {
  return `${ils(plan.price)} ${priceUnitLabel(plan)}`;
}

// ── Direct (zero-click) answer ───────────────────────────────────────────────
/**
 * A 2–3 sentence Hebrew zero-click answer for a service (optionally a city). It
 * NAMES the real cheapest plan, its price (with the plan's per-unit suffix) and
 * provider, then states how many plans were compared and adds a dated freshness
 * stamp ("נכון ל-<חודש שנה>"). When a city is given the framing notes Israeli
 * telecom is national (the same plans apply everywhere) — honest, not invented
 * local data.
 *
 * Returns "" when the list has no priced plan (the caller then omits the block
 * rather than render an empty/false answer).
 */
export function directAnswerFor(
  service: string,
  city: string | undefined,
  plans: Plan[],
  now: Date = new Date(),
): string {
  const best = cheapest(plans);
  if (!best) return "";

  const label = serviceLabel(service);
  const count = plans.filter(priced).length;
  const stamp = heMonthYear(now);
  const where = city ? `ב${city} (וברחבי ישראל) ` : "";

  // Sentence 1 — the answer engines lift this: cheapest plan + price + provider.
  const s1 =
    `המסלול הזול ביותר ל${label} ${where}הוא "${best.plan}" של ${best.provider} ` +
    `במחיר ${priceWithUnit(best)}.`;

  // Sentence 2 — scope + freshness (how many compared, as-of date).
  const s2 =
    count > 1
      ? `המחיר נכון ל-${stamp} ומבוסס על השוואת ${count} מסלולי ${label} בקטלוג שלנו.`
      : `המחיר נכון ל-${stamp}.`;

  // Sentence 3 — honest national-availability note for city pages only.
  const s3 = city
    ? "שירותי התקשורת בישראל ארציים — אותם מסלולים זמינים בכל הערים."
    : "";

  return [s1, s2, s3].filter(Boolean).join(" ");
}

// ── Conversational Q&A (pillar 5) ────────────────────────────────────────────
/** A single question + its factual, data-derived answer. */
export interface AeoQuestion {
  /** The conversational question (Hebrew). */
  question: string;
  /** The factual answer, drawn ONLY from the plan list (Hebrew). */
  answer: string;
}

/**
 * 3–4 conversational questions with FACTUAL answers derived from the plan list:
 * the cheapest overall, the cheapest with no commitment, the cheapest 5G, and the
 * cheapest that bundles abroad use. Each answer names the real plan + price +
 * provider. Questions whose qualifying plan doesn't exist in the list are OMITTED
 * (never answered with a guess), so the result has 0–4 entries depending on data.
 *
 * Designed to feed BOTH the visible <AeoQA> block and `faqPageSchema(...)` from
 * the same source, so the rendered Q&A and the FAQPage JSON-LD always match.
 */
export function pageQuestions(service: string, plans: Plan[]): AeoQuestion[] {
  const label = serviceLabel(service);
  const out: AeoQuestion[] = [];
  const seen = new Set<string>(); // dedupe when the same plan wins several axes

  const push = (question: string, plan: Plan | undefined, lead: string) => {
    if (!plan) return;
    const key = `${question}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      question,
      answer: `${lead} "${plan.plan}" של ${plan.provider} במחיר ${priceWithUnit(plan)}.`,
    });
  };

  push(
    `מהו מסלול ה${label} הזול ביותר?`,
    cheapest(plans),
    `המסלול הזול ביותר הוא`,
  );
  push(
    `מהו מסלול ה${label} הזול ביותר ללא התחייבות?`,
    cheapestWhere(plans, (p) => p.noCommit === true),
    `הזול ביותר שניתן לעזוב בכל עת ללא קנס יציאה הוא`,
  );
  if (service !== "internet" && service !== "tv") {
    push(
      `מהו מסלול ה-5G הזול ביותר ל${label}?`,
      cheapestWhere(plans, (p) => p.is5G === true),
      `מסלול ה-5G הזול ביותר הוא`,
    );
  }
  push(
    `מהו מסלול ה${label} הזול ביותר שכולל שימוש בחו״ל?`,
    cheapestWhere(plans, (p) => p.hasAbroad === true),
    `הזול ביותר שכולל גלישה/שיחות בחו״ל הוא`,
  );

  return out;
}

// ── LLM data feed (pillar 3) ─────────────────────────────────────────────────
/** Caller-supplied context for the feed (all optional, all truthful). */
export interface LlmFeedMeta {
  /** The service slug/label this feed covers, e.g. "cellular". */
  service?: string;
  /** City name when the page is a geo page (availability is still national). */
  city?: string;
  /** Canonical page URL the feed describes. */
  url?: string;
  /** Real "data as of" date (ISO). Defaults to {@link lastDataDate}. */
  asOf?: string;
  /**
   * Whether these plans are the BUNDLED fallback (prices may be slightly behind).
   * Threaded from {@link LiveCatalogue.stale} so the feed is honest about source.
   */
  stale?: boolean;
}

/** One plan as it appears in the machine-readable feed (compact, real fields). */
export interface LlmFeedPlan {
  id: string;
  provider: string;
  plan: string;
  category: string;
  price: number;
  priceUnit: string;
  /** Post-promo price when the plan has a real one, else null. */
  priceAfterPromo: number | null;
  is5G: boolean;
  noCommit: boolean;
  hasAbroad: boolean;
}

/** The full machine-readable comparison snapshot (serialised into the page). */
export interface LlmDataFeed {
  "@context": "https://switchy-ai.com/llm-data-feed";
  source: string;
  service?: string;
  city?: string;
  url?: string;
  asOf: string;
  /** True when the plans are the bundled fallback (prices possibly behind). */
  stale: boolean;
  currency: "ILS";
  planCount: number;
  /** The single cheapest plan id, for instant "what's cheapest" answers. */
  cheapestPlanId: string | null;
  plans: LlmFeedPlan[];
}

/**
 * Build a compact, machine-readable snapshot of the comparison for the page's
 * `<script type="application/json" id="llm-data-feed">`. Lists every real plan
 * (id/provider/price/unit/flags), names the cheapest plan id, carries the
 * currency, the real "as of" date and the `stale` source flag.
 *
 * This is a SUPPLEMENT to schema.org JSON-LD (which engines parse formally) — a
 * dense, easy-to-lift truth table for LLM scrapers. It fabricates nothing: it
 * only re-serialises the plan list it is handed.
 */
export function llmDataFeed(plans: Plan[], meta: LlmFeedMeta = {}): LlmDataFeed {
  const feedPlans: LlmFeedPlan[] = plans.filter(priced).map((p) => ({
    id: p.id,
    provider: p.provider,
    plan: p.plan,
    category: p.cat,
    price: p.price,
    priceUnit: priceUnitLabel(p),
    priceAfterPromo:
      typeof p.after === "number" && Number.isFinite(p.after) ? p.after : null,
    is5G: p.is5G === true,
    noCommit: p.noCommit === true,
    hasAbroad: p.hasAbroad === true,
  }));

  const best = cheapest(plans);

  return {
    "@context": "https://switchy-ai.com/llm-data-feed",
    source: "Switchy AI — מנוע הנתונים",
    ...(meta.service ? { service: meta.service } : {}),
    ...(meta.city ? { city: meta.city } : {}),
    ...(meta.url ? { url: meta.url } : {}),
    asOf: meta.asOf ?? lastDataDate(plans),
    stale: meta.stale === true,
    currency: "ILS",
    planCount: feedPlans.length,
    cheapestPlanId: best ? best.id : null,
    plans: feedPlans,
  };
}

// ── Methodology + freshness ──────────────────────────────────────────────────
/**
 * The transparent, stated methodology behind the page's "cheapest"/rankings — a
 * single honest Hebrew sentence (E-E-A-T). Rendered by <DataMethodology> and
 * mirrored anywhere the page makes a "זול ביותר" claim, so the basis is never
 * covert.
 */
export function methodologyText(): string {
  return (
    "הדירוג מבוסס על המחיר ההתחלתי המפורסם בלבד (₪ לחודש/לחבילה/ליום), " +
    "מהנמוך לגבוה, מתוך קטלוג המסלולים שלנו. איננו ממציאים מחירים, חיסכון או " +
    "דירוגים — כל נתון נלקח מהמסלול עצמו, ומקום שבו נתון חסר הוא מושמט ולא מנוחש. " +
    "מחיר לאחר מבצע מוצג כפי שמפורסם, כאשר קיים."
  );
}

/**
 * The real "data as of" date (ISO yyyy-mm-dd). When any plan carries a real
 * `updated_at`/`updatedAt`, the newest one wins (the genuine freshness of the
 * data); otherwise it falls back to today's date in UTC (a truthful "checked on"
 * stamp for a build-time snapshot — never a fabricated future date).
 */
export function lastDataDate(plans: Plan[], now: Date = new Date()): string {
  let best: number | null = null;
  for (const p of plans) {
    const raw = (p as Record<string, unknown>).updated_at ??
      (p as Record<string, unknown>).updatedAt;
    if (typeof raw !== "string") continue;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) continue;
    if (best == null || t > best) best = t;
  }
  const d = best != null ? new Date(best) : now;
  return d.toISOString().slice(0, 10);
}
