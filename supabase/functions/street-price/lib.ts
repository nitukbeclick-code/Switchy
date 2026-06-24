// Pure helpers for the street-price Edge Function (street-price/index.ts), split
// out so they can be unit-tested without booting Deno.serve or touching the
// network/env (mirrors analytics-track/lib.ts + community-moderate's exported
// heuristicScreen). NO I/O, NO env.
//
// These are the function's security + honesty boundary:
//   • STREET_PRICE_MIN_REPORTS — the publish threshold, kept in lockstep with the
//     DB's get_street_price() v_min_reports (street-prices-2026-06.sql §3). The DB
//     gates what the aggregate returns; this constant drives the "X more reports
//     needed" copy and is pinned to the DB by a unit test's comment.
//   • parseReport      — validate/coerce the POST body into a clean, honest report
//     row (or a typed rejection) — never trust the client shape.
//   • screenReport     — the DETERMINISTIC heuristic pre-screen (mirrors
//     community-moderate's heuristicScreen PATTERN): a report is 'approved' only
//     when its price is plausible in absolute terms AND (when a catalogue reference
//     is known) sane relative to the real headline; an implausible price stays
//     'pending' for a human. High precision: ordinary below-headline retention
//     offers (the WHOLE POINT of street price) pass; only absurd values are held.
//   • reporterFingerprintInput — shapes the raw reporter signal into a stable
//     string to hash (the actual SHA-256 happens in index.ts) — NO PII retained.
//   • clampLeadConsent — consent is honoured ONLY for an attached contactable lead;
//     a bare price report carries no contact details and needs no consent.

import { CATEGORIES, normalizeCategory, normalizeProvider } from "../_shared/catalogue.ts";

// ── The publish threshold (keep == DB get_street_price v_min_reports) ──────────
export const STREET_PRICE_MIN_REPORTS = 5;

// Absolute sane bounds for a monthly telecom price report (₪). Anything outside
// this is junk regardless of catalogue context — a fat-fingered "0" or "999999".
// Mirrors the DB CHECK (reported_price > 0 and <= 100000) but tighter on the low
// end: a real monthly bill is at least a few shekels.
export const MIN_REPORTED_PRICE = 5;
export const MAX_REPORTED_PRICE = 100000;

// A report whose price is wildly out of line with the REAL catalogue headline is
// almost certainly a typo/troll, not a genuine retention offer. We hold (don't
// count) a report priced ABOVE catalogue × this (nobody negotiates UP) or absurdly
// BELOW it. Retention offers routinely land well under headline, so the low gate is
// generous — we only catch the implausible (e.g. ₪1 for a ₪120 plan).
export const MAX_OVER_CATALOGUE_RATIO = 1.5;  // > headline × 1.5 ⇒ implausible (you don't haggle a price UP)
export const MIN_UNDER_CATALOGUE_RATIO = 0.1; // < headline × 0.1 ⇒ implausibly cheap (likely a typo)

export type ReportStatus = "pending" | "approved" | "rejected";

// A validated, clean report ready to insert (status decided by screenReport).
export interface ParsedReport {
  plan_id: string | null;
  provider: string;
  category: string;
  reported_price: number;
}

// Raw client input for a price submission. Every field is validated/coerced — the
// client shape is never trusted.
export interface ReportInput {
  plan_id?: unknown;
  provider?: unknown;
  category?: unknown;
  reported_price?: unknown;
}

function clip(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

function toInt(v: unknown): number | null {
  // Accept a number or a numeric string ("89", "89.5", "₪89" → strip non-digits).
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/[^\d.]/g, "");
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

// Validate + coerce a submission into a clean ParsedReport, or a typed rejection
// reason (so index.ts can return a precise 400). `providers` is the live set of
// canonical catalogue provider names (for normalization); pass [] when unknown
// (then any non-empty provider string is accepted as-is, clipped). Truth-only: we
// never invent a provider/category — an unrecognised one is rejected, not guessed.
export function parseReport(
  input: ReportInput,
  providers: string[] = [],
): { ok: true; report: ParsedReport } | { ok: false; reason: string } {
  const price = toInt(input.reported_price);
  if (price === null) return { ok: false, reason: "missing or non-numeric reported_price" };
  if (price < MIN_REPORTED_PRICE || price > MAX_REPORTED_PRICE) {
    return { ok: false, reason: "reported_price out of sane range" };
  }

  const rawProvider = clip(input.provider, 120);
  if (!rawProvider) return { ok: false, reason: "missing provider" };
  // Normalize against the live catalogue when we have it; else accept the clipped
  // free text (still bounded). An empty normalization result with a known provider
  // list means "not a provider we recognise" → reject rather than store junk.
  const provider = providers.length ? normalizeProvider(rawProvider, providers) : rawProvider;
  if (!provider) return { ok: false, reason: "unrecognised provider" };

  const category = normalizeCategory(clip(input.category, 40));
  if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, reason: "missing or unknown category" };
  }

  // plan_id is optional (a reporter may know only provider + category). When given,
  // keep it clipped/trimmed; never fabricate one.
  const planId = clip(input.plan_id, 120);

  return {
    ok: true,
    report: {
      plan_id: planId || null,
      provider,
      category,
      reported_price: price,
    },
  };
}

