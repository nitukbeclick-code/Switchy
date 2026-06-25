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
// Two-layer screening (both honest, both fail-soft):
//   1. heuristicScreen() — a DETERMINISTIC, high-precision Hebrew/English pre-screen
//      for the unambiguous spam/scam patterns an LLM outage would otherwise let
//      through (link+phone harvesting, money/crypto/loan-scam phrasing, "buy
//      followers", grossly repetitive spam). Tuned for precision, not recall: it
//      only fires on combinations that are spam with near-certainty, so it never
//      hides ordinary frustration or provider criticism. A user-report signal
//      (community_reports rows on the same id) lowers its bar slightly.
//   2. the LLM classifier — the nuanced judge. Runs even when the heuristic stays
//      silent. A heuristic hit pre-flags immediately AND is recorded; the LLM can
//      still raise severity.
//
// Every flag (heuristic or LLM) appends ONE row to public.security_audit_log
// (service-role only; RLS-locked) so moderation actions are auditable. We FLAG/
// HOLD (is_flagged + a Hebrew note for a human reviewer) — never hard-delete.
//
// Deploy: supabase functions deploy community-moderate --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { firstEnv, resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { fetchRows, insertRow, patchCount } from "../_shared/db.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";

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
  source?: "heuristic" | "gemini" | "groq"; // which layer produced the verdict (for audit)
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

// ── Deterministic Hebrew/English spam-scam pre-screen ───────────────────────────
// High PRECISION, low recall: each signal below is a thing that, on its own, is
// almost never present in a genuine "I'm frustrated with my provider" post but is
// a hallmark of spam/scam. We require a COMBINATION (or one extreme signal) before
// flagging, so honest slang/criticism/venting is never caught. This is the honest
// safety net for an LLM outage — it is NOT a substitute for the nuanced classifier.
//
// Hebrew-aware: scam phrasing in Hebrew (הלוואה מיידית, רווח מובטח, העבר כסף),
// link+phone harvesting, crypto/forex pitches, follower/like selling, and grossly
// repetitive character spam. Returns a Verdict (source:"heuristic") or null.

// URL-ish: http(s), www., or bare domain.tld (incl. common Israeli TLDs). No `g`
// flag — these are used only with .test() (a global regex makes .test() stateful).
const RE_URL = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|co|io|me|ru|cn|xyz|top|link|click|info|biz|online|site|store|il)\b/i;
// A phone number being solicited (Israeli mobile or generic 9-15 digit run with separators).
const RE_PHONE = /(?:\+?972|0)?5\d[-\s]?\d{3}[-\s]?\d{4}|\b\d[\d\s().-]{7,}\d\b/;
// WhatsApp / Telegram contact handles, a classic spam "DM me" CTA.
const RE_CONTACT_HANDLE = /\b(?:wa\.me|t\.me|telegram\.me|whatsapp)\b|@[A-Za-z0-9_]{4,}/i;

// Money / crypto / "get rich" / loan-shark phrasing in Hebrew + English. Each is a
// scam tell in a telecom community; none appears in ordinary plan-comparison talk.
const SCAM_PHRASES: RegExp[] = [
  /\b(?:bitcoin|btc|ethereum|forex|crypto|invest(?:ment)?|trading|binary option)\b/i,
  /רווח\s*מובטח|הכנסה\s*פסיבית|הרווח[יו]?\s*(?:אלפים|כסף|מהבית)|תרווי?חו?\s*כסף/,
  /הלוואה\s*(?:מיידית|מהירה|ללא)|אשראי\s*מיידי|כסף\s*מהיר|הלוואות\b/,
  /העבר[ות]?\s*(?:כסף|תשלום)|תשלח[יו]?\s*כסף|bit\b|פייבוקס|paybox/i,
  /\b(?:casino|gambling|בטים|הימור(?:ים)?|קזינו)\b/i,
];
// "Buy followers / likes / cheap traffic" — pure spam, never a real telecom post.
const SPAM_OFFERS: RegExp[] = [
  /\b(?:followers?|likes?|subscribers?)\b.*\b(?:cheap|buy|sale|\$|usd)\b/i,
  /(?:עוקבים|לייקים|מנויים)\s*(?:בזול|למכירה|זול)/,
  /\b(?:viagra|cialis|loan|earn \$|make money|work from home)\b/i,
];

