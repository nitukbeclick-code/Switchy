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
const MAX_OUTPUT_TOKENS = 300;
const PER_IP_DAILY_LIMIT = 1; // strict: one bill analysis per IP per day
const MAX_SUGGESTIONS = 3;

// Gemini Vision model ids, tried in order (404 → try next, see callGemini).
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
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

const VISION_PROMPT = `אתה מנתח חשבונות תקשורת ישראליים מתוך תמונה (סלולר / אינטרנט / טלוויזיה / חבילה משולבת / חו"ל).
החזר אך ורק אובייקט JSON תקין (ללא טקסט נוסף, ללא markdown) בפורמט:
{"provider": string, "monthly": number, "category": string, "confidence": number}

הנחיות:
- provider: שם הספק כפי שמופיע בחשבון. אם מזוהה, נסה להחזיר אחד מתוך הרשימה הבאה בדיוק: __PROVIDERS__. אם לא ברור, החזר את השם שמופיע בחשבון, ואם אין — מחרוזת ריקה "".
- monthly: הסכום החודשי הכולל לתשלום בשקלים (מספר בלבד, ללא ₪ וללא פסיקים). אם יש "סה""כ לתשלום" קח אותו. אם לא ניתן לקרוא סכום, החזר 0.
- category: אחד מהערכים בדיוק: "cellular", "internet", "tv", "triple", "abroad". אם לא ברור, החזר "".
- confidence: מספר בין 0 ל-1 שמבטא עד כמה אתה בטוח שזו אכן תמונת חשבון תקשורת קריאה.
אם התמונה אינה חשבון תקשורת, מטושטשת או לא קריאה — החזר {"provider":"","monthly":0,"category":"","confidence":0}.`;

async function callGeminiModel(
  model: string,
  apiKey: string,
  promptText: string,
  img: { mimeType: string; data: string },
): Promise<Response> {
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              { inlineData: { mimeType: img.mimeType, data: img.data } },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    },
  );
}

// Google renames/retires model ids over time; a 404 means "try the next
// candidate", anything else (auth/quota/5xx) is a real failure — surface it.
async function callGeminiVision(
  apiKey: string,
  promptText: string,
  img: { mimeType: string; data: string },
): Promise<string> {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    const r = await callGeminiModel(model, apiKey, promptText, img);
    if (r.ok) {
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
      jlog({ at: "bill-analyzer.callGemini", ok: true, model });
      return String(text).trim();
    }
    lastStatus = r.status;
    jlog({ at: "bill-analyzer.callGemini", ok: false, model, status: r.status });
    if (r.status !== 404) break;
  }
  throw new Error("gemini vision request failed: " + lastStatus);
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  if (!apiKey) return json({ error: "מנתח החשבונות אינו זמין כרגע." }, 503);

  let body: { imageBase64?: string };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }

  const raw = String(body.imageBase64 ?? "");
  if (!raw.trim()) return json({ error: "חסרה תמונה לניתוח." }, 400);
  if (raw.length > MAX_BASE64_LEN) {
    return json({ error: "התמונה גדולה מדי. צלמו תמונה קטנה יותר ונסו שוב." }, 413);
  }
  const img = parseImage(raw);
  if (!img) return json({ error: "פורמט התמונה אינו נתמך." }, 400);
  if (img.data.length > MAX_BASE64_LEN) {
    return json({ error: "התמונה גדולה מדי. צלמו תמונה קטנה יותר ונסו שוב." }, 413);
  }

  const ip = clientIp(req);
  if (await rateLimited(ip)) {
    return json({ error: "כבר ניתחנו עבורכם חשבון היום. נסו שוב מחר 🙂", suggestions: [] }, 429);
  }

  const plans = loadPlans();
  const providers = catalogueProviders(plans);
  const prompt = VISION_PROMPT.replace("__PROVIDERS__", providers.join(", "));

  let extracted: Extracted | null = null;
  try {
    const out = await callGeminiVision(apiKey, prompt, img);
    extracted = parseExtraction(out);
  } catch (e) {
    jlog({ at: "bill-analyzer", ok: false, error: String(e) });
    // Fail-soft: never crash the client. 200 + friendly Hebrew error.
    return json({ provider: "", currentSpend: 0, category: "", suggestions: [], error: FRIENDLY_UNREADABLE });
  }

  // Unreadable / not-a-bill / low confidence → friendly 200, no crash.
  if (!extracted || extracted.confidence < 0.3 || !(extracted.monthly > 0)) {
    jlog({ at: "bill-analyzer", ok: true, readable: false, confidence: extracted?.confidence ?? null });
    return json({ provider: "", currentSpend: 0, category: "", suggestions: [], error: FRIENDLY_UNREADABLE });
  }

  const provider = normalizeProvider(extracted.provider, providers);
  const category = normalizeCategory(extracted.category);
  // Clip the extracted total to a sane range; bills above ₪5000/mo for a single
  // service are almost certainly a misread, so treat them as unreadable rather
  // than fabricate huge "savings".
  const currentSpend = Math.round(Math.min(5000, Math.max(0, extracted.monthly)));
  const suggestions = buildSuggestions(plans, category, currentSpend, MAX_SUGGESTIONS);

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

  jlog({ at: "bill-analyzer", ok: true, readable: true, provider, category, currentSpend, suggestions: suggestions.length });

  return json({ provider, currentSpend, category, suggestions, note });
});
