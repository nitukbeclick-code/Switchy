import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// meeting-book — Switchy AI
// Email-verified, self-serve Zoom consultation booking for ANONYMOUS visitors
// (no app account). This is the anti-spam front door for public.meetings: a
// visitor must prove control of an email address (one-time code) before a
// booking row is inserted. The DB trigger meetings_guard remains the ultimate
// authority on schedule + rate limits; this function adds the email gate and a
// process-local request throttle in front of it.
//
// Deploy: supabase functions deploy meeting-book --no-verify-jwt
//   (verify_jwt MUST be false — the callers are anonymous browsers.)
//
// POST { action: "request-code", email, name? }  -> always { ok: true } (generic)
// POST { action: "verify-code",  email, code }    -> { ok: true } | { ok:false, error }
// POST { action: "book", name, phone, email, meeting_date, slot, category?, consent }
//                                                 -> { ok: true } | { ok:false, error }
// GET  (any)                                      -> small health string
//
// SECURITY DESIGN:
//   • Origin allow-list (same set as web/app/api/lead/route.ts) blocks off-site
//     browser POSTs; requests with NO Origin (non-browser) pass to the gates.
//   • Codes: 6-digit, crypto-random, SHA-256-hashed at rest, constant-time
//     compared, 15-min expiry, max 5 verify attempts per row.
//   • Rate limits: per-email + per-IP on request-code; per-IP on every action.
//   • The `book` gate requires a verified, unconsumed OTP < 30 min old, then
//     marks it consumed on success (single-use).
//   • Generic responses on request-code (never leak whether mail was sent / the
//     address exists). The code is NEVER logged.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCfgCached } from "../_shared/config.ts";
import { rateLimit, secretFingerprint } from "../_shared/ratelimit.ts";
import { fetchRows, insertRow, patchCount } from "../_shared/db.ts";
import { sendCustomerEmail } from "../_shared/email.ts";
import { buildOtpEmailHtml } from "../_shared/meetings.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";
import {
  canonicalizeEmail,
  DEFAULT_OTP_RATE_LIMITS,
  evaluateOtpRateLimit,
  evaluateOtpVerify,
  genCode,
  hashCode,
  isValidEmail,
  normalizeEmail,
  validBookingSlot,
} from "./lib.ts";

// ── Origin allow-list ─────────────────────────────────────────────────────────
// Same set as web/app/api/lead/route.ts. The booking form is only ever posted
// from our own pages; rejecting cross-origin browser POSTs blocks third-party
// sites from driving the endpoint (CSRF / off-site abuse). A request with NO
// Origin header (a non-browser caller) is allowed through to the email + DB
// gates, which remain the authoritative abuse controls.
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://switchy-ai.com",
  "https://www.switchy-ai.com",
  "https://app.switchy-ai.com",
  "https://switchyy-omega.vercel.app",
]);

function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // non-browser callers: gates below still apply
  return ALLOWED_ORIGINS.has(origin);
}

// CORS headers echo only an allowed Origin (never "*") so credentials/cookies
// can never be read cross-site. When the Origin is absent we still emit a
// permissive header for the (non-browser) caller's convenience.
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : (origin ? "null" : "*");
  return {
    "Access-Control-Allow-Origin": allow,
    // The browser preflights the booking POST because it carries `apikey` +
    // `Authorization` (the Supabase anon key). Those MUST be echoed here or the
    // preflight fails and every browser booking is blocked (curl, which skips
    // preflight, still works — which is why this hid for so long). Mirror the
    // shared _shared/cors.ts allow-list.
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin), ...(extra ?? {}) },
  });
}

// Best-effort client IP, mirroring meetings_guard / notify-lead: prefer
// cf-connecting-ip, else the LAST hop of x-forwarded-for.
function clientIp(req: Request): string {
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf;
  const xff = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : "";
}

