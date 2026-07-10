// ────────────────────────────────────────────────────────────────────────────
// lib/bill-forensics.ts — PURE bill forensics (no fs, no network, no state), so
// it is safe to import from a client component AND unit-testable in isolation.
//
// WHAT: turn a parsed bill (what the Gemini-Vision edge analyzer already returns —
// provider, monthly total ₪, category, the REAL cheaper catalogue suggestions) into
// an itemized, EXPLAINABLE anomaly report: "ייתכן שאתה משלם ₪X מיותר", an
// expired-promo flag, an unused/duplicate-service flag, and a total-overpay summary.
//
// This MIRRORS the edge analyzer's grounding (supabase/functions/_shared/catalogue.ts
// → buildSuggestions/annualSaving): the same REAL catalogue, the same monthly →
// annual ×12 math, the same "cheaper regular plan in the same category" rule. We
// never re-derive a different number than the surfaced suggestion — a duplicated
// formula would drift.
//
// HONESTY (E-E-A-T, ABSOLUTE):
//   • A flag fires ONLY when the PARSED DATA SUPPORTS IT — a real ₪ delta vs the
//     real catalogue, never a fabricated overcharge. No real cheaper plan → no
//     overpay flag (we say "you're paying a fair price"), not an invented number.
//   • Anything INFERRED (an expired promo we deduce from the total matching a
//     plan's post-promo `after` price; an unused line we can't positively confirm)
//     is framed with "ייתכן" / "כדאי לבדוק" — never asserted as fact.
//   • Line-item flags require ACTUAL line items in the input. With only a single
//     monthly total (today's Vision read) we emit BILL-LEVEL flags and DO NOT
//     fabricate per-line rows. The shape is forward-compatible: when a future
//     Vision pass extracts itemized rows, the SAME lib flags them per line.
//   • Low read confidence widens the hedging (everything becomes "ייתכן").
//
// This is decision-support, not legal/financial advice — the caller renders a
// "הניתוח אוטומטי, ודאו מול החשבון" caveat. We compute; we never auto-act.
// ────────────────────────────────────────────────────────────────────────────

import { CATEGORY_HE } from "./categories";
import { ils } from "./format";

/**
 * A SLIM, serializable plan subset — exactly the fields the forensics reads. The
 * full catalogue {@link import("./types").Plan} is a server-only shape (it carries
 * fs-loaded extras); the bills page projects each real plan down to this minimal
 * row before passing it across the RSC → client boundary, so a 120-plan catalogue
 * doesn't ship its full payload to the browser. Derived from REAL catalogue rows
 * only — never hand-authored.
 */
export interface ForensicsPlan {
  cat: string;
  provider: string;
  plan: string;
  /** Headline / promo monthly price, ₪. */
  price: number;
  /** Post-promo price, ₪ — null when the plan has no step-up. */
  after: number | null;
  /** Plan sub-variant (regular/dataonly/kosher); defaults to "regular". */
  kind?: string;
}

/** A cheaper-plan suggestion, identical in shape to the analyze-bill result. */
export interface ForensicsSuggestion {
  id?: string;
  name: string;
  provider: string;
  price: number;
  annualSaving: number;
}

/**
 * An OPTIONAL parsed bill line. Today's Vision read returns only a single monthly
 * total, so `lineItems` is usually absent — the analyzer emits bill-level flags
 * instead. When present (a future itemized read), each line is flagged on its own
 * merits. A line is only ever surfaced when it carries a real, finite ₪ amount.
 */
export interface BillLineItem {
  /** The label exactly as it appears on the bill (e.g. "ביטוח מכשיר", "VOD"). */
  label: string;
  /** Monthly charge for this line, in ₪ (finite, ≥ 0). */
  amount: number;
  /** Optional category for this line (defaults to the bill's category). */
  cat?: string;
}

/** The parsed-bill input — a superset-safe view of the analyze-bill result. */
export interface ForensicsInput {
  /** Normalized provider display name ("" when not identified). */
  provider: string;
  /** Total monthly spend extracted from the bill, ₪ (0 when unreadable). */
  currentSpend: number;
  /** Catalogue category id (cellular | internet | tv | triple | abroad | ""). */
  category: string;
  /** REAL cheaper catalogue plans in the same category (from the analyzer). */
  suggestions: ForensicsSuggestion[];
  /** Vision read confidence, 0–1. Low confidence widens "ייתכן" hedging. */
  confidence: number;
  /** OPTIONAL parsed line items. Absent today → bill-level flags only. */
  lineItems?: BillLineItem[];
}

