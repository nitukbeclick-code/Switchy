// ─────────────────────────────────────────────────────────────────────────────
// translate/lib.ts — pure, testable helpers for the site-wide translation edge fn
//
// The public site is authored in Hebrew. This function translates arbitrary UI
// strings into a small set of target languages ON DEMAND (client sends the visible
// text, gets back the translation), and every result is cached in
// public.site_translations so the first viewer pays the model latency and everyone
// after is served from the DB.
//
// SAFETY (the whole reason this is a bespoke function and not a raw model call):
//   • PRICES AND NUMBERS MUST NEVER CHANGE. ₪11 stays ₪11 in every language.
//   • Provider/brand names, plan-name tokens, units (GB, Mbps, 5G), URLs, emails and
//     phone numbers must survive verbatim.
//   We guarantee this by MASKING those spans with sentinel tokens (⟦0⟧, ⟦1⟧ …)
//   before the model ever sees the text, then restoring them after. The model only
//   ever rewrites the human words between the tokens, so it is structurally unable
//   to alter a price. `restoreText` + `tokensPreserved` verify the round-trip.
//
// Nothing here touches the network — index.ts wires these to the AI client + DB.
// ─────────────────────────────────────────────────────────────────────────────

export type LangDir = "rtl" | "ltr";
export type LangMeta = { code: string; label: string; english: string; dir: LangDir };

// The launch set. `he` is the source (the "off" / restore state) and is never a
// translation target. Adding a language later is just another row here + the same
// entry in the two client runtimes — the engine itself is fully generic.
export const SOURCE_LANG = "he";
export const SUPPORTED_LANGS: LangMeta[] = [
  { code: "ar", label: "العربية", english: "Arabic", dir: "rtl" },
  { code: "en", label: "English", english: "English", dir: "ltr" },
  { code: "ru", label: "Русский", english: "Russian", dir: "ltr" },
  { code: "am", label: "አማርኛ", english: "Amharic", dir: "ltr" },
  { code: "es", label: "Español", english: "Spanish", dir: "ltr" },
  { code: "fr", label: "Français", english: "French", dir: "ltr" },
];

export function isSupportedLang(code: string): boolean {
  return SUPPORTED_LANGS.some((l) => l.code === code);
}

export function langEnglishName(code: string): string {
  return SUPPORTED_LANGS.find((l) => l.code === code)?.english ?? code;
}

// ── Protected brand / product vocabulary ────────────────────────────────────
// Provider names (Hebrew + Latin) and telecom product tokens that must appear
// unchanged in every language. Longest-first matching is applied at mask time so
// "גולן טלקום" is caught before "גולן". Case-insensitive for the Latin entries.
export const PROTECTED_TERMS: string[] = [
  // Brand — this site
  "SWITCHY AI", "Switchy AI", "SWITCHY", "Switchy",
  // Providers (Hebrew)
  "הוט מובייל", "הוט", "סלקום", "פרטנר", "פלאפון", "בזק בינלאומי", "בזק",
  "גולן טלקום", "גולן", "רמי לוי", "רמי לוי שיווק", "we4g", "We4G", "וויקום",
  "נקסט טיוי", "נקסטב", "סטינג טיוי", "סטינג", "גילת", "וואלה מובייל", "וואלה",
  "אקספון", "יטרון",
  // Providers / products (Latin)
  "Cellcom", "Partner", "Pelephone", "Bezeq", "Golan Telecom", "Golan",
  "Rami Levy", "019 Mobile", "019", "xphone", "Airalo", "NextTV", "Sting TV",
  "Gilat", "Walla", "YES", "HOT Mobile", "HOT",
  // Telecom / tech tokens
  "eSIM", "SIM", "5G", "4G", "3G", "LTE", "FWA", "CGNAT", "IPv6", "VPN", "VoIP",
  "Wi-Fi", "WiFi", "Mbps", "Gbps", "Kbps", "GB", "TB", "MB", "Netflix",
  "Disney+", "YouTube", "Spotify", "Apple TV", "Zoom", "WhatsApp",
];

