// Shared AI calls for the agent: Gemini chat + Gemini Vision + an OpenAI-style
// fallback chain (Groq → OpenRouter). Mirrors the site-* functions' working
// brain so the WhatsApp bot answers with the same grounded intelligence.

import { jlog } from "./log.ts";

// Gemini model ids Google ships on the free tier, tried in order. A 404 means
// "try the next candidate"; any other status (auth/quota/5xx) is a real failure.
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const GROQ_MODEL = "llama-3.3-70b-versatile";
// Cerebras Cloud — OpenAI-compatible, wafer-scale inference (very fast). A 3rd
// free fallback so the agent never goes dark when Gemini AND Groq are both busy.
const CEREBRAS_MODEL = "llama-3.3-70b";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

// ── Model ROUTING (the "tier" opt) ───────────────────────────────────────────
// Two answer profiles, both BEHAVIOR-ADDITIVE: same grounded brain, same full
// degradation chain (Gemini → Groq → OpenRouter), same Vision/clean/timeouts.
//   "smart" (DEFAULT = today): leads with gemini-2.5-flash → better copy/flow.
//   "fast":                    leads with gemini-2.0-flash (cheaper/lower-latency),
//                              i.e. same answer, sooner — never fabricated.
// The ROUTE is just a re-ORDERING of the existing model candidates: the model the
// tier prefers is tried first, then the rest of GEMINI_MODELS as the usual
// 404-fallthrough. Every model stays reachable, so a tier never narrows the chain.
export type ModelTier = "fast" | "smart";
export type AiTierOpts = { tier?: ModelTier };
export const DEFAULT_TIER: ModelTier = "smart";

// The Gemini model each tier leads with. "smart" keeps today's GEMINI_MODELS[0].
export const TIER_GEMINI_MODEL: Record<ModelTier, string> = {
  smart: "gemini-2.5-flash",
  fast: "gemini-2.0-flash",
};

// Resolve the tier from the optional opts (safe default = "smart" = today).
export function resolveTier(opts?: AiTierOpts): ModelTier {
  return opts?.tier === "fast" ? "fast" : DEFAULT_TIER;
}

// The Gemini candidate list for a tier: the tier's preferred model first, then the
// remaining GEMINI_MODELS in their canonical order (de-duped). "smart" returns the
// canonical list unchanged; "fast" floats gemini-2.0-flash to the front. The full
// set is always present — routing only reorders, never drops a fallback.
export function modelsForTier(tier: ModelTier): string[] {
  const lead = TIER_GEMINI_MODEL[tier];
  const rest = GEMINI_MODELS.filter((m) => m !== lead);
  return GEMINI_MODELS.includes(lead) ? [lead, ...rest] : [...GEMINI_MODELS];
}

const MAX_HISTORY_TURNS = 6;
const MAX_MESSAGE_LEN = 800;

// Per-call wall-clock budgets. A paid LLM that hangs would otherwise pin the
// edge function until the platform kills it (and, for the fallback chain, stack
// 3 hangs in series). We race every fetch against an AbortController so a stuck
// provider fails fast and we move on (or surface a 504) instead of cascading.
export const TEXT_TIMEOUT_MS = 15_000;
export const VISION_TIMEOUT_MS = 30_000;

// A 504-style sentinel a caller can map to an HTTP 504. Thrown by fetchWithTimeout
// when the AbortController fires.
export class AiTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "AiTimeoutError";
  }
}

// fetch() with a hard timeout via AbortController. On timeout the underlying
// request is aborted (freeing the socket) and we throw AiTimeoutError; any other
// network error propagates unchanged.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  label: string,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) {
      jlog({ at: `ai.timeout`, label, ms });
      throw new AiTimeoutError(label, ms);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type ChatTurn = { role: string; text: string };
export type AiKeys = { gemini?: string; groq?: string; cerebras?: string; openrouter?: string; openai?: string };