/** Severity drives the visual tone of a flag (info → warn → alert). */
export type FlagSeverity = "info" | "warn" | "alert";

/**
 * How sure we are of a flag:
 *   • "confirmed" — backed by a real ₪ delta vs the real catalogue (asserted).
 *   • "likely"    — inferred from the data (the bill matches a post-promo price,
 *                   a low-confidence read) → MUST be framed with "ייתכן".
 */
export type FlagConfidence = "confirmed" | "likely";

/** A single, explainable finding in the forensics report. */
export interface ForensicsFlag {
  /** Stable id for keys / analytics (e.g. "overpay", "expired-promo"). */
  kind: "overpay" | "expired-promo" | "unused-line" | "duplicate-line";
  severity: FlagSeverity;
  confidence: FlagConfidence;
  /** Short Hebrew headline, e.g. "ייתכן שאתה משלם ₪41 מיותר בחודש". */
  title: string;
  /** One-line Hebrew explanation grounded in the real ₪ delta / catalogue. */
  detail: string;
  /** The monthly ₪ this flag accounts for (0 when not a ₪ figure). */
  monthly: number;
  /** The annual ₪ this flag accounts for (monthly × 12; 0 when N/A). */
  annual: number;
}

/** The full forensics report the component renders. */
export interface ForensicsReport {
  /** Whether there is anything to show at all (a readable bill). */
  readable: boolean;
  /** Ordered findings (highest-saving / most-severe first). */
  flags: ForensicsFlag[];
  /** Total monthly overpay across all ₪-bearing flags, ₪. */
  totalMonthlyOverpay: number;
  /** Total annual overpay (monthly × 12), ₪. */
  totalAnnualOverpay: number;
  /**
   * True when EVERY flag is merely "likely" (or there are none) — the caller
   * leans harder on the "ייתכן / ודאו מול החשבון" framing.
   */
  allInferred: boolean;
  /** The single best (largest-saving) cheaper plan, or null when none. */
  bestAlternative: ForensicsSuggestion | null;
  /** Hebrew category label for the bill, "" when unknown. */
  categoryLabel: string;
}

/** Below this confidence the read is shaky → every flag is hedged to "likely". */
const LOW_CONFIDENCE = 0.6;
/** Ignore sub-shekel deltas — rounding noise, not a real overcharge. */
const MIN_DELTA = 1;

// ₪-format a rounded integer — re-exported from the single lib/format source so
// the forensics report groups thousands identically to the rest of /bills.
export { ils };

/** Round to a whole shekel; clamp negatives to 0 (never a "negative overpay"). */
function shekels(n: number): number {
  return Math.max(0, Math.round(Number.isFinite(n) ? n : 0));
}

/** The largest-saving suggestion, or null when there are no real cheaper plans. */
export function bestAlternative(
  suggestions: ForensicsSuggestion[],
): ForensicsSuggestion | null {
  let best: ForensicsSuggestion | null = null;
  for (const s of suggestions) {
    if (!s || !(s.price >= 0)) continue;
    if (!best || s.annualSaving > best.annualSaving) best = s;
  }
  return best;
}

/**
 * BILL-LEVEL overpay flag, grounded in the REAL catalogue: the gap between the
 * current monthly spend and the cheapest comparable plan the analyzer already
 * surfaced. This is the SAME number as the headline suggestion saving (no drift):
 * monthly delta = currentSpend − bestAlternative.price, annual = ×12.
 *
 * "confirmed" when the read is clear (a real cheaper plan exists at a real lower
 * price); softened to "likely" (→ "ייתכן") on a low-confidence read. Returns null
 * when there is NO cheaper plan — we never fabricate an overpay.
 */
function overpayFlag(input: ForensicsInput): ForensicsFlag | null {
  const best = bestAlternative(input.suggestions);
  if (!best) return null;
  const monthly = shekels(input.currentSpend - best.price);
  if (monthly < MIN_DELTA) return null;
  const annual = shekels(monthly * 12);
  const lowConf = input.confidence < LOW_CONFIDENCE;
  const catLabel = CATEGORY_HE[input.category] ?? "";
  const inCat = catLabel ? `ב${catLabel} ` : "";
  return {
    kind: "overpay",
    severity: annual >= 600 ? "alert" : "warn",
    confidence: lowConf ? "likely" : "confirmed",
    title: lowConf
      ? `ייתכן שאתה משלם ${ils(monthly)} מיותר בחודש`
      : `אתה משלם ${ils(monthly)} מיותר בחודש`,
    detail:
      `נמצא מסלול ${inCat}של ${best.provider} ב-${ils(best.price)} לחודש לעומת ` +
      `${ils(input.currentSpend)} שאתה משלם — פער של ${ils(monthly)} בחודש, ` +
      `${ils(annual)} בשנה.`,
    monthly,
    annual,
  };
}

