// ────────────────────────────────────────────────────────────────────────────
// POST /api/rights — data-subject-rights REQUEST INTAKE (server-side).
//
// Israeli Privacy Protection Law §13/§14 + Amendment 13: a person may request to
// ACCESS, CORRECT, or DELETE their data, or WITHDRAW marketing/processing consent.
// This endpoint is a REQUEST INTAKE ONLY — it NEVER returns anyone's personal
// data to the (unauthenticated) requester. It records the request into
// public.data_subject_requests so the team can verify identity out-of-band and
// then fulfil it. The statutory response deadline (now()+30d) is stamped by the
// DB trigger `data_subject_requests_set_deadline`, not by the client, so it can't
// be omitted or back-dated.
//
// SECURITY: uses the Supabase SERVICE-ROLE key, which lives ONLY in the server env
// (SUPABASE_SERVICE_ROLE_KEY) and is NEVER exposed to the browser. Same posture as
// /api/lead — an Origin allow-list (block off-site/CSRF browser POSTs), a mandatory
// consent gate, and the DB rate-limit gate (surfaced as 429). source_ip is stamped
// by the DB gate / left null here (never trusted from the client body).
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { normalizeIsraeliPhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Origin allow-list — the rights form is only ever submitted from our own pages.
// Rejecting cross-origin browser POSTs blocks third-party sites from driving the
// endpoint (CSRF / off-site abuse). Same-origin fetches send a matching Origin;
// requests with NO Origin header (non-browser callers) are allowed through to the
// DB gates, which remain the authoritative abuse controls. Mirrors /api/lead.
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
  if (!origin) return true; // non-browser callers: DB gates still apply
  return ALLOWED_ORIGINS.has(origin);
}

// Request kinds — MUST match the data_subject_requests.kind CHECK constraint
// (supabase/data-protection-2026-06.sql): access / correction / deletion / withdraw.
const ALLOWED_KINDS = ["access", "correction", "deletion", "withdraw"] as const;
type Kind = (typeof ALLOWED_KINDS)[number];

interface RightsBody {
  kind?: unknown; // request type — one of ALLOWED_KINDS
  name?: unknown; // how the person identifies themselves
  email?: unknown; // contact (email or phone — at least one required)
  phone?: unknown;
  details?: unknown; // free-text: what they're asking for
  consent?: unknown; // mandatory — must be true (they understand it's an intake)
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Minimal email shape check — we only need a plausible reply address, not RFC-5322. */
function isPlausibleEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(req: Request) {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json(
      { ok: false, error: "forbidden origin" },
      { status: 403 },
    );
  }

  // ── Service-role configured? ───────────────────────────────────────────────
  if (!SERVICE_ROLE_KEY) {
    return Response.json(
      { ok: false, error: "rights intake not configured" },
      { status: 503 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: RightsBody;
  try {
    body = (await req.json()) as RightsBody;
  } catch {
    return Response.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const kindRaw = str(body.kind);
  const kind = (ALLOWED_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as Kind)
    : null;
  const name = str(body.name);
  const emailRaw = str(body.email);
  const phoneRaw = str(body.phone);
  const details = str(body.details);
  const consent = body.consent === true;

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!kind) {
    return Response.json(
      { ok: false, error: "יש לבחור סוג בקשה" },
      { status: 400 },
    );
  }
  if (!name || name.length < 2) {
    return Response.json({ ok: false, error: "שם נדרש" }, { status: 400 });
  }

  // Contact: accept a valid email OR a valid Israeli phone (at least one). We need
  // a way to reply / verify identity out-of-band before fulfilling the request.
  const email = emailRaw && isPlausibleEmail(emailRaw) ? emailRaw : "";
  const phone = phoneRaw ? normalizeIsraeliPhone(phoneRaw) : null;
  if (emailRaw && !email) {
    return Response.json(
      { ok: false, error: "כתובת אימייל לא תקינה" },
      { status: 400 },
    );
  }
  if (phoneRaw && !phone) {
    return Response.json(
      { ok: false, error: "מספר טלפון לא תקין" },
      { status: 400 },
    );
  }
  if (!email && !phone) {
    return Response.json(
      { ok: false, error: "יש להשאיר אימייל או טלפון ליצירת קשר" },
      { status: 400 },
    );
  }
  if (!consent) {
    return Response.json(
      { ok: false, error: "יש לאשר את הטיפול בבקשה" },
      { status: 400 },
    );
  }

  // Fold the contact channel(s) into the `contact` column (the schema has a single
  // free-text contact field). Both are kept so the team can reply / verify.
  const contact = [email ? `אימייל: ${email}` : "", phone ? `טלפון: ${phone}` : ""]
    .filter(Boolean)
    .join(" | ");

  // ── Insert via service-role (bypasses RLS; deadline trigger stamps deadline) ─
  // We deliberately DO NOT set source_ip / requested_at / deadline_at / status
  // from the client: status defaults to 'open', requested_at + deadline_at are
  // server-stamped by the DB trigger (now()+30d), source_ip stays null unless the
  // DB gate sets it. This keeps the legally-meaningful fields server-authoritative.
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("data_subject_requests").insert({
    kind,
    full_name: name,
    contact,
    details: details || null,
  });

  if (error) {
    // Surface the DB rate-limit gate as 429; everything else as 500. Never leak
    // internal details to the client.
    const msg = (error.message || "").toLowerCase();
    const rateLimited =
      msg.includes("rate") || msg.includes("limit") || error.code === "P0001";
    return Response.json(
      {
        ok: false,
        error: rateLimited
          ? "יותר מדי בקשות. נסו שוב מאוחר יותר."
          : "אירעה שגיאה בשליחת הבקשה. נסו שוב.",
      },
      { status: rateLimited ? 429 : 500 },
    );
  }

  return Response.json({ ok: true });
}
