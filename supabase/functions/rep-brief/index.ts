// rep-brief — Phone-Rep AI Call-Brief endpoint (admin / service-role).
//
// One POST endpoint that turns a single lead into a concise Hebrew CALL-BRIEF the
// human phone rep reads before dialling. It answers FOUR things, all grounded in
// REAL data (never fabricated):
//   1) the customer's stated need (category / budget / current provider), parsed
//      from the lead's fields + free-text notes,
//   2) the 2-3 best-matching REAL plans from the bundled catalogue snapshot
//      (shared pickCandidates/buildSuggestions — cite plan names + prices),
//   3) suggested talking points + likely objections with honest answers,
//   4) COMPLIANCE reminders the rep MUST say: §7b commission disclosure (we earn
//      a referral fee; it does NOT change the customer's price) + §30A (Spam Law)
//      consent-before-marketing.
//
// AUTH (fail-closed, mirrors the other admin/webhook endpoints): EITHER a verified
// admin (Authorization: Bearer <supabase user access token> → requireAdmin), OR a
// trusted server-to-server caller with the shared `x-webhook-secret` header
// (lead_webhook_secret, constant-time compared). Anything else → 401/403. All DB
// access is service-role via _shared/db.ts.
//
// INPUT (POST JSON):
//   { lead_id: "<uuid>" }          → service-role reads the lead row, OR
//   { lead: { ...lead fields } }   → caller passes a lead object directly
//     (used by the WhatsApp/Telegram pipeline that already has the row in hand).
//
// The plan FACTS always come from buildBrief (the pure, catalogue-grounded
// builder). An optional AI narrative (generateReply, when keys are configured)
// only REPHRASES that deterministic brief — it can never add a plan/price/saving
// that isn't already grounded. So the brief stays honest (E-E-A-T) with or
// without AI.
//
// Errors are always JSON {error}: 401 (no/invalid creds), 403 (not admin),
// 400 (bad shape / lead not resolvable), 404 (lead_id not found), 500/502 on
// unexpected/DB failures.
//
// Deploy: supabase functions deploy rep-brief   (requireAdmin / safeEqual do the
// real auth, so --no-verify-jwt is fine — the webhook-secret path has no JWT).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { fetchRows } from "../_shared/db.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { firstEnv, resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { type AiKeys, generateReply } from "../_shared/ai.ts";
import { catalogueProviders, type Plan, plansFromSnapshot } from "../_shared/catalogue.ts";
import { jlog } from "../_shared/log.ts";
import {
  AI_SYSTEM_PROMPT,
  aiUserMessage,
  type BriefLead,
  buildBrief,
  type RepBrief,
} from "./rep_brief.ts";

// Catalogue snapshot — bundled at deploy time (mirrors site-ai-chat /
// site-bill-analyzer / site-plan-advisor). Refresh from site/data/plans.json and
// redeploy when prices change. Grounding ONLY ever comes from these REAL rows.
import plansSnapshot from "./plans-snapshot.json" with { type: "json" };

type Row = Record<string, unknown>;

const q = encodeURIComponent;

function loadPlans(): Plan[] {
  return plansFromSnapshot(plansSnapshot);
}

// ── CORS + JSON (mirrors crm-api: this is an admin/server endpoint, not a public
//    browser surface, so a permissive CORS header is fine — auth is the real
//    gate). ─────────────────────────────────────────────────────────────────
function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// Resolve the lead this brief is for. Two paths:
//  • body.lead — a lead object passed directly (trusted caller already has it);
//    we coerce the rep-relevant fields and use it as-is.
//  • body.lead_id — service-role reads exactly the rep-relevant columns from
//    public.leads (never `select=*` — keep PII surface minimal).
// Returns { lead } on success, or { status, error } describing the failure.
async function resolveLead(
  body: Row,
): Promise<{ lead: BriefLead } | { status: number; error: string }> {
  // Direct lead object.
  if (body.lead && typeof body.lead === "object") {
    const l = body.lead as Row;
    const lead = coerceLead(l);
    if (!lead.name && !lead.notes && !lead.provider) {
      return { status: 400, error: "אובייקט הליד ריק מדי לבניית תדריך" };
    }
    return { lead };
  }

  const leadId = String(body.lead_id ?? body.leadId ?? "").trim();
  if (!leadId) return { status: 400, error: "חסר lead_id או lead" };
  // Guard the id shape before it reaches the query string (uuid only).
  if (!/^[0-9a-fA-F-]{36}$/.test(leadId)) return { status: 400, error: "lead_id לא תקין" };

  const rows = await fetchRows<Row>(
    `/rest/v1/leads?id=eq.${q(leadId)}&limit=1&select=id,name,phone,provider,plan_id,source,callback_time,notes,status,consent_marketing_sms,consent_marketing_email,consent_marketing_whatsapp`,
  );
  if (rows === null) return { status: 502, error: "שגיאה בטעינת הליד" };
  if (!rows.length) return { status: 404, error: "הליד לא נמצא" };
  return { lead: coerceLead(rows[0]) };
}