// Process-local per-IP throttle applied to EVERY action (in front of the
// per-email limit and the DB gates). Generous cap — a real visitor sends a
// handful of requests; only a flood from one IP trips it. The bucket key uses a
// non-reversible fingerprint of the IP, never the raw IP, so it's safe to log.
const IP_LIMIT = 30; // requests per IP per window, across all actions
const IP_WINDOW_MS = 15 * 60_000; // 15 minutes
async function ipLimited(action: string, ip: string, origin: string | null): Promise<Response | null> {
  if (!ip) return null; // no IP to key on — DB gates still apply
  const fp = await secretFingerprint(ip);
  const res = rateLimit(`mbk:ip:${fp}`, IP_LIMIT, IP_WINDOW_MS);
  if (res.allowed) return null;
  jlog({ at: "rate-limit", fn: "meeting-book", action, ip_fp: fp, retry_after: res.retryAfterSec });
  return json({ ok: false, error: "יותר מדי בקשות. נסו שוב מאוחר יותר." }, 429, origin, {
    "Retry-After": String(res.retryAfterSec),
  });
}

const OTP_TTL_MS = 15 * 60_000; // code lifetime
const MAX_VERIFY_ATTEMPTS = 5; // per OTP row
const BOOK_OTP_MAX_AGE_MS = 30 * 60_000; // verified OTP must be fresher than this to book

// Carriers eligible for a booked consultation — MUST match the public.meetings_guard
// whitelist (meetings-2026-06.sql) EXACTLY, or the insert is rejected with
// 'provider not eligible'. Mirrors the static booking grid + the web BookClient.
const MEETING_PROVIDERS = ["HOT", "yes", "פרטנר", "סלקום", "STING TV", "בזק", "הוט מובייל"];

type OtpRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  verified_at: string | null;
  consumed_at: string | null;
  created_at: string;
};

// UNCONSUMED OTP rows for an address, newest first (capped). The verify + book
// gates scan this SET — not just the single newest row — because "request a new
// code" (resend) MINTS A FRESH ROW while the previous code is still valid: a user
// who enters the code from an earlier email must still be honored instead of
// being checked only against the latest row (which would wrongly say "invalid").
// Returns [] on a query failure (fail-soft). Caller filters by expiry/verified.
async function unconsumedOtps(email: string): Promise<OtpRow[]> {
  const q = `/rest/v1/meeting_email_otps?select=id,email,code_hash,expires_at,attempts,verified_at,consumed_at,created_at` +
    `&email=eq.${encodeURIComponent(email)}&consumed_at=is.null&order=created_at.desc&limit=8`;
  const rows = await fetchRows<OtpRow>(q);
  return rows ?? [];
}

// Recent SEND timestamps (epoch ms) for a column=value within the last
// `sinceMs`, newest-first and capped, feeding the DURABLE OTP rate-limit. Every
// row here is a code that was actually emailed, so this count is shared across
// all Edge isolates (unlike the in-memory limiter). Returns [] on any query
// failure — fail-soft, with the in-memory limiter remaining the floor.
async function recentOtpTimestamps(
  col: "email" | "email_canon" | "ip",
  value: string,
  sinceMs: number,
  cap: number,
): Promise<number[]> {
  if (!value) return [];
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  const q = `/rest/v1/meeting_email_otps?select=created_at&${col}=eq.${encodeURIComponent(value)}` +
    `&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=${cap}`;
  const rows = await fetchRows<{ created_at: string }>(q);
  if (!rows) return [];
  return rows.map((r) => Date.parse(r.created_at)).filter((n) => Number.isFinite(n));
}