// WhatsApp persona — short, warm, grounded. The catalogue context is appended
// to this header by the caller (buildCatalogueContext).
export const SYSTEM_PROMPT_HEADER =
  `את/ה הסוכן/ת החכם/ה של "Switchy AI" בוואטסאפ — שירות ישראלי להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/חבילה משולבת/חו"ל וחיסכון בחשבונות התקשורת.
כללים מחייבים:
- ענה/י בעברית בלבד, קצר וזורם לוואטסאפ (1-4 משפטים), בטון חם, אנושי ומקצועי. מותר אימוג'י אחד-שניים.
- התבסס/י אך ורק על נתוני המסלולים שמופיעים למטה. אסור להמציא ספק, מסלול, מחיר או תכונה שלא מופיעים ברשימה.
- כשממליצים: ציין/י עד 3 מסלולים ספציפיים מהרשימה עם משפט סיבה קצר לכל אחד, וכשרלוונטי ציין/י "אחרי המבצע" ושאל/י שאלה אחת קצרה כדי לדייק (תקציב/נפח/ספק נוכחי).
- אפשר להזכיר חיסכון כטווח כללי בלבד ("אפשר לחסוך מאות שקלים בשנה"), בלי להבטיח סכום מדויק לאדם ספציפי.
- אם המשתמש/ת רוצה לדבר עם נציג אנושי, מבקש/ת הצעה מותאמת אישית, או צריך/ה ניתוח חשבון — הצע/י בעדינות לחבר נציג אנושי (הוא יחזור כאן בוואטסאפ). אפשר גם להזמין לשלוח צילום של החשבון לניתוח.
- אל תיתן/י מידע רגיש או לא קשור לתחום התקשורת.
- חשוב מאוד: החזר/י אך ורק את התשובה הסופית ללקוח, בעברית בלבד. אסור לכתוב קידומות כמו "THOUGHT"/"REASONING"/"תשובה:", אסור לתעד את תהליך החשיבה, ואסור טקסט באנגלית.

נתוני מסלולים אמיתיים (קטגוריה | ספק | מסלול | מחיר | תכונות):
`;

