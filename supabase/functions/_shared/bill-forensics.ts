// ─────────────────────────────────────────────────────────────────────────────
// bill-forensics — חוסך · ביקורת חשבון (truth-only)
// Pure, dependency-light forensic auditor over a PARSED telecom bill. Given the
// line items a Vision model extracted from a photographed bill + the REAL plan
// catalogue, it surfaces concrete, ₪-quantified anomalies a customer can act on:
//
//   • overcharge   — a charged line that exceeds the catalogue price of the plan
//                    it matches (a real ₪ delta, not a vibe).
//   • expired_promo — a price that JUMPED vs a previous period, or a dated
//                    discount whose end-date has passed (the promo lapsed).
//   • zombie_line  — a duplicate / orphaned add-on the customer likely forgot
//                    (the same paid add-on billed twice, or a stray paid extra).
//
// TRUTH-ONLY (E-E-A-T): every finding is grounded in the PARSED numbers + the
// REAL catalogue. We NEVER fabricate an overcharge, a count, or a ₪ figure.
//   - certainty "ודאי" only when the parsed data PROVES it (e.g. the exact same
//     add-on line appears twice, or a charged amount strictly exceeds a matched
//     catalogue price by a meaningful margin).
//   - certainty "ייתכן" for anything INFERRED (a fuzzy plan match, a price step we
//     can't fully attribute, a promo end-date with no second data point).
//   - when the data does NOT support a flag, we emit NOTHING for that line. No
//     finding is better than a wrong finding.
//
// No network, no env, no I/O — unit-testable in isolation (mirrors lib.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { type Plan } from "./catalogue.ts";

// ── Parsed-bill input shape ──────────────────────────────────────────────────
// A single charged line on the bill, as the Vision model extracts it. Only
// `desc` + `amount` are required; the rest are best-effort hints the model may
// or may not surface, and the auditor degrades gracefully when they're absent.
export type BillLine = {
  desc: string; // the line description, verbatim (e.g. "חבילת גלישה 5G", "ביטוח מכשיר")
  amount: number; // the ₪ charged on THIS line (monthly). Non-finite/≤0 → ignored.
  // OPTIONAL forensic hints (present only when the model is confident):
  prevAmount?: number | null; // the same line's amount on a PRIOR period, if shown ("חודש קודם ₪X")
  promoEnd?: string | null; // an ISO-ish date a discount on this line ends/ended ("בתוקף עד 2026-03-01")
  category?: string | null; // the line's service category, if the model could tell (cellular/internet/…)
  isAddon?: boolean | null; // model's hint that this is an ADD-ON / extra, not the base plan
};

// The whole parsed bill the auditor reasons over. `provider`/`category` are the
// bill-level context (already normalized by the caller against the catalogue);
// `monthly` is the total; `lines` is the itemization (possibly empty — then we
// can only audit at the total level, which is intentionally conservative).
export type ParsedBill = {
  provider: string;
  category: string;
  monthly: number;
  lines: BillLine[];
};

export type Severity = "low" | "med" | "high";
export type Certainty = "ודאי" | "ייתכן";
export type FindingKind = "overcharge" | "expired_promo" | "zombie_line";

export type Finding = {
  kind: FindingKind;
  severity: Severity;
  certainty: Certainty; // honest confidence label, surfaced verbatim
  title: string; // short Hebrew headline
  detail: string; // one-line Hebrew explanation, grounded in the real numbers
  impact: number; // ₪ MONTHLY impact (always ≥ 0; 0 when not quantifiable but still worth flagging)
  line?: string; // the bill-line description this finding is about (for the UI)
};

export type AuditResult = {
  findings: Finding[];
  totalMonthlyImpact: number; // Σ impact across findings (de-duplicated; ≥ 0)
};

// A loose profile the caller can pass to bias matching (currently optional /
// forward-looking — kept so the signature is stable as the engine grows).
export type ForensicProfile = {
  knownPlan?: string | null; // the plan the user told us they're on, if any
  expectedMonthly?: number | null; // what they expect to pay, if any
};

// Rounding margin (₪): a charged line must exceed the matched catalogue price by
// MORE than this to be flagged an overcharge. Absorbs cents/VAT-rounding noise so
// we don't cry "overcharge" over a ₪1 rounding artifact.
const OVERCHARGE_MARGIN = 3;
// A price step (this period vs last) under this ₪ amount is noise, not a lapsed
// promo. Above it AND a meaningful relative jump → flag.
const PROMO_STEP_MIN = 5;
// Relative jump threshold for expired_promo (e.g. 1.25 → +25%).
const PROMO_STEP_RATIO = 1.2;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clipStr(v: unknown, n = 80): string {
  return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, n);
}

