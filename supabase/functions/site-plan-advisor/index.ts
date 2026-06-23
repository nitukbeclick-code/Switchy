import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// site-plan-advisor — חוסך מנוע המלצות מסלולים (רב-שלבי)
//
// Public, multi-turn plan recommender behind the website's "מצא לי מסלול" flow.
// Grounded STRICTLY in a bundled catalogue snapshot (plans-snapshot.json, copied
// from site/data/plans.json) — the model only ever sees real catalogue rows, so
// it can't invent providers/plans/prices. Lead capture is NOT handled here; the
// site hands off to the existing lead form after the recommendation.
//
// POST { answers: { category, budget, priority, lines, abroad }, history? }
//   -> { recommendations: [{ planId, name, provider, price, annualSaving, reason }], followup }
//
// Mirrors site-ai-chat's conventions (CORS, json helper, Gemini multi-model
// fallback, cf-connecting-ip / X-Forwarded-For trust order, per-IP rate-limit by
// counting rows, jlog-style structured logging, fail-soft). Self-contained: reads
// API keys + Supabase service creds directly from edge env vars.
//
// Deploy: supabase functions deploy site-plan-advisor --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import plansSnapshot from "./plans-snapshot.json" with { type: "json" };
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { AiTimeoutError, fetchWithTimeout } from "../_shared/ai.ts";
import {
  annualSaving,
  type Answers,
  buildCatalogueContext,
  parseAnswers,
  pickCandidates,
  type Plan,
} from "./lib.ts";

// ── Limits / tuning ──────────────────────────────────────────────────────────
const MAX_HISTORY_TURNS = 8;
// Per-LLM-call wall-clock budget. A hung provider would otherwise pin the
// function (and stack Gemini+Groq hangs in series); we race each fetch against
// an AbortController so a stuck provider fails fast and we fall through / 504.
const TEXT_TIMEOUT_MS = 15_000;
const MAX_TEXT_LEN = 600;
// Hard ceiling on the combined raw conversation text — a cheap abuse/cost guard
// that rejects oversized payloads BEFORE any (paid) AI call. The per-turn
// MAX_TEXT_LEN clip below still applies; this is the coarse "obviously abusive" gate.
const MAX_INPUT_LEN = 2000;
const MAX_OUTPUT_TOKENS = 700;
const PER_IP_HOURLY_LIMIT = 20; // advisor_sessions, per IP, ~20/hour
const TEMPERATURE = 0.3;
const MAX_RECOMMENDATIONS = 3;

// Gemini ids Google ships under the free tier; tried in order (404 ⇒ next).
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── HTTP helpers (mirror site-ai-chat) ───────────────────────────────────────
// CORS is per-request: corsHeaders(req) reflects only an allowlisted Origin
// (public, paid-LLM endpoint — `*` would let any site spend our Gemini/Groq quota).
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

function jlog(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), fn: "site-plan-advisor", ...fields }));
  } catch (_) {
    console.log("site-plan-advisor", String(fields.at ?? "log"));
  }
}

// ── Catalogue ────────────────────────────────────────────────────────────────
// The Plan/Answers types + the pure ranking helpers (parseAnswers, pickCandidates,
// scorePlan, buildCatalogueContext, annualSaving) live in ./lib.ts so they're
// unit-tested without booting Deno.serve. Only loadPlans (which binds the bundled
// snapshot) stays here.

// Bundled at deploy time — no runtime fetch, no dependency on the live site.
function loadPlans(): Plan[] {
  const rows = (plansSnapshot as { plans?: Plan[] })?.plans;
  return Array.isArray(rows) ? rows : [];
}

