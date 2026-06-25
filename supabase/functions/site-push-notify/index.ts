import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// site-push-notify — Switchy AI deal-feed Web Push sender
//
// Scheduled (pg_cron) edge fn that turns REAL price drops into browser/PWA push
// notifications. It reads the price ledger (public.plan_price_history) for
// material drops (>= ₪5 OR >= 10%), reads opted-in browser subscriptions
// (public.push_subscriptions), and sends an end-to-end-encrypted Web Push to
// each subscriber whose category prefs match — honoring opt-out, quiet hours
// (23:00–08:00 Israel), and per-(subscription,drop) dedupe.
//
//   GET  ?action=health  -> config/grant status (sources gated by webhook secret)
//   POST (webhook-secret) -> run a fan-out pass; { dryRun?: true } selects + counts
//                            without sending. Optional { windowMs } overrides the
//                            drop look-back.
//
// FAIL-SOFT, like notify-lead: if VAPID keys are absent the POST returns
// 503 "not configured" and sends nothing (the deal feed is simply dark until
// the owner sets the keys in env/Vault). Every DB call is fail-soft (null on
// error, never a throw). The webhook-secret gate is the auth; a post-auth
// in-memory rate-limit only sheds a runaway loop / leaked-secret flood.
//
// Deploy: supabase functions deploy site-push-notify --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { firstEnv, resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { rateLimit, secretFingerprint } from "../_shared/ratelimit.ts";
import { jlog } from "../_shared/log.ts";
import {
  buildPushMessage,
  detectDrops,
  dropDedupeKey,
  type PriceSnapshot,
  type Subscription,
  subscriptionWantsCategory,
} from "./deals.ts";
import { importVapidKeys, sendWebPush, type VapidKeys } from "./webpush.ts";

const enc = encodeURIComponent;

// ── config: VAPID keys + contact subject (env, Vault-extensible later) ────────
// VAPID public/private are raw base64url (public = 65-byte uncompressed point,
// private = 32-byte scalar). The subject is a mailto:/https: contact the push
// service can reach. All optional → the fn fails soft to "not configured".
interface PushCfg {
  vapidPublic: string;
  vapidPrivate: string;
  subject: string;
}

function resolvePushCfg(): PushCfg {
  return {
    vapidPublic: firstEnv(["VAPID_PUBLIC_KEY", "WEB_PUSH_PUBLIC_KEY", "VAPID_PUBLIC"]),
    vapidPrivate: firstEnv(["VAPID_PRIVATE_KEY", "WEB_PUSH_PRIVATE_KEY", "VAPID_PRIVATE"]),
    subject: firstEnv(["VAPID_SUBJECT", "WEB_PUSH_CONTACT"]) || "mailto:hello@switchy-ai.com",
  };
}

function pushConfigured(c: PushCfg): boolean {
  return !!c.vapidPublic && !!c.vapidPrivate;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      ...(extraHeaders ?? {}),
    },
  });
}

// ── post-auth rate limit (mirrors notify-lead / renewal-reminders) ───────────
const RL_LIMIT = 60; // authenticated runs per window (cron fires a few/hour)
const RL_WINDOW_MS = 60_000;
async function rateLimited(secret: string): Promise<Response | null> {
  const fp = await secretFingerprint(secret);
  const res = rateLimit(`site-push-notify:post:${fp}`, RL_LIMIT, RL_WINDOW_MS);
  if (res.allowed) return null;
  jlog({ at: "rate-limit", fn: "site-push-notify", secret_fp: fp, retry_after: res.retryAfterSec });
  return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(res.retryAfterSec) });
}

// ── DB reads ──────────────────────────────────────────────────────────────────
// Recent price snapshots, newest first; bounded so a huge ledger can't blow the
// edge wall-clock. detectDrops re-groups per plan and applies the window.
async function fetchRecentSnapshots(windowMs: number): Promise<PriceSnapshot[] | null> {
  const since = enc(new Date(Date.now() - windowMs).toISOString());
  return await fetchRows<PriceSnapshot>(
    `/rest/v1/plan_price_history?select=plan_id,category,provider,price,after,captured_at` +
      `&captured_at=gte.${since}&order=captured_at.desc&limit=2000`,
  );
}

// All active subscriptions. The prefs columns (opted_out/quiet_hours) come from
// the site-push-notify SQL extension; select is forgiving if they're absent yet
// (PostgREST returns the columns it has — we default the rest in code).
async function fetchSubscriptions(): Promise<Subscription[] | null> {
  const rows = await fetchRows<Record<string, unknown>>(
    `/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth,categories,opted_out,quiet_hours&limit=5000`,
  );
  if (rows === null) return null;
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    endpoint: String(r.endpoint ?? ""),
    p256dh: String(r.p256dh ?? ""),
    auth: String(r.auth ?? ""),
    categories: Array.isArray(r.categories) ? (r.categories as string[]) : [],
    opted_out: r.opted_out === true,
    quiet_hours: r.quiet_hours === true,
  })).filter((s) => s.id && s.endpoint && s.p256dh && s.auth);
}