// ── request-code ──────────────────────────────────────────────────────────────
async function handleRequestCode(body: Record<string, unknown>, ip: string, origin: string | null): Promise<Response> {
  const email = normalizeEmail(body.email);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  // Generic success even on a bad email: never reveal validation/state to a
  // prober. We simply do no work.
  if (!isValidEmail(email)) return json({ ok: true }, 200, origin);

  // Canonical address for RATE-LIMIT KEYING (not for sending — we still mail the
  // raw normalized `email`). Collapses provider-equivalent aliases (Gmail +tag /
  // dot rotation, googlemail) into ONE bucket so the per-address caps can't be
  // defeated to email-bomb a single inbox via alias rotation.
  const emailCanon = canonicalizeEmail(email);

  // CHEAP PRE-FILTER — in-memory per-address limit (process-local). Sheds an
  // obvious flood on a hot isolate without touching the DB. NOT authoritative on
  // serverless (isolates don't share this Map); the durable gate below is. Keyed
  // on a fingerprint of the CANONICAL address so aliases collapse here too.
  const canonFp = await secretFingerprint(emailCanon);
  const perEmail = rateLimit(`mbk:req:${canonFp}`, 5, 15 * 60_000);
  if (!perEmail.allowed) {
    jlog({ at: "rate-limit", fn: "meeting-book", action: "request-code", email_fp: canonFp });
    return json({ ok: true }, 200, origin); // generic — don't leak the throttle
  }

  // DURABLE rate limit (AUTHORITATIVE; shared across all isolates via Postgres).
  // Pull this address's send history (24h) and this IP's (1h) from the OTP table
  // and let the pure evaluator decide. Denied → generic { ok:true } with NO email
  // and NO insert, so a flood costs neither a send nor a row. cap=40 > every
  // configured max, so the windowed counts are exact. fetchRows failure → [] →
  // fail-soft (the in-memory pre-filter above stays the floor). The per-address
  // count keys on email_canon so all aliases of one mailbox share a single bucket.
  const L = DEFAULT_OTP_RATE_LIMITS;
  const emailTimestamps = await recentOtpTimestamps("email_canon", emailCanon, L.emailDayMs, 40);
  const ipTimestamps = ip ? await recentOtpTimestamps("ip", ip, L.ipWindowMs, 40) : [];
  const decision = evaluateOtpRateLimit({ now: Date.now(), emailTimestamps, ipTimestamps });
  if (!decision.allowed) {
    jlog({ at: "rate-limit", fn: "meeting-book", action: "request-code", durable: true, reason: decision.reason, email_fp: canonFp });
    return json({ ok: true }, 200, origin); // outcome-blind — never leak the throttle
  }

  const code = genCode();
  const codeHash = await hashCode(code);
  // `email` stores the ORIGINAL normalized address (we send the code there);
  // `email_canon` stores the alias-collapsed key the durable per-address count
  // reads, so all aliases of one mailbox share a single rate-limit bucket.
  const inserted = await insertRow("meeting_email_otps", {
    email,
    email_canon: emailCanon,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    ip: ip || null,
  });

  // Send the code email — fully fail-soft and outcome-blind to the caller.
  if (inserted) {
    try {
      const cfg = await resolveCfgCached();
      await sendCustomerEmail(
        cfg,
        email,
        "קוד אימות לקביעת שיחת ייעוץ — Switchy AI",
        buildOtpEmailHtml({ code, name: name || undefined }),
      );
    } catch (e) {
      // never throw into the caller — log without the code/PII
      jlog({ at: "request-code", ok: false, error: String(e) });
    }
  }
  // Log WITHOUT the code or the raw email.
  jlog({ at: "request-code", email_fp: canonFp, inserted });
  return json({ ok: true }, 200, origin);
}