/**
 * EXPIRED-PROMO flag — INFERRED, always "likely" (→ "ייתכן"). When a real plan in
 * the same category has a post-promo `after` price, and the user's current spend
 * is at/above that `after` while the promo `price` is meaningfully lower, the bill
 * looks like a promo that has already stepped up. We frame it as a question to
 * check, never a fact, and ground it in the real plan's two real prices.
 *
 * Requires `plans` (the real catalogue) — the only place the lib reads catalogue
 * beyond the analyzer's own suggestions, so it can spot the promo→after pattern.
 */
function expiredPromoFlag(
  input: ForensicsInput,
  plans: ForensicsPlan[],
): ForensicsFlag | null {
  if (!(input.currentSpend > 0) || !input.category) return null;
  // The real plan whose post-promo price best explains the current spend: same
  // category, a real `after` step-up (after > price), and currentSpend within a
  // small band of `after`. Pick the one with the biggest promo→after gap (the most
  // money back if they re-negotiate / switch to the promo price).
  let match: { promo: number; after: number; provider: string; name: string } | null = null;
  for (const p of plans) {
    if (p.cat !== input.category) continue;
    if ((p.kind ?? "regular") !== "regular") continue;
    const promo = typeof p.price === "number" ? p.price : NaN;
    const after = typeof p.after === "number" ? p.after : NaN;
    if (!Number.isFinite(promo) || !Number.isFinite(after)) continue;
    if (after <= promo) continue; // no real step-up
    // Current spend looks like the post-promo price (within ±10% or ±₪5).
    const tol = Math.max(5, after * 0.1);
    if (Math.abs(input.currentSpend - after) > tol) continue;
    const gap = after - promo;
    if (!match || gap > match.after - match.promo) {
      match = { promo, after, provider: p.provider, name: String(p.plan ?? "") };
    }
  }
  if (!match) return null;
  const monthly = shekels(input.currentSpend - match.promo);
  if (monthly < MIN_DELTA) return null;
  const annual = shekels(monthly * 12);
  return {
    kind: "expired-promo",
    severity: "warn",
    confidence: "likely",
    title: "ייתכן שתקופת המבצע שלך הסתיימה",
    detail:
      `הסכום שאתה משלם (${ils(input.currentSpend)}) קרוב למחיר שאחרי המבצע. ` +
      `מסלולים דומים מתחילים ב-${ils(match.promo)} לחודש — כדאי לבדוק מול הספק ` +
      `אם המחיר עלה בתום תקופת ההטבה.`,
    monthly,
    annual,
  };
}

/**
 * LINE-ITEM flags — fire ONLY when the input actually carries parsed line items
 * (a future itemized Vision read). With no line items we emit NOTHING here rather
 * than fabricate per-line rows. Two patterns, both data-backed:
 *   • duplicate-line: two lines share a (normalized) label → likely double-charge.
 *   • unused-line: an add-on the user may not need (insurance/VOD/extra line) —
 *     INFERRED, always "likely" ("ייתכן שאינך משתמש בשירות הזה").
 */
function lineItemFlags(input: ForensicsInput): ForensicsFlag[] {
  const items = (input.lineItems ?? []).filter(
    (l): l is BillLineItem =>
      !!l && typeof l.label === "string" && Number.isFinite(l.amount) && l.amount > 0,
  );
  if (items.length === 0) return [];

  const flags: ForensicsFlag[] = [];

  // ── Duplicate lines: same normalized label appearing more than once. ──────
  const byLabel = new Map<string, BillLineItem[]>();
  for (const l of items) {
    const key = l.label.trim().toLowerCase();
    const list = byLabel.get(key);
    if (list) list.push(l);
    else byLabel.set(key, [l]);
  }
  for (const group of byLabel.values()) {
    if (group.length < 2) continue;
    // The duplicate(s) beyond the first are the candidate double-charge.
    const dupMonthly = shekels(
      group.slice(1).reduce((sum, l) => sum + l.amount, 0),
    );
    if (dupMonthly < MIN_DELTA) continue;
    flags.push({
      kind: "duplicate-line",
      severity: "alert",
      confidence: "likely",
      title: `ייתכן חיוב כפול על "${group[0].label}"`,
      detail:
        `הסעיף "${group[0].label}" מופיע ${group.length} פעמים בחשבון ` +
        `(${ils(dupMonthly)} נוספים בחודש). כדאי לוודא מול הספק שאין חיוב כפול.`,
      monthly: dupMonthly,
      annual: shekels(dupMonthly * 12),
    });
  }

  // ── Unused / optional add-ons (insurance, VOD, extra line, premium SMS). ──
  for (const l of items) {
    if (!isOptionalAddOn(l.label)) continue;
    const monthly = shekels(l.amount);
    if (monthly < MIN_DELTA) continue;
    flags.push({
      kind: "unused-line",
      severity: "info",
      confidence: "likely",
      title: `ייתכן שאתה משלם על תוספת שאינך צריך: "${l.label}"`,
      detail:
        `סעיף "${l.label}" מחויב ב-${ils(monthly)} בחודש (${ils(monthly * 12)} ` +
        `בשנה). אם אינך משתמש בו — כדאי לבדוק ביטול מול הספק.`,
      monthly,
      annual: shekels(monthly * 12),
    });
  }

  return flags;
}