const SYSTEM_PROMPT = `את/ה יועץ/ת מסלולים חכם/ה באתר "חוסך" — שירות ישראלי להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/טריפל/חו"ל.
המשימה: לבחור עבור המשתמש/ת את המסלולים המתאימים ביותר מתוך רשימת המסלולים האמיתית בלבד שמופיעה למטה, ולנסח שאלת המשך אחת קצרה שתחדד את ההמלצה.

כללים מחייבים:
- ענה/י בעברית בלבד.
- בחר/י אך ורק מתוך רשימת המסלולים למטה. אסור בהחלט להמציא ספק, מסלול, מחיר או planId שלא מופיע ברשימה. ה-planId חייב להיות זהה בדיוק למזהה ברשימה.
- עד ${MAX_RECOMMENDATIONS} המלצות, מהמתאים ביותר לפחות.
- כל "reason" קצר (משפט אחד, עד 18 מילים), ענייני, ומבוסס על הנתונים (מחיר/תכונות מול מה שהמשתמש/ת ביקש/ה).
- אל תבטיח/י חיסכון מדויק; אם אין נתון תקציב — אל תזכיר/י סכום חיסכון.
- "followup" = שאלה אחת קצרה וטבעית להמשך הבירור (למשל על שימוש בחו"ל, מספר קווים, או חשיבות מחיר מול נפח).

החזר/י JSON תקין בלבד, ללא טקסט נוסף, במבנה:
{"recommendations":[{"planId":"...","reason":"..."}],"followup":"..."}
- אל תכלול/י מחיר/שם/ספק בתוך ה-JSON — רק planId ו-reason. המערכת תשלים את היתר מהקטלוג.`;

function buildUserPrompt(ans: Answers, catalogue: string): string {
  const catLabel: Record<string, string> = {
    cellular: "סלולר",
    internet: "אינטרנט",
    tv: "טלוויזיה",
    triple: "טריפל",
    abroad: "חו\"ל",
  };
  const prioLabel: Record<string, string> = {
    price: "מחיר נמוך ככל האפשר",
    data: "נפח גלישה גדול",
    abroad: "שימוש בחו\"ל",
    noCommit: "ללא התחייבות",
    "5g": "רשת 5G",
    balanced: "איזון בין מחיר לערך",
  };
  const lines: string[] = [];
  lines.push(`קטגוריה מבוקשת: ${ans.category ? catLabel[ans.category] ?? ans.category : "לא צוינה (בחר/י מהזולים ביותר)"}`);
  if (ans.budget != null) lines.push(`תקציב/חשבון נוכחי חודשי: כ-₪${ans.budget}`);
  lines.push(`עדיפות: ${prioLabel[ans.priority] ?? ans.priority}`);
  lines.push(`מספר קווים/מנויים: ${ans.lines}`);
  lines.push(`שימוש בחו"ל: ${ans.abroad ? "כן" : "לא"}`);
  return `תשובות המשתמש/ת:\n${lines.join("\n")}\n\nרשימת המסלולים האמיתית (planId | קטגוריה | ספק | מסלול | מחיר | תכונות):\n${catalogue}`;
}

// ── LLM model output → planIds + reasons ─────────────────────────────────────
type ModelOut = { recs: { planId: string; reason: string }[]; followup: string };

function extractJson(text: string): unknown {
  const t = String(text ?? "").trim();
  try {
    return JSON.parse(t);
  } catch (_) { /* try to peel a fenced / embedded object */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch (_) { /* give up below */ }
  }
  return null;
}

function parseModelOut(text: string): ModelOut {
  const obj = extractJson(text) as Record<string, unknown> | null;
  const recsRaw = Array.isArray(obj?.recommendations) ? obj!.recommendations : [];
  const recs = recsRaw
    .map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      return { planId: String(o.planId ?? "").trim(), reason: String(o.reason ?? "").trim().slice(0, 160) };
    })
    .filter((r) => r.planId);
  const followup = String(obj?.followup ?? "").trim().slice(0, 240);
  return { recs, followup };
}