// Bill-photo extraction prompt (replace __PROVIDERS__ with the catalogue list).
export const VISION_PROMPT =
  `אתה מנתח חשבונות תקשורת ישראליים מתוך תמונה (סלולר / אינטרנט / טלוויזיה / חבילה משולבת / חו"ל).
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
  systemContext: string,
  history: ChatTurn[],
  message: string,
  maxTokens: number,
): Promise<Response> {
  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.text ?? "").slice(0, MAX_MESSAGE_LEN) }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  return await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemContext }] },
        contents,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.4,
          // Disable gemini-2.5 "thinking" so the model never returns its planning
          // as the reply (the THOUGHT / numbered-plan leak). No-op on 2.0/1.5.
          ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    },
    TEXT_TIMEOUT_MS,
    `gemini:${model}`,
  );
}

export async function callGemini(
  apiKey: string,
  systemContext: string,
  history: ChatTurn[],
  message: string,
  maxTokens = 400,
  models: string[] = GEMINI_MODELS,
): Promise<string> {
  let lastStatus = 0;
  for (const model of models) {
    const r = await callGeminiModel(model, apiKey, systemContext, history, message, maxTokens);
    if (r.ok) {
      const j = await r.json();
      const parts: Array<{ text?: string; thought?: boolean }> = j?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      jlog({ at: "ai.callGemini", ok: true, model });
      return String(text).trim();
    }
    lastStatus = r.status;
    jlog({ at: "ai.callGemini", ok: false, model, status: r.status });
    if (r.status !== 404) break;
  }
  throw new Error("gemini request failed: " + lastStatus);
}

function buildOpenAiMessages(systemContext: string, history: ChatTurn[], message: string): { role: string; content: string }[] {
  return [
    { role: "system", content: systemContext },
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: String(h.text ?? "").slice(0, MAX_MESSAGE_LEN),
    })),
    { role: "user", content: message },
  ];
}

async function callOpenAiCompatible(
  endpoint: string,
  model: string,
  apiKey: string,
  systemContext: string,
  history: ChatTurn[],
  message: string,
  maxTokens: number,
  label: string,
): Promise<string> {
  const r = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: buildOpenAiMessages(systemContext, history, message),
    }),
  }, TEXT_TIMEOUT_MS, label);
  if (!r.ok) {
    jlog({ at: `ai.${label}`, ok: false, status: r.status });
    throw new Error(`${label} request failed: ${r.status}`);
  }
  const j = await r.json();
  jlog({ at: `ai.${label}`, ok: true });
  return String(j?.choices?.[0]?.message?.content ?? "").trim();
}

// Strip a leaked reasoning preamble: some models emit "THOUGHT: …" / an English
// chain-of-thought before the actual answer. Keep only the customer-facing reply.
const REASON_MARKER = /^(THOUGHT|REASONING|THINKING|PLAN|ANALYSIS|NOTE|STEP|מחשבה|חשיבה|ניתוח)\b\s*:?/i;

// A "planning preamble" paragraph: mostly numbered/bulleted lines that read as
// English meta-steps (often "**Step:**") — gemini-2.5 emits this before the real
// answer even with thinking disabled. We detect and drop such paragraphs.
function isPlanBlock(p: string): boolean {
  const lines = p.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!lines.length) return false;
  const planish = lines.filter((l) =>
    /^(\d+[.)]|[-*•])\s+/.test(l) && (/\*\*[^*]+\*\*/.test(l) || /[A-Za-z]{4,}/.test(l))
  ).length;
  return planish >= Math.max(2, Math.ceil(lines.length * 0.6));
}

// Keep only the customer-facing reply: strip a leaked reasoning/planning preamble
// (THOUGHT: … or an English numbered "plan" block) and return the real answer.
export function cleanReply(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return s;
  // If the model used an explicit final-answer marker, take what follows it.
  const ans = s.match(/(?:^|\n)\s*(?:ANSWER|FINAL(?:\s+ANSWER)?|RESPONSE|תשובה|מענה)\s*:\s*([\s\S]+)$/i);
  if (ans && ans[1].trim()) s = ans[1].trim();
  const paras = s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paras.length > 1) {
    const kept = paras.filter((p) => !REASON_MARKER.test(p) && !isPlanBlock(p));
    // If everything looked like planning, fall back to the last paragraph (the
    // answer almost always comes last).
    return (kept.length ? kept : [paras[paras.length - 1]]).join("\n\n").trim();
  }
  // Single block: drop a leading reasoning-marker line if present.
  if (REASON_MARKER.test(s)) {
    const lines = s.split("\n");
    const firstHe = lines.findIndex((l) => /[֐-׿]/.test(l) && !REASON_MARKER.test(l.trim()));
    if (firstHe > 0) return lines.slice(firstHe).join("\n").trim();
  }
  return s;
}

// A best-effort sink the caller can pass to learn *why* generateReply gave up:
// `timedOut` is set when at least one provider in the chain aborted on the
// AbortController timeout, so a site endpoint can answer 504 instead of a generic
// failure. Purely informational — generateReply still returns "" on total failure.
export type ReplyMeta = { timedOut: boolean };

// Orchestrated chat reply: Gemini → Groq → OpenRouter. Returns "" only if every
// configured provider fails (caller supplies a friendly fallback). Each reply is
// passed through cleanReply() to drop any leaked reasoning preamble. Each provider
// fetch is bounded by an AbortController timeout (TEXT_TIMEOUT_MS): a hung provider
// fails fast and we try the next one instead of pinning the function.
export async function generateReply(
  keys: AiKeys,
  systemContext: string,
  history: ChatTurn[],
  message: string,
  maxTokens = 400,
  meta?: ReplyMeta,
  opts?: AiTierOpts,
): Promise<string> {
  // Route the Gemini model order by tier (default "smart" = today's order). The
  // full degradation chain (Gemini → Groq → OpenRouter) below is UNCHANGED — only
  // which Gemini model is tried first differs.
  const models = modelsForTier(resolveTier(opts));
  if (keys.gemini) {
    try {
      const t = cleanReply(await callGemini(keys.gemini, systemContext, history, message, maxTokens, models));
      if (t) return t;
    } catch (e) {
      if (e instanceof AiTimeoutError && meta) meta.timedOut = true;
      jlog({ at: "ai.generateReply", provider: "gemini", ok: false, error: String(e) });
    }
  }
  if (keys.groq) {
    try {
      const t = cleanReply(await callOpenAiCompatible(
        "https://api.groq.com/openai/v1/chat/completions",
        GROQ_MODEL, keys.groq, systemContext, history, message, maxTokens, "groq",
      ));
      if (t) return t;
    } catch (e) {
      if (e instanceof AiTimeoutError && meta) meta.timedOut = true;
    }
  }
  if (keys.cerebras) {
    try {
      const t = cleanReply(await callOpenAiCompatible(
        "https://api.cerebras.ai/v1/chat/completions",
        CEREBRAS_MODEL, keys.cerebras, systemContext, history, message, maxTokens, "cerebras",
      ));
      if (t) return t;
    } catch (e) {
      if (e instanceof AiTimeoutError && meta) meta.timedOut = true;
    }
  }
  if (keys.openrouter) {
    try {
      const t = cleanReply(await callOpenAiCompatible(
        "https://openrouter.ai/api/v1/chat/completions",
        OPENROUTER_MODEL, keys.openrouter, systemContext, history, message, maxTokens, "openrouter",
      ));
      if (t) return t;
    } catch (e) {
      if (e instanceof AiTimeoutError && meta) meta.timedOut = true;
    }
  }
  return "";
}

// Gemini Vision (bill photo) — single call, model fallthrough on 404.
export async function callGeminiVision(
  apiKey: string,
  promptText: string,
  img: { mimeType: string; data: string },
): Promise<string> {
  let lastStatus = 0;
  // Vision model order: LEAD with the fast, widely-available gemini-2.0-flash — bill
  // OCR doesn't need 2.5's reasoning, and gemini-2.5 is the most overloaded model (it
  // 503s under load), then fall through to 2.5 / 1.5. Unlike the text path, Vision has
  // NO cross-provider (Groq/OpenRouter) fallback — so the loop below ALSO retries the
  // next model on a transient 429/5xx, a network timeout, OR a 200-but-empty reply
  // (not just a 404). That fragility was why bill photos returned "couldn't analyze".
  const VISION_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
  for (const model of VISION_MODELS) {
    let r: Response;
    try {
      r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: promptText },
                { inlineData: { mimeType: img.mimeType, data: img.data } },
              ],
            }],
            generationConfig: {
              maxOutputTokens: 512,
              temperature: 0.1,
              responseMimeType: "application/json",
              ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        },
        VISION_TIMEOUT_MS,
        `gemini-vision:${model}`,
      );
    } catch (e) {
      // Network error / AbortController timeout on THIS model → try the next one.
      lastStatus = 504;
      jlog({ at: "ai.callGeminiVision", ok: false, model, error: String(e) });
      continue;
    }
    if (r.ok) {
      const j = await r.json();
      const parts: Array<{ text?: string; thought?: boolean }> = j?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
      if (text) {
        jlog({ at: "ai.callGeminiVision", ok: true, model });
        return text;
      }
      // 200 but empty (safety block / token budget consumed) → try the next model.
      jlog({ at: "ai.callGeminiVision", ok: false, model, empty: true });
      continue;
    }
    lastStatus = r.status;
    jlog({ at: "ai.callGeminiVision", ok: false, model, status: r.status });
    // Retry the next model on transient / overload / model-gone; stop only on a hard
    // client/auth error (400/401/403) where a different model won't help.
    if (r.status === 404 || r.status === 429 || r.status >= 500) continue;
    break;
  }
  throw new Error("gemini vision request failed: " + lastStatus);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini FUNCTION CALLING (the tool-using agent path) — added alongside the text
// path above WITHOUT touching it. callGemini/generateReply/callGeminiVision keep
// working exactly as before; this is a separate, opt-in surface that _shared/
// agent.ts drives. Same model-fallthrough-on-404, same AbortController timeout,
// same thinkingConfig disable for gemini-2.5.
//
// Gemini's wire shape (generateContent REST):
//   request.tools = [{ functionDeclarations: [ {name, description, parameters} ] }]
//   a tool call comes back as a part:  { functionCall: { name, args } }
//   we reply with a part:              { functionResponse: { name, response } }
// We expose those as plain TS types so the agent loop never hand-builds the JSON.
// ─────────────────────────────────────────────────────────────────────────────

// A JSON-schema-ish parameter spec for one tool (Gemini's OpenAPI subset). We
// keep it permissive (Record) so tools.ts can author the schema directly.
export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // { type:"object", properties:{...}, required:[...] }
};

// A model-requested tool call parsed out of the response.
export type GeminiFunctionCall = { name: string; args: Record<string, unknown> };

// One step of the tool loop's result: EITHER the model asked to call tools
// (`calls` non-empty) OR it produced a final text answer (`text`). Never both
// meaningfully populated — the agent acts on whichever is present.
export type GeminiToolStep = { calls: GeminiFunctionCall[]; text: string };

// A turn in the function-calling contents array. `user`/`model` carry text;
// `functionResponse` carries a tool result the model consumes on the next step.
export type ToolContent =
  | { role: "user" | "model"; parts: Array<{ text: string }> }
  | { role: "model"; parts: Array<{ functionCall: GeminiFunctionCall }> }
  | { role: "function"; parts: Array<{ functionResponse: { name: string; response: Record<string, unknown> } }> };

function buildToolContents(history: ChatTurn[], message: string): ToolContent[] {
  const out: ToolContent[] = history.slice(-MAX_HISTORY_TURNS).map((h) => ({
    role: (h.role === "user" ? "user" : "model") as "user" | "model",
    parts: [{ text: String(h.text ?? "").slice(0, MAX_MESSAGE_LEN) }],
  }));
  out.push({ role: "user", parts: [{ text: message }] });
  return out;
}

// One raw generateContent call with tools. `contents` is the running transcript
// (text turns + prior functionCall/functionResponse turns). Returns the parsed
// step. Model fallthrough on 404 like the text path; any other status throws.
async function callGeminiToolsModel(
  model: string,
  apiKey: string,
  systemContext: string,
  contents: ToolContent[],
  tools: GeminiFunctionDeclaration[],
  maxTokens: number,
): Promise<Response> {
  return await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemContext }] },
        contents,
        tools: tools.length ? [{ functionDeclarations: tools }] : undefined,
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: 0.3,
          ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    },
    TEXT_TIMEOUT_MS,
    `gemini-tools:${model}`,
  );
}

function parseToolStep(j: unknown): GeminiToolStep {
  const parts: Array<{ text?: string; thought?: boolean; functionCall?: { name?: string; args?: unknown } }> =
    (j as { candidates?: Array<{ content?: { parts?: unknown } }> })?.candidates?.[0]?.content?.parts as
      Array<{ text?: string; thought?: boolean; functionCall?: { name?: string; args?: unknown } }> ?? [];
  const calls: GeminiFunctionCall[] = [];
  let text = "";
  for (const p of parts) {
    if (p?.functionCall?.name) {
      const args = (p.functionCall.args && typeof p.functionCall.args === "object")
        ? p.functionCall.args as Record<string, unknown>
        : {};
      calls.push({ name: String(p.functionCall.name), args });
    } else if (!p.thought && typeof p.text === "string") {
      text += p.text;
    }
  }
  return { calls, text: text.trim() };
}

// Low-level single step: send the running `contents` (+ tool declarations) and
// return what the model wants next (tool calls or final text). The agent loop in
// agent.ts owns appending the model's functionCall turn and the functionResponse
// turn between steps. Throws on a hard failure (so the caller can fall back to
// the no-tools text chain).
export async function generateWithToolsStep(
  apiKey: string,
  systemContext: string,
  contents: ToolContent[],
  tools: GeminiFunctionDeclaration[],
  maxTokens = 500,
  opts?: AiTierOpts,
): Promise<GeminiToolStep> {
  // Tier routing: lead with the tier's preferred Gemini model, then fall through
  // the rest on 404 exactly as before (default "smart" = today's order).
  const models = modelsForTier(resolveTier(opts));
  let lastStatus = 0;
  for (const model of models) {
    const r = await callGeminiToolsModel(model, apiKey, systemContext, contents, tools, maxTokens);
    if (r.ok) {
      const j = await r.json();
      jlog({ at: "ai.generateWithToolsStep", ok: true, model });
      return parseToolStep(j);
    }
    lastStatus = r.status;
    jlog({ at: "ai.generateWithToolsStep", ok: false, model, status: r.status });
    if (r.status !== 404) break;
  }
  throw new Error("gemini tools request failed: " + lastStatus);
}

// Append a model functionCall turn to the running transcript (so the model sees
// its own call when it consumes the result on the next step).
export function appendFunctionCall(contents: ToolContent[], call: GeminiFunctionCall): void {
  contents.push({ role: "model", parts: [{ functionCall: call }] });
}

// Append a tool result the model will consume on the next step.
export function appendFunctionResponse(
  contents: ToolContent[],
  name: string,
  response: Record<string, unknown>,
): void {
  contents.push({ role: "function", parts: [{ functionResponse: { name, response } }] });
}

// Seed a fresh tool-loop transcript from prior chat history + the new message.
export function newToolContents(history: ChatTurn[], message: string): ToolContent[] {
  return buildToolContents(history, message);
}

// Defensive JSON extraction: strip ```json fences and pull the first {...} block.
export function extractJson(raw: string): Record<string, unknown> | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  if (!s.startsWith("{")) {
    const i = s.indexOf("{");
    const k = s.lastIndexOf("}");
    if (i >= 0 && k > i) s = s.slice(i, k + 1);
  }
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch (_) {
    return null;
  }
}