// ── verify-code ───────────────────────────────────────────────────────────────
async function handleVerifyCode(body: Record<string, unknown>, origin: string | null): Promise<Response> {
  const email = normalizeEmail(body.email);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const bad = { ok: false, error: "קוד לא תקין או שפג" };
  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) return json(bad, 200, origin);

  // Scan ALL unexpired, unconsumed codes for this address — not just the newest —
  // so a resend (which mints a fresh row) doesn't reject a code the user already
  // received and is still within its window. The pure evaluateOtpVerify decides;
  // we apply its side effects.
  const rows = await unconsumedOtps(email);
  const enteredHash = await hashCode(code);
  const outcome = evaluateOtpVerify(rows, enteredHash, Date.now(), MAX_VERIFY_ATTEMPTS);

  if (outcome.status === "no-live") return json(bad, 200, origin);
  if (outcome.status === "too-many") {
    return json({ ok: false, error: "יותר מדי ניסיונות" }, 200, origin);
  }
  if (outcome.status === "mismatch") {
    // Charge the attempt to the newest live row (bounds brute force).
    await patchCount(`/rest/v1/meeting_email_otps?id=eq.${encodeURIComponent(outcome.chargeId)}`, {
      attempts: outcome.nextAttempts,
    });
    return json({ ok: false, error: "קוד לא תקין" }, 200, origin);
  }
  // match → stamp verified_at on the row whose code matched (idempotent).
  await patchCount(`/rest/v1/meeting_email_otps?id=eq.${encodeURIComponent(outcome.matchedId)}`, {
    verified_at: new Date().toISOString(),
  });
  jlog({ at: "verify-code", ok: true });
  return json({ ok: true }, 200, origin);
}

// ── book ──────────────────────────────────────────────────────────────────────
// Map a Postgres `raise exception` message from meetings_guard to a friendly
// Hebrew message + HTTP status. Anything we don't recognize → generic 500.
function mapGuardError(raw: string): { error: string; status: number } {
  const m = raw.toLowerCase();
  if (m.includes("rate limit")) return { error: "יותר מדי בקשות. נסו שוב מאוחר יותר.", status: 429 };
  if (m.includes("already pending") || m.includes("meeting already")) {
    return { error: "כבר קיימת פגישה פתוחה למספר הזה.", status: 400 };
  }
  if (m.includes("saturday")) return { error: "לא ניתן לקבוע פגישה בשבת.", status: 400 };
  if (m.includes("one day ahead")) return { error: "יש לקבוע פגישה ליום אחד מראש לפחות.", status: 400 };
  if (m.includes("too far ahead")) return { error: "ניתן לקבוע פגישה עד 30 יום מראש.", status: 400 };
  if (m.includes("invalid slot")) return { error: "המועד שנבחר אינו זמין.", status: 400 };
  if (m.includes("invalid name")) return { error: "שם לא תקין.", status: 400 };
  if (m.includes("invalid phone")) return { error: "מספר טלפון לא תקין.", status: 400 };
  if (m.includes("provider not eligible")) return { error: "החברה שנבחרה אינה זמינה לפגישת ייעוץ.", status: 400 };
  return { error: "אירעה שגיאה בקביעת הפגישה. נסו שוב.", status: 500 };
}

