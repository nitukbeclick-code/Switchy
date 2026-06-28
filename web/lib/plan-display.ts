// ────────────────────────────────────────────────────────────────────────────
// plan-display — the SINGLE source of truth for turning a catalogue {@link Plan}
// into the category-aware, ready-to-render display data the comparison views
// show. It MIRRORS the static site's `comparisonTable` helpers (site/build.js
// ~lines 804-870): the same `afterCell` / `fee` / `spec` / `info` / `price`
// semantics, ported to typed, null-safe, pure TypeScript.
//
// TRUTH-ONLY: every accessor reads ONLY what exists on the plan. A missing field
// returns `null` (callers OMIT the row) — nothing is fabricated, no price/perk is
// invented, and a price that does not jump after the promo is honestly marked
// "מחיר קבוע" (matching the static `afterCell`'s "קבוע") rather than a bare "—".
//
// Pure + side-effect-free → safe to call in RSC render, in client components, and
// in tests. No React, no fs, no network here.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan } from "./types";
import { priceUnitShort } from "./format";

// ── Price helpers ────────────────────────────────────────────────────────────

/**
 * The display price string, preferring the EXACT advertised price (e.g. 69.90)
 * when it isn't a whole shekel; otherwise the rounded `price` int. Mirrors the
 * static site's `priceText`. The rounded int stays the sort key elsewhere — this
 * is presentation only.
 */
export function priceText(plan: Plan): string {
  const exact = numOrNull(plan.priceExact);
  if (exact != null) {
    return Number.isInteger(exact) ? String(exact) : exact.toFixed(2);
  }
  return String(plan.price);
}

/** The same exact-vs-rounded logic for the POST-promo price (`afterExact ?? after`). */
function afterText(plan: Plan): string | null {
  const exact = numOrNull(plan.afterExact);
  const after = exact ?? numOrNull(plan.after);
  if (after == null) return null;
  return Number.isInteger(after) ? String(after) : after.toFixed(2);
}

/** Whether the post-promo price is a genuine JUMP above the headline price. */
function hasPriceJump(plan: Plan): boolean {
  const after = numOrNull(plan.afterExact) ?? numOrNull(plan.after);
  return after != null && after > plan.price;
}

/**
 * The post-promo price label for a plan, mirroring the static site's `afterCell`:
 *
 * - JUMP (after > price): `{ kind: "jump", text: "₪196/ח׳", amount }` — the real
 *   price the customer pays once the promo ends, with the per-unit suffix.
 * - FIXED (no jump, or no `after` at all): `{ kind: "fixed", text: "מחיר קבוע" }`
 *   — an HONEST "price stays the same" marker, NOT a meaningless bare "—".
 *
 * The `amount` (when present) is the exact post-promo number for callers that
 * want to format it themselves; `text` is the ready-to-render Hebrew string.
 */
export function afterPriceLabel(plan: Plan): {
  kind: "jump" | "fixed";
  text: string;
  amount: number | null;
} {
  if (hasPriceJump(plan)) {
    const amount = numOrNull(plan.afterExact) ?? numOrNull(plan.after);
    return {
      kind: "jump",
      text: `₪${afterText(plan)}${priceUnitShort(plan)}`,
      amount,
    };
  }
  return { kind: "fixed", text: "מחיר קבוע", amount: null };
}

// ── fee / spec accessors (null-safe, alt-key aware) ──────────────────────────

/**
 * Read a FEE off `plan.fees` by Hebrew key, trying `key` then each `alts` in
 * order (e.g. `fee(p, "נתב", "ראוטר")`). Returns the first non-empty string
 * value, or `null` when none is present — mirrors the static `fee()` helper but
 * null-safe and typed. Never fabricates a value.
 */
export function fee(plan: Plan, key: string, ...alts: string[]): string | null {
  return readMap(plan.fees, key, alts);
}

/**
 * Read a SPEC off `plan.specs` by Hebrew key, trying `key` then each `alts`
 * (e.g. `spec(p, "נתונים", "נפח")`). First non-empty value or `null`. Mirrors the
 * static `spec()` helper. Never fabricates a value.
 */
export function spec(plan: Plan, key: string, ...alts: string[]): string | null {
  return readMap(plan.specs, key, alts);
}

// ── perks (qualitative "מידע נוסף") ──────────────────────────────────────────

