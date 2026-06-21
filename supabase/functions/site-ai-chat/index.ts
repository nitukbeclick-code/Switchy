import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ai-chat — חוסך AI
// Public chat endpoint behind the "חוסך AI" widget on app.html. Replaces the
// old client-only keyword-matched demo with a real Gemini call, grounded in
// the plan catalogue bundled into this function as plans-snapshot.json (the
// production site isn't live yet, so the catalogue can't be fetched at
// runtime — refresh that file from site/data/plans.json and redeploy when
// prices change).
//
// POST { message: string, history?: { role: 'user'|'bot', text: string }[] }
//   -> { reply: string }
//
// Deploy: supabase functions deploy ai-chat --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached } from "../_shared/config.ts";
import { fetchRows, insertRow } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import plansSnapshot from "./plans-snapshot.json" with { type: "json" };

const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY_TURNS = 6;
const MAX_OUTPUT_TOKENS = 350;
const PER_IP_HOURLY_LIMIT = 15;

// Gemini model names Google has shipped under the free tier; tried in order.
// chosech.co.il isn't live yet (DNS unset, app still pre-launch), so the
// catalogue ships as a bundled snapshot instead of a runtime fetch — refresh
// this file (copy from site/data/plans.json) and redeploy when prices change.
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

// Fallback chain when Gemini is down/empty/quota-capped. Both speak the
// OpenAI chat-completions schema, so they share buildOpenAiMessages + the same
// grounded Hebrew system prompt. Groq is fast & free-tier-generous; OpenRouter
// is the last-ditch net (a free model id so it costs nothing at rest).
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

type Plan = {
  cat?: string; provider?: string; plan?: string; price?: number;
  is5G?: boolean; noCommit?: boolean; hasAbroad?: boolean; priceUnit?: string;
};

// Bundled at deploy time (see GEMINI_MODELS comment above) — no runtime fetch,
// no dependency on the production site being live.
function loadPlans(): Plan[] {
  const rows = (plansSnapshot as { plans?: Plan[] })?.plans;
  return Array.isArray(rows) ? rows : [];
}

// Compact, factual context: the cheapest handful per category, formatted as
// pipe-delimited rows. Keeps the prompt small and keeps Gemini from inventing
// plans that don't exist — it only ever sees real catalogue rows.
function buildCatalogueContext(plans: Plan[]): string {
  const byCat = new Map<string, Plan[]>();
  for (const p of plans) {
    if (!p.cat || typeof p.price !== "number") continue;
    if (!byCat.has(p.cat)) byCat.set(p.cat, []);
    byCat.get(p.cat)!.push(p);
  }
  const lines: string[] = [];
  for (const [cat, rows] of byCat) {
    rows.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    for (const p of rows.slice(0, 15)) {
      const unit = p.priceUnit === "package" ? "לחבילה" : p.priceUnit === "day" ? "ליום" : p.priceUnit === "minute" ? "לדקה" : "לחודש";
      const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && "כולל חו״ל"].filter(Boolean).join(", ");
      lines.push(`${cat} | ${p.provider} | ${p.plan} | ₪${p.price} ${unit}${flags ? " | " + flags : ""}`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT_HEADER = `את/ה "חוסך AI" — עוזר וירטואלי באתר חוסך, אפליקציה ישראלית להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/חו"ל.
כללים מחייבים:
- ענה/י בעברית בלבד, בקצרה (2-4 משפטים), בטון חם ומקצועי.
- התבסס/י אך ורק על נתוני המסלולים שמופיעים למטה. אל תמציא/י ספקים, מסלולים או מחירים שלא מופיעים ברשימה.
- אם השאלה דורשת ייעוץ אישי מורכב (למשל ניתוח חשבון ספציפי, מצב חוזי מורכב), הפנה/י בעדינות לטופס "קבלו השוואה חינם" באתר או לוואטסאפ.
- אל תבטיח/י חיסכון מדויק לאדם ספציפי — רק טווחים כלליים שמבוססים על הנתונים.
- אל תיתן/י מידע רגיש או לא קשור לתחום התקשורת/האתר.

נתוני מסלולים אמיתיים (קטגוריה | ספק | מסלול | מחיר | תכונות):
`;

async function callGeminiModel(model: string, apiKey: string, systemContext: string, history: { role: string; text: string }[], message: string): Promise<Response> {
  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.text ?? "").slice(0, MAX_MESSAGE_LEN) }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemContext }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
      }),
    },
  );
}

// Google renames/retires model ids over time; a 404 means "try the next
// candidate", anything else (auth/quota/5xx) is a real failure — stop trying
// Gemini and let the caller fall through to the OpenAI-style providers.
async function callGemini(apiKey: string, systemContext: string, history: { role: string; text: string }[], message: string): Promise<string> {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    const r = await callGeminiModel(model, apiKey, systemContext, history, message);
    if (r.ok) {
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
      jlog({ at: "ai-chat.callGemini", ok: true, model });
      return String(text).trim();
    }
    lastStatus = r.status;
    jlog({ at: "ai-chat.callGemini", ok: false, model, status: r.status });
    if (r.status !== 404) break;
  }
  throw new Error("gemini request failed: " + lastStatus);
}