// ── Plan matching (catalogue-grounded, conservative) ─────────────────────────
// Find the cheapest catalogue plan in the given category for the given provider
// that plausibly corresponds to a base-plan line. We deliberately use the
// CHEAPEST comparable regular plan as the "fair price" floor: if the customer is
// charged MORE than the cheapest comparable plan, the delta is real.
//
// When `provider` is given, we require a same-provider match (provider-
// attributable, certainty "ודאי"). When `provider` is "" we explicitly scan the
// WHOLE category (the cross-provider floor, certainty "ייתכן") — the caller uses
// the empty-provider call as the deliberate fallback, so a same-provider call
// returning non-null must mean we genuinely matched the bill's provider.
// Returns null when we can't ground it (no comparable row).
function cheapestComparable(
  plans: Plan[],
  provider: string,
  category: string,
): Plan | null {
  const prov = provider.trim().toLowerCase();
  const cat = category.trim().toLowerCase();
  if (!cat) return null;
  const candidates = plans.filter((p) =>
    typeof p.price === "number" &&
    (p.price as number) > 0 &&
    (p.kind ?? "regular") === "regular" &&
    String(p.cat ?? "").toLowerCase() === cat &&
    // provider given → require an exact provider match; provider "" → category-
    // wide floor across every provider.
    (prov ? String(p.provider ?? "").toLowerCase() === prov : true)
  );
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => ((a.price ?? Infinity) <= (b.price ?? Infinity) ? a : b));
}

function sev(impact: number): Severity {
  if (impact >= 40) return "high";
  if (impact >= 15) return "med";
  return "low";
}

// ── (1) overcharge ───────────────────────────────────────────────────────────
// A charged BASE-PLAN line that exceeds the provider's cheapest comparable
// catalogue plan by a meaningful margin. The ₪ delta is REAL (charged − floor).
// Certainty: "ודאי" when we matched the SAME provider+category (provider-
// attributable); "ייתכן" when we only had the category floor (cross-provider).
function findOvercharge(
  bill: ParsedBill,
  plans: Plan[],
): Finding | null {
  // Pick the base-plan line: prefer an explicit non-addon line in the bill's
  // category; else fall back to the bill total (single-service bill).
  const cat = bill.category;
  if (!cat) return null;
  const baseLines = bill.lines.filter((l) =>
    num(l.amount) > 0 && l.isAddon !== true &&
    (!l.category || String(l.category).toLowerCase() === cat.toLowerCase())
  );
  // Charged amount we attribute to the base plan, and the line label for the UI.
  let charged = 0;
  let label = "";
  if (baseLines.length) {
    const top = baseLines.reduce((a, b) => (num(a.amount) >= num(b.amount) ? a : b));
    charged = num(top.amount);
    label = clipStr(top.desc);
  } else if (num(bill.monthly) > 0 && bill.lines.length === 0) {
    // No itemization → audit at the total level (single-service bill only).
    charged = num(bill.monthly);
    label = "סך החשבון החודשי";
  } else {
    return null;
  }
  if (!(charged > 0)) return null;

  // sameProvider is non-null ONLY when we actually had the bill's provider AND
  // matched a same-provider catalogue row (→ provider-attributable, "ודאי").
  // With no provider we go straight to the cross-provider category floor ("ייתכן").
  const sameProvider = bill.provider ? cheapestComparable(plans, bill.provider, cat) : null;
  const floorPlan = sameProvider ?? cheapestComparable(plans, "", cat);
  if (!floorPlan || typeof floorPlan.price !== "number") return null;
  const floor = floorPlan.price as number;
  const delta = charged - floor;
  if (delta <= OVERCHARGE_MARGIN) return null; // within rounding/noise → no flag

  const impact = Math.round(delta);
  const certainty: Certainty = sameProvider ? "ודאי" : "ייתכן";
  const provNote = sameProvider
    ? `אצל ${floorPlan.provider} קיים מסלול דומה ב-₪${floor}`
    : `מסלול דומה בקטגוריה קיים כבר ב-₪${floor} (${floorPlan.provider})`;
  return {
    kind: "overcharge",
    severity: sev(impact),
    certainty,
    title: "ייתכן שאתם משלמים מעבר למחיר המקובל",
    detail: `על ${label} מחויבים ₪${Math.round(charged)} לחודש. ${provNote} — פער של כ-₪${impact} בחודש.`,
    impact,
    line: label,
  };
}