/**
 * Tokens that are pure spec noise in the `feats` list — volume / minutes / SMS /
 * speed / 5G — already shown in their own columns. Mirrors the static `info()`
 * filter regex `/^\d|GB|דק|SMS|מגה|Mb|^5G$/i` so a perk like "1500GB גלישה" or
 * "עד 300/100Mb" is dropped from the qualitative perks line (it's a duplicate of
 * the נפח / מהירות column) while a real perk like "נתיב מהיר" survives.
 */
const PERK_NOISE = /^\d|GB|דק|SMS|מגה|Mb|^5G$/i;

/**
 * The qualitative perks for a plan — the static site's "מידע נוסף". Built from
 * `plan.feats`, dropping the raw spec tokens (see {@link PERK_NOISE}); when no
 * feats survive, falls back to `plan.fineLines`, then a single-item `plan.notes`.
 * Returns an ordered, de-duplicated string[] (possibly empty). Never invents a
 * perk — only real catalogue text is surfaced.
 */
export function perks(plan: Plan): string[] {
  const feats = toStringArray(plan.feats).filter(
    (x) => x && !PERK_NOISE.test(x),
  );
  if (feats.length) return dedupe(feats);

  const fineLines = toStringArray(plan.fineLines);
  if (fineLines.length) return dedupe(fineLines);

  const notes = typeof plan.notes === "string" ? plan.notes.trim() : "";
  return notes ? [notes] : [];
}

/**
 * The FULL fine-print for a plan — every `fineLines` entry (the static site's
 * "פרטים מלאים" modal content). Used to back the mobile "פרטים מלאים ▾"
 * disclosure. Ordered + de-duplicated; empty when the plan carries none.
 */
export function fineLines(plan: Plan): string[] {
  return dedupe(toStringArray(plan.fineLines));
}

// ── ordered, category-aware field rows ───────────────────────────────────────

/** One labelled display row: a Hebrew column label + its rendered value. */
export interface PlanField {
  /** The Hebrew column label, e.g. "נפח" / "נתב" / "מהירות". */
  label: string;
  /** The non-empty display value (callers render verbatim). */
  value: string;
}

/**
 * The complete category-aware display bundle for a single plan — the one shape
 * every comparison view (mobile card + desktop table) renders from, so the two
 * can never drift. All strings are ready to render; `fields` is the ordered list
 * of the category's rich columns (price/after handled separately by the view).
 */
export interface PlanDisplay {
  /** The plan this bundle describes (handy for keys / callbacks). */
  plan: Plan;
  /** Headline price string (exact-aware), e.g. "69.90" / "70" — no ₪ prefix. */
  price: string;
  /** Short per-unit suffix for the headline price, e.g. "/ח׳" / "/חבילה". */
  priceUnit: string;
  /** The post-promo price label (jump vs fixed) — see {@link afterPriceLabel}. */
  after: ReturnType<typeof afterPriceLabel>;
  /** Ordered category-specific rich fields (נפח / מהירות / נתב / ממיר / …). */
  fields: PlanField[];
  /** Qualitative perks ("מידע נוסף") — see {@link perks}. */
  perks: string[];
  /** Full fine-print for the "פרטים מלאים" disclosure — see {@link fineLines}. */
  fineLines: string[];
}

/**
 * The ORDERED rich fields for a plan, chosen by its category — the typed mirror
 * of the static site's per-category `head`/`row` arrays:
 *
 * - internet: מהירות, נתב, מגדיל טווח, התקנה
 * - tv / triple: ממיר, נתב, התקנה
 * - abroad: נפח, תוקף
 * - cellular (default): דמי חיבור, נפח, דקות/SMS, חו״ל
 *
 * Only fields with a REAL value are included (truth-only — a plan missing נתב
 * simply omits that row, never a fabricated dash). The price + post-promo columns
 * are NOT included here (the view renders them prominently); this is the
 * "everything else" the static table shows.
 */
