import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// community-moderate — automatic spam/abuse moderation for community content
// Target of an AFTER INSERT trigger (notify_community_moderate_on_insert, which
// mirrors public.notify_community_on_insert) on public.community_posts /
// community_replies. Classifies the new row's body with an LLM and, only on a
// clear violation, flags the row (is_flagged=true + a Hebrew moderation_note +
// flagged_at). Never hard-deletes; a human still reviews flagged content.
//
// Security: the trigger sends header `x-webhook-secret: <lead_webhook_secret>`
// (from Vault). Without a matching secret the request is rejected — this endpoint
// is otherwise public and must not be spammable.
//
// Classifier: Gemini PRIMARY (gemini-2.5-flash → 2.0-flash → 1.5-flash), Groq
// fallback (llama-3.3-70b-versatile). Hebrew-aware, deliberately CONSERVATIVE —
// Hebrew slang is fine; only clear spam/scam/harassment/hate/sexual/ad violations
// are flagged. Fail-soft AND fail-OPEN: if every classifier errors we do NOT flag.
//
// Deploy: supabase functions deploy community-moderate --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { patchCount } from "../_shared/db.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import { jlog } from "../_shared/log.ts";

type WebhookBody = {
  type?: string; // INSERT | UPDATE | DELETE
  table?: string;
  schema?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

type Verdict = {
  flag: boolean;
  reason: string;
  severity: "low" | "med" | "high";
};

// Gemini ids Google ships on the free tier, tried in order (a 404 just means
// "try the next candidate"; any other status is a real Gemini failure).
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const GROQ_MODEL = "llama-3.3-70b-versatile";

const MAX_BODY_LEN = 2000; // clip the classified text so a huge post can't blow the prompt
const MAX_OUTPUT_TOKENS = 200;

const MODERATED_TABLES = new Set(["community_posts", "community_replies"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clip(v: unknown, n = MAX_BODY_LEN): string {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const SYSTEM_PROMPT = `את/ה מנהל/ת קהילה אוטומטי/ת באפליקציה ישראלית להשוואת מסלולי תקשורת (סלולר/אינטרנט/טלוויזיה).
המשימה: לסווג הודעה מהקהילה ולהחליט אם היא מפרה את כללי הקהילה.
הפרות אפשריות: ספאם, הונאה/נוכלות (scam), הטרדה, שנאה/גזענות, תוכן מיני, פרסומת לא רלוונטית (off-topic ad).
היה/י שמרן/ית מאוד: סלנג עברי, ביקורת על ספקים, תסכול, ניסוח בוטה או דעות חריפות — מותרים ואינם הפרה.
דגל/י (flag=true) רק כשיש הפרה ברורה וחד-משמעית.
החזר/י אך ורק JSON תקין במבנה המדויק:
{"flag": <true|false>, "reason": "<סיבה קצרה בעברית>", "severity": "<low|med|high>"}
ללא טקסט נוסף, ללא markdown, ללא code fences.`;

// Extracts the first {...} JSON object from a model reply (models sometimes wrap
// the JSON in prose or ```json fences despite instructions) and coerces it into
// a strict Verdict. Returns null on anything unparseable.
function parseVerdict(raw: string): Verdict | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch (_) {
    return null;
  }
  const flag = obj.flag === true || obj.flag === "true";
  const sevRaw = String(obj.severity ?? "").toLowerCase();
  const severity: Verdict["severity"] = sevRaw === "high" ? "high" : sevRaw === "med" ? "med" : "low";
  const reason = clip(obj.reason, 200) || "הפרת כללי הקהילה";
  return { flag, reason, severity };
}

async function callGeminiModel(model: string, apiKey: string, userText: string): Promise<Response> {
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0,
          responseMimeType: "application/json",
        },
      }),
    },
  );
}

// Gemini classification. A 404 means "try the next model id"; anything else
// (auth/quota/5xx) stops the Gemini chain so the caller can fall through to Groq.
// Throws on total failure (the caller treats that fail-OPEN: no flag).
async function classifyGemini(apiKey: string, userText: string): Promise<Verdict> {
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    const r = await callGeminiModel(model, apiKey, userText);
    if (r.ok) {
      const j = await r.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
      const v = parseVerdict(String(text));
      if (v) {
        jlog({ at: "community-moderate.gemini", ok: true, model, flag: v.flag, severity: v.severity });
        return v;
      }
      jlog({ at: "community-moderate.gemini", ok: false, model, error: "unparseable" });
      break; // a valid 200 with junk body won't improve on the next model id
    }
    lastStatus = r.status;
    jlog({ at: "community-moderate.gemini", ok: false, model, status: r.status });
    if (r.status !== 404) break;
  }
  throw new Error("gemini classify failed: " + lastStatus);
}

