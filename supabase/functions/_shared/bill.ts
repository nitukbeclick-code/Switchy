// ─────────────────────────────────────────────────────────────────────────────
// _shared/bill.ts — the shared bill-photo layer: the pure image/JSON parsers
// (moved here from site-bill-analyzer/lib.ts so the analyzer SCREEN, the in-chat
// photo path in site-ai-chat, and any future surface share ONE implementation)
// PLUS the single Vision→billHint extractor. site-bill-analyzer/lib.ts re-exports
// the parsers for backward compat (its index.ts + the existing unit tests import
// them from there, unchanged).
//
// TRUTH-ONLY: every helper only RESHAPES / normalizes what the vision model read
// off the bill — it fabricates no provider, price, line, or category. The monthly
// amount is clamped to a sane 0..5000 range (a higher read is almost certainly a
// misread, and we never turn a misread into a huge fake "saving").
// ─────────────────────────────────────────────────────────────────────────────

import { callGeminiVision, VISION_PROMPT } from "./ai.ts";
import {
  catalogueProviders,
  normalizeCategory,
  normalizeProvider,
  type Plan,
} from "./catalogue.ts";
import { type BillLine, type ParsedBill } from "./bill-forensics.ts";

// Reject anything larger than ~6MB of base64 payload (≈4.5MB decoded image) —
// keeps a single request from blowing the function's memory/time budget. Shared
// so every image entry point (analyzer screen + in-chat photo) uses ONE ceiling.
export const MAX_BILL_BASE64_LEN = 6 * 1024 * 1024;

// Parse + clamp a CLIENT-SUPPLIED bill hint (`{provider?, monthly, category?}`)
// referencing an already-analyzed bill — no image here (that's the OCR path).
// The monthly is clamped to 0..5000 and rounded EXACTLY like the WhatsApp/OCR
// paths, so a misread or a hostile client can't turn it into a giant fake saving;
// a non-usable bill (non-finite / non-positive monthly) → undefined so the prompt
// stays byte-identical to today. provider/category are trimmed + length-capped or
// omitted — never invented. Honesty rail: this only reshapes what the client sent.
export function parseBillHint(
  raw: unknown,
): { provider?: string; monthly: number; category?: string } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const monthly = Math.round(Math.min(5000, Math.max(0, Number(o.monthly))));
  if (!Number.isFinite(monthly) || monthly <= 0) return undefined;
  const provider = typeof o.provider === "string" ? (o.provider.trim().slice(0, 40) || undefined) : undefined;
  const category = typeof o.category === "string" ? (o.category.trim().slice(0, 20) || undefined) : undefined;
  return { provider, monthly, category };
}

export type Extracted = {
  provider: string;
  monthly: number;
  category: string;
  confidence: number;
  // Honest, human-readable caveats from the vision model (e.g. "התמונה מעט
  // מטושטשת", "הסכום החודשי לא ברור"). Always an array (possibly empty); each
  // entry is trimmed + clipped so a misbehaving model can't bloat the response.
  warnings: string[];
  // OPTIONAL itemized lines for the forensic auditor (bill-forensics.auditBill).
  // The vision model surfaces them only when the bill is itemized AND legible;
  // an empty array (the default) means "no itemization read" and the forensics
  // pass degrades to a conservative total-level audit. NEVER fabricated — a line
  // exists here only because the model read it off the bill.
  lines: BillLine[];
};

// Coerce the model's `warnings` into a clean string[]: accept an array of
// strings, or a single string, drop empties, clip each to 120 chars, cap at 5.
function parseWarnings(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : (typeof raw === "string" ? [raw] : []);
  const out: string[] = [];
  for (const w of arr) {
    const s = String(w ?? "").trim().slice(0, 120);
    if (s) out.push(s);
    if (out.length >= 5) break;
  }
  return out;
}

// Max itemized lines we accept from the model — a real telecom bill has a
// handful of charge lines; anything past this is almost certainly OCR noise, so
// we cap it to keep the forensic pass (and the response) bounded.
const MAX_LINES = 30;

function finiteOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Coerce the model's `lines` into a clean BillLine[]. Each entry must have a
// description AND a finite positive amount to count (a line with neither is
// dropped — we never invent a charge). Optional forensic hints (prevAmount,
// promoEnd, category, isAddon) are passed through only when present + sane.
// Truth-only: this only RESHAPES what the model read; it adds nothing.
export function parseLines(raw: unknown): BillLine[] {
  if (!Array.isArray(raw)) return [];
  const out: BillLine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const desc = String(o.desc ?? o.description ?? o.name ?? "").trim().slice(0, 80);
    const amount = finiteOrNull(o.amount ?? o.price ?? o.sum) ?? 0;
    // Drop a line that carries no usable signal (no desc and no positive amount).
    if (!desc && !(amount > 0)) continue;
    const prevAmount = finiteOrNull(o.prevAmount ?? o.prev ?? o.previous);
    const promoEndRaw = String(o.promoEnd ?? o.promo_end ?? o.until ?? "").trim().slice(0, 40);
    const categoryRaw = String(o.category ?? o.cat ?? "").trim().slice(0, 40);
    const isAddon = typeof o.isAddon === "boolean"
      ? o.isAddon
      : typeof o.is_addon === "boolean"
      ? o.is_addon
      : null;
    out.push({
      desc,
      amount: amount > 0 ? amount : 0,
      prevAmount: prevAmount != null && prevAmount > 0 ? prevAmount : null,
      promoEnd: promoEndRaw || null,
      category: categoryRaw || null,
      isAddon,
    });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

// Parse "data:image/png;base64,AAAA…" or raw base64. Returns mimeType + the
// bare base64 payload (no prefix) so Gemini's inlineData gets clean bytes.
export function parseImage(input: string): { mimeType: string; data: string } | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/^data:([^;,]+)(?:;base64)?,(.*)$/s);
  if (m) {
    const mimeType = m[1] || "image/jpeg";
    const data = m[2].replace(/\s/g, "");
    if (!data) return null;
    return { mimeType, data };
  }
  // Raw base64 (no data-URL wrapper) — assume jpeg, the most common camera output.
  const data = s.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 64))) return null;
  return { mimeType: "image/jpeg", data };
}

// Gemini is asked for raw JSON, but be defensive: strip ```json fences and pull
// the first {...} block if it wrapped the object in prose anyway. Coerce a
// non-finite monthly/confidence (NaN, missing) to 0 so downstream math is safe.
export function parseExtraction(raw: string): Extracted | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const k = s.lastIndexOf("}");
    if (i >= 0 && k > i) s = s.slice(i, k + 1);
  }
  try {
    const o = JSON.parse(s) as Record<string, unknown>;
    const monthly = Number(o.monthly);
    let confidence = Number(o.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    // Clamp confidence into [0,1] — a model occasionally returns 0-100 or >1.
    confidence = Math.max(0, Math.min(1, confidence));
    return {
      provider: String(o.provider ?? "").slice(0, 80),
      monthly: Number.isFinite(monthly) ? monthly : 0,
      category: String(o.category ?? "").slice(0, 40),
      confidence,
      warnings: parseWarnings(o.warnings),
      lines: parseLines(o.lines),
    };
  } catch (_) {
    return null;
  }
}

// Assemble a ParsedBill for the forensic auditor from the (already
// confidence-gated, normalized) extraction + the bill-level provider/category
// the caller resolved against the catalogue. Kept pure so index.ts stays thin
// and this can be unit-tested. `provider`/`category` are passed in because the
// caller normalizes them via the shared catalogue aliases BEFORE calling.
export function buildParsedBill(
  extracted: Extracted,
  provider: string,
  category: string,
  monthly: number,
): ParsedBill {
  return {
    provider: String(provider ?? "").slice(0, 80),
    category: String(category ?? "").slice(0, 40),
    monthly: Number.isFinite(monthly) ? monthly : 0,
    lines: Array.isArray(extracted?.lines) ? extracted.lines : [],
  };
}

// The grounded bill facts the agent consumes as `billHint` (agent.ts injects it +
// can call analyze_bill). `monthly` is the clamped ₪ read; provider/category are
// normalized to catalogue ids (or omitted when unknown — never guessed).
export type BillHint = { provider?: string; monthly: number; category?: string; imageId?: string };

// The ONE bill-photo Vision extractor, shared by every surface that reads a photo
// (the analyzer screen keeps its own richer flow for now; the in-chat photo path
// uses this). Steps: Gemini Vision (the shared VISION_PROMPT) → parseExtraction →
// normalize provider/category against the LIVE catalogue → clamp monthly 0..5000.
//
// Contract (matches the WhatsApp bill path):
//   • THROWS on a vision-call error (rate limit / timeout / 5xx) so the caller can
//     choose the right user message and fail soft — the extractor itself never
//     fabricates a reply.
//   • returns { hint: null, extracted } when the read yields no usable monthly
//     amount (unreadable / not-a-bill) — the caller then simply proceeds without a
//     bill hint (the agent asks for the figures honestly).
//   • returns { hint, extracted } on success. `extracted` carries the confidence +
//     warnings so the caller can be honest about a shaky read.
export async function extractBillHint(
  geminiKey: string,
  plans: Plan[],
  img: { mimeType: string; data: string },
): Promise<{ hint: BillHint | null; extracted: Extracted | null }> {
  const providers = catalogueProviders(plans);
  const out = await callGeminiVision(
    geminiKey,
    VISION_PROMPT.replace("__PROVIDERS__", providers.join(", ")),
    img,
  );
  const extracted = parseExtraction(out);
  const monthly = Number(extracted?.monthly);
  if (!extracted || !(monthly > 0)) return { hint: null, extracted: extracted ?? null };
  const provider = normalizeProvider(extracted.provider, providers);
  const category = normalizeCategory(extracted.category);
  const spend = Math.round(Math.min(5000, Math.max(0, monthly)));
  return {
    hint: { provider: provider || undefined, monthly: spend, category: category || undefined },
    extracted,
  };
}