// ── Gemini (primary) ─────────────────────────────────────────────────────────
async function callGeminiModel(model: string, apiKey: string, system: string, history: { role: string; text: string }[], user: string): Promise<Response> {
  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.text ?? "").slice(0, MAX_TEXT_LEN) }],
    })),
    { role: "user", parts: [{ text: user }] },
  ];
  return await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: TEMPERATURE,
          responseMimeType: "application/json",
        },
      }),
    },
    TEXT_TIMEOUT_MS,
    `gemini:${model}`,
  );
}

async function callGemini(apiKey: string, system: string, history: { role: string; text: string }[], user: string): Promise<string> {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    const r = await callGeminiModel(model, apiKey, system, history, user);
    if (r.ok) {
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
      jlog({ at: "callGemini", ok: true, model });
      return String(text).trim();
    }
    lastStatus = r.status;
    jlog({ at: "callGemini", ok: false, model, status: r.status });
    if (r.status !== 404) break; // 404 ⇒ retired id, try next; anything else is real
  }
  throw new Error("gemini request failed: " + lastStatus);
}

// ── Groq (fallback) ──────────────────────────────────────────────────────────
async function callGroq(apiKey: string, system: string, history: { role: string; text: string }[], user: string): Promise<string> {
  const messages = [
    { role: "system", content: system },
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: String(h.text ?? "").slice(0, MAX_TEXT_LEN),
    })),
    { role: "user", content: user },
  ];
  const r = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: TEMPERATURE,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
    }),
  }, TEXT_TIMEOUT_MS, "groq");
  if (!r.ok) {
    jlog({ at: "callGroq", ok: false, status: r.status });
    throw new Error("groq request failed: " + r.status);
  }
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  jlog({ at: "callGroq", ok: true, model: GROQ_MODEL });
  return String(text).trim();
}

// ── Rate limit (advisor_sessions, per IP) ────────────────────────────────────
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

