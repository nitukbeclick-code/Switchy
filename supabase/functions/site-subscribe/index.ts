import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

// Per-IP hourly cap by counting recent rows for this IP. Fail-OPEN on any
// infra hiccup (missing creds / query error) — never block a real signup
// because the counter read stumbled.
async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  const creds = serviceCreds();
  if (!creds) return false;
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  try {
    const r = await fetch(
      `${creds.url}/rest/v1/newsletter_subscribers?select=id&source_ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}`,
      { headers: { "apikey": creds.key, "Authorization": `Bearer ${creds.key}` } },
    );
    if (!r.ok) {
      jlog({ at: "site-subscribe.rateLimited", ok: false, status: r.status });
      return false; // fail open
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length >= PER_IP_HOURLY_LIMIT;
  } catch (e) {
    jlog({ at: "site-subscribe.rateLimited", ok: false, error: String(e) });
    return false; // fail open
  }
}

// Insert the subscriber. Returns:
//   "ok"        — inserted (or treated as already-subscribed on unique violation)
//   "error"     — service creds missing or an unexpected write failure
// PostgREST surfaces a unique-constraint violation as 409 (code 23505); we
// swallow it so re-subscribing is idempotent.
async function insertSubscriber(
  email: string,
  ip: string,
): Promise<"ok" | "error"> {
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
    if (r.ok) return "ok";
    // Unique violation → already subscribed → idempotent success.
    const text = await r.text().catch(() => "");
    if (r.status === 409 || text.includes("23505") || text.includes("duplicate")) {
      jlog({ at: "site-subscribe.insert", ok: true, already: true });
      return "ok";
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
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><body style="font-family:Arial,Helvetica,sans-serif;background:#F5F7F8;margin:0;padding:24px;color:#0B0F14">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #E5E7EB;border-radius:14px;padding:28px;text-align:right">
    <h1 style="font-size:22px;margin:0 0 12px">ברוכים הבאים ל-חוסך 🎉</h1>
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px">תודה שנרשמתם לניוזלטר שלנו!</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px">מעכשיו תקבלו עדכונים על המסלולים המשתלמים ביותר בסלולר, אינטרנט, טלוויזיה וחבילות לחו״ל — כדי שתמשיכו לחסוך בלי מאמץ.</p>
    <p style="font-size:14px;line-height:1.6;color:#6B7280;margin:16px 0 0">קיבלתם את המייל הזה כי נרשמתם באתר חוסך. אם זו טעות, אפשר פשוט להתעלם.</p>
  </div>
</body></html>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: WELCOME_SUBJECT, html }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
      jlog({ at: "site-subscribe.welcome", ok: false, status: r.status, error: j?.message ?? j?.name });
    }
  } catch (e) {
    jlog({ at: "site-subscribe.welcome", ok: false, error: String(e) });
  }
}

// Pragmatic RFC-ish email check: a single @, non-empty local/domain parts, at
// least one dot in the domain, no whitespace. Not a full RFC 5322 parser — just
// enough to reject obvious garbage before we store it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (await rateLimited(ip)) return json({ error: "בקשות רבות מדי, נסו שוב מאוחר יותר" }, 429);

  const result = await insertSubscriber(email, ip);
  if (result === "error") {
    return json({ error: "אירעה שגיאה, נסו שוב בעוד רגע" }, 502);
  }

  // Best-effort welcome email — never blocks or fails the (already recorded)
  // subscription.
  await sendWelcome(email);

  return json({ ok: true });
});