// Groq fallback (OpenAI chat-completions schema). Returns a Verdict on success,
// or null on any failure/empty/unparseable body so the caller stays fail-open.
async function classifyGroq(apiKey: string, userText: string): Promise<Verdict | null> {
  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userText },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });
    if (!r.ok) {
      jlog({ at: "community-moderate.groq", ok: false, status: r.status });
      return null;
    }
    const j = await r.json();
    const text = String(j?.choices?.[0]?.message?.content ?? "");
    const v = parseVerdict(text);
    jlog({ at: "community-moderate.groq", ok: !!v, flag: v?.flag, severity: v?.severity });
    return v;
  } catch (e) {
    jlog({ at: "community-moderate.groq", ok: false, error: String(e) });
    return null;
  }
}

// Build the user-turn text: the author (context for impersonation/spam) + body.
function buildClassifierInput(record: Record<string, unknown>): string {
  const author = clip(record.author ?? "אנונימי", 60);
  const body = clip(record.body, MAX_BODY_LEN);
  return `מחבר/ת: ${author}${NL}תוכן: ${body}`;
}

// Runs the classifier chain (Gemini → Groq). Returns a Verdict on success, or
// null when EVERY configured classifier failed — the caller treats null as
// fail-OPEN (do not flag) so a model outage never auto-hides legitimate content.
async function classify(geminiKey: string, groqKey: string, userText: string): Promise<Verdict | null> {
  if (geminiKey) {
    try {
      return await classifyGemini(geminiKey, userText);
    } catch (e) {
      jlog({ at: "community-moderate.classify", provider: "gemini", ok: false, error: String(e) });
    }
  }
  if (groqKey) {
    const v = await classifyGroq(groqKey, userText);
    if (v) return v;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const cfg = await resolveCfgCached();

  // Fail-closed on the shared secret: an unauthenticated caller must not be able
  // to drive the moderation/flagging machinery or burn classifier quota.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret || !(await safeEqual(provided, cfg.webhookSecret))) {
    jlog({ at: "community-moderate", ok: false, error: "bad secret" });
    return json({ error: "unauthorized" }, 401);
  }

  let body: WebhookBody;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }

  // Only act on INSERTs into the moderated community tables; everything else is a
  // no-op 200 so the trigger never retries on rows we deliberately ignore.
  if (body.type && body.type !== "INSERT") return json({ ok: true, skipped: "not-insert" });
  const table = String(body.table ?? "");
  if (!MODERATED_TABLES.has(table)) return json({ ok: true, skipped: "unhandled-table" });

  const record = body.record ?? {};
  const rowId = String(record.id ?? "");
  const text = clip(record.body, MAX_BODY_LEN);
  if (!rowId || !text) return json({ ok: true, skipped: "empty" });

  const geminiKey = cfg.gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  const groqKey = firstEnv(["GROQ_API_KEY"]);
  if (!geminiKey && !groqKey) {
    // No classifier configured — fail-open (never flag) rather than erroring.
    jlog({ at: "community-moderate", ok: true, skipped: "no-classifier" });
    return json({ ok: true, skipped: "no-classifier" });
  }

  const verdict = await classify(geminiKey, groqKey, buildClassifierInput(record));

  // Fail-OPEN: a null verdict (every classifier errored) must NOT flag content.
  if (!verdict || !verdict.flag) {
    return json({ ok: true, flagged: false });
  }

  // Flag the offending row — service role, scoped to the exact id. Never delete.
  const n = await patchCount(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(rowId)}`,
    { is_flagged: true, moderation_note: verdict.reason, flagged_at: new Date().toISOString() },
  );
  if (n === 0) {
    // Lost race / already gone / RLS — log but don't fail the trigger.
    jlog({ at: "community-moderate", ok: false, table, rowId, error: "patch matched 0 rows" });
    return json({ ok: true, flagged: false, note: "no-match" });
  }
  jlog({ at: "community-moderate", ok: true, table, rowId, severity: verdict.severity });

  // High-severity violations get a short Hebrew team ping so a human can review
  // fast. Best-effort: a Telegram failure must not fail the moderation result.
  if (verdict.severity === "high") {
    const author = esc(clip(record.author ?? "אנונימי", 60));
    const reason = esc(clip(verdict.reason, 120));
    const snippet = esc(clip(text, 200));
    const kind = table === "community_posts" ? "פוסט" : "תגובה";
    const msg = `🚩 <b>תוכן קהילה סומן (חמור)</b> · ${kind}${NL}מאת ${author}${NL}סיבה: ${reason}${NL}${snippet}`;
    const tg = await sendTelegram(cfg, msg);
    if (!tg.ok) jlog({ at: "community-moderate", ok: false, error: "telegram alert failed", detail: tg.error });
  }

  return json({ ok: true, flagged: true, severity: verdict.severity });
});