/**
 * Heuristic: does a line label look like an OPTIONAL add-on the user might not
 * need? Conservative Hebrew/English cues only — we'd rather miss a real one than
 * flag a core service. Always rendered as "ייתכן", never asserted.
 */
const OPTIONAL_ADDON_CUES = [
  "ביטוח",
  "השכרת",
  "vod",
  "סטרימינג בתוספת",
  "ערוץ פרימיום",
  "חבילת תוכן",
  "מספר נוסף",
  "קו נוסף",
  "שיחות לחו",
  "premium",
  "insurance",
];

export function isOptionalAddOn(label: string): boolean {
  const s = (label ?? "").trim().toLowerCase();
  if (!s) return false;
  return OPTIONAL_ADDON_CUES.some((cue) => s.includes(cue.toLowerCase()));
}

/**
 * Build the full forensics report from a parsed bill + the real catalogue.
 *
 * Ordering: ₪-bearing flags by annual saving (desc), so the biggest opportunity
 * leads. The total-overpay summary sums ONLY the bill-level overpay + real line
 * items — it does NOT double-count the inferred expired-promo (which is a subset
 * of the same monthly spend, surfaced as context, not additive savings).
 */
export function analyzeBill(
  input: ForensicsInput,
  plans: ForensicsPlan[] = [],
): ForensicsReport {
  const categoryLabel = CATEGORY_HE[input.category] ?? "";
  const best = bestAlternative(input.suggestions);

  // Unreadable bill → nothing to report (the caller shows the "couldn't read"
  // state). Guard on a real spend so we never emit a ₪0 forensics card.
  if (!(input.currentSpend > 0)) {
    return {
      readable: false,
      flags: [],
      totalMonthlyOverpay: 0,
      totalAnnualOverpay: 0,
      allInferred: true,
      bestAlternative: best,
      categoryLabel,
    };
  }

  const flags: ForensicsFlag[] = [];

  // 1) Bill-level overpay vs the real catalogue (the headline, confirmed number).
  const overpay = overpayFlag(input);
  if (overpay) flags.push(overpay);

  // 2) Line-item flags — only when the input actually carries parsed lines.
  const lineFlags = lineItemFlags(input);
  for (const f of lineFlags) flags.push(f);

  // 3) Expired-promo — inferred context, always "ייתכן". Added AFTER so it never
  //    outranks a confirmed overpay; excluded from the additive total below.
  const promo = expiredPromoFlag(input, plans);
  if (promo) flags.push(promo);

  // Sort: confirmed before likely, then by annual ₪ (desc), then by severity.
  const sevRank: Record<FlagSeverity, number> = { alert: 0, warn: 1, info: 2 };
  flags.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "confirmed" ? -1 : 1;
    if (b.annual !== a.annual) return b.annual - a.annual;
    return sevRank[a.severity] - sevRank[b.severity];
  });

  // Total overpay: the bill-level overpay + real (non-inferred-promo) line items.
  // The expired-promo flag describes the SAME spend from another angle, so it is
  // NOT summed — adding it would double-count and inflate the "total wasted".
  const additive = flags.filter((f) => f.kind !== "expired-promo");
  const totalMonthlyOverpay = shekels(
    additive.reduce((sum, f) => sum + f.monthly, 0),
  );
  const totalAnnualOverpay = shekels(totalMonthlyOverpay * 12);

  const allInferred =
    flags.length === 0 || flags.every((f) => f.confidence === "likely");

  return {
    readable: true,
    flags,
    totalMonthlyOverpay,
    totalAnnualOverpay,
    allInferred,
    bestAlternative: best,
    categoryLabel,
  };
}