// Coerce an untrusted lead-ish object into the BriefLead shape (strings clipped,
// consent booleans only when explicitly true). Never trusts arbitrary fields.
function coerceLead(l: Row): BriefLead {
  const str = (v: unknown, max: number): string | null => {
    const t = String(v ?? "").trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    id: str(l.id, 64),
    name: str(l.name, 120),
    phone: str(l.phone, 32),
    provider: str(l.provider, 200),
    plan_id: str(l.plan_id, 200),
    source: str(l.source, 40),
    callback_time: str(l.callback_time, 40),
    notes: str(l.notes, 2000),
    status: str(l.status, 40),
    consent_marketing_sms: l.consent_marketing_sms === true,
    consent_marketing_email: l.consent_marketing_email === true,
    consent_marketing_whatsapp: l.consent_marketing_whatsapp === true,
  };
}

// AI keys, same resolution as the site-* / whatsapp surfaces: Gemini from Vault
// (resolveCfgCached) or env, Groq + OpenRouter from env. All optional — when none
// are present the deterministic brief is returned as-is (still fully usable).
async function aiKeys(): Promise<AiKeys> {
  const gemini = (await resolveCfgCached()).gemini || firstEnv(["GEMINI_API_KEY", "GOOGLE_AI_KEY"]);
  return {
    gemini,
    groq: firstEnv(["GROQ_API_KEY"]),
    openrouter: firstEnv(["OPENROUTER_API_KEY"]),
  };
}

// Verify the trusted server-to-server caller via the shared webhook secret
// (constant-time). Mirrors community-notify / notify-lead.
async function webhookAuthed(req: Request): Promise<boolean> {
  const cfg = await resolveCfgCached();
  const provided = req.headers.get("x-webhook-secret") ?? "";
  return !!cfg.webhookSecret && (await safeEqual(provided, cfg.webhookSecret));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // AUTH (fail-closed): a trusted webhook-secret caller, OR a verified admin.
  // We check the cheap secret first; if absent/wrong, fall back to the admin
  // gate. Distinguish 401 (no creds at all) from 403 (creds present, not admin).
  const byWebhook = await webhookAuthed(req);
  let actorUid = "";
  if (!byWebhook) {
    const admin = await requireAdmin(req);
    if (!admin) {
      const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
      const hasBearer = auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim().length > 0;
      const hasSecret = (req.headers.get("x-webhook-secret") ?? "").length > 0;
      return (hasBearer || hasSecret)
        ? json({ error: "אין הרשאה" }, 403)
        : json({ error: "נדרשת התחברות" }, 401);
    }
    actorUid = admin.uid;
  }

  let body: Row;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "בקשה לא תקינה" }, 400);
  }

  try {
    const resolved = await resolveLead(body);
    if ("error" in resolved) return json({ error: resolved.error }, resolved.status);

    const plans = loadPlans();
    const providers = catalogueProviders(plans);
    const brief: RepBrief = buildBrief(resolved.lead, plans, providers);

    // Optional AI narrative — ONLY rephrases the deterministic brief (grounded
    // hard by AI_SYSTEM_PROMPT). Fail-soft: any failure/empty keeps the
    // deterministic `text` so the rep always has a usable brief.
    let narrative = "";
    const wantAi = body.ai !== false; // default on; caller can opt out with {ai:false}
    if (wantAi) {
      const keys = await aiKeys();
      if (keys.gemini || keys.groq || keys.openrouter) {
        try {
          narrative = await generateReply(keys, AI_SYSTEM_PROMPT, [], aiUserMessage(brief), 700);
        } catch (e) {
          jlog({ at: "rep-brief.ai", ok: false, error: String(e) });
        }
      }
    }

    jlog({
      at: "rep-brief",
      ok: true,
      via: byWebhook ? "webhook" : "admin",
      actor: actorUid || null,
      leadId: brief.lead.id || null,
      category: brief.need.category || null,
      plans: brief.plans.length,
      ai: Boolean(narrative),
    });

    // `text` is the deterministic, copy-paste brief (always present). `narrative`
    // is the optional AI rephrase (empty when AI is off/unavailable). The
    // structured fields (need/plans/talkingPoints/objections/compliance) let a
    // CRM render the brief however it likes.
    return json({
      ok: true,
      lead: brief.lead,
      need: brief.need,
      plans: brief.plans,
      talkingPoints: brief.talkingPoints,
      objections: brief.objections,
      compliance: brief.compliance,
      brief: brief.text,
      narrative: narrative || null,
    });
  } catch (e) {
    jlog({ at: "rep-brief.dispatch", ok: false, error: String(e) });
    return json({ error: "אירעה שגיאה בשרת" }, 500);
  }
});
