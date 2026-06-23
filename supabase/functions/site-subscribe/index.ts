import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { EMAIL_RE, type InsertResult, shouldWelcome } from "./lib.ts";
import { listUnsubscribeHeader, unsubscribeUrlFor, welcomeEmail } from "../_shared/email.ts";

// ─────────────────────────────────────────────────────────────────────────────
// site-subscribe — newsletter signup for the חוסך marketing site.
//
// Public endpoint behind the "הרשמה לניוזלטר" form. Records the subscriber in
// `newsletter_subscribers` (service role) and sends a short Hebrew welcome
// email via Resend. Idempotent: re-subscribing an existing address is a no-op
// success, and a failed/disabled email never fails the subscription.
//
// POST { email: string, consent: true } -> { ok: true }
//
// Deploy: supabase functions deploy site-subscribe --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

const PER_IP_HOURLY_LIMIT = 10;
const MAX_EMAIL_LEN = 254; // RFC 5321 max address length
const DEFAULT_FROM = "חוסך <noreply@switchy-ai.com>";
const WELCOME_SUBJECT = "ברוכים הבאים ל-חוסך";

// ── logging ──────────────────────────────────────────────────────────────────
// One JSON line per event so the Supabase log explorer can filter on fields
// (mirrors _shared/log.ts jlog).
function jlog(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
  } catch (_) {
    console.log(String(fields.at ?? "log"), String(fields.error ?? ""));
  }
}

// ── CORS ─────────────────────────────────────────────────────────────────────
function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// ── service-role PostgREST ───────────────────────────────────────────────────
function serviceCreds(): { url: string; key: string } | null {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return { url, key };
}

// ── client IP ────────────────────────────────────────────────────────────────
// Same trust order as site-ai-chat: CDN-set header first, then the last
// (infra-appended) X-Forwarded-For hop — never the spoofable first hop.
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

// Per-IP hourly cap by counting recent rows for this IP. Tri-state:
//   true  = limited (429), false = ok, null = DB error.
// On a DB query error we FAIL-CLOSED (null → 503): this endpoint triggers a paid
// Resend send, so a Supabase outage must not turn it into an unmetered mailer.
// Only the "no IP" / "not configured" cases stay fail-open.
async function rateLimited(ip: string): Promise<boolean | null> {
  if (!ip) return false; // can't limit without an IP — fail-open
  const creds = serviceCreds();
  if (!creds) return false; // not configured ⇒ fail open
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  try {
    const r = await fetch(
      `${creds.url}/rest/v1/newsletter_subscribers?select=id&source_ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`,
      { headers: { "apikey": creds.key, "Authorization": `Bearer ${creds.key}` } },
    );
    if (!r.ok) {
      jlog({ at: "site-subscribe.rateLimited", ok: false, status: r.status });
      return null; // query failed ⇒ fail CLOSED (caller returns 503)
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length >= PER_IP_HOURLY_LIMIT;
  } catch (e) {
    jlog({ at: "site-subscribe.rateLimited", ok: false, error: String(e) });
    return null; // infra hiccup ⇒ fail CLOSED (caller returns 503)
  }
}

const FRIENDLY_BUSY = "שירות עמוס כרגע, נסו שוב בעוד רגע";

// Insert the subscriber. Returns a tri-state so the caller can decide whether
// to send the welcome email:
//   "inserted" — a brand-new row was created (→ send welcome)
//   "exists"   — already subscribed (unique violation, idempotent) (→ NO welcome)
//   "error"    — service creds missing or an unexpected write failure
// PostgREST surfaces a unique-constraint violation as 409 (code 23505); we
// swallow it so re-subscribing is idempotent — but we DON'T re-welcome, which
// would burn a paid Resend send every time the same person re-submits the form.
async function insertSubscriber(
  email: string,
  ip: string,
): Promise<InsertResult> {
  const creds = serviceCreds();
  if (!creds) {
    jlog({ at: "site-subscribe.insert", ok: false, error: "service creds missing" });
    return "error";
  }
  try {
    const r = await fetch(`${creds.url}/rest/v1/newsletter_subscribers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": creds.key,
        "Authorization": `Bearer ${creds.key}`,
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        email,
        consent: true,
        source: "site",
        source_ip: ip || null,
      }),
    });
    if (r.ok) return "inserted";
    // Unique violation → already subscribed → idempotent success, but skip the
    // welcome email (they already got one when they first signed up).
    const text = await r.text().catch(() => "");
    if (r.status === 409 || text.includes("23505") || text.includes("duplicate")) {
      jlog({ at: "site-subscribe.insert", ok: true, already: true });
      return "exists";
    }
    jlog({ at: "site-subscribe.insert", ok: false, status: r.status });
    return "error";
  } catch (e) {
    jlog({ at: "site-subscribe.insert", ok: false, error: String(e) });
    return "error";
  }
}

// Short Hebrew welcome email via Resend. Fail-soft: a missing key or a send
// error is logged and swallowed — the subscription has already been recorded.
async function sendWelcome(email: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!apiKey) {
    jlog({ at: "site-subscribe.welcome", ok: false, error: "RESEND_API_KEY missing" });
    return;
  }
  const from = Deno.env.get("RESEND_FROM") || DEFAULT_FROM;
  // Branded, email-client-safe welcome built by the shared template system
  // (_shared/email.ts): table layout + inline styles, RTL Hebrew, green CTA,
  // and a §30A footer carrying a working unsubscribe link.
  const unsubscribe = unsubscribeUrlFor(email);
  const html = welcomeEmail({ unsubscribeUrl: unsubscribe });
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // List-Unsubscribe / -Post let Gmail & Apple Mail surface a native
      // one-tap unsubscribe (Spam-Law §30A + good deliverability).
      body: JSON.stringify({
        from,
        to: [email],
        subject: WELCOME_SUBJECT,
        html,
        headers: {
          "List-Unsubscribe": listUnsubscribeHeader(email),
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
      jlog({ at: "site-subscribe.welcome", ok: false, status: r.status, error: j?.message ?? j?.name });
    }
  } catch (e) {
    jlog({ at: "site-subscribe.welcome", ok: false, error: String(e) });
  }
}

// EMAIL_RE / shouldWelcome are imported from ./lib.ts (the single source of
// truth for the email shape + the no-re-welcome rule) so they can be unit-tested
// without booting this Deno.serve entrypoint.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { email?: unknown; consent?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "בקשה לא תקינה" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return json({ error: "כתובת אימייל לא תקינה" }, 400);
  }
  if (body.consent !== true) {
    return json({ error: "יש לאשר את ההסכמה לקבלת דיוור" }, 400);
  }

  const ip = clientIp(req);
  const limited = await rateLimited(ip);
  if (limited === null) return json({ error: FRIENDLY_BUSY }, 503);
  if (limited) return json({ error: "בקשות רבות מדי, נסו שוב מאוחר יותר" }, 429);

  const result = await insertSubscriber(email, ip);
  if (result === "error") {
    return json({ error: "אירעה שגיאה, נסו שוב בעוד רגע" }, 502);
  }

  // Best-effort welcome email — never blocks or fails the (already recorded)
  // subscription. Only for a genuinely new subscriber: re-submitting an
  // existing address is an idempotent success but must NOT re-welcome (it would
  // burn a paid Resend send on every duplicate form post).
  if (shouldWelcome(result)) {
    await sendWelcome(email);
  } else {
    jlog({ at: "site-subscribe", ok: true, already: true, welcomed: false });
  }

  return json({ ok: true });
});
