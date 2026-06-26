// ────────────────────────────────────────────────────────────────────────────
// Quiz wire types — the shape /api/recommend returns and <QuizWizard> consumes.
//
// Kept in its own pure (node-free) module so the CLIENT component (QuizWizard) can
// import the type WITHOUT pulling the route's server-only deps (lib/data → node:fs)
// into the client bundle. The route imports the same type, so the client and the
// API can never disagree on the contract.
// ────────────────────────────────────────────────────────────────────────────

/** One labelled rich field for a quiz match — mirrors lib/plan-display's PlanField. */
export interface RecommendMatchField {
  /** The Hebrew column label, e.g. "נפח" / "נתב" / "מהירות". */
  label: string;
  /** The non-empty display value (rendered verbatim). */
  value: string;
}

/** The honest post-promo line for a quiz match — mirrors lib/plan-display's after. */
export interface RecommendMatchAfter {
  /** "jump" = price genuinely rises after the promo; "fixed" = price stays put. */
  kind: "jump" | "fixed";
  /** Ready-to-render Hebrew string ("₪196/ח׳" for a jump, "מחיר קבוע" for fixed). */
  text: string;
}

/**
 * One ranked REAL catalogue plan returned to the quiz client. Every field is a
 * genuine catalogue value (id/provider/plan/price/after) or an explainable output
 * of the shared ranking formula (score/label/annualSaving/reasons/caveats) —
 * nothing here is fabricated.
 *
 * The RICH display fields (priceText / afterLabel / fields / perks) are computed
 * SERVER-SIDE from the full catalogue Plan via lib/plan-display.ts — the SAME
 * helper the comparison tables use — so the quiz result cards surface the same
 * category-aware catalogue data (post-promo price, decoder/router/installation,
 * data/speed/minutes specs, perks) and can never drift from the tables.
 */
export interface RecommendMatch {
  /** Stable catalogue id, e.g. "cel_cellcom_5gprocare1500". */
  id: string;
  /** Provider display name (e.g. "סלקום"). */
  provider: string;
  /** Plan display name. */
  plan: string;
  /** Category bucket (cellular | internet | tv | triple | abroad). */
  cat: string;
  /** Headline price in ₪ (the rounded sort key — for honest framing/comparisons). */
  price: number;
  /** Post-promo price in ₪ when the headline is a promo, else null. */
  after: number | null;
  /** Hebrew per-unit price suffix (לחודש / לחבילה / …) — owned by lib/format.ts. */
  priceUnit: string;
  /**
   * Exact-aware headline price STRING (e.g. "69.90" / "70", no ₪ prefix) from
   * plan-display.priceText — what the card renders, matching the comparison table.
   */
  priceText: string;
  /** The honest post-promo line (jump vs "מחיר קבוע") from plan-display.afterPriceLabel. */
  afterLabel: RecommendMatchAfter;
  /**
   * Ordered, category-relevant rich fields (נפח / מהירות / נתב / ממיר / התקנה /
   * דקות / חו״ל …) from plan-display.planFieldsForCategory — only fields that exist
   * on the plan, truth-only. Empty when the plan carries none.
   */
  fields: RecommendMatchField[];
  /** Qualitative perks ("מידע נוסף") from plan-display.perks — empty when none. */
  perks: string[];
  is5G: boolean;
  noCommit: boolean;
  hasAbroad: boolean;
  /** 0..100 match score (rounded) — what the UI shows. */
  score: number;
  /** Short Hebrew band label (e.g. "התאמה מצוינת"). */
  label: string;
  /** ₪/year saving vs the current bill — 0 unless a real bill was supplied. */
  annualSaving: number;
  /** Hebrew reasons this plan ranked here. */
  reasons: string[];
  /** Hebrew caveats (promo step-up, commitment, over budget). */
  caveats: string[];
}

/** The successful /api/recommend response body. */
export interface RecommendResponse {
  ok: true;
  category: string;
  priority: string;
  matches: RecommendMatch[];
  /** True when the request supplied a real current bill (annualSaving meaningful). */
  hasBill: boolean;
}