// True when `s` repeats one character (e.g. "!!!!!!!!!!") or one short token to a
// degree no human composes — a cheap spam/flood tell.
function isGrosslyRepetitive(s: string): boolean {
  if (/(.)\1{9,}/.test(s)) return true; // 10+ of the same char in a row
  const tokens = s.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length >= 8) {
    const top = new Map<string, number>();
    for (const t of tokens) top.set(t, (top.get(t) ?? 0) + 1);
    const max = Math.max(...top.values());
    if (max / tokens.length >= 0.6) return true; // one token is ≥60% of the post
  }
  return false;
}

// reportBoost = true relaxes the threshold by one signal (real users already
// flagged this row, so a single strong signal is enough to hold it for review).
export function heuristicScreen(body: string, reportBoost = false): Verdict | null {
  const s = String(body ?? "");
  if (!s.trim()) return null;

  const hasUrl = RE_URL.test(s);
  const hasPhone = RE_PHONE.test(s);
  const hasHandle = RE_CONTACT_HANDLE.test(s);
  const scam = SCAM_PHRASES.some((re) => re.test(s));
  const offer = SPAM_OFFERS.some((re) => re.test(s));
  const repetitive = isGrosslyRepetitive(s);
  const contactCTA = hasPhone || hasHandle;

  // Score the unambiguous spam/scam signals. A real frustrated-customer post has
  // ~none of these; spam stacks several. Threshold is intentionally high.
  let score = 0;
  if (offer) score += 2;                 // "buy followers cheap" is spam on its own
  if (scam && (hasUrl || contactCTA)) score += 2; // scam pitch + a way to contact = scam
  else if (scam) score += 1;
  if (hasUrl && contactCTA) score += 2;  // link + phone/handle harvesting = spam combo
  else if (hasUrl) score += 1;
  if (repetitive) score += 1;

  const threshold = reportBoost ? 1 : 2;
  if (score < threshold) return null;

  const reason = offer
    ? "פרסום/ספאם מסחרי (מכירת שירותים לא רלוונטיים)"
    : scam
    ? "חשד להונאה/נוכלות כספית"
    : "ספאם (קישורים/פרטי קשר חוזרים)";
  const severity: Verdict["severity"] = score >= 4 || scam ? "high" : "med";
  return { flag: true, reason, severity, source: "heuristic" };
}