const SENTINEL_OPEN = "⟦"; // ⟦
const SENTINEL_CLOSE = "⟧"; // ⟧

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Brands, longest first, so multi-word names win over their prefixes.
const BRAND_ALTERNATION = [...PROTECTED_TERMS]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

// A single regex whose ORDER encodes priority: URLs → emails → phones → brands →
// money/percent/unit-bearing numbers → bare numbers. `u` for correct Unicode word
// boundaries around Hebrew/Latin brand names.
const PROTECT_RE = new RegExp(
  [
    "https?:\\/\\/[^\\s]+", // urls
    "[\\w.+-]+@[\\w-]+\\.[\\w.-]+", // emails
    "\\+?\\d[\\d\\-\\s]{6,}\\d", // phone-ish runs
    `(?:${BRAND_ALTERNATION})`, // brands / product tokens
    "₪\\s?\\d[\\d.,]*", // ₪11 / ₪ 11
    "\\$\\s?\\d[\\d.,]*",
    "\\d[\\d.,]*\\s?(?:₪|%|GB|TB|MB|Mbps|Gbps|Kbps)", // 11₪ / 20GB / 100Mbps
    // number + a Hebrew currency/unit WORD, masked as ONE span so the model can
    // neither translate nor re-position the unit relative to its number
    // ("11 שקל", "300 מגה", "50 דקות"). Longest units first.
    "\\d[\\d.,]*\\s?(?:שקלים|שקל|ש\"ח|ש״ח|אחוזים|אחוז|מגהביט|מגהבייט|מגה|ג'יגהבייט|ג'יגהביט|ג׳יגהבייט|ג׳יגהביט|ג'יגה|ג׳יגה|קילוביט|ג\"ב|מ\"ב|ג׳יב|דקות|דקה|שח)",
    "\\d[\\d.,]*", // bare numbers (last)
  ].join("|"),
  "giu",
);

export type Protected = { masked: string; tokens: string[] };

// Replace every protected span with an opaque ⟦k⟧ sentinel. Returns the masked
// string (what the model translates) and the ordered originals (what we restore).
export function protectText(input: string): Protected {
  const tokens: string[] = [];
  const masked = input.replace(PROTECT_RE, (match) => {
    const idx = tokens.length;
    tokens.push(match);
    return `${SENTINEL_OPEN}${idx}${SENTINEL_CLOSE}`;
  });
  return { masked, tokens };
}

// Put the originals back. Tolerant of the model inserting spaces inside the
// sentinel (⟦ 0 ⟧) or dropping/altering the brackets around the index.
export function restoreText(translated: string, tokens: string[]): string {
  let out = translated;
  for (let i = 0; i < tokens.length; i++) {
    const re = new RegExp(`${SENTINEL_OPEN}\\s*${i}\\s*${SENTINEL_CLOSE}`, "g");
    out = out.replace(re, tokens[i]);
  }
  return out;
}

// The ordered list of sentinel indices actually present in a string, left→right.
export function sentinelSequence(s: string): number[] {
  const re = new RegExp(`${SENTINEL_OPEN}\\s*(\\d+)\\s*${SENTINEL_CLOSE}`, "g");
  return Array.from(s.matchAll(re), (m) => Number(m[1]));
}

// True only when the model output carries EVERY sentinel EXACTLY ONCE and IN THE
// SAME ORDER the input had them (0,1,…,n-1). Presence alone is NOT enough: a model
// that reorders ⟦1⟧⟦0⟧ (a price range "11-15₪" → "15₪-11") or duplicates ⟦0⟧⟦0⟧
// (one price shown as two) would otherwise pass and silently corrupt a price.
// index.ts rejects a failing translation and keeps the Hebrew original.
export function tokensPreserved(translated: string, tokenCount: number): boolean {
  const seq = sentinelSequence(translated);
  if (seq.length !== tokenCount) return false;
  for (let i = 0; i < tokenCount; i++) if (seq[i] !== i) return false;
  return true;
}

