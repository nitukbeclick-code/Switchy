import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// site-bill-analyzer — חוסך · מנתח חשבונות
// Public endpoint behind the "צלמו את החשבון" feature on the marketing site.
// The user photographs a phone/internet/TV bill; Gemini Vision extracts the
// provider, the total monthly amount (₪) and the service category, and we match
// that against the bundled plan catalogue to surface up to 3 cheaper options.
//
// PRIVACY: the image is NEVER stored. Only a summary row is written to
// bill_analyses (ip, provider, current_spend, suggestions) — never the photo,
// never any base64. Strict rate-limit: 1 analysis / IP / day.
//
// POST { imageBase64: string }   // data URL ("data:image/png;base64,…") or raw base64
//   -> 200 {
//        provider: string,                 // mapped to one of our catalogue providers, or "" if unknown
//        currentSpend: number,             // total monthly ₪ extracted from the bill (0 if unreadable)
//        category: string,                 // cellular | internet | tv | triple | abroad | ""
//        suggestions: [{ name, provider, price, annualSaving }],
//        note: string                      // friendly Hebrew context line
//      }
//   On a junk/blurry/unreadable image we STILL return 200 with an `error`
//   field (friendly Hebrew) + empty suggestions — the front-end never crashes.
//
// Deploy: supabase functions deploy site-bill-analyzer --no-verify-jwt
//
// ── DB (run once in the SQL editor; mirrors the chat_messages convention) ────
//   create table if not exists public.bill_analyses (
//     id bigint generated always as identity primary key,
//     ip text,
//     provider text,
//     current_spend numeric,
//     suggestions jsonb,
//     created_at timestamptz not null default now()
//   );
//   create index if not exists bill_analyses_ip_idx
//     on public.bill_analyses (ip, created_at desc);
//   alter table public.bill_analyses enable row level security;
//   -- no policies: only service_role (bypasses RLS) reads/writes this table.
//   grant select, insert on public.bill_analyses to service_role;
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached } from "../_shared/config.ts";
import { fetchRows, insertRow } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { AiTimeoutError, callGeminiVision } from "../_shared/ai.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import {
  buildSuggestions,
  catalogueProviders,
  normalizeCategory,
  normalizeProvider,
  type Plan,
} from "../_shared/catalogue.ts";
import { type Extracted, parseExtraction, parseImage } from "./lib.ts";
import plansSnapshot from "./plans-snapshot.json" with { type: "json" };

// Reject anything larger than ~6MB of base64 payload (≈4.5MB decoded image) —
// keeps a single request from blowing the function's memory/time budget.
const MAX_BASE64_LEN = 6 * 1024 * 1024;
const PER_IP_DAILY_LIMIT = 1; // strict: one bill analysis per IP per day
const MAX_SUGGESTIONS = 3;
// Below this confidence we treat the read as unreliable and refuse to surface
// (possibly wrong) numbers — honesty over a confident-sounding misread.
const MIN_CONFIDENCE = 0.3;

// CORS is per-request: corsHeaders(req) reflects only an allowlisted Origin
// (public, paid Gemini-Vision endpoint — `*` would let any site spend our quota).
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

// Bundled at deploy time — refresh from site/data/plans.json and redeploy when
// prices change (the production site isn't fetched at runtime).
function loadPlans(): Plan[] {
  const rows = (plansSnapshot as { plans?: Plan[] })?.plans;
  return Array.isArray(rows) ? rows : [];
}

// catalogueProviders / normalizeProvider / normalizeCategory / buildSuggestions
// are imported from _shared/catalogue.ts — the single source of truth for the
// provider-alias table and category synonyms, shared with the WhatsApp bot so a
// brand either surface knows is matched on both. (B4/B8 drift fix.)
//
// parseImage / parseExtraction (+ the Extracted type) are imported from ./lib.ts
// so they can be unit-tested without booting the Deno.serve entrypoint.

// Vision extraction prompt. We additionally ask the model to be HONEST about
// image quality: it returns a `confidence` (0-1) AND a short `warnings` list
// (e.g. blurry photo, unclear total) that we surface to the user verbatim — we
// never paper over a shaky read with a confident-sounding number.
const VISION_PROMPT = `אתה מנתח חשבונות תקשורת ישראליים מתוך תמונה (סלולר / אינטרנט / טלוויזיה / חבילה משולבת / חו"ל).
החזר אך ורק אובייקט JSON תקין (ללא טקסט נוסף, ללא markdown) בפורמט:
{"provider": string, "monthly": number, "category": string, "confidence": number, "warnings": string[]}

הנחיות:
- provider: שם הספק כפי שמופיע בחשבון. אם מזוהה, נסה להחזיר אחד מתוך הרשימה הבאה בדיוק: __PROVIDERS__. אם לא ברור, החזר את השם שמופיע בחשבון, ואם אין — מחרוזת ריקה "".
- monthly: הסכום החודשי הכולל לתשלום בשקלים (מספר בלבד, ללא ₪ וללא פסיקים). אם יש "סה""כ לתשלום" קח אותו. אם לא ניתן לקרוא סכום, החזר 0.
- category: אחד מהערכים בדיוק: "cellular", "internet", "tv", "triple", "abroad". אם לא ברור, החזר "".
- confidence: מספר בין 0 ל-1 שמבטא עד כמה אתה בטוח שזו אכן תמונת חשבון תקשורת קריאה ושהסכום שחילצת נכון. היה כן/ה: אם התמונה מטושטשת או הסכום לא חד-משמעי, החזר ערך נמוך.
- warnings: רשימת אזהרות קצרות בעברית על איכות הקריאה (לכל היותר 3), למשל "התמונה מעט מטושטשת", "הסכום החודשי לא ברור לחלוטין", "זוהו כמה סכומים ולא בטוח מהו התשלום החודשי". אם הקריאה ברורה לגמרי — החזר [].
אם התמונה אינה חשבון תקשורת, מטושטשת או לא קריאה — החזר {"provider":"","monthly":0,"category":"","confidence":0,"warnings":["לא ניתן לקרוא את החשבון מהתמונה"]}.`;

