// ────────────────────────────────────────────────────────────────────────────
// POST /api/push — proxy a web-push (un)subscription to the backend store.
//
// The browser mints an opaque PushSubscription (endpoint + p256dh/auth keys). We
// forward it to the Supabase edge function `site-push-notify`, which persists it
// (service role) so the backend can later send price-drop / renewal pushes. This
// thin proxy exists so the browser never needs the function's URL or any secret,
// and so the SAME origin allow-list + posture as /api/lead applies.
//
// FAIL-SOFT: push is a progressive enhancement. If the backend URL is not
// configured, we return 503 ("not configured") and the client UI simply keeps
// push toggled off — prices/leads/chat are unaffected. We never throw.
//
// PRIVACY: the payload is the opaque subscription only — NO PII. The endpoint is
// minted by the user's browser push service; storing it lets us push to that
// device until they unsubscribe.
// ────────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";

// Anon key is safe to send from the server to invoke the (no-verify-jwt) function;
// the function itself uses the service role internally. If unset, we still attempt
// the call (the function is deployed --no-verify-jwt) but fail soft on any error.
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY;

// The backend push-store function name (Supabase edge function). Overridable via
// env for a different deployment, defaults to the agreed name.
const PUSH_FN =
  process.env.SITE_PUSH_NOTIFY_FN ?? "site-push-notify";

// Origin allow-list — identical posture to /api/lead and /api/rights. Block
// off-site / CSRF browser POSTs; requests with NO Origin (non-browser callers)
// pass through to the backend's own gates.
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

function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers: backend gates still apply
  return ALLOWED_ORIGINS.has(origin);
}

interface PushBody {
  action?: unknown; // "subscribe" | "unsubscribe"
  subscription?: unknown; // serialized PushSubscription { endpoint, keys }
}

/** Minimal shape check — a real PushSubscription has a string https endpoint. */
function isPlausibleSubscription(v: unknown): v is { endpoint: string } {
  if (!v || typeof v !== "object") return false;
  const endpoint = (v as { endpoint?: unknown }).endpoint;
  return typeof endpoint === "string" && /^https:\/\//.test(endpoint);
}

export async function POST(req: Request) {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ ok: false, error: "forbidden origin" }, { status: 403 });
  }

  // ── Parse + validate ───────────────────────────────────────────────────────
  let body: PushBody;
  try {
    body = (await req.json()) as PushBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const action = body.action === "unsubscribe" ? "unsubscribe" : "subscribe";
  if (!isPlausibleSubscription(body.subscription)) {
    return Response.json({ ok: false, error: "invalid subscription" }, { status: 400 });
  }

  // ── Forward to the backend store (site-push-notify) ────────────────────────
  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${PUSH_FN}`;

  // A short timeout so a slow/unreachable backend can't hang the request. Push is
  // best-effort; we'd rather report a soft failure than block the user.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (SUPABASE_ANON_KEY) {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ action, subscription: body.subscription }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // 404/501 ⇒ the function isn't deployed yet: treat as "not configured" so
      // the client toggles push off gracefully rather than showing a hard error.
      if (res.status === 404 || res.status === 501) {
        return Response.json(
          { ok: false, error: "push not configured" },
          { status: 503 },
        );
      }
      return Response.json(
        { ok: false, error: "push store unavailable" },
        { status: 502 },
      );
    }

    return Response.json({ ok: true });
  } catch {
    // Network error / timeout / unset backend — fail soft.
    return Response.json(
      { ok: false, error: "push not configured" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timer);
  }
}