// Shared OpenAI chat-completions message array: the same grounded Hebrew system
// prompt as Gemini's systemInstruction, then the clipped history, then the new
// user turn. "bot"/"model" history roles map to "assistant".
function buildOpenAiMessages(systemContext: string, history: { role: string; text: string }[], message: string): { role: string; content: string }[] {
  return [
    { role: "system", content: systemContext },
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: String(h.text ?? "").slice(0, MAX_MESSAGE_LEN),
    })),
    { role: "user", content: message },
  ];
}

// One helper for both OpenAI-compatible endpoints (Groq, OpenRouter). Returns
// the trimmed reply on success, or "" on any failure/empty body so the caller
// can move to the next provider without throwing mid-chain.
async function callOpenAiCompatible(
  label: string,
  url: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.4,
      }),
    });
    if (!r.ok) {
      jlog({ at: `ai-chat.${label}`, ok: false, status: r.status });
      return "";
    }
    const j = await r.json();
    const text = String(j?.choices?.[0]?.message?.content ?? "").trim();
    jlog({ at: `ai-chat.${label}`, ok: !!text, model });
    return text;
  } catch (e) {
    jlog({ at: `ai-chat.${label}`, ok: false, error: String(e) });
    return "";
  }
}

// Resilient generation: Gemini first (its richer systemInstruction path), then
// Groq, then OpenRouter — each only attempted if a key is present. Returns the
// first non-empty reply, or "" if every configured provider fails/empties out.
async function generateReply(
  geminiKey: string,
  systemContext: string,
  history: { role: string; text: string }[],
  message: string,
): Promise<string> {
  if (geminiKey) {
    try {
      const reply = await callGemini(geminiKey, systemContext, history, message);
      if (reply) return reply;
    } catch (e) {
      jlog({ at: "ai-chat.generateReply", provider: "gemini", ok: false, error: String(e) });
    }
  }

  const messages = buildOpenAiMessages(systemContext, history, message);

  const groqKey = firstEnv(["GROQ_API_KEY"]);
  if (groqKey) {
    const reply = await callOpenAiCompatible(
      "callGroq",
      "https://api.groq.com/openai/v1/chat/completions",
      groqKey,
      GROQ_MODEL,
      messages,
    );
    if (reply) return reply;
  }

  const openRouterKey = firstEnv(["OPENROUTER_API_KEY"]);
  if (openRouterKey) {
    const reply = await callOpenAiCompatible(
      "callOpenRouter",
      "https://openrouter.ai/api/v1/chat/completions",
      openRouterKey,
      OPENROUTER_MODEL,
      messages,
      // OpenRouter asks senders to identify the calling app; harmless if dropped.
      { "HTTP-Referer": "https://switchy-ai.com", "X-Title": "Switchy AI" },
    );
    if (reply) return reply;
  }

  return "";
}

function clientIp(req: Request): string {
  // Same trust order as the leads rate-limit gate: CDN-set header first, then
  // the last (infra-appended) X-Forwarded-For hop — never the spoofable first hop.
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
  if (!ip) return false; // fail-open on missing IP — the global 60/hr leads cap is unrelated; best-effort here
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const rows = await fetchRows<{ id: string }>(
    `/rest/v1/chat_messages?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`,
  );
  if (rows === null) return false; // table missing / query failed — fail open, don't block real users on infra hiccups
  return rows.length >= PER_IP_HOURLY_LIMIT;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  // Configured if ANY provider in the fallback chain has a key — Gemini first,
  // then the OpenAI-style backups (Groq, OpenRouter).
  if (!apiKey && !firstEnv(["GROQ_API_KEY"]) && !firstEnv(["OPENROUTER_API_KEY"])) {
    return json({ error: "ai chat is not configured" }, 503);
  }

  let body: { message?: string; history?: { role: string; text: string }[] };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }
  const message = String(body.message ?? "").trim();
  if (!message) return json({ error: "message is required" }, 400);
  if (message.length > MAX_MESSAGE_LEN) return json({ error: "message too long" }, 400);
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];

  const ip = clientIp(req);
  if (await rateLimited(ip)) return json({ error: "rate limit exceeded" }, 429);

  const plans = loadPlans();
  const systemPrompt = SYSTEM_PROMPT_HEADER + buildCatalogueContext(plans);

  try {
    const reply = await generateReply(apiKey, systemPrompt, history, message);
    insertRow("chat_messages", { ip: ip || null }).catch(() => {}); // best-effort, never blocks the reply
    return json({ reply: reply || "מצטער/ת, לא הצלחתי לנסח תשובה כרגע — נסו לשאול אחרת או דברו איתנו בוואטסאפ." });
  } catch (e) {
    jlog({ at: "ai-chat", ok: false, error: String(e) });
    return json({ error: "ai request failed" }, 502);
  }
});
