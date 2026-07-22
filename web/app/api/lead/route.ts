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
// GRANULAR MARKETING (Spam Law): three OPTIONAL, default-false per-channel opt-ins
// (consent_marketing_sms / _email / _whatsapp) are persisted to dedicated boolean
// columns, SEPARATE from the mandatory consent gate. They're stripped on a retry
// if the migration adding them hasn't run yet, so a lead is never lost.
//
// Server-managed columns (source_ip / status / bot workflow) are NOT set here —
// the DB rate-limit gate nulls client values and stamps the IP itself.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { normalizeIsraeliPhone } from "@/lib/phone";
import { isReferralCode, normalizeReferralCode } from "@/lib/referral";

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
    // Canonical host is non-www. We also allow the www alias and the
    // app.switchy-ai.com subdomain — where the GEO app currently serves during the
    // subdomain-first phase (before the eventual apex cutover) — plus the Vercel alias.
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
  source?: unknown; // bounded attribution label from the first-party form
  provider?: unknown;
  plan_id?: unknown;
  callback_time?: unknown;
  notes?: unknown;
  consent?: unknown; // mandatory terms+privacy — must be true
  referrer_code?: unknown; // optional SW-XXXXXX share code (referral attribution)
  marketing?: unknown; // legacy: single optional opt-in (kept for back-compat)
  // Granular per-channel marketing opt-ins (Spam Law) — each optional, default
  // false. Persisted to the dedicated leads.consent_marketing_* boolean columns.
  consent_marketing_sms?: unknown;
  consent_marketing_email?: unknown;
  consent_marketing_whatsapp?: unknown;
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

/**
 * True when an insert error means a `consent_marketing_*` column doesn't exist
 * yet (the granular-marketing-consent migration hasn't been applied). PostgREST
 * reports a missing column as PGRST204; we also match the column-name signal so
 * the route can retry WITHOUT the marketing columns and never lose the lead.
 */
function isMissingMarketingColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST204") return true;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("consent_marketing");
}

/**
 * True when an insert error means the `referrer_code` column doesn't exist yet
 * (the referral-attribution migration hasn't been applied). PostgREST reports a
 * missing column as PGRST204; we also match the column-name signal so the route
 * can retry WITHOUT it and never lose the lead. Dropping it only loses the
 * (optional) attribution stamp — the lead itself is always captured.
 */
function isMissingReferrerColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  if (error.code === "PGRST204") return true;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("referrer_code");
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
  const provider = str(body.provider).slice(0, 160) || null;
  const planId = str(body.plan_id).slice(0, 180) || null;
  const notes = str(body.notes).slice(0, 4000);
  const sourceRaw = str(body.source).toLowerCase();
  // Keep campaign/journey attribution useful in the CRM without accepting
  // arbitrary prose into the source column. Unknown callers fall back to web.
  const source = /^[a-z0-9-]{1,40}$/.test(sourceRaw) ? sourceRaw : "web";
  const consent = body.consent === true;
  // Optional referral attribution: a referee who arrived via a share link sends
  // ?ref=SW-XXXXXX as `referrer_code`. Validate (truth-only — a junk/spoofed code
  // is silently ignored, never stored) and normalize to the canonical form. This
  // is purely an attribution stamp; it NEVER gates the lead or bypasses consent.
  const referrerCode = isReferralCode(body.referrer_code)
    ? normalizeReferralCode(body.referrer_code)
    : null;
  // Granular per-channel marketing opt-ins (each optional, default false).
  const marketingSms = body.consent_marketing_sms === true;
  const marketingEmail = body.consent_marketing_email === true;
  const marketingWhatsapp = body.consent_marketing_whatsapp === true;
  // Legacy single opt-in OR any granular channel implies a marketing consent
  // (used for the marketing_accepted_at consent timestamp).
  const marketing =
    body.marketing === true ||
    marketingSms ||
    marketingEmail ||
    marketingWhatsapp;

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

  // Shared row (everything except how `city` is stored and the marketing cols).
  const baseRow = {
    name,
    phone,
    email: null,
    provider,
    plan_id: planId,
    callback_time: callbackTime,
    source,
    // Consent: non-null → trigger stamps now(); null → stays null.
    terms_accepted_at: nowIso,
    privacy_accepted_at: nowIso,
    marketing_accepted_at: marketing ? nowIso : null,
  };

  // Granular per-channel marketing opt-ins (Spam Law) — written to dedicated
  // boolean columns. Folded out into a retry if the migration isn't applied yet.
  const marketingCols = {
    consent_marketing_sms: marketingSms,
    consent_marketing_email: marketingEmail,
    consent_marketing_whatsapp: marketingWhatsapp,
  };

  // The desired storage: dedicated `leads.city` column (leads-city-2026-06) +
  // dedicated `consent_marketing_*` columns (granular-marketing-2026-06). If
  // either migration isn't applied yet PostgREST returns a column-missing error;
  // we retry, stripping the missing group, so a lead is NEVER lost. The opt-in
  // booleans default false, so dropping them only ever loses an explicit opt-IN —
  // we conservatively fold a recorded opt-in into notes on that fallback path.
  let withCity = true;
  let withMarketing = true;
  // `referrer_code` is written only when present AND not stripped by a pending-
  // migration retry. It's optional attribution, so dropping it never loses a lead.
  let withReferrer = referrerCode != null;

  function buildRow() {
    const notesWithCity = withCity
      ? baseNotes
      : [city ? `עיר: ${city}` : "", baseNotes].filter(Boolean).join(" | ");
    const optedInChannels = [
      marketingSms ? "SMS" : "",
      marketingEmail ? "אימייל" : "",
      marketingWhatsapp ? "וואטסאפ" : "",
    ].filter(Boolean);
    const marketingNote =
      !withMarketing && optedInChannels.length > 0
        ? `אישור דיוור שיווקי: ${optedInChannels.join(", ")}`
        : "";
    const finalNotes = [notesWithCity, marketingNote]
      .filter(Boolean)
      .join(" | ");
    return {
      ...baseRow,
      ...(withCity ? { city: city || null } : {}),
      ...(withMarketing ? marketingCols : {}),
      ...(withReferrer ? { referrer_code: referrerCode } : {}),
      notes: finalNotes || null,
    };
  }

  // Insert and read back the new lead id (needed to credit a referral redemption).
  // `.select("id").single()` returns the inserted row; on a stripped-column retry
  // we re-run the same select so `newLeadId` always reflects the row that landed.
  let insert = await supabase
    .from("leads")
    .insert(buildRow())
    .select("id")
    .single();
  let error = insert.error;

  // Retry, stripping whichever optional column-group the error names, until the
  // insert succeeds or there's nothing left to strip. Each missing optional
  // migration surfaces a missing column as PGRST204; the marketing detector also
  // matches the explicit `consent_marketing` name, the city detector the explicit
  // `city` name, the referrer detector the explicit `referrer_code` name. We check
  // the explicit-name detectors before the generic city/marketing PGRST204 match
  // so a missing `referrer_code` is attributed to the right group. We cap at three
  // retries (one per optional group) so a lead is never lost to a pending
  // migration, without risking an unbounded loop.
  for (let attempt = 0; attempt < 3 && error; attempt++) {
    if (
      withReferrer &&
      (error.message || "").toLowerCase().includes("referrer_code")
    ) {
      withReferrer = false;
    } else if (
      withMarketing &&
      (error.message || "").toLowerCase().includes("consent_marketing")
    ) {
      withMarketing = false;
    } else if (
      withCity &&
      (error.message || "").toLowerCase().includes("city")
    ) {
      withCity = false;
    } else if (withReferrer && isMissingReferrerColumn(error)) {
      withReferrer = false;
    } else if (withMarketing && isMissingMarketingColumn(error)) {
      withMarketing = false;
    } else if (withCity && isMissingCityColumn(error)) {
      withCity = false;
    } else {
      break; // not a strippable missing-column error
    }
    insert = await supabase
      .from("leads")
      .insert(buildRow())
      .select("id")
      .single();
    error = insert.error;
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

  // ── Credit the referral redemption (fail-soft, never blocks the lead) ───────
  // The lead is captured at this point. If it arrived with a valid referral code
  // AND that code actually landed on the row (withReferrer survived the retries),
  // stamp the first redemption via the service_role RPC. This is best-effort
  // attribution: any RPC error (function not deployed yet, code unknown, already
  // redeemed) is swallowed — a redemption failure must NEVER fail a captured lead.
  if (referrerCode && withReferrer) {
    const newLeadId =
      insert.data && typeof insert.data.id === "string"
        ? insert.data.id
        : null;
    if (newLeadId) {
      try {
        await supabase.rpc("redeem_referral_code", {
          p_code: referrerCode,
          p_lead_id: newLeadId,
        });
      } catch {
        // Swallow — attribution is an enhancement, never load-bearing.
      }
    }
  }

  return Response.json({ ok: true });
}