// How many user reports already exist for this row. null/0 ⇒ none (or lookup
// failed — fail-soft: we simply don't apply the report boost). Bounded query.
async function reportCount(targetType: "post" | "reply", targetId: string): Promise<number> {
  const rows = await fetchRows<{ id: string }>(
    `/rest/v1/community_reports?target_type=eq.${targetType}&target_id=eq.${encodeURIComponent(targetId)}&select=id&limit=20`,
  );
  return rows?.length ?? 0;
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

// Pick the verdict to ACT on from the (optional) heuristic hit + (optional) LLM
// verdict. We flag if EITHER fires; severity is the higher of the two so an LLM
// "high" is never downgraded by a heuristic "med". The reason prefers the LLM
// (nuanced, Hebrew) but falls back to the heuristic. `source` records the basis.
function combineVerdicts(heuristic: Verdict | null, llm: Verdict | null): Verdict | null {
  const sev = (v: Verdict | null) => (v?.flag ? (v.severity === "high" ? 3 : v.severity === "med" ? 2 : 1) : 0);
  const hFlag = !!heuristic?.flag;
  const lFlag = !!llm?.flag;
  if (!hFlag && !lFlag) return null;
  const severity = sev(heuristic) >= sev(llm) ? heuristic!.severity : llm!.severity;
  // Prefer the LLM's Hebrew reason when it flagged; else the heuristic's.
  const reason = (lFlag ? llm!.reason : heuristic!.reason) || "הפרת כללי הקהילה";
  const source: Verdict["source"] = hFlag && lFlag ? (llm!.source ?? "groq") : hFlag ? "heuristic" : (llm!.source ?? "groq");
  return { flag: true, reason, severity, source };
}

// Append ONE bounded, PII-light row to public.security_audit_log for a flag. The
// service-role key bypasses RLS on that table (see audit-observability-2026-06.sql);
// best-effort by contract — a logging failure must NEVER fail moderation.
async function auditModeration(
  table: string,
  rowId: string,
  record: Record<string, unknown>,
  verdict: Verdict,
  reports: number,
): Promise<void> {
  try {
    await insertRow("security_audit_log", {
      user_id: typeof record.user_id === "string" ? record.user_id : null,
      event: "community_content_flagged",
      detail: {
        table,
        row_id: rowId,
        severity: verdict.severity,
        source: verdict.source ?? "llm",
        reason: clip(verdict.reason, 200),
        reports,                         // how many user reports preceded the flag
        author: clip(record.author ?? "", 60),
        preview: clip(record.body, 160), // PII-light snippet for the reviewer
      },
    });
  } catch (e) {
    jlog({ at: "community-moderate.audit", ok: false, error: String(e) });
  }
}

async function handle(req: Request): Promise<Response> {
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

  // Layer 1 — deterministic pre-screen. If real users already reported this row,
  // relax the heuristic threshold by one signal (reportBoost). The report lookup
  // is fail-soft (0 on any error), so it never blocks moderation.
  const targetType = table === "community_posts" ? "post" : "reply";
  const reports = await reportCount(targetType, rowId);
  const heuristic = heuristicScreen(text, reports > 0);

  // Layer 2 — the nuanced LLM classifier (Gemini → Groq), when configured. It runs
  // even on a heuristic hit so it can RAISE severity; it never lowers it.
  const geminiKey = cfg.gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  const groqKey = firstEnv(["GROQ_API_KEY"]);
  let llm: Verdict | null = null;
  if (geminiKey || groqKey) {
    llm = await classify(geminiKey, groqKey, buildClassifierInput(record));
  } else if (!heuristic) {
    // No classifier AND no deterministic hit — fail-open (never flag).
    jlog({ at: "community-moderate", ok: true, skipped: "no-classifier" });
    return json({ ok: true, skipped: "no-classifier" });
  }

  // Fail-OPEN: with no heuristic hit, a null/false LLM verdict (or model outage)
  // must NOT flag content. The heuristic only ever raises a high-precision flag.
  const verdict = combineVerdicts(heuristic, llm);
  if (!verdict || !verdict.flag) {
    return json({ ok: true, flagged: false });
  }

  // Flag the offending row — service role, scoped to the exact id. Never delete;
  // a human still reviews everything held here (is_flagged + a Hebrew note).
  const n = await patchCount(
    `/rest/v1/${table}?id=eq.${encodeURIComponent(rowId)}`,
    { is_flagged: true, moderation_note: verdict.reason, flagged_at: new Date().toISOString() },
  );
  if (n === 0) {
    // Lost race / already gone / RLS — log but don't fail the trigger.
    jlog({ at: "community-moderate", ok: false, table, rowId, error: "patch matched 0 rows" });
    return json({ ok: true, flagged: false, note: "no-match" });
  }
  jlog({ at: "community-moderate", ok: true, table, rowId, severity: verdict.severity, source: verdict.source, reports });

  // Audit trail: one PII-light row per flag (service-role only, RLS-locked).
  await auditModeration(table, rowId, record, verdict, reports);

  // High-severity violations get a short Hebrew team ping so a human can review
  // fast. Best-effort: a Telegram failure must not fail the moderation result.
  if (verdict.severity === "high") {
    const author = esc(clip(record.author ?? "אנונימי", 60));
    const reason = esc(clip(verdict.reason, 120));
    const snippet = esc(clip(text, 200));
    const kind = table === "community_posts" ? "פוסט" : "תגובה";
    const reportLine = reports > 0 ? `${NL}דיווחי משתמשים: ${reports}` : "";
    const msg = `🚩 <b>תוכן קהילה סומן (חמור)</b> · ${kind}${NL}מאת ${author}${NL}סיבה: ${reason}${reportLine}${NL}${snippet}`;
    const tg = await sendTelegram(cfg, msg);
    if (!tg.ok) jlog({ at: "community-moderate", ok: false, error: "telegram alert failed", detail: tg.error });
  }

  return json({ ok: true, flagged: true, severity: verdict.severity });
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is configured).
// An UNEXPECTED throw outside handle's own fail-soft paths (e.g. config resolve)
// is surfaced to captureError and degraded to the function's existing 500-shaped
// error response — never a new status/body. captureError is NOT awaited and never
// throws/blocks.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "community-moderate", method: req.method });
    jlog({ at: "community-moderate", ok: false, error: String(e) });
    return json({ error: "internal error" }, 500);
  }
});
