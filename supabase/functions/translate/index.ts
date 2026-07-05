import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// translate — on-demand, cached, site-wide UI translation
//
// The public site is authored in Hebrew. The two front-ends (the Next mobile app
// and the static desktop site) each ship a small runtime that, when a visitor
// picks a language, collects the visible strings and POSTs them here. We return
// the translations and CACHE every one in public.site_translations, so:
//   • the first visitor to see a string in a language pays ~1-2s of model latency,
//   • every visitor after is served from the DB in ~100ms,
//   • a returning visitor re-reads their own browser cache instantly (client side).
//
// SAFETY — prices and brands can never be altered. lib.ts masks every ₪/number/
// brand/unit/URL span with an opaque sentinel BEFORE the model sees the text and
// restores it after, and we reject (→ keep the Hebrew original) any translation
// that dropped a sentinel. See lib.ts.
//
// COST — the DB cache means the model is hit only for genuinely-new strings; the
// site's string set is finite, so steady-state model spend trends to zero. On top
// of that: per-request size caps + a generous in-memory per-IP flood backstop.
// Fail-soft everywhere: on any model/DB failure a string falls back to its Hebrew
// original — the page is never broken, only left untranslated.
//
// POST { lang: "ar"|"en"|"ru"|"am"|"es"|"fr", texts: string[] }
//   -> { lang, translations: string[] }   // aligned 1:1 with texts
//
// Deploy: supabase functions deploy translate --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached } from "../_shared/config.ts";
import { fetchRows, rpcScalar, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { type AiKeys, generateReply } from "../_shared/ai.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { rateLimit } from "../_shared/ratelimit.ts";
import {
  batchStrings,
  buildSystemPrompt,
  isSupportedLang,
  langEnglishName,
  needsTranslation,
  parseTranslations,
  protectText,
  restoredMatchesTokens,
  restoreText,
  sha256Hex,
  tokensPreserved,
} from "./lib.ts";

const MAX_TEXTS = 120; // strings per request
const MAX_TOTAL_CHARS = 24_000; // summed payload chars
const MAX_STRING_LEN = 2_000; // a single string longer than this is passed through untranslated
const PER_IP_LIMIT = 90; // requests …
const PER_IP_WINDOW_MS = 60_000; // … per minute (flood backstop; the DB cache is the real guard)
const CACHE_IN_CHUNK = 50; // hashes per cache-lookup URL
const MODEL_MAX_TOKENS = 8192; // headroom so a full batch's JSON reply isn't truncated
// Ge'ez/Cyrillic/Arabic render more tokens per source char; smaller batches keep a
// reply inside MODEL_MAX_TOKENS (retry-split below is the safety net either way).
const VERBOSE_LANGS = new Set(["am", "ru", "ar"]);
const batchCapFor = (lang: string) => (VERBOSE_LANGS.has(lang) ? 24 : 40);
// Hard global daily ceiling on model-translated strings (across all IPs/isolates)
// so a distributed / XFF-spoofing flood can't run the paid model unbounded. When
// exceeded, uncached strings fail soft to Hebrew. The DB cache means legitimate
// steady-state usage sits far under this.
const DAILY_MODEL_BUDGET = 40_000;

function json(req: Request, body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req, extra) },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return (xff.split(",")[0] || req.headers.get("x-real-ip") || "").trim();
}

// Pull cached (source_hash → translated) rows for this language, chunking the
// `in.(…)` filter so the URL never grows unbounded. Fail-soft: a failed chunk
// just yields no cache hits for those hashes (they get translated fresh).
async function loadCache(lang: string, hashes: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < hashes.length; i += CACHE_IN_CHUNK) {
    const chunk = hashes.slice(i, i + CACHE_IN_CHUNK);
    const inList = chunk.map((h) => `"${h}"`).join(",");
    const rows = await fetchRows<{ source_hash: string; translated: string }>(
      `/rest/v1/site_translations?select=source_hash,translated&lang=eq.${encodeURIComponent(lang)}&source_hash=in.(${inList})`,
    );
    if (rows) for (const r of rows) out.set(r.source_hash, r.translated);
  }
  return out;
}

