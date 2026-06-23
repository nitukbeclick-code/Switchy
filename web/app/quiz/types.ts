// ────────────────────────────────────────────────────────────────────────────
// Quiz wire types — the shape /api/recommend returns and <QuizWizard> consumes.
//
// Kept in its own pure (node-free) module so the CLIENT component (QuizWizard) can
// import the type WITHOUT pulling the route's server-only deps (lib/data → node:fs)
// into the client bundle. The route imports the same type, so the client and the
// API can never disagree on the contract.
// ────────────────────────────────────────────────────────────────────────────

/**
 * One ranked REAL catalogue plan returned to the quiz client. Every field is a
 * genuine catalogue value (id/provider/plan/price/after) or an explainable output
 * of the shared ranking formula (score/label/annualSaving/reasons/caveats) —
 * nothing here is fabricated.
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
  /** Headline price in ₪. */
  price: number;
  /** Post-promo price in ₪ when the headline is a promo, else null. */
  after: number | null;
  /** Hebrew per-unit price suffix (לחודש / לחבילה / …) — owned by lib/format.ts. */
  priceUnit: string;
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