export function planFieldsForCategory(plan: Plan): PlanField[] {
  const out: PlanField[] = [];
  const push = (label: string, value: string | null) => {
    if (value) out.push({ label, value });
  };

  switch (plan.cat) {
    case "internet":
      push("מהירות", spec(plan, "מהירות", "גלישה"));
      push("נתב", fee(plan, "נתב", "ראוטר"));
      push("מגדיל טווח", fee(plan, "מגדיל טווח", "מרחיב טווח"));
      push("התקנה", fee(plan, "התקנה", "חיבור"));
      break;

    case "tv":
    case "triple":
      push("ממיר", fee(plan, "ממיר", "ממירים"));
      push("נתב", fee(plan, "נתב", "ראוטר"));
      push("התקנה", fee(plan, "התקנה", "חיבור"));
      break;

    case "abroad":
      push("נפח", spec(plan, "נתונים", "נפח"));
      push("תוקף", spec(plan, "תוקף", "ימים"));
      break;

    case "cellular":
    default:
      push("דמי חיבור", fee(plan, "דמי חיבור"));
      push("נפח", spec(plan, "נתונים", "נפח"));
      push("דקות/SMS", minutesAndSms(plan));
      push("חו״ל", abroadValue(plan));
      break;
  }

  return out;
}

/**
 * The full {@link PlanDisplay} bundle for a plan — the one call a comparison view
 * makes to get everything it needs, category-aware and truth-only.
 */
export function planDisplay(plan: Plan): PlanDisplay {
  return {
    plan,
    price: priceText(plan),
    priceUnit: priceUnitShort(plan),
    after: afterPriceLabel(plan),
    fields: planFieldsForCategory(plan),
    perks: perks(plan),
    fineLines: fineLines(plan),
  };
}

/** Alias of {@link planFieldsForCategory} — the ordered rich rows for a plan. */
export const planRows = planFieldsForCategory;

// ── detail page bundle (the rich mobile plan-detail surface) ─────────────────

/**
 * The ORDERED equipment / one-off-fee rows a detail page surfaces — the typed
 * mirror of the Flutter `_PaymentsEquipmentSection` ("תשלומים וציוד"). Each entry
 * is a real `{ label, value }` charge read off `plan.fees` (alt-key aware), so the
 * true cost of the line — connection, installation, router, decoder, range
 * extender — is never buried. Truth-only: a fee the plan doesn't carry is OMITTED.
 *
 * `label` is the canonical Hebrew column header; `value` is the catalogue's own
 * verbatim string (e.g. "₪149" / "+₪19.9/ח׳" / "אין"). Never computed or invented.
 */
export function planFees(plan: Plan): PlanField[] {
  const out: PlanField[] = [];
  const push = (label: string, value: string | null) => {
    if (value) out.push({ label, value });
  };
  // Canonical order + alt-keys mirror the static site / Flutter equipment list.
  push("דמי חיבור", fee(plan, "דמי חיבור", "חיבור", "הצטרפות"));
  push("התקנה", fee(plan, "התקנה"));
  push("נתב", fee(plan, "נתב", "ראוטר"));
  push("ממיר", fee(plan, "ממיר", "ממירים", "מקלט"));
  push("מגדיל טווח", fee(plan, "מגדיל טווח", "מרחיב טווח"));
  return out;
}

/**
 * Every spec on the plan as ordered `{ label, value }` rows — the FULL spec map,
 * NOT the category subset {@link planFieldsForCategory} renders. Backs the detail
 * page's "מפרט" grid (the Flutter `_SpecGrid`), which shows the whole `plan.specs`
 * dict verbatim. Insertion order of the catalogue map is preserved; empty values
 * are dropped (truth-only). Empty when the plan carries no specs.
 */
export function allSpecs(plan: Plan): PlanField[] {
  const map = plan.specs;
  if (!map || typeof map !== "object") return [];
  const out: PlanField[] = [];
  for (const [label, raw] of Object.entries(map as Record<string, unknown>)) {
    const key = typeof label === "string" ? label.trim() : "";
    if (!key) continue;
    let value: string | null = null;
    if (typeof raw === "string") {
      const t = raw.trim();
      value = t || null;
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      value = String(raw);
    }
    if (value) out.push({ label: key, value });
  }
  return out;
}

/**
 * The full detail-page bundle — EVERYTHING the rich mobile plan-detail surface
 * needs, in one truth-only call. A superset of {@link PlanDisplay}: it adds the
 * complete spec list, the structured equipment/fee rows, and the textual extras
 * (terms / eligibility / notes / source / freshness) the detail page shows beyond
 * the compact comparison card.
 *
 * TRUTH-ONLY: optional textual fields are present ONLY when the plan really
 * carries non-empty data — absent ones are left `undefined`/empty so callers can
 * omit their rows without inventing content. No ratings are fabricated here:
 * rating/review rendering MUST go through `getAggregateRating`, which returns
 * `null` when there's no real data.
 */
