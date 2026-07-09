// ────────────────────────────────────────────────────────────────────────────
// POST /api/analyze-bill — bill-photo → savings (server-side proxy).
//
// WHAT: the user photographs a phone/internet/TV bill on /bills; the browser
// compresses it and POSTs { imageBase64 } here. This route forwards the image to
// the Supabase Edge Function `site-bill-analyzer`, which runs Gemini Vision to
// extract { provider, monthly total ₪, category } and matches it against the REAL
// plan catalogue to surface up to 3 cheaper plans + the annual saving. We return
// that result (provider / currentSpend / category / suggestions / annualSaving /
// confidence / warnings / note) verbatim to the client.
//
// WHY A SERVER ROUTE (not a direct browser → edge call):
//   1. RATE LIMIT (Vision is METERED — costs real money per call). The edge fn
//      rate-limits per IP, but from the browser-via-our-server path it would only
//      ever see THIS server's IP. So we (a) enforce our OWN strict per-IP/day
//      guard here BEFORE spending a Vision call, by querying public.bill_analyses
//      with the service-role key, and (b) forward the real client IP to the edge
//      fn (X-Forwarded-For last hop + CF-Connecting-IP) so its own guard also
//      keys on the real user — defense in depth, never our shared server quota.
//   2. ORIGIN ALLOW-LIST — block off-site / CSRF browser POSTs (mirrors /api/lead).
//   3. We never expose the Supabase anon/service key to the browser for this.
//
// PRIVACY: the image is NEVER stored. The edge fn writes only a summary row
// (ip, provider, current_spend, suggestions) — never the photo, never base64.
// This route holds the image in memory only for the duration of the upstream
// call. The client copy states plainly that the photo is sent to Google for the
// read and is not stored.
//
// FAIL-SOFT: on any upstream error we return a friendly Hebrew message + empty
// suggestions so the front-end never crashes.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vision can take a few seconds; give the upstream call generous headroom but cap
// it so a hung request can't pin a serverless instance.
export const maxDuration = 30;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The bill-analyzer edge function (verify_jwt:false → no auth required, but we
// still send the anon key as apikey when available, matching the site wiring).
const EDGE_FN_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/site-bill-analyzer`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Match the edge function's own limits so we reject early without an upstream
// round-trip: ~6MB base64 payload, 1 analysis / IP / day. (Vision is metered.)
const MAX_BASE64_LEN = 6 * 1024 * 1024;
const PER_IP_DAILY_LIMIT = 1;
// Hard ceiling on how long we wait for the upstream Vision call before giving up.
const UPSTREAM_TIMEOUT_MS = 25_000;

// Origin allow-list — the uploader is only ever submitted from our own pages.
// Requests with NO Origin (non-browser callers) pass through to the rate-limit
// gate, which remains the authoritative abuse control. Mirrors /api/lead.
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
  if (!origin) return true; // non-browser callers: the rate-limit gate still applies
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * Resolve the real client IP for rate-limiting on Vercel.
 *
 * SECURITY: a client can send ANY request header, so `cf-connecting-ip` /
 * `x-forwarded-for` are attacker-controlled unless a trusted proxy overwrites
 * them. On Vercel, `x-vercel-forwarded-for` is injected by the platform edge and
 * cannot be spoofed by the caller — trust it FIRST so an attacker can't mint a
 * fresh "IP" per request (which would defeat the per-IP/day guard on this paid
 * Vision endpoint). Only if it is absent (e.g. a Cloudflare-fronted deploy) do we
 * fall back to the CDN header, then the LAST infra-appended X-Forwarded-For hop —
 * never the spoofable first hop.
 */
function clientIp(req: Request): string {
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const hops = vercel.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[0]; // Vercel puts the real client first
  }
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return "";
}

/**
 * Our own strict per-IP/day guard. Queries public.bill_analyses (the summary
 * table the edge fn writes) via the service-role key for rows from this IP in the
 * last 24h. Returns true when the user is over the daily limit.
 *
 * Fail policy: a query failure FAILS CLOSED (returns true) — this endpoint hits a
 * paid Vision model, so a DB hiccup must block rather than let a burst through.
 * A missing IP fails OPEN (can't key the limit on nothing).
 */
async function isRateLimited(ip: string): Promise<boolean> {
  if (!ip) return false; // fail-open on missing IP (nothing to key on)
  if (!SERVICE_ROLE_KEY) return false; // guard handled upstream; can't query here
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("bill_analyses")
    .select("id")
    .eq("ip", ip)
    .gte("created_at", since)
    .limit(PER_IP_DAILY_LIMIT);
  if (error) return true; // fail CLOSED — never let a DB outage enable a Vision burst
  return (data?.length ?? 0) >= PER_IP_DAILY_LIMIT;
}

/** Friendly Hebrew copy, mirrored from the edge function. */
const FRIENDLY_RATE_LIMIT =
  "כבר ניתחנו עבורכם חשבון היום. נסו שוב מחר 🙂";
const FRIENDLY_TIMEOUT =
  "ניתוח החשבון לוקח יותר מדי זמן כרגע. נסו שוב בעוד רגע.";
const FRIENDLY_UNAVAILABLE =
  "מנתח החשבונות אינו זמין כרגע. נסו שוב מאוחר יותר.";

/** A single cheaper-plan suggestion as returned by the edge function. */
interface Suggestion {
  id?: string;
  name: string;
  provider: string;
  price: number;
  annualSaving: number;
}

/** The shape we return to the client (a superset-safe view of the edge result). */
interface AnalyzeResult {
  provider: string;
  currentSpend: number;
  category: string;
  suggestions: Suggestion[];
  /** Total annual saving of the single best (largest-saving) suggestion, ₪. */
  annualSaving: number;
  confidence: number;
  warnings: string[];
  note?: string;
  error?: string;
}

export async function POST(req: Request): Promise<Response> {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ error: "forbidden origin" }, { status: 403 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { imageBase64?: unknown };
  try {
    body = (await req.json()) as { imageBase64?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  if (!imageBase64.trim()) {
    return Response.json({ error: "חסרה תמונה לניתוח." }, { status: 400 });
  }
  if (imageBase64.length > MAX_BASE64_LEN) {
    return Response.json(
      { error: "התמונה גדולה מדי. צלמו תמונה קטנה יותר ונסו שוב." },
      { status: 413 },
    );
  }

  // ── Strict per-IP/day guard BEFORE spending a (paid) Vision call ────────────
  const ip = clientIp(req);
  if (await isRateLimited(ip)) {
    return Response.json(
      { error: FRIENDLY_RATE_LIMIT, suggestions: [] },
      { status: 429 },
    );
  }

  // ── Forward to the bill-analyzer edge function ──────────────────────────────
  // We pass the REAL client IP so the edge fn's own per-IP guard keys on the user,
  // not on our server. A bounded timeout turns a hung Vision model into a clean
  // 504 ("try again") rather than a pinned instance.
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
      // Append the real client IP as the LAST X-Forwarded-For hop (the hop the
      // edge fn trusts) and set CF-Connecting-IP (its first-choice header).
      const existingXff = req.headers.get("x-forwarded-for");
      headers["x-forwarded-for"] = existingXff ? `${existingXff}, ${ip}` : ip;
      headers["cf-connecting-ip"] = ip;
    }
    upstream = await fetch(EDGE_FN_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ imageBase64 }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    // Aborted by our timeout → 504 "try again". Any other network error → 502.
    const aborted = e instanceof Error && e.name === "AbortError";
    return Response.json(
      {
        provider: "",
        currentSpend: 0,
        category: "",
        suggestions: [],
        annualSaving: 0,
        confidence: 0,
        warnings: [],
        error: aborted ? FRIENDLY_TIMEOUT : FRIENDLY_UNAVAILABLE,
      } satisfies AnalyzeResult,
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }

  // Parse upstream JSON defensively — a non-JSON 5xx must not crash us.
  const data = (await upstream.json().catch(() => ({}))) as Partial<AnalyzeResult>;

  // Surface upstream not-configured / rate-limit / size statuses transparently.
  if (!upstream.ok) {
    // 503 (no API key), 429 (edge-side IP limit), 413 (too large), 504 (timeout).
    const status = upstream.status;
    return Response.json(
      {
        provider: "",
        currentSpend: 0,
        category: "",
        suggestions: [],
        annualSaving: 0,
        confidence: 0,
        warnings: [],
        error:
          typeof data.error === "string" && data.error
            ? data.error
            : status === 503
              ? FRIENDLY_UNAVAILABLE
              : status === 504
                ? FRIENDLY_TIMEOUT
                : FRIENDLY_UNAVAILABLE,
      } satisfies AnalyzeResult,
      { status: status >= 400 && status <= 599 ? status : 502 },
    );
  }

  // ── Normalize the successful result for the client ──────────────────────────
  const suggestions: Suggestion[] = Array.isArray(data.suggestions)
    ? data.suggestions
        .filter(
          (s): s is Suggestion =>
            !!s && typeof s === "object" && typeof s.name === "string",
        )
        .map((s) => ({
          id: typeof s.id === "string" ? s.id : undefined,
          name: String(s.name),
          provider: String(s.provider ?? ""),
          price: Number(s.price) || 0,
          annualSaving: Math.max(0, Number(s.annualSaving) || 0),
        }))
    : [];

  // The headline annual saving is the single best (largest) suggestion's saving.
  const annualSaving = suggestions.reduce(
    (max, s) => Math.max(max, s.annualSaving),
    0,
  );

  const result: AnalyzeResult = {
    provider: typeof data.provider === "string" ? data.provider : "",
    currentSpend: Number(data.currentSpend) || 0,
    category: typeof data.category === "string" ? data.category : "",
    suggestions,
    annualSaving,
    confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter((w): w is string => typeof w === "string")
      : [],
    note: typeof data.note === "string" ? data.note : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
  };

  return Response.json(result);
}