// Dedupe: which (subscription, drop) keys did we already deliver? We read the
// recent delivery ledger and skip any key already present. Fail-soft: if the
// read fails we return null and the caller declines to send (so a DB blip can't
// cause a re-send storm).
async function fetchDeliveredKeys(windowMs: number): Promise<Set<string> | null> {
  const since = enc(new Date(Date.now() - windowMs).toISOString());
  const rows = await fetchRows<{ dedupe_key?: string }>(
    `/rest/v1/push_deliveries?select=dedupe_key&created_at=gte.${since}&limit=20000`,
  );
  if (rows === null) return null;
  return new Set(rows.map((r) => String(r.dedupe_key ?? "")).filter(Boolean));
}

// Record a successful delivery so the same drop isn't pushed again. Fail-soft.
async function recordDelivery(key: string, subId: string, planId: string): Promise<void> {
  await insertRow("push_deliveries", {
    dedupe_key: key,
    subscription_id: subId,
    plan_id: planId,
  });
}

// Prune a dead subscription (push service returned 404/410 = gone). Fail-soft.
async function pruneSubscription(subId: string): Promise<void> {
  try {
    await serviceFetch(`/rest/v1/push_subscriptions?id=eq.${enc(subId)}`, { method: "DELETE" });
  } catch (_) { /* the next run re-attempts and prunes */ }
}

// Service-role grant probe for the health endpoint (mirrors notify-lead).
async function tableGrantProbe(table: string): Promise<"ok" | "forbidden" | "error"> {
  try {
    const r = await serviceFetch(`/rest/v1/${table}?select=id&limit=1`, { method: "HEAD" });
    if (!r) return "error";
    if (r.ok) return "ok";
    if (r.status === 401 || r.status === 403) return "forbidden";
    return "error";
  } catch (_) {
    return "error";
  }
}

// ── the fan-out pass ─────────────────────────────────────────────────────────
interface RunResult {
  ok: boolean;
  error?: string;
  drops: number;
  candidates: number; // (subscription × drop) pairs that matched prefs and weren't deduped
  sent: number;
  failed: number;
  pruned: number;
  dryRun: boolean;
}

async function runPass(
  keys: VapidKeys,
  subject: string,
  windowMs: number,
  dryRun: boolean,
): Promise<RunResult> {
  const base: RunResult = {
    ok: false, drops: 0, candidates: 0, sent: 0, failed: 0, pruned: 0, dryRun,
  };

  const [snapshots, subs] = await Promise.all([
    fetchRecentSnapshots(windowMs),
    fetchSubscriptions(),
  ]);
  // A failed read must not read as "nothing to do" — bail without sending.
  if (snapshots === null) return { ...base, error: "price_history read failed" };
  if (subs === null) return { ...base, error: "subscriptions read failed" };

  const drops = detectDrops(snapshots, Date.now(), windowMs);
  base.drops = drops.length;
  if (drops.length === 0 || subs.length === 0) return { ...base, ok: true };

  const delivered = await fetchDeliveredKeys(windowMs);
  if (delivered === null) return { ...base, error: "delivery ledger read failed" };

  const now = Date.now();
  let candidates = 0, sent = 0, failed = 0, pruned = 0;

  for (const drop of drops) {
    for (const sub of subs) {
      if (!subscriptionWantsCategory(sub, drop.category, now)) continue;
      const key = dropDedupeKey(sub.id, drop);
      if (delivered.has(key)) continue;
      candidates++;
      if (dryRun) continue;

      const msg = buildPushMessage(drop);
      const payload = new TextEncoder().encode(JSON.stringify(msg));
      const outcome = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        keys,
        subject,
      );

      if (outcome.ok) {
        sent++;
        delivered.add(key); // guard against a duplicate drop in this same pass
        await recordDelivery(key, sub.id, drop.planId);
      } else if (outcome.expired) {
        pruned++;
        await pruneSubscription(sub.id);
      } else {
        failed++;
        jlog({ at: "push.send", ok: false, status: outcome.status, error: outcome.error });
      }
    }
  }

  return { ok: true, drops: drops.length, candidates, sent, failed, pruned, dryRun };
}