export interface PlanDetail {
  /** The plan this bundle describes. */
  plan: Plan;
  /** Headline price string (exact-aware), e.g. "69.90" — no ₪ prefix. */
  price: string;
  /** Short per-unit suffix for the headline price, e.g. "/ח׳" / "/חבילה". */
  priceUnit: string;
  /** The post-promo price label (jump vs fixed) — see {@link afterPriceLabel}. */
  after: ReturnType<typeof afterPriceLabel>;
  /** The FULL spec list (all of `plan.specs`) — see {@link allSpecs}. */
  specs: PlanField[];
  /** Structured equipment / one-off-fee rows — see {@link planFees}. */
  fees: PlanField[];
  /** Qualitative perks ("מידע נוסף") — see {@link perks}. */
  perks: string[];
  /** Full fine-print for the "אותיות קטנות" disclosure — see {@link fineLines}. */
  fineLines: string[];
  /** Commitment / contract term bullets — empty when the plan carries none. */
  terms: string[];
  /** Who the plan is for — present only when the catalogue carries it. */
  eligibility?: string;
  /** Free-text additional info — present only when non-empty. */
  notes?: string;
  /** Source/provider link the data was taken from — present only when set. */
  sourceUrl?: string;
  /** When this data was last verified (ISO date) — present only when set. */
  updatedAt?: string;
}

/**
 * The full {@link PlanDetail} bundle for a plan — the one call the rich mobile
 * plan-detail page makes to get everything it renders, category-aware and
 * truth-only. Reuses the existing price/perks/fineLines accessors so the detail
 * page can never drift from the comparison views, and adds the full spec list,
 * the structured equipment/fee rows, and the textual extras.
 */
export function planDetail(plan: Plan): PlanDetail {
  const out: PlanDetail = {
    plan,
    price: priceText(plan),
    priceUnit: priceUnitShort(plan),
    after: afterPriceLabel(plan),
    specs: allSpecs(plan),
    fees: planFees(plan),
    perks: perks(plan),
    fineLines: fineLines(plan),
    terms: termsList(plan),
  };

  const eligibility = cleanText(plan.eligibility);
  if (eligibility) out.eligibility = eligibility;
  const notes = cleanText(plan.notes);
  if (notes) out.notes = notes;
  const sourceUrl = cleanText(plan.sourceUrl);
  if (sourceUrl) out.sourceUrl = sourceUrl;
  const updatedAt = cleanText(plan.updatedAt);
  if (updatedAt) out.updatedAt = updatedAt;

  return out;
}

// ── internal helpers ─────────────────────────────────────────────────────────

/** Combine `דקות` + `SMS` into one cell, mirroring the static cellular row. */
function minutesAndSms(plan: Plan): string | null {
  const mins = spec(plan, "דקות");
  const sms = spec(plan, "SMS");
  const parts = [mins, sms ? `${sms} SMS` : null].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

/**
 * The cellular "חו״ל" cell, mirroring the static row: only shown when the plan
 * actually bundles abroad use (`hasAbroad`), preferring an explicit spec value,
 * else a "✓" tick. Plans without abroad return `null` (the field is omitted).
 */
function abroadValue(plan: Plan): string | null {
  if (!plan.hasAbroad) return null;
  return spec(plan, "חו״ל", 'חו"ל') ?? "✓";
}

/** First non-empty trimmed string value for `key`/`alts` in a loose map, or null. */
function readMap(
  map: unknown,
  key: string,
  alts: string[],
): string | null {
  if (!map || typeof map !== "object") return null;
  const m = map as Record<string, unknown>;
  for (const k of [key, ...alts]) {
    const v = m[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      return String(v);
    }
  }
  return null;
}

/**
 * The contract-terms bullets for a plan, de-duplicated. Accepts BOTH catalogue
 * shapes truth-only: the bundled `string[]` of clauses, or the live-DB single
 * raw `string` (treated as one term). Empty when the plan carries no terms.
 */
function termsList(plan: Plan): string[] {
  const raw = plan.terms;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? [t] : [];
  }
  return dedupe(toStringArray(raw));
}

/** A trimmed non-empty string from an unknown, or null (truth-only text gate). */
function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

/** Coerce an unknown (possibly string) to a finite number, or null. */
function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Coerce an unknown to a clean string[] (trimmed, non-empty entries only). */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const x of value) {
    if (typeof x === "string") {
      const t = x.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** Order-preserving de-duplication of a string[]. */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}
