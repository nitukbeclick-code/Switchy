import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// street-price — crowd-reported real-world "מחיר רחוב" (street price).
//
// Two public, fail-soft endpoints over public.street_prices (RLS-locked; reached
// only via the service role — see street-prices-2026-06.sql):
//
//   POST  { plan_id?, provider, category, reported_price, lead? } -> { ok, status }
//     Submit ONE real ₪/month a person actually pays / was quoted (frequently a
//     personalised retention offer below the public catalogue headline). The body
//     runs through:
//       1. parseReport()  — validate/coerce/normalize against the live catalogue
//          (unknown provider/category rejected — never guessed).
//       2. screenReport() — a DETERMINISTIC heuristic pre-screen (mirrors
//          community-moderate's heuristicScreen PATTERN): a plausible price (sane
//          absolute bounds AND, when a real catalogue headline is known, sane vs
//          it) is born 'approved' and counts; anything implausible stays 'pending'
//          for a human — NEVER auto-rejected, never deleted.
//       3. audit         — ONE PII-light row to public.security_audit_log per
//          screened report (mirrors community-moderate's audit), so screening is
//          reviewable.
//     A bare price report carries NO contact details, so it needs NO consent
//     (user-PULL wave; no §30A surface). Consent is honoured ONLY when the user
//     ALSO attaches a contactable `lead` (name+phone+mandatory consent) wanting a
//     callback — that lead goes through the EXISTING leads path (_shared/leads.ts:
//     consent re-stamp + pg_net fan-out), never this table.
//     Rate-limited per reporter fingerprint (process-local; the real cost gate).
//     The success body NEVER echoes any stored/derived data — it can't be turned
//     into a read oracle for the raw report stream.
//
//   GET  ?plan_id=…&provider=…  -> { ok, report_count, typical_price, …, reports_needed }
//     Read the threshold-gated aggregate via get_street_price() (SECURITY DEFINER).
//     Returns a median/typical figure ONLY above the real minimum-reports threshold;
//     below it every price is NULL and `reports_needed` tells the UI how many more
//     are required (so the app shows "we need N more reports", never a fabricated
//     typical price). Honest by construction (the DB gate, not this code, nulls the
//     figures).
//
// Public + unauthenticated by design (anyone may report/read), but CORS-locked to
// our own surfaces (paid DB calls shouldn't be drivable from any website) and rate-
// limited. Deploy: supabase functions deploy street-price --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, insertRow, rpcRows } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { corsHeaders, preflight } from "../_shared/cors.ts";
import { rateLimit, secretFingerprint } from "../_shared/ratelimit.ts";
import { catalogueProviders, type Plan, plansFromRows } from "../_shared/catalogue.ts";
import { captureAiLead } from "../_shared/leads.ts";
import {
  clampLeadConsent,
  parseReport,
  type ParsedReport,
  reporterFingerprintInput,
  reportsNeeded,
  screenReport,
} from "./lib.ts";

// Per-reporter submission cap (process-local; see _shared/ratelimit.ts). A genuine
// user reports a handful of plans, not hundreds — this only sheds a flood/loop.
const SUBMIT_LIMIT = 20;
const SUBMIT_WINDOW_MS = 60 * 60_000; // 1 hour

// Same trust order as analytics-track/site-* clientIp: CDN header first, then the
// last (infra-appended) X-Forwarded-For hop — never the spoofable first hop.
function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "";
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

// Load the live catalogue (cheap, cached briefly) so parseReport can normalize the
// provider against real names and we can resolve a headline reference price. Fail-
// soft: a DB hiccup yields [] (then the screen falls back to absolute bounds only).
let plansCache: { plans: Plan[]; at: number } | null = null;
async function loadPlans(): Promise<Plan[]> {
  if (plansCache && Date.now() - plansCache.at < 5 * 60_000) return plansCache.plans;
  const rows = await fetchRows<Record<string, unknown>>(
    "/rest/v1/plans?select=id,provider,category,price,price_unit,specs,subtitle,kind,title&limit=2000",
  );
  const plans = rows ? plansFromRows(rows) : [];
  if (rows) plansCache = { plans, at: Date.now() };
  return plans;
}

// Resolve the REAL catalogue headline ₪/month for a report, for screenReport's
// relative sanity check. Prefer an exact plan-id match; else the cheapest matching
// (provider, category) regular plan (a fair "headline" for that cohort). Returns
// null when nothing matches (the screen then uses absolute bounds only). Never
// fabricates a price.
function catalogueReference(plans: Plan[], report: ParsedReport): number | null {
  if (report.plan_id) {
    const exact = plans.find((p) => p.id === report.plan_id && typeof p.price === "number");
    if (exact && typeof exact.price === "number") return exact.price;
  }
  const cohort = plans
    .filter((p) =>
      p.provider === report.provider &&
      p.cat === report.category &&
      typeof p.price === "number" &&
      (p.kind ?? "regular") === "regular"
    )
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  return cohort.length ? (cohort[0].price as number) : null;
}

// One PII-light audit row per screened report (mirrors community-moderate's
// auditModeration). Best-effort — a logging failure must NEVER fail the submission.
async function auditScreen(report: ParsedReport, status: string, reason: string, ref: number | null): Promise<void> {
  try {
    await insertRow("security_audit_log", {
      user_id: null, // a price report has no user attached (no PII)
      event: "street_price_screened",
      detail: {
        provider: report.provider,
        category: report.category,
        plan_id: report.plan_id,
        reported_price: report.reported_price,
        catalogue_ref: ref,
        status,
        reason,
      },
    });
  } catch (e) {
    jlog({ at: "street-price.audit", ok: false, error: String(e) });
  }
}