function clientIp(req: Request): string {
  // CDN-set header first, then the last (infra-appended) X-Forwarded-For hop —
  // never the spoofable first hop.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "";
}

async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false; // fail-open on missing IP
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const rows = await fetchRows<{ id: string }>(
    `/rest/v1/bill_analyses?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`,
  );
  if (rows === null) return true; // query failed — fail CLOSED (this endpoint hits paid Gemini Vision; block rather than let a DB outage enable a burst)
  return rows.length >= PER_IP_DAILY_LIMIT;
}

const FRIENDLY_UNREADABLE =
  "לא הצלחנו לקרוא את החשבון מהתמונה. נסו לצלם שוב באור טוב, ישר מול הדף, כך שסכום התשלום החודשי וסכום הספק יהיו ברורים.";

// Timed-out (vision model hung past VISION_TIMEOUT_MS) → 504 so the client shows
// "try again", not a fake/empty read.
const FRIENDLY_TIMEOUT =
  "ניתוח החשבון לוקח יותר מדי זמן כרגע. נסו שוב בעוד רגע.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const apiKey = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  if (!apiKey) return json(req, { error: "מנתח החשבונות אינו זמין כרגע." }, 503);

  let body: { imageBase64?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: "invalid json" }, 400);
  }

  const raw = String(body.imageBase64 ?? "");
  if (!raw.trim()) return json(req, { error: "חסרה תמונה לניתוח." }, 400);
  if (raw.length > MAX_BASE64_LEN) {
    return json(req, { error: "התמונה גדולה מדי. צלמו תמונה קטנה יותר ונסו שוב." }, 413);
  }
  const img = parseImage(raw);
  if (!img) return json(req, { error: "פורמט התמונה אינו נתמך." }, 400);
  if (img.data.length > MAX_BASE64_LEN) {
    return json(req, { error: "התמונה גדולה מדי. צלמו תמונה קטנה יותר ונסו שוב." }, 413);
  }

  const ip = clientIp(req);
  if (await rateLimited(ip)) {
    return json(req, { error: "כבר ניתחנו עבורכם חשבון היום. נסו שוב מחר 🙂", suggestions: [] }, 429);
  }

  const plans = loadPlans();
  const providers = catalogueProviders(plans);
  const prompt = VISION_PROMPT.replace("__PROVIDERS__", providers.join(", "));

  let extracted: Extracted | null = null;
  try {
    const out = await callGeminiVision(apiKey, prompt, img);
    extracted = parseExtraction(out);
  } catch (e) {
    // A hung vision model is distinct from an unreadable image: surface 504 so
    // the user retries rather than thinking their bill couldn't be read.
    if (e instanceof AiTimeoutError) {
      jlog({ at: "bill-analyzer", ok: false, timedOut: true });
      return json(req, { provider: "", currentSpend: 0, category: "", suggestions: [], error: FRIENDLY_TIMEOUT }, 504);
    }
    jlog({ at: "bill-analyzer", ok: false, error: String(e) });
    // Fail-soft: never crash the client. 200 + friendly Hebrew error.
    return json(req, { provider: "", currentSpend: 0, category: "", suggestions: [], error: FRIENDLY_UNREADABLE });
  }

  // Unreadable / not-a-bill / low confidence → friendly 200, no crash. Echo the
  // confidence + any model warnings so the front-end can be honest about WHY.
  if (!extracted || extracted.confidence < MIN_CONFIDENCE || !(extracted.monthly > 0)) {
    const confidence = extracted?.confidence ?? 0;
    const warnings = extracted?.warnings ?? [];
    jlog({ at: "bill-analyzer", ok: true, readable: false, confidence });
    return json(req, {
      provider: "",
      currentSpend: 0,
      category: "",
      suggestions: [],
      confidence,
      warnings,
      error: FRIENDLY_UNREADABLE,
    });
  }

  const provider = normalizeProvider(extracted.provider, providers);
  const category = normalizeCategory(extracted.category);
  // Clip the extracted total to a sane range; bills above ₪5000/mo for a single
  // service are almost certainly a misread, so treat them as unreadable rather
  // than fabricate huge "savings".
  const currentSpend = Math.round(Math.min(5000, Math.max(0, extracted.monthly)));
  const suggestions = buildSuggestions(plans, category, currentSpend, MAX_SUGGESTIONS);
  const confidence = extracted.confidence;
  const warnings = extracted.warnings;

  const note = suggestions.length
    ? `מצאנו ${suggestions.length} מסלולים זולים יותר באותה קטגוריה.`
    : "לא מצאנו מסלול זול יותר באותה קטגוריה — נראה שאתם משלמים מחיר טוב.";

  // PRIVACY: store ONLY the summary — never the image, never the base64.
  // Best-effort; never blocks the response.
  insertRow("bill_analyses", {
    ip: ip || null,
    provider: provider || null,
    current_spend: currentSpend,
    suggestions,
  }).catch(() => {});

  jlog({ at: "bill-analyzer", ok: true, readable: true, provider, category, currentSpend, confidence, suggestions: suggestions.length });

  return json(req, { provider, currentSpend, category, suggestions, confidence, warnings, note });
});