// ── (2) expired_promo ─────────────────────────────────────────────────────────
// Two independent honest signals, whichever the parsed data supports:
//   (a) a PRICE JUMP vs the same line's prior-period amount (prevAmount), past
//       both an absolute (PROMO_STEP_MIN ₪) and relative (PROMO_STEP_RATIO) bar —
//       a classic "the introductory discount ended" pattern. Certainty "ודאי":
//       the two numbers are both ON the bill.
//   (b) a dated discount (promoEnd) whose date is in the PAST relative to `now` —
//       the promo window lapsed. Certainty "ייתכן": we can see the date but not
//       always prove the higher price is the post-promo one.
// We pick the single strongest signal (largest ₪ impact) to avoid double-flagging.
function findExpiredPromo(bill: ParsedBill, now: Date): Finding | null {
  let best: Finding | null = null;
  const consider = (f: Finding) => {
    if (!best || f.impact > best.impact) best = f;
  };

  for (const l of bill.lines) {
    const amount = num(l.amount);
    if (!(amount > 0)) continue;
    const label = clipStr(l.desc) || "אחת השורות בחשבון";

    // (a) price jump vs prior period
    const prev = l.prevAmount == null ? 0 : num(l.prevAmount);
    if (prev > 0 && amount - prev >= PROMO_STEP_MIN && amount >= prev * PROMO_STEP_RATIO) {
      const impact = Math.round(amount - prev);
      consider({
        kind: "expired_promo",
        severity: sev(impact),
        certainty: "ודאי",
        title: "מחיר קפץ — ייתכן שמבצע הסתיים",
        detail:
          `${label}: עלה מ-₪${Math.round(prev)} ל-₪${Math.round(amount)} בחודש (כ-₪${impact} יותר). ` +
          `זה דפוס אופייני לסיום מבצע היכרות — כדאי לבדוק מול הספק.`,
        impact,
        line: label,
      });
    }

    // (b) a discount end-date that already passed
    const end = parseLooseDate(l.promoEnd);
    if (end && end.getTime() < now.getTime()) {
      // Impact here is only quantifiable if we ALSO saw a prior price; otherwise
      // 0 (we flag it as worth checking, honestly, without inventing a number).
      const impact = prev > 0 && amount > prev ? Math.round(amount - prev) : 0;
      consider({
        kind: "expired_promo",
        severity: impact > 0 ? sev(impact) : "low",
        certainty: "ייתכן",
        title: "מבצע שתוקפו פג",
        detail:
          `${label}: ההנחה הייתה בתוקף עד ${isoDay(end)} ותאריך זה כבר עבר. ` +
          `ייתכן שהמחיר עלה בהתאם — שווה לוודא מול הספק.`,
        impact,
        line: label,
      });
    }
  }
  return best;
}

// ── (3) zombie_line ───────────────────────────────────────────────────────────
// A paid add-on the customer likely forgot:
//   (a) the SAME add-on description billed MORE THAN ONCE (duplicate) — certainty
//       "ודאי", impact = the duplicate copies' ₪.
//   (b) a stray paid ADD-ON line (isAddon hint) the customer may not use —
//       certainty "ייתכן", surfaced only as "worth reviewing" (no fabricated
//       claim that it's unused; impact = its ₪ so they can decide).
// We return the single highest-impact zombie to keep the report focused.
function findZombieLine(bill: ParsedBill): Finding | null {
  // (a) duplicates — group paid lines by a normalized description.
  const groups = new Map<string, { label: string; amounts: number[] }>();
  for (const l of bill.lines) {
    const amount = num(l.amount);
    if (!(amount > 0)) continue;
    const key = normalizeDesc(l.desc);
    if (!key) continue;
    const g = groups.get(key) ?? { label: clipStr(l.desc), amounts: [] };
    g.amounts.push(amount);
    groups.set(key, g);
  }
  let dupBest: Finding | null = null;
  for (const { label, amounts } of groups.values()) {
    if (amounts.length < 2) continue;
    // Impact = everything beyond the first copy (the customer pays for it twice+).
    amounts.sort((a, b) => b - a);
    const extra = amounts.slice(1).reduce((s, n) => s + n, 0);
    const impact = Math.round(extra);
    if (impact <= 0) continue;
    const f: Finding = {
      kind: "zombie_line",
      severity: sev(impact),
      certainty: "ודאי",
      title: "חיוב כפול על אותו שירות",
      detail:
        `"${label}" מופיע ${amounts.length} פעמים בחשבון (₪${amounts.map((a) => Math.round(a)).join(" + ₪")}). ` +
        `ייתכן חיוב כפול — שווה לבדוק שלא משלמים פעמיים על אותו דבר.`,
      impact,
      line: label,
    };
    if (!dupBest || f.impact > dupBest.impact) dupBest = f;
  }
  if (dupBest) return dupBest;

  // (b) a lone paid add-on (only when explicitly hinted as an add-on). Honest:
  // we don't CLAIM it's unused — we surface it as "worth reviewing".
  const addons = bill.lines
    .filter((l) => l.isAddon === true && num(l.amount) > 0)
    .sort((a, b) => num(b.amount) - num(a.amount));
  if (addons.length) {
    const a = addons[0];
    const impact = Math.round(num(a.amount));
    const label = clipStr(a.desc) || "תוספת בתשלום";
    return {
      kind: "zombie_line",
      severity: "low",
      certainty: "ייתכן",
      title: "תוספת בתשלום — שווה לבדוק שאתם משתמשים בה",
      detail:
        `${label}: תוספת חודשית של ₪${impact}. אם אינכם משתמשים בה, אפשר לבקש להסיר אותה ולחסוך.`,
      impact,
      line: label,
    };
  }
  return null;
}

