// ────────────────────────────────────────────────────────────────────────────
// POST /api/lead — capture a contact request into public.leads (server-side).
//
// SECURITY: uses the Supabase SERVICE-ROLE key, which lives ONLY in the server
// env (SUPABASE_SERVICE_ROLE_KEY) and is NEVER exposed to the browser. If the key
// is absent the route returns 503 ("not configured") instead of failing silently.
//
// CONSENT (Israeli Spam Law §30A + Privacy Reg.13): the mandatory terms+privacy
// consent must be TRUE — we reject otherwise. We send a non-null timestamp for
// terms_accepted_at / privacy_accepted_at (and marketing_accepted_at only if the
// user opted in); the BEFORE INSERT trigger `leads_consent_stamp` overwrites each
// with now() when non-null (else null) so the proof can't be backdated.
//
// Server-managed columns (source_ip / status / bot workflow) are NOT set here —
// the DB rate-limit gate nulls client values and stamps the IP itself.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { normalizeIsraeliPhone } from "@/lib/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Origin allow-list — the lead form is only ever submitted from our own pages.
// Rejecting cross-origin browser POSTs blocks third-party sites from driving the
// endpoint (CSRF / off-site abuse). Same-origin fetches send a matching Origin;
// requests with NO Origin header (non-browser callers) are allowed through to the
// DB rate-limit + consent gates, which remain the authoritative abuse controls.
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [
    // Canonical host is non-www (single host avoids a www/non-www entity split).
    // The hosting layer 301-redirects www→non-www, so browser POSTs always carry
    // the non-www Origin; we list only the canonical host here.
    "https://switchy-ai.com",
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

// Israeli mobile/landline: 9–10 digits, optionally with separators / +972.
// Shared with <LeadForm> via lib/phone so client validation + server
// normalization can never disagree.
const normalizePhone = normalizeIsraeliPhone;

interface LeadBody {
  name?: unknown;
  phone?: unknown;
  city?: unknown;
  service?: unknown; // desired category (cellular/internet/...) or free text
  category?: unknown; // alias of `service` sent by <LeadForm>
  provider?: unknown;
  plan_id?: unknown;
  callback_time?: unknown;
  notes?: unknown;
  consent?: unknown; // mandatory terms+privacy — must be true
  marketing?: unknown; // optional opt-in
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * True when an insert error means the `city` column doesn't exist yet (the
 * leads-city migration hasn't been applied). PostgREST reports a missing column
 * as PGRST204 with a message naming the column; we match either signal so the
 * route can fall back to folding the city into notes.
 */
function isMissingCityColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST204") return true;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("city") && msg.includes("column");
}

export async function POST(req: Request) {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ ok: false, error: "forbidden origin" }, { status: 403 });
  }

  // ── Service-role configured? ───────────────────────────────────────────────
  if (!SERVICE_ROLE_KEY) {
    return Response.json(
      { ok: false, error: "lead capture not configured" },
      { status: 503 },
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: LeadBody;
  try {
    body = (await req.json()) as LeadBody;
  } catch {
    return Response.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const name = str(body.name);
  const phoneRaw = str(body.phone);
  const city = str(body.city);
  // <LeadForm> sends the desired service under `category`; older callers use
  // `service`. Accept either so the city/service tag is never silently dropped.
  const service = str(body.service) || str(body.category);
  const provider = str(body.provider) || null;
  const planId = str(body.plan_id) || null;
  const notes = str(body.notes);
  const consent = body.consent === true;
  const marketing = body.marketing === true;

  // callback_time is constrained by the schema comment to a known set.
  const allowedCallback = ["now", "noon", "evening", "tomorrow"];
  const callbackRaw = str(body.callback_time);
  const callbackTime = allowedCallback.includes(callbackRaw)
    ? callbackRaw
    : null;

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!name || name.length < 2) {
    return Response.json(
      { ok: false, error: "שם מלא נדרש" },
      { status: 400 },
    );
  }
  const phone = normalizePhone(phoneRaw);
  if (!phone) {
    return Response.json(
      { ok: false, error: "מספר טלפון לא תקין" },
      { status: 400 },
    );
  }
  if (!consent) {
    // MANDATORY consent — Spam Law + Privacy. Reject without it.
    return Response.json(
      { ok: false, error: "יש לאשר את תנאי השימוש ומדיניות הפרטיות" },
      { status: 400 },
    );
  }

  // City is captured into the dedicated `leads.city` column (for local-partner
  // routing) when it exists; the desired service is always folded into notes
  // since the schema has no service column.
  const notesParts: string[] = [];
  if (service) notesParts.push(`שירות מבוקש: ${service}`);
  if (notes) notesParts.push(notes);
  const baseNotes = notesParts.join(" | ");

  // Non-null sentinels for the consent stamp trigger (it overwrites with now()).
  const nowIso = new Date().toISOString();

  // ── Insert via service-role (bypasses RLS; DB gate enforces rate limits) ────
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Shared row (everything except how `city` is stored).
  const baseRow = {
    name,
    phone,
    email: null,
    provider,
    plan_id: planId,
    callback_time: callbackTime,
    source: "web",
    // Consent: non-null → trigger stamps now(); null → stays null.
    terms_accepted_at: nowIso,
    privacy_accepted_at: nowIso,
    marketing_accepted_at: marketing ? nowIso : null,
  };

  // Prefer the dedicated `leads.city` column (migration leads-city-2026-06).
  // If it isn't present yet (column-missing schema-cache error), retry with the
  // city folded into notes so the lead is never lost before the migration runs.
  let error = (
    await supabase.from("leads").insert({
      ...baseRow,
      city: city || null,
      notes: baseNotes || null,
    })
  ).error;

  if (error && isMissingCityColumn(error)) {
    const notesWithCity = [city ? `עיר: ${city}` : "", baseNotes]
      .filter(Boolean)
      .join(" | ");
    error = (
      await supabase.from("leads").insert({
        ...baseRow,
        notes: notesWithCity || null,
      })
    ).error;
  }

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
          : "אירעה שגיאה בשליחת הפנייה. נסו שוב.",
      },
      { status: rateLimited ? 429 : 500 },
    );
  }

  return Response.json({ ok: true });
}
