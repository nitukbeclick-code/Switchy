// ────────────────────────────────────────────────────────────────────────────
// /api/street-price — the public "מחיר הרחוב" surface.
//
//   GET  → the HONEST, threshold-gated aggregate of what users actually pay, per
//          category. Reads the SECURITY DEFINER get_street_price(p_plan_id,
//          p_provider) RPC (supabase/street-prices-2026-06.sql) once per category
//          via the service-role key. The RPC returns price figures ONLY when a
//          category clears the distinct-reporter threshold; below it every figure
//          is null and we surface `published:false` so the chart renders nothing.
//
//   POST → submit one report ("דווח/י כמה את/ה משלם/ת"). We do NOT write the table
//          here — the `street-price` Edge Function OWNS the write path (it runs the
//          deterministic heuristic pre-screen, derives the PII-free reporter
//          fingerprint, performs the insert, and appends the moderation audit row).
//          This route forwards the validated submission to that edge fn, passing
//          the REAL client IP so the fingerprint + per-reporter rate-limit key on
//          the user, not on our server — exactly the /api/analyze-bill proxy
//          posture. We never re-implement (or duplicate) the screen here.
//
// E-E-A-T / HONESTY: the read is threshold-gated by the DB (no fabricated counts /
// no sub-threshold band ever leaves). The write is screened by the edge fn (no
// unscreened row counts). This route invents nothing.
//
// SECURITY: the service-role key lives ONLY in SUPABASE_SERVICE_ROLE_KEY (server
// env) and never reaches the browser. A same-site Origin allow-list blocks
// off-site/CSRF browser POSTs (mirrors /api/lead + /api/analyze-bill). The raw
// reports table is never read here — only the aggregate RPC + the edge submit.
//
// FAIL-SOFT: any missing-config / DB / upstream error degrades to a well-formed,
// empty (GET) or friendly-error (POST) response — the page never crashes.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import {
  STREET_PRICE_CATEGORIES,
  STREET_PRICE_MIN_REPORTS,
  normalizeAggregate,
  validateSubmission,
  type StreetPriceAggregate,
} from "@/lib/street-price";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The street-price submit edge function (owns screen + fingerprint + insert + audit).
const EDGE_FN_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/street-price`;
// Bound how long we wait for the upstream submit before giving up.
const UPSTREAM_TIMEOUT_MS = 10_000;

// Origin allow-list — the report form is only ever submitted from our own pages.
// Requests with NO Origin (non-browser callers) pass through to the edge fn's own
// rate-limit/screen, which remain the authoritative abuse controls. Mirrors
// /api/lead + /api/analyze-bill.
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [
    "https://switchy-ai.com",
    "https://www.switchy-ai.com",
    "https://app.switchy-ai.com",
    "https://switchyy-omega.vercel.app",
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined,
  ].filter((o): o is string => typeof o === "string" && o.length > 0),
);

/** True when the request's Origin is same-site (or absent → non-browser caller). */
function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers: edge-fn gates still apply
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * Resolve the real client IP from the edge/CDN headers (CDN-set header first, then
 * the LAST infra-appended X-Forwarded-For hop — never the spoofable first hop).
 * Forwarded to the edge fn so its reporter fingerprint + rate-limit key on the
 * user, not our server. Mirrors /api/analyze-bill clientIp().
 */
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

// ── GET — the threshold-gated aggregate, per category ─────────────────────────
export interface StreetPriceGetResponse {
  ok: boolean;
  /** One aggregate per category (published or not). */
  categories: StreetPriceAggregate[];
  /** The publish threshold applied, echoed so the client can label honestly. */
  threshold: number;
}

/** A well-formed empty payload (all categories unpublished) — the fail-soft default. */
function emptyGetPayload(): StreetPriceGetResponse {
  return {
    ok: true,
    categories: STREET_PRICE_CATEGORIES.map((c) => normalizeAggregate(c, null)),
    threshold: STREET_PRICE_MIN_REPORTS,
  };
}

function jsonGet(body: StreetPriceGetResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Short cache: the aggregate moves slowly and a slightly-stale figure is
      // harmless; this keeps repeat views off the DB.
      "cache-control": "public, max-age=120, s-maxage=600",
    },
  });
}

export async function GET(): Promise<Response> {
  // No service-role key → degrade gracefully to "no data" (200) so the page shows
  // the honest empty state rather than erroring.
  if (!SERVICE_ROLE_KEY) return jsonGet(emptyGetPayload());

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // One call → the per-category aggregate for every category that has reports
  // (supabase/street-prices-web-2026-06.sql). The RPC returns the distinct-reporter
  // count for each, and nulls every PRICE figure below the threshold, so a thin
  // category normalises to `published:false` and the chart renders the empty state.
  let rows: unknown[] = [];
  try {
    const { data, error } = await supabase.rpc(
      "get_street_prices_by_category",
      { p_min_reports: STREET_PRICE_MIN_REPORTS },
    );
    // Any DB error → degrade to the empty payload (the page shows the empty state).
    if (error) return jsonGet(emptyGetPayload());
    rows = Array.isArray(data) ? data : [];
  } catch {
    return jsonGet(emptyGetPayload());
  }

  // Index the returned rows by category, then emit one aggregate per known
  // category (a category with no row at all → unpublished/empty).
  const byCat = new Map<string, unknown>();
  for (const row of rows) {
    const c =
      row && typeof row === "object"
        ? (row as { category?: unknown }).category
        : undefined;
    if (typeof c === "string") byCat.set(c, row);
  }

  const results = STREET_PRICE_CATEGORIES.map((cat) =>
    normalizeAggregate(cat, byCat.get(cat) ?? null),
  );

  return jsonGet({
    ok: true,
    categories: results,
    threshold: STREET_PRICE_MIN_REPORTS,
  });
}

// ── POST — forward a report to the screening edge function ────────────────────
const FRIENDLY_UNAVAILABLE =
  "מערכת הדיווחים אינה זמינה כרגע. נסו שוב מאוחר יותר.";
const FRIENDLY_TIMEOUT = "הדיווח לוקח יותר מדי זמן כרגע. נסו שוב בעוד רגע.";

export interface StreetPricePostResponse {
  ok: boolean;
  /** Honest status of the submitted report as the edge fn screened it. */
  status?: "approved" | "pending" | "rejected";
  /** Hebrew, user-facing message. */
  message?: string;
  error?: string;
}

export async function POST(req: Request): Promise<Response> {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json(
      { ok: false, error: "forbidden origin" },
      { status: 403 },
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  // ── Client-side guard (the edge fn re-validates + runs the nuanced screen) ──
  const v = validateSubmission({
    category: body.category,
    provider: body.provider,
    reported_price: body.reported_price ?? body.price,
    plan_id: body.plan_id,
  });
  if (!v.ok) {
    return Response.json({ ok: false, error: v.error }, { status: 400 });
  }

  // ── Forward to the screening edge function ──────────────────────────────────
  const ip = clientIp(req);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (ANON_KEY) {
      headers.apikey = ANON_KEY;
      headers.Authorization = `Bearer ${ANON_KEY}`;
    }
    if (ip) {
      // Append the real client IP as the LAST X-Forwarded-For hop + CF-Connecting-IP
      // so the edge fn's fingerprint + per-reporter rate-limit key on the user.
      const existingXff = req.headers.get("x-forwarded-for");
      headers["x-forwarded-for"] = existingXff ? `${existingXff}, ${ip}` : ip;
      headers["cf-connecting-ip"] = ip;
    }
    upstream = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(v.submission),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e instanceof Error && e.name === "AbortError";
    return Response.json(
      {
        ok: false,
        error: aborted ? FRIENDLY_TIMEOUT : FRIENDLY_UNAVAILABLE,
      } satisfies StreetPricePostResponse,
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const data = (await upstream
    .json()
    .catch(() => ({}))) as Partial<StreetPricePostResponse> & {
    status?: string;
  };

  if (!upstream.ok) {
    const status = upstream.status;
    // The edge fn's error codes are English internals ("too many requests",
    // "unrecognised provider"); we map to friendly Hebrew by status rather than
    // leak them. (A genuine bad submission is already caught by our client guard
    // above, so a 400 here is rare.)
    const error =
      status === 429
        ? "כבר קלטנו ממך דיווח לאחרונה. תודה!"
        : status === 400
          ? "הדיווח לא עבר אימות. בדקו את הפרטים ונסו שוב."
          : FRIENDLY_UNAVAILABLE;
    return Response.json(
      { ok: false, error } satisfies StreetPricePostResponse,
      { status: status >= 400 && status <= 599 ? status : 502 },
    );
  }

  // ── Normalise the edge fn's verdict for the client ──────────────────────────
  const screened: "approved" | "pending" | "rejected" =
    data.status === "approved" || data.status === "rejected"
      ? data.status
      : "pending";
  const message =
    typeof data.message === "string" && data.message
      ? data.message
      : screened === "approved"
        ? "תודה! הדיווח שלך נקלט ונספר אל מחיר הרחוב."
        : "תודה! הדיווח שלך נקלט וייבדק לפני שייספר. כל דיווח עוזר.";

  return Response.json({ ok: true, status: screened, message });
}
