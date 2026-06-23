// Shared AI calls for the agent: Gemini chat + Gemini Vision + an OpenAI-style
// fallback chain (Groq → OpenRouter). Mirrors the site-* functions' working
// brain so the WhatsApp bot answers with the same grounded intelligence.

import { jlog } from "./log.ts";

// Gemini model ids Google ships on the free tier, tried in order. A 404 means
// "try the next candidate"; any other status (auth/quota/5xx) is a real failure.
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

const MAX_HISTORY_TURNS = 6;
const MAX_MESSAGE_LEN = 800;

export type ChatTurn = { role: string; text: string };
export type AiKeys = { gemini?: string; groq?: string; openrouter?: string; openai?: string };

// WhatsApp persona — short, warm, grounded. The catalogue context is appended
// to this header by the caller (buildCatalogueContext).
export const SYSTEM_PROMPT_HEADER =
  `את/ה הסוכן/ת החכם/ה של "חוסך" (Switchy) בוואטסאפ — שירות ישראלי להשוואת מסלולי סלולר/אינטרנט/טלוויזיה/חבילה משולבת/חו"ל וחיסכון בחשבונות התקשורת.
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
  return await fetch(
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
  );
}

export async function callGemini(
  apiKey: string,
  systemContext: string,
  history: ChatTurn[],
  message: string,
  maxTokens = 400,
): Promise<string> {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
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
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: buildOpenAiMessages(systemContext, history, message),
    }),
  });
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

// Orchestrated chat reply: Gemini → Groq → OpenRouter. Returns "" only if every
// configured provider fails (caller supplies a friendly fallback). Each reply is
// passed through cleanReply() to drop any leaked reasoning preamble.
export async function generateReply(
  keys: AiKeys,
  systemContext: string,
  history: ChatTurn[],
  message: string,
  maxTokens = 400,
): Promise<string> {
  if (keys.gemini) {
    try {
      const t = cleanReply(await callGemini(keys.gemini, systemContext, history, message, maxTokens));
      if (t) return t;
    } catch (e) {
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
    } catch (_) { /* fall through */ }
  }
  if (keys.openrouter) {
    try {
      const t = cleanReply(await callOpenAiCompatible(
        "https://openrouter.ai/api/v1/chat/completions",
        OPENROUTER_MODEL, keys.openrouter, systemContext, history, message, maxTokens, "openrouter",
      ));
      if (t) return t;
    } catch (_) { /* fall through */ }
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
  for (const model of GEMINI_MODELS) {
    const r = await fetch(
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
            maxOutputTokens: 300,
            temperature: 0.1,
            responseMimeType: "application/json",
            ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        }),
      },
    );
    if (r.ok) {
      const j = await r.json();
      const parts: Array<{ text?: string; thought?: boolean }> = j?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      jlog({ at: "ai.callGeminiVision", ok: true, model });
      return String(text).trim();
    }
    lastStatus = r.status;
    jlog({ at: "ai.callGeminiVision", ok: false, model, status: r.status });
    if (r.status !== 404) break;
  }
  throw new Error("gemini vision request failed: " + lastStatus);
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