// ── POST: submit a reported real price ──────────────────────────────────────
async function handleSubmit(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_) {
    return json(req, { error: "bad request" }, 400);
  }

  // Per-reporter rate limit BEFORE any DB work (the cost gate). Keyed by a
  // non-reversible fingerprint of the trusted client IP — never the raw IP.
  const ip = clientIp(req);
  const fp = ip ? await secretFingerprint(ip) : "none";
  const rl = rateLimit(`street-price:submit:${fp}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSec), ...corsHeaders(req) },
    });
  }

  const plans = await loadPlans();
  const providers = catalogueProviders(plans);

  const parsed = parseReport(body, providers);
  if (!parsed.ok) {
    jlog({ at: "street-price.submit", ok: false, reason: parsed.reason });
    return json(req, { error: parsed.reason }, 400);
  }
  const report = parsed.report;

  // Deterministic heuristic pre-screen against the REAL catalogue headline (when
  // known). 'approved' counts toward the aggregate; 'pending' is held for a human.
  const ref = catalogueReference(plans, report);
  const verdict = screenReport(report, ref);

  // Reporter fingerprint for the aggregate's DISTINCT count (same person + same
  // plan dedupes; no PII). With no trustworthy IP we still store the row but with a
  // 'none' fingerprint — it just won't dedupe.
  const reporterHash = await secretFingerprint(reporterFingerprintInput(ip, report.provider, report.category));

  const ok = await insertRow("street_prices", {
    plan_id: report.plan_id,
    provider: report.provider,
    category: report.category,
    reported_price: report.reported_price,
    reporter_hash: reporterHash,
    status: verdict.status,
  });
  if (!ok) {
    jlog({ at: "street-price.submit", ok: false, error: "insert failed" });
    return json(req, { error: "could not record report" }, 502);
  }

  // Audit trail (best-effort) — one PII-light row per screened report.
  await auditScreen(report, verdict.status, verdict.reason, ref);

  // Optional attached contactable lead → reuse the EXISTING leads path (consent
  // re-stamp + fan-out). Consent is honoured ONLY here, never on the price report.
  // Fail-soft: a lead-capture hiccup never fails the price submission.
  const leadConsent = clampLeadConsent(body.lead as Record<string, unknown> | undefined);
  let leadCaptured = false;
  if (leadConsent) {
    try {
      const res = await captureAiLead({
        name: leadConsent.name,
        phone: leadConsent.phone,
        provider: report.provider,
        category: report.category,
        notes: `דיווח מחיר רחוב: ${report.provider} ${report.category} ₪${report.reported_price}`,
        consent: leadConsent.consent,
        consent_marketing_sms: leadConsent.consent_marketing_sms,
        consent_marketing_email: leadConsent.consent_marketing_email,
        consent_marketing_whatsapp: leadConsent.consent_marketing_whatsapp,
      });
      leadCaptured = res === "captured";
    } catch (e) {
      jlog({ at: "street-price.lead", ok: false, error: String(e) });
    }
  }

  jlog({ at: "street-price.submit", ok: true, status: verdict.status, provider: report.provider, category: report.category, leadCaptured });

  // Honest, minimal response: we acknowledge the report and whether it counts yet
  // ('approved') or is held ('pending'). We NEVER echo back the aggregate or any
  // stored rows here — read it via GET.
  return json(req, { ok: true, status: verdict.status, lead_captured: leadCaptured });
}

// ── GET: read the threshold-gated aggregate ─────────────────────────────────
type AggregateRow = {
  report_count?: number | string | null;
  typical_price?: number | null;
  median_price?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  avg_price?: number | null;
  meets_threshold?: boolean | null;
  first_at?: string | null;
  last_at?: string | null;
};

async function handleRead(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const planId = (url.searchParams.get("plan_id") ?? "").trim() || null;
  const provider = (url.searchParams.get("provider") ?? "").trim() || null;

  // Need at least one of plan_id / provider to scope the aggregate.
  if (!planId && !provider) {
    return json(req, { error: "plan_id or provider required" }, 400);
  }

  const rows = await rpcRows<AggregateRow>("get_street_price", {
    p_plan_id: planId,
    p_provider: provider,
  });
  if (rows === null) {
    // DB error — honest 503 (do NOT confidently report "no data").
    return json(req, { error: "temporarily unavailable" }, 503);
  }

  const agg = rows[0] ?? {};
  const count = Number(agg.report_count ?? 0) || 0;
  const meets = agg.meets_threshold === true;

  // Below threshold the DB already nulled every price; surface the count + how many
  // more reports are needed so the UI can say "צריך עוד N דיווחים" — never a number.
  return json(req, {
    ok: true,
    report_count: count,
    meets_threshold: meets,
    reports_needed: reportsNeeded(count),
    typical_price: agg.typical_price ?? null,
    median_price: agg.median_price ?? null,
    min_price: agg.min_price ?? null,
    max_price: agg.max_price ?? null,
    avg_price: agg.avg_price ?? null,
    first_at: agg.first_at ?? null,
    last_at: agg.last_at ?? null,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  try {
    if (req.method === "POST") return await handleSubmit(req);
    if (req.method === "GET") return await handleRead(req);
    return json(req, { error: "method not allowed" }, 405);
  } catch (e) {
    // Top-level fail-soft: never leak a stack; log + honest 500.
    jlog({ at: "street-price", ok: false, error: String(e) });
    return json(req, { error: "internal error" }, 500);
  }
});