export interface ScreenVerdict {
  status: ReportStatus;          // 'approved' counts; 'pending' is held for a human
  reason: string;                // short Hebrew reason (audit + log)
  // Optional context for the audit row — how far from catalogue this came in.
  catalogueRef?: number | null;
}

// The DETERMINISTIC heuristic pre-screen (mirrors community-moderate's
// heuristicScreen PATTERN: high precision, conservative, fail-soft). Decides
// whether a parsed report may be 'approved' (counts toward the aggregate) or must
// stay 'pending' (held for a human — never auto-rejected, never deleted).
//
// `catalogueRef` is the REAL catalogue headline ₪/month for this plan/provider when
// index.ts could resolve it (else null/undefined). The screen is honest BOTH ways:
//   • A retention offer BELOW headline is the entire point of street price → it
//     passes (we do NOT hold a report just for being cheaper than the catalogue).
//   • A price ABOVE headline × MAX_OVER_CATALOGUE_RATIO, or absurdly below it, is
//     almost certainly a typo/troll → held 'pending'.
//   • With NO catalogue reference, we fall back to the absolute sane bounds only.
// Never throws.
export function screenReport(report: ParsedReport, catalogueRef?: number | null): ScreenVerdict {
  const price = report.reported_price;

  // Absolute bounds first (parseReport already enforced these, but screenReport is
  // also called directly in tests — keep it self-sufficient).
  if (!(price >= MIN_REPORTED_PRICE && price <= MAX_REPORTED_PRICE)) {
    return { status: "pending", reason: "מחיר מחוץ לטווח סביר — מוחזק לבדיקה", catalogueRef: catalogueRef ?? null };
  }

  const ref = typeof catalogueRef === "number" && catalogueRef > 0 ? catalogueRef : null;
  if (ref !== null) {
    if (price > ref * MAX_OVER_CATALOGUE_RATIO) {
      // Reported price is meaningfully ABOVE the public headline — you don't
      // negotiate a price up; likely a typo or the wrong plan.
      return { status: "pending", reason: "גבוה משמעותית מהמחירון — מוחזק לבדיקה", catalogueRef: ref };
    }
    if (price < ref * MIN_UNDER_CATALOGUE_RATIO) {
      // Implausibly cheap vs the real headline — almost certainly a typo.
      return { status: "pending", reason: "נמוך באופן לא סביר מהמחירון — מוחזק לבדיקה", catalogueRef: ref };
    }
  }

  // Plausible in absolute terms and (when known) sane vs catalogue → approve. A
  // below-headline retention offer is exactly what we want to surface.
  return { status: "approved", reason: "מחיר סביר — אושר", catalogueRef: ref };
}

// Shape the raw reporter signal into a stable, PII-light string to fingerprint
// (the SHA-256 itself runs in index.ts via crypto.subtle). We prefer the
// service-supplied client IP (trusted hop, see analytics-track clientIp) salted
// with the plan/provider so the same person reporting the SAME plan dedupes in the
// aggregate's DISTINCT count, while reporting a DIFFERENT plan is a distinct
// reporter. NO name/phone is ever part of this — a price report has none. Returns
// "" when there is nothing trustworthy to fingerprint (caller then declines).
export function reporterFingerprintInput(ip: string, provider: string, category: string): string {
  const cleanIp = String(ip ?? "").trim();
  if (!cleanIp) return "";
  // Lower-cased, joined — stable across casing/spacing variants of the same report.
  return [cleanIp, String(provider ?? "").trim().toLowerCase(), String(category ?? "").trim().toLowerCase()].join("|");
}

// Consent on an ATTACHED contactable lead (name+phone, wants a callback) is the
// ONLY consent this surface deals with — and it reuses the existing leads path, not
// this table. This helper just normalises the consent flags so index.ts can hand a
// clean shape to the shared leads capture. A bare price report (no lead) needs no
// consent and returns null here.
export interface LeadConsentInput {
  name?: unknown;
  phone?: unknown;
  consent?: unknown;
  consent_marketing_sms?: unknown;
  consent_marketing_email?: unknown;
  consent_marketing_whatsapp?: unknown;
}

// Returns the lead-ish payload ONLY when a real contactable lead is attached AND
// mandatory consent === true; otherwise null (no lead capture). It never fabricates
// consent — a name+phone without consert===true yields null (the caller must not
// capture). The actual insert/consent re-stamp happens in _shared/leads.ts.
export function clampLeadConsent(input: LeadConsentInput | undefined): LeadConsentInput | null {
  if (!input || typeof input !== "object") return null;
  const name = clip(input.name, 80);
  const phone = clip(input.phone, 40);
  // No contactable lead attached at all → nothing to consent to.
  if (name.length < 2 || !phone) return null;
  // Mandatory consent gate — never fabricated. Without it, do NOT capture a lead.
  if (input.consent !== true) return null;
  return {
    name,
    phone,
    consent: true,
    consent_marketing_sms: input.consent_marketing_sms === true,
    consent_marketing_email: input.consent_marketing_email === true,
    consent_marketing_whatsapp: input.consent_marketing_whatsapp === true,
  };
}

// How many more reports are needed before the aggregate publishes — for honest UI
// copy ("צריך עוד N דיווחים"). Never negative.
export function reportsNeeded(currentCount: number): number {
  const have = Number.isFinite(currentCount) ? Math.max(0, Math.floor(currentCount)) : 0;
  return Math.max(0, STREET_PRICE_MIN_REPORTS - have);
}
