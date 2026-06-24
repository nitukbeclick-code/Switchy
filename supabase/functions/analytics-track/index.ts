import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// analytics-track — product-funnel event sink for the Switchy AI app + site.
//
// Public, fire-and-forget endpoint. Accepts a single funnel event and appends a
// row to `analytics_events` via the service role (see _shared/db.ts insertRow).
// It never echoes data back — the only success body is `{ ok: true }` — so it
// can't be turned into a read oracle for the table.
//
// POST { event: string, props?: object, ts?: number } -> { ok: true }
//
// Deploy: supabase functions deploy analytics-track --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, insertRow } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { clientIp, isAllowedEvent, sanitizeProps } from "./lib.ts";

// Light abuse cap: an analytics beacon is high-volume by nature, but one IP
// hammering thousands of rows/hour is junk. Counts recent rows for the IP.
const PER_IP_HOURLY_LIMIT = 600;

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...extra };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// Per-IP hourly cap. Tri-state: true = limited, false = ok, null = DB error.
// Analytics is non-critical, so on a DB hiccup we FAIL-OPEN (treat as ok) — a
// dropped beacon must never surface as a user-visible error.
async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false; // can't limit without an IP — fail open
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const rows = await fetchRows(
    `/rest/v1/analytics_events?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}&limit=${PER_IP_HOURLY_LIMIT}`,
  );
  if (rows === null) return false; // query failed ⇒ fail open (non-critical)
  return rows.length >= PER_IP_HOURLY_LIMIT;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { event?: unknown; props?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "bad request" }, 400);
  }

  const event = String(body.event ?? "").trim();
  if (!isAllowedEvent(event)) {
    return json({ error: "unknown event" }, 400);
  }

  const ip = clientIp(req);
  if (await rateLimited(ip)) return json({ error: "too many requests" }, 429);

  // Best-effort insert; a write failure is logged but still returns ok so the
  // client's fire-and-forget beacon never sees an error it can't act on.
  const ok = await insertRow("analytics_events", {
    event,
    props: sanitizeProps(body.props),
    ip: ip || null,
  });
  if (!ok) jlog({ at: "analytics-track.insert", ok: false, event });

  // Never echo back any stored/derived data.
  return json({ ok: true });
});