// NOTE: the source IP is intentionally NOT passed/stamped here — meetings_guard
// reads it from request.headers itself (cf-connecting-ip / x-forwarded-for) and
// enforces the per-IP meeting rate limit server-side, the single source of truth.
async function handleBook(body: Record<string, unknown>, origin: string | null): Promise<Response> {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = normalizeEmail(body.email);
  const meetingDate = typeof body.meeting_date === "string" ? body.meeting_date.trim() : "";
  const slot = typeof body.slot === "string" ? body.slot.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 120) : "";
  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  const consent = body.consent === true;

  // Mandatory consent (Spam Law §30A + Privacy) — reject without it.
  if (!consent) {
    return json({ ok: false, error: "יש לאשר את תנאי השימוש ומדיניות הפרטיות" }, 400, origin);
  }
  if (!name || name.length < 2) return json({ ok: false, error: "שם מלא נדרש" }, 400, origin);
  if (!phone) return json({ ok: false, error: "מספר טלפון לא תקין" }, 400, origin);
  if (!isValidEmail(email)) return json({ ok: false, error: "כתובת מייל לא תקינה" }, 400, origin);
  // Provider gate: a meeting may only be booked for an eligible carrier — the SAME
  // seven the public.meetings_guard whitelist enforces. Reject early with a friendly
  // message instead of letting the trigger raise a generic error.
  if (!MEETING_PROVIDERS.includes(provider)) {
    return json({ ok: false, error: "נא לבחור חברה לפגישה מתוך הרשימה" }, 400, origin);
  }

  // EMAIL GATE: require a verified, unconsumed OTP for this address, fresh enough
  // that the verification is still trustworthy (< 30 min). Scan the SET (not just
  // the newest row) so the code the user actually verified — which may not be the
  // latest after a resend — is honored. unconsumedOtps already excludes consumed.
  const verifiedRow = (await unconsumedOtps(email)).find((r) =>
    !!r.verified_at && Date.parse(r.created_at) > Date.now() - BOOK_OTP_MAX_AGE_MS
  );
  if (!verifiedRow) {
    return json({ ok: false, error: "יש לאמת את המייל קודם" }, 400, origin);
  }

  // Schedule pre-check (mirrors meetings_guard). The trigger re-validates, but
  // a friendly early reject avoids a generic DB error for a bad grid/day.
  const slotCheck = validBookingSlot(meetingDate, slot, Date.now());
  if (!slotCheck.ok) {
    const mapped = mapGuardError(slotCheck.error);
    return json({ ok: false, error: mapped.error }, mapped.status, origin);
  }

  // Insert via service-role. status is OMITTED (the guard forces 'pending');
  // consent timestamps are non-null sentinels the guard re-stamps with now().
  const nowIso = new Date().toISOString();
  const ok = await insertRow("meetings", {
    name,
    phone,
    email,
    meeting_date: meetingDate,
    slot,
    provider,
    ...(category ? { notes: `שירות מבוקש: ${category}` } : {}),
    email_verified_at: nowIso,
    source: "site_book",
    terms_accepted_at: nowIso,
    privacy_accepted_at: nowIso,
  });

  if (!ok) {
    // insertRow swallows the PostgREST error body (returns false), so we can't
    // read the guard's exact message here — surface the generic guard mapping.
    // The most common rejections (rate limit / already pending) are still safe
    // generic messages; the slot pre-check above catches the schedule cases.
    jlog({ at: "book", ok: false });
    return json({ ok: false, error: "אירעה שגיאה בקביעת הפגישה. נסו שוב." }, 500, origin);
  }

  // Single-use: consume the verified OTP so it can't be replayed for another booking.
  await patchCount(`/rest/v1/meeting_email_otps?id=eq.${encodeURIComponent(verifiedRow.id)}`, {
    consumed_at: nowIso,
  });
  jlog({ at: "book", ok: true });
  return json({ ok: true }, 200, origin);
}

async function handle(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method === "GET") {
    return new Response("meeting-book: ok", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
    });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405, origin);
  }

  // Off-site browser POSTs are rejected; non-browser callers (no Origin) pass.
  if (!allowedOrigin(origin)) {
    return json({ ok: false, error: "forbidden origin" }, 403, origin);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch (_) {
    return json({ ok: false, error: "invalid JSON body" }, 400, origin);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const ip = clientIp(req);

  // Per-IP throttle on every action, in front of the per-email limit + DB gates.
  const limited = await ipLimited(action, ip, origin);
  if (limited) return limited;

  switch (action) {
    case "request-code":
      return await handleRequestCode(body, ip, origin);
    case "verify-code":
      return await handleVerifyCode(body, origin);
    case "book":
      return await handleBook(body, origin);
    default:
      return json({ ok: false, error: "unknown action" }, 400, origin);
  }
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is set). Any
// unexpected throw outside the fail-soft paths degrades to a 503 in the same
// { ok:false, error } shape — never a new status/body. captureError is not
// awaited and never throws.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "meeting-book", method: req.method });
    jlog({ at: "meeting-book", ok: false, error: String(e) });
    return json({ ok: false, error: "temporarily unavailable" }, 503, req.headers.get("origin"));
  }
});