// Best-effort bulk upsert of freshly-translated rows. Unique(source_hash,lang)
// makes this idempotent under the race of two visitors translating the same
// string at once (merge-duplicates). Never throws into the request path.
async function saveCache(
  rows: { source_hash: string; lang: string; source_text: string; translated: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await serviceFetch("/rest/v1/site_translations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  } catch (e) {
    jlog({ at: "translate.saveCache", ok: false, error: String(e) });
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const geminiKey = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  const groqKey = firstEnv(["GROQ_API_KEY"]);
  const cerebrasKey = firstEnv(["CEREBRAS_API_KEY"]);
  const openrouterKey = firstEnv(["OPENROUTER_API_KEY"]);
  if (!geminiKey && !groqKey && !cerebrasKey && !openrouterKey) {
    return json(req, { error: "translation is not configured" }, 503);
  }
  const keys: AiKeys = { gemini: geminiKey, groq: groqKey, cerebras: cerebrasKey, openrouter: openrouterKey };

  let body: { lang?: unknown; texts?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: "invalid json" }, 400);
  }

  const lang = String(body.lang ?? "").trim();
  if (!isSupportedLang(lang)) return json(req, { error: "unsupported language" }, 400);

  if (!Array.isArray(body.texts)) return json(req, { error: "texts must be an array" }, 400);
  const texts = body.texts.map((t) => String(t ?? ""));
  if (texts.length === 0) return json(req, { lang, translations: [] });
  if (texts.length > MAX_TEXTS) return json(req, { error: "too many strings" }, 400);
  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) return json(req, { error: "payload too large" }, 400);

  // Flood backstop (process-local; the DB cache is the real cost guard).
  const ip = clientIp(req);
  if (ip) {
    const rl = rateLimit(`translate:${ip}`, PER_IP_LIMIT, PER_IP_WINDOW_MS);
    if (!rl.allowed) {
      return json(req, { error: "rate limit exceeded" }, 429, { "Retry-After": String(rl.retryAfterSec) });
    }
  }

  // Which strings actually need the model? Skip pure numbers/symbols and overlong
  // blobs — they pass through unchanged. Dedupe so a string repeated across the
  // page is translated once.
  const uniqueToTranslate = new Set<string>();
  for (const t of texts) {
    if (t.length > MAX_STRING_LEN) continue;
    if (needsTranslation(t)) uniqueToTranslate.add(t);
  }
  const uniques = [...uniqueToTranslate];

  // final translation for each unique source string
  const resolved = new Map<string, string>();

  if (uniques.length > 0) {
    const hashes = await Promise.all(uniques.map((s) => sha256Hex(s)));
    const hashOf = new Map<string, string>();
    uniques.forEach((s, i) => hashOf.set(s, hashes[i]));

    // 1) DB cache
    const cache = await loadCache(lang, hashes);
    const missing: string[] = [];
    for (const s of uniques) {
      const cached = cache.get(hashOf.get(s)!);
      if (cached !== undefined) resolved.set(s, cached);
      else missing.push(s);
    }

    // 2) Global daily budget gate — atomically reserve this request's model work.
    //    Best-effort: on a DB error we proceed (fail-open); the per-request caps +
    //    in-memory limiter still apply. `false` => over budget => the misses stay
    //    Hebrew (they already default to their original below).
    const budgetOk = await rpcScalar<boolean>("translate_budget_consume", {
      p_n: missing.length,
      p_cap: DAILY_MODEL_BUDGET,
    });

    // 3) Model for the misses (masked → translate → restore → double-verify).
    const english = langEnglishName(lang);
    const system = buildSystemPrompt(english);
    const toCache: { source_hash: string; lang: string; source_text: string; translated: string }[] = [];

    // Translate one batch. On a PARSE FAILURE (e.g. the model truncated the JSON
    // array for a verbose script) split the batch and retry each half, so a lost
    // tail never drops the WHOLE batch to Hebrew. Each survivor must pass BOTH
    // guards — ordered/complete sentinels AND a restored-token re-match — before it
    // is trusted or cached; anything else keeps the Hebrew original.
    const translateBatch = async (batch: string[]): Promise<void> => {
      const protectedBatch = batch.map((s) => protectText(s));
      const maskedArr = protectedBatch.map((p) => p.masked);
      let out: string[] | null = null;
      try {
        const reply = await generateReply(keys, system, [], JSON.stringify(maskedArr), MODEL_MAX_TOKENS, undefined, { tier: "fast" });
        out = parseTranslations(reply, maskedArr.length);
      } catch (e) {
        jlog({ at: "translate.model", ok: false, lang, error: String(e) });
      }
      if (out === null && batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        await translateBatch(batch.slice(0, mid));
        await translateBatch(batch.slice(mid));
        return;
      }
      batch.forEach((src, i) => {
        const p = protectedBatch[i];
        const masked = out?.[i];
        if (masked && tokensPreserved(masked, p.tokens.length)) {
          const finalText = restoreText(masked, p.tokens);
          if (restoredMatchesTokens(finalText, p.tokens)) {
            resolved.set(src, finalText);
            toCache.push({ source_hash: hashOf.get(src)!, lang, source_text: src, translated: finalText });
            return;
          }
        }
        resolved.set(src, src); // fail-soft: keep the Hebrew original
      });
    };

    if (budgetOk !== false) {
      for (const batch of batchStrings(missing, batchCapFor(lang), 3500)) {
        await translateBatch(batch);
      }
    }
    // Cache only genuinely-translated rows (never cache a fail-soft identity).
    await saveCache(toCache.filter((r) => r.translated !== r.source_text));
  }

  // Align output to the original input order; anything not translated → itself.
  const translations = texts.map((t) => resolved.get(t) ?? t);
  jlog({ at: "translate", lang, in: texts.length, uniques: uniques.length });
  return json(req, { lang, translations });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    // Last-resort: never 500 the page — echo the input back untranslated.
    jlog({ at: "translate.fatal", ok: false, error: String(e) });
    try {
      const b = await req.clone().json();
      const texts = Array.isArray(b?.texts) ? b.texts.map((t: unknown) => String(t ?? "")) : [];
      return json(req, { lang: String(b?.lang ?? ""), translations: texts }, 200);
    } catch (_) {
      return json(req, { error: "translation failed" }, 200);
    }
  }
});