// ── HTTP ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  }

  const cfg = await resolveCfgCached(); // for the shared webhook secret
  const push = resolvePushCfg();

  if (req.method === "GET") {
    const action = new URL(req.url).searchParams.get("action");
    if (action === "health" || action === null) {
      // Ops detail (grant probes) only for the authed team — anonymous health is
      // a cheap config snapshot of booleans.
      const authed = !!cfg.webhookSecret &&
        (await safeEqual(req.headers.get("x-webhook-secret") ?? "", cfg.webhookSecret));
      const grants = authed
        ? {
          push_subscriptions: await tableGrantProbe("push_subscriptions"),
          plan_price_history: await tableGrantProbe("plan_price_history"),
          push_deliveries: await tableGrantProbe("push_deliveries"),
        }
        : undefined;
      return json({
        ok: true,
        function: "site-push-notify",
        configured: {
          vapid: pushConfigured(push),
          webhook_secret: !!cfg.webhookSecret,
        },
        ...(authed ? { table_grants: grants } : {}),
      });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // Read the POST body ONCE — both the public subscribe path and the secret-gated
  // fan-out path below need it, and req.json() can only be consumed a single time.
  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body = full run */ }

  // ── Public subscribe / unsubscribe (NO webhook secret) ──────────────────────
  // This is how a browser/PWA registers its Web-Push subscription — without this
  // branch the deal-feed sender has no audience. Validated + rate-limited by an
  // endpoint fingerprint so it can't be abused to flood the table; the row is
  // upserted by the UNIQUE endpoint so re-subscribing is idempotent.
  const action = typeof payload.action === "string" ? payload.action : "";
  if (action === "subscribe" || action === "unsubscribe") {
    const sub = (payload.subscription ?? {}) as Record<string, unknown>;
    const endpoint = typeof sub.endpoint === "string" ? sub.endpoint : "";
    if (!endpoint.startsWith("https://") || endpoint.length > 1000) {
      return json({ ok: false, error: "invalid subscription" }, 400);
    }
    const fp = await secretFingerprint(endpoint);
    const rl = rateLimit(`site-push-notify:sub:${fp}`, 20, 60_000);
    if (!rl.allowed) {
      return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(rl.retryAfterSec) });
    }
    if (action === "unsubscribe") {
      try {
        await serviceFetch(`/rest/v1/push_subscriptions?endpoint=eq.${enc(endpoint)}`, { method: "DELETE" });
      } catch (_) { /* fail-soft; dead endpoints are pruned on the next run anyway */ }
      return json({ ok: true, unsubscribed: true });
    }
    // subscribe: require the encryption keys + persist the opted-in subscription.
    const keys = (sub.keys ?? {}) as Record<string, unknown>;
    const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
    const auth = typeof keys.auth === "string" ? keys.auth : "";
    if (!p256dh || !auth) return json({ ok: false, error: "invalid keys" }, 400);
    const allowedCats = new Set(["cellular", "internet", "tv", "triple", "abroad"]);
    const categories = Array.isArray(payload.categories)
      ? (payload.categories as unknown[])
          .filter((c): c is string => typeof c === "string" && allowedCats.has(c))
          .slice(0, 5)
      : [];
    try {
      const r = await serviceFetch(`/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ endpoint, p256dh, auth, categories, opted_out: false }),
      });
      if (!r || !r.ok) {
        jlog({ at: "push.subscribe", ok: false, status: r?.status });
        return json({ ok: false, error: "store failed" }, 503);
      }
    } catch (e) {
      jlog({ at: "push.subscribe", ok: false, error: String(e) });
      return json({ ok: false, error: "store failed" }, 503);
    }
    return json({ ok: true, subscribed: true });
  }

  // ── Secret-gated fan-out runner (cron) ──────────────────────────────────────
  // Auth: shared webhook secret (constant-time), fail-closed when unset.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  // Authenticated → throttle (sheds only a runaway loop / leaked-secret flood).
  const limited = await rateLimited(cfg.webhookSecret);
  if (limited) return limited;

  // Fail-soft "not configured" when the VAPID keys aren't set (like notify-lead).
  if (!pushConfigured(push)) {
    return json({ ok: false, error: "web push not configured" }, 503);
  }

  const dryRun = payload.dryRun === true;
  const windowMs = typeof payload.windowMs === "number" && payload.windowMs > 0
    ? Math.min(payload.windowMs, 30 * 24 * 60 * 60 * 1000) // cap look-back at 30d
    : 7 * 24 * 60 * 60 * 1000;

  let keys: VapidKeys;
  try {
    keys = await importVapidKeys(push.vapidPublic, push.vapidPrivate);
  } catch (e) {
    // Misformatted keys are an ops misconfiguration → treat as not configured.
    jlog({ at: "vapid.import", ok: false, error: String(e) });
    return json({ ok: false, error: "web push key invalid" }, 503);
  }

  const result = await runPass(keys, push.subject, windowMs, dryRun);
  const status = result.ok ? 200 : 500;
  return json(result, status);
});