// Final safety net, run AFTER restoreText: re-tokenize the restored (translated)
// string and require its protected spans to equal the ORIGINAL tokens — same
// values, same order. This catches corruption the sentinel check cannot: a digit
// the model glued onto a sentinel (⟦0⟧0 → "10%0" re-tokenizes to ["10%","0"]), a
// stray number the translation introduced, or a reordered/duplicated span. Any
// mismatch ⇒ the caller keeps the Hebrew original. Prices can only ever survive
// verbatim or fall back — never mutate.
export function restoredMatchesTokens(restored: string, tokens: string[]): boolean {
  const got = protectText(restored).tokens;
  if (got.length !== tokens.length) return false;
  for (let i = 0; i < tokens.length; i++) if (got[i] !== tokens[i]) return false;
  return true;
}

// A string with no letters (pure number/symbol/emoji) never needs the model — it
// would only ever come back identical, so we short-circuit it. `\p{L}` = any letter
// in any script (Hebrew, Latin, Cyrillic, Ge'ez …).
const HAS_LETTER_RE = /\p{L}/u;
export function needsTranslation(s: string): boolean {
  const t = s.trim();
  if (t.length === 0) return false;
  if (!HAS_LETTER_RE.test(t)) return false;
  return true;
}

// System prompt for one target language. Deliberately strict about the sentinels
// and about returning ONLY the JSON envelope, so the batch stays parseable.
export function buildSystemPrompt(targetEnglish: string): string {
  return [
    `You are a professional localization engine for an Israeli telecom price-comparison website.`,
    `Translate each Hebrew UI string in the input array into ${targetEnglish}.`,
    `Rules:`,
    `1. Return ONLY a JSON object of the exact shape {"t": [ ... ]} — an array of the translated strings, SAME length and SAME order as the input. No prose, no markdown, no code fences.`,
    `2. Preserve every ${SENTINEL_OPEN}number${SENTINEL_CLOSE} sentinel EXACTLY as-is and in a natural position. These stand in for prices, numbers, brand names and units — never translate, reorder the digits of, or drop them.`,
    `3. Natural, fluent, marketing-appropriate ${targetEnglish}. Keep it concise — this is UI copy, not documentation.`,
    `4. Do not add explanations or quotation marks that were not in the source.`,
    `5. If a string is already only a sentinel or has nothing to translate, return it unchanged.`,
  ].join("\n");
}

// Extract the translations array from a model reply. Tolerant of code fences and
// of the model wrapping the array directly (no {"t":…}). Returns null when it
// cannot get an array of exactly `expectedLen` strings — the caller then fails soft.
export function parseTranslations(reply: string, expectedLen: number): string[] | null {
  if (!reply) return null;
  let text = reply.trim();
  // Strip ``` / ```json fences if present.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const tryArray = (v: unknown): string[] | null => {
    if (!Array.isArray(v) || v.length !== expectedLen) return null;
    if (!v.every((x) => typeof x === "string")) return null;
    return v as string[];
  };
  // 1) {"t":[...]}
  try {
    const j = JSON.parse(text);
    if (j && typeof j === "object" && Array.isArray((j as { t?: unknown }).t)) {
      const got = tryArray((j as { t: unknown[] }).t);
      if (got) return got;
    }
    const direct = tryArray(j);
    if (direct) return direct;
  } catch {
    // fall through to bracket extraction
  }
  // 2) first top-level [ … ] in the text
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const got = tryArray(JSON.parse(text.slice(start, end + 1)));
      if (got) return got;
    } catch {
      // give up
    }
  }
  return null;
}

// Stable cache key for (source, lang). SHA-256 hex of the source text; the lang is
// a separate column so one source row fans out to N languages.
export async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Split a list of strings into model batches bounded by count AND total chars, so
// a single call never blows the token budget or gets truncated mid-array.
export function batchStrings(items: string[], maxItems = 40, maxChars = 3500): string[][] {
  const batches: string[][] = [];
  let cur: string[] = [];
  let curChars = 0;
  for (const s of items) {
    const len = s.length + 8;
    if (cur.length > 0 && (cur.length >= maxItems || curChars + len > maxChars)) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(s);
    curChars += len;
  }
  if (cur.length > 0) batches.push(cur);
  return batches;
}