// ── Date helpers (loose, defensive) ──────────────────────────────────────────
// Parse a best-effort date out of "2026-03-01", "01/03/2026", "1.3.26" etc.
// Returns null on anything we can't read with confidence (never guesses).
export function parseLooseDate(raw: unknown): Date | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // ISO-ish: YYYY-MM-DD (the form we ask the model for).
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return safeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  // DD/MM/YYYY or DD.MM.YY (Israeli order).
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const yy = Number(m[3]);
    const year = yy < 100 ? 2000 + yy : yy;
    return safeDate(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

function safeDate(y: number, mo: number, d: number): Date | null {
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Reject overflow (e.g. 31/02 rolling into March).
  if (dt.getUTCMonth() !== mo - 1) return null;
  return dt;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Normalize a line description for duplicate-grouping: lowercase, strip digits /
// punctuation / extra whitespace so "גלישה 5G (1)" and "גלישה 5G" collapse.
function normalizeDesc(raw: unknown): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[0-9()[\]{}.,:;!?"'\\/|_+\-*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Public entrypoint ────────────────────────────────────────────────────────
// auditBill(parsedBill, catalogue, profile?) → ordered findings (highest impact
// first) + the de-duplicated total monthly ₪ impact. Pure: pass `now` in tests
// to make expired_promo deterministic (defaults to the real clock).
export function auditBill(
  bill: ParsedBill,
  catalogue: Plan[],
  _profile?: ForensicProfile,
  now: Date = new Date(),
): AuditResult {
  const safeBill: ParsedBill = {
    provider: clipStr(bill?.provider, 80),
    category: clipStr(bill?.category, 40),
    monthly: num(bill?.monthly),
    lines: Array.isArray(bill?.lines)
      ? bill.lines
        .map((l) => ({
          desc: clipStr(l?.desc, 80),
          amount: num(l?.amount),
          prevAmount: l?.prevAmount == null ? null : num(l.prevAmount),
          promoEnd: l?.promoEnd == null ? null : clipStr(l.promoEnd, 40),
          category: l?.category == null ? null : clipStr(l.category, 40),
          isAddon: typeof l?.isAddon === "boolean" ? l.isAddon : null,
        }))
        .filter((l) => l.desc || l.amount > 0)
      : [],
  };

  const plans = Array.isArray(catalogue) ? catalogue : [];
  const findings: Finding[] = [];
  const oc = findOvercharge(safeBill, plans);
  if (oc) findings.push(oc);
  const ep = findExpiredPromo(safeBill, now);
  if (ep) findings.push(ep);
  const zl = findZombieLine(safeBill);
  if (zl) findings.push(zl);

  // Highest ₪ impact first; ties keep insertion order (stable sort in V8).
  findings.sort((a, b) => b.impact - a.impact);

  // Total impact: sum, but avoid double-counting when an overcharge and an
  // expired-promo describe the SAME line (the price jump IS the overcharge). In
  // that case keep the LARGER of the two so we never overstate the savings.
  let total = 0;
  const usedLines = new Set<string>();
  for (const f of findings) {
    const lineKey = f.line ? normalizeDesc(f.line) : "";
    if (lineKey && usedLines.has(lineKey)) continue; // skip the overlap on the same line
    total += Math.max(0, f.impact);
    if (lineKey) usedLines.add(lineKey);
  }

  return { findings, totalMonthlyImpact: Math.round(total) };
}