// Tri-state: true = limited (429), false = ok, null = DB error.
// On a DB query error we FAIL-CLOSED (null → 503): the advisor calls the paid
// Gemini/Groq providers, so a Supabase outage must not make them unmetered.
// Only the "no IP" / "not configured" cases stay fail-open.
async function rateLimited(ip: string): Promise<boolean | null> {
  if (!ip) return false; // can't limit without an IP — fail-open
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return false; // not configured ⇒ fail open
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  try {
    const r = await fetch(
      `${url}/rest/v1/advisor_sessions?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`,
      { headers: { "apikey": key, "Authorization": `Bearer ${key}` } },
    );
    if (!r.ok) {
      jlog({ at: "rateLimited", ok: false, status: r.status });
      return null; // query failed ⇒ fail CLOSED (caller returns 503)
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length >= PER_IP_HOURLY_LIMIT;
  } catch (e) {
    jlog({ at: "rateLimited", ok: false, error: String(e) });
    return null; // infra hiccup ⇒ fail CLOSED (caller returns 503)
  }
}

const FRIENDLY_BUSY = "שירות עמוס כרגע, נסו שוב בעוד רגע";

function recordSession(ip: string): void {
  // best-effort audit/rate-limit row; never blocks the response
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return;
  fetch(`${url}/rest/v1/advisor_sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ ip: ip || null }),
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_KEY") ?? "";
  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
  if (!geminiKey && !groqKey) return json(req, { error: "advisor is not configured" }, 503);

  let body: { answers?: unknown; history?: { role: string; text: string }[] };
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: "invalid json" }, 400);
  }

  // Cheap abuse/cost guard: reject an oversized raw conversation before any AI
  // work (sum the incoming history turns' text, the only free-text the client sends).
  if (Array.isArray(body.history)) {
    const totalLen = body.history.reduce((n, h) => n + String(h?.text ?? "").length, 0);
    if (totalLen > MAX_INPUT_LEN) return json(req, { error: "input too long" }, 400);
  }

  const ans = parseAnswers(body.answers);
  const history = Array.isArray(body.history)
    ? body.history
      .filter((h) => h && typeof h === "object")
      .map((h) => ({ role: String(h.role ?? ""), text: String(h.text ?? "") }))
      .slice(-MAX_HISTORY_TURNS)
    : [];

  const ip = clientIp(req);
  const limited = await rateLimited(ip);
  if (limited === null) return json(req, { error: FRIENDLY_BUSY }, 503);
  if (limited) return json(req, { error: "rate limit exceeded" }, 429);

  const plans = loadPlans();
  const candidates = pickCandidates(plans, ans);
  if (candidates.length === 0) {
    return json(req, {
      recommendations: [],
      followup: "לא מצאתי מסלולים מתאימים בקטגוריה הזו כרגע. תרצו שאבדוק קטגוריה אחרת?",
    });
  }

  // Stable lookup so we can validate the model's planIds against the snapshot
  // and complete name/provider/price OURSELVES — never from the model.
  const byId = new Map<string, Plan>();
  for (const p of candidates) if (p.id) byId.set(p.id, p);

  const catalogue = buildCatalogueContext(candidates);
  const userPrompt = buildUserPrompt(ans, catalogue);

  let raw = "";
  let provider = "";
  let timedOut = false;
  try {
    if (geminiKey) {
      try {
        raw = await callGemini(geminiKey, SYSTEM_PROMPT, history, userPrompt);
        provider = "gemini";
      } catch (e) {
        if (e instanceof AiTimeoutError) timedOut = true;
        jlog({ at: "advisor", note: "gemini failed, trying groq", error: String(e) });
      }
    }
    if ((!raw || parseModelOut(raw).recs.length === 0) && groqKey) {
      raw = await callGroq(groqKey, SYSTEM_PROMPT, history, userPrompt);
      provider = "groq";
    }
  } catch (e) {
    if (e instanceof AiTimeoutError) timedOut = true;
    jlog({ at: "advisor", ok: false, error: String(e) });
  }

  const parsed = parseModelOut(raw);

  // Keep ONLY recommendations whose planId exists in the snapshot candidates;
  // complete every field from the catalogue, compute annualSaving ourselves.
  const recommendations = parsed.recs
    .map((r) => byId.get(r.planId))
    .filter((p): p is Plan => !!p)
    .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i) // dedupe
    .slice(0, MAX_RECOMMENDATIONS)
    .map((p) => {
      const reason = parsed.recs.find((r) => r.planId === p.id)?.reason ?? "";
      const saving = annualSaving(p, ans);
      const rec: Record<string, unknown> = {
        planId: p.id,
        name: p.plan,
        provider: p.provider,
        price: p.price,
        reason: reason || "מתאים לדרישות שציינתם מתוך הקטלוג.",
      };
      if (saving != null) rec.annualSaving = saving;
      return rec;
    });

  // Deterministic fallback if the model returned nothing usable: surface the
  // top-ranked snapshot candidates so the flow never dead-ends.
  if (recommendations.length === 0) {
    for (const p of candidates.slice(0, MAX_RECOMMENDATIONS)) {
      const saving = annualSaving(p, ans);
      const rec: Record<string, unknown> = {
        planId: p.id,
        name: p.plan,
        provider: p.provider,
        price: p.price,
        reason: "אחת ההצעות המשתלמות בקטגוריה לפי הנתונים שמסרתם.",
      };
      if (saving != null) rec.annualSaving = saving;
      recommendations.push(rec);
    }
  }

  const followup = parsed.followup ||
    "כדי לדייק עוד — חשוב לכם יותר מחיר נמוך או נפח גלישה גדול?";

  recordSession(ip);
  // The deterministic fallback above is REAL grounded catalogue data, so even on
  // an LLM timeout we return useful recommendations rather than 504-ing the flow.
  // We just log the timeout (the AbortController already prevented the hang).
  jlog({ at: "advisor", ok: true, provider: provider || "fallback", timedOut, recs: recommendations.length });
  return json(req, { recommendations, followup });
});
