import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// savings-watch — חוסך Proactive Savings Watcher (Communications Law §30A)
//
// Scheduled (pg_cron) edge fn that turns REAL, grounded saving opportunities into
// proactive alerts to users who explicitly opted in to watch a plan. For each
// public.tracked_plans row with watch_opt_in = true it looks for either:
//   (A) a real price DROP for the exact tracked plan in plan_price_history, OR
//   (B) a catalogue plan that genuinely BEATS what the user pays today (market
//       rate — never a promise).
// If — and only if — a material saving exists, and the user is not on the
// marketing_suppression list for the channel, and we're OUTSIDE quiet hours
// (23:00–08:00 Israel), and we haven't already alerted this exact opportunity,
// it sends a Web Push and/or a WhatsApp text quoting the real figures.
//
//   GET  ?action=health  -> config/grant status (grant probes gated by the secret)
//   POST (x-webhook-secret) -> run a pass; { dryRun?: true } selects + counts but
//                              sends nothing. Optional { windowMs } drop look-back.
//
// FAIL-SOFT (mirrors site-push-notify / renewal-reminders): every DB read returns
// null on error (never "nothing to do"); a failed read aborts the pass instead of
// blasting. The x-webhook-secret gate is the auth; a post-auth in-memory rate
// limit only sheds a runaway loop. Web Push needs VAPID keys (else that channel is
// dark); WhatsApp needs WHATSAPP_TOKEN (else that channel is dark) — each degrades
// independently, the pass still runs the other channel.
//
// COMPLIANCE §30A — a proactive alert is marketing, gated in this order:
//   1. consent     — only watch_opt_in = true rows are fetched;
//   2. suppression — skip a channel the contact opted out of (marketing_suppression);
//   3. quiet hours — never 23:00–08:00 Israel (unless dryRun, which never sends);
//   4. dedupe      — the savings_watch_alerts ledger blocks a re-alert.
//
// Deploy: supabase functions deploy savings-watch --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { firstEnv } from "../_shared/config.ts";
import { rateLimit, secretFingerprint } from "../_shared/ratelimit.ts";
import { jlog } from "../_shared/log.ts";
import { type Plan, plansFromRows } from "../_shared/catalogue.ts";
import { sendText as sendWhatsapp } from "../_shared/whatsapp.ts";
import { importVapidKeys, sendWebPush, type VapidKeys } from "../site-push-notify/webpush.ts";
import {
  buildWatchAlert,
  eligibleChannels,
  inQuietHours,
  type Opportunity,
  opportunityDedupeKey,
  opportunityForTracked,
  latestPriceByPlan,
  type PriceSnapshot,
  type TrackedPlan,
  type WatchContact,
} from "./lib.ts";

const enc = encodeURIComponent;

// ── config: VAPID keys + contact subject (env, Vault-extensible) ──────────────
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
function whatsappConfigured(): boolean {
  return !!firstEnv(["WHATSAPP_TOKEN"]);
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

// ── post-auth rate limit (mirrors site-push-notify / renewal-reminders) ───────
const RL_LIMIT = 60;
const RL_WINDOW_MS = 60_000;
async function rateLimited(secret: string): Promise<Response | null> {
  const fp = await secretFingerprint(secret);
  const res = rateLimit(`savings-watch:post:${fp}`, RL_LIMIT, RL_WINDOW_MS);
  if (res.allowed) return null;
  jlog({ at: "rate-limit", fn: "savings-watch", secret_fp: fp, retry_after: res.retryAfterSec });
  return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(res.retryAfterSec) });
}

// ── DB reads (all fail-soft: null on error) ───────────────────────────────────

// Opted-in tracked plans only (§30A consent gate #1). Filtered on watch_opt_in;
// the SELECT 400s (→ null) until the migration adds the column, so the whole fn
// is a logged no-op pre-migration — never a throw, never a blast.
async function fetchWatchedPlans(): Promise<TrackedPlan[] | null> {
  const rows = await fetchRows<Record<string, unknown>>(
    `/rest/v1/tracked_plans?select=id,user_id,plan_id,category,provider,plan_name,monthly_price` +
      `&watch_opt_in=is.true&limit=5000`,
  );
  if (rows === null) return null;
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    user_id: String(r.user_id ?? ""),
    plan_id: r.plan_id == null ? null : String(r.plan_id),
    category: String(r.category ?? ""),
    provider: String(r.provider ?? ""),
    plan_name: String(r.plan_name ?? ""),
    monthly_price: Number(r.monthly_price ?? 0),
  })).filter((t) => t.id && t.user_id && t.category && t.monthly_price > 0);
}

// Recent price snapshots, bounded; latestPriceByPlan re-groups to newest-per-plan.
async function fetchRecentSnapshots(windowMs: number): Promise<PriceSnapshot[] | null> {
  const since = enc(new Date(Date.now() - windowMs).toISOString());
  return await fetchRows<PriceSnapshot>(
    `/rest/v1/plan_price_history?select=plan_id,price,captured_at` +
      `&captured_at=gte.${since}&order=captured_at.desc&limit=4000`,
  );
}

// Live catalogue (same read shape as the WhatsApp bot) for the better_plan signal.
async function fetchCatalogue(): Promise<Plan[] | null> {
  const rows = await fetchRows<Record<string, unknown>>(
    "/rest/v1/plans?select=id,provider,category,price,price_unit,specs,subtitle,kind,title&limit=2000",
  );
  if (rows === null) return null;
  return plansFromRows(rows);
}

// Phone per user (for WhatsApp), from profiles. id = auth user id = tracked.user_id.
async function fetchPhones(userIds: string[]): Promise<Map<string, string> | null> {
  if (userIds.length === 0) return new Map();
  const inList = userIds.map((u) => enc(u)).join(",");
  const rows = await fetchRows<{ id?: string; phone?: string | null }>(
    `/rest/v1/profiles?select=id,phone&id=in.(${inList})&limit=5000`,
  );
  if (rows === null) return null;
  const out = new Map<string, string>();
  for (const r of rows) {
    const id = String(r.id ?? "");
    const phone = String(r.phone ?? "").trim();
    if (id && phone) out.set(id, phone);
  }
  return out;
}

// Web-Push subscription per user (first non-muted one). Honors the deal-feed's
// opted_out mute. user_id null rows (anon PWA) carry no tracked plan, so ignored.
interface PushRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
async function fetchPushByUser(userIds: string[]): Promise<Map<string, PushRow> | null> {
  if (userIds.length === 0) return new Map();
  const inList = userIds.map((u) => enc(u)).join(",");
  const rows = await fetchRows<Record<string, unknown>>(
    `/rest/v1/push_subscriptions?select=user_id,endpoint,p256dh,auth,opted_out` +
      `&user_id=in.(${inList})&limit=5000`,
  );
  if (rows === null) return null;
  const out = new Map<string, PushRow>();
  for (const r of rows) {
    if (r.opted_out === true) continue; // hard mute (deal-feed pref)
    const uid = String(r.user_id ?? "");
    const endpoint = String(r.endpoint ?? "");
    const p256dh = String(r.p256dh ?? "");
    const auth = String(r.auth ?? "");
    if (!uid || !endpoint || !p256dh || !auth) continue;
    if (!out.has(uid)) out.set(uid, { user_id: uid, endpoint, p256dh, auth });
  }
  return out;
}

// The set of phones suppressed for WhatsApp (§30A opt-out registry). Fail-soft:
// null aborts the pass — a DB blip must NOT let us message a suppressed contact.
async function fetchWhatsappSuppression(): Promise<Set<string> | null> {
  const rows = await fetchRows<{ contact?: string }>(
    `/rest/v1/marketing_suppression?select=contact&channel=eq.whatsapp&limit=20000`,
  );
  if (rows === null) return null;
  return new Set(rows.map((r) => normPhone(String(r.contact ?? ""))).filter(Boolean));
}

// Which opportunity dedupe keys did we already alert? Skip any already present.
// Fail-soft: null aborts (a read failure must not cause a re-alert storm).
async function fetchAlertedKeys(windowMs: number): Promise<Set<string> | null> {
  const since = enc(new Date(Date.now() - windowMs).toISOString());
  const rows = await fetchRows<{ dedupe_key?: string }>(
    `/rest/v1/savings_watch_alerts?select=dedupe_key&created_at=gte.${since}&limit=20000`,
  );
  if (rows === null) return null;
  return new Set(rows.map((r) => String(r.dedupe_key ?? "")).filter(Boolean));
}

// Record an alert so the same opportunity isn't re-sent. Fail-soft.
async function recordAlert(key: string, op: Opportunity, channels: string[]): Promise<void> {
  await insertRow("savings_watch_alerts", {
    dedupe_key: key,
    tracked_id: op.trackedId,
    user_id: op.userId,
    source: op.source,
    channels: channels.join(","),
    monthly_saving: op.monthlySaving,
  });
}

// Prune a dead push subscription (404/410 = gone). Fail-soft.
async function prunePush(endpoint: string): Promise<void> {
  try {
    await serviceFetch(`/rest/v1/push_subscriptions?endpoint=eq.${enc(endpoint)}`, { method: "DELETE" });
  } catch (_) { /* the next run re-attempts */ }
}

// Normalise a phone for suppression comparison (digits only — the leads table
// uses the same normalization for its per-phone cap).
function normPhone(p: string): string {
  return (p ?? "").replace(/\D/g, "");
}

// Service-role grant probe for the health endpoint.
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

// ── the fan-out pass ──────────────────────────────────────────────────────────
interface RunResult {
  ok: boolean;
  error?: string;
  watched: number; // opted-in tracked plans considered
  opportunities: number; // tracked plans with a real saving
  candidates: number; // (opportunity × eligible channel) pairs not deduped
  sentPush: number;
  sentWhatsapp: number;
  failed: number;
  pruned: number;
  suppressed: number; // opportunities skipped purely by suppression
  quietHoursSkipped: number; // opportunities held back by quiet hours
  dryRun: boolean;
}

async function runPass(
  push: PushCfg,
  windowMs: number,
  dryRun: boolean,
): Promise<RunResult> {
  const base: RunResult = {
    ok: false, watched: 0, opportunities: 0, candidates: 0, sentPush: 0, sentWhatsapp: 0,
    failed: 0, pruned: 0, suppressed: 0, quietHoursSkipped: 0, dryRun,
  };

  const watched = await fetchWatchedPlans();
  if (watched === null) {
    // pre-migration (no watch_opt_in column) or transient → logged no-op, not a throw
    jlog({ at: "savings-watch", ok: true, note: "watched query unavailable (pre-migration?)" });
    return { ...base, ok: true };
  }
  base.watched = watched.length;
  if (watched.length === 0) return { ...base, ok: true };

  const userIds = [...new Set(watched.map((t) => t.user_id))];
  const [snapshots, catalogue, phones, pushByUser, suppressed, alerted] = await Promise.all([
    fetchRecentSnapshots(windowMs),
    fetchCatalogue(),
    fetchPhones(userIds),
    fetchPushByUser(userIds),
    fetchWhatsappSuppression(),
    fetchAlertedKeys(windowMs),
  ]);
  // A failed read must not read as "nothing to do" — abort without sending.
  if (snapshots === null) return { ...base, error: "price_history read failed" };
  if (catalogue === null) return { ...base, error: "catalogue read failed" };
  if (phones === null) return { ...base, error: "profiles read failed" };
  if (pushByUser === null) return { ...base, error: "push_subscriptions read failed" };
  if (suppressed === null) return { ...base, error: "suppression read failed" };
  if (alerted === null) return { ...base, error: "alert ledger read failed" };

  const latestByPlan = latestPriceByPlan(snapshots);
  const quiet = inQuietHours();

  // VAPID keys: imported once. If absent/invalid the push channel is simply dark
  // (WhatsApp can still run); we DON'T abort the whole pass for it.
  let vapid: VapidKeys | null = null;
  if (pushConfigured(push)) {
    try {
      vapid = await importVapidKeys(push.vapidPublic, push.vapidPrivate);
    } catch (e) {
      jlog({ at: "vapid.import", ok: false, error: String(e) });
      vapid = null;
    }
  }

  let opportunities = 0, candidates = 0, sentPush = 0, sentWhatsapp = 0;
  let failed = 0, pruned = 0, suppressedCount = 0, quietHoursSkipped = 0;

  for (const tracked of watched) {
    const op = opportunityForTracked(tracked, latestByPlan, catalogue);
    if (!op) continue;
    opportunities++;

    const key = opportunityDedupeKey(op);
    if (alerted.has(key)) continue; // already alerted this exact opportunity

    // Assemble the contact + per-channel eligibility (reachability + suppression).
    const phone = phones.get(tracked.user_id) ?? null;
    const pushRow = pushByUser.get(tracked.user_id) ?? null;
    const contact: WatchContact = {
      userId: tracked.user_id,
      phone,
      push: pushRow ? { endpoint: pushRow.endpoint, p256dh: pushRow.p256dh, auth: pushRow.auth } : null,
      suppressedWhatsapp: phone ? suppressed.has(normPhone(phone)) : true,
      suppressedPush: false, // muted push rows were already excluded in fetchPushByUser
    };
    const elig = eligibleChannels(contact);
    // Push needs working VAPID keys too — fold that into eligibility here.
    const canPush = elig.push && !!vapid;
    const canWhatsapp = elig.whatsapp;

    if (!canPush && !canWhatsapp) {
      // No reachable, non-suppressed channel. If there WAS a phone but it's
      // suppressed (and no push), count it as a suppression skip for visibility.
      if (phone && contact.suppressedWhatsapp && !elig.push) suppressedCount++;
      continue;
    }

    // Quiet hours apply to the actual send (not dry-run counting). Outside dry-run
    // we hold the alert until the next out-of-quiet pass (no dedupe row written).
    if (quiet && !dryRun) {
      quietHoursSkipped++;
      continue;
    }

    candidates++;
    if (dryRun) continue;

    const alert = buildWatchAlert(op);
    const channelsSent: string[] = [];

    // Web Push (encrypted) — prune a dead endpoint, soft-fail otherwise.
    if (canPush && vapid && pushRow) {
      const payload = new TextEncoder().encode(JSON.stringify({
        title: alert.title,
        body: alert.body,
        data: { url: alert.url, trackedId: op.trackedId, source: op.source },
      }));
      const outcome = await sendWebPush(
        { endpoint: pushRow.endpoint, p256dh: pushRow.p256dh, auth: pushRow.auth },
        payload,
        vapid,
        push.subject,
      );
      if (outcome.ok) {
        sentPush++;
        channelsSent.push("push");
      } else if (outcome.expired) {
        pruned++;
        await prunePush(pushRow.endpoint);
      } else {
        failed++;
        jlog({ at: "watch.push", ok: false, status: outcome.status, error: outcome.error });
      }
    }

    // WhatsApp — only to a non-suppressed phone (already gated by canWhatsapp).
    if (canWhatsapp && phone) {
      const wamid = await sendWhatsapp(phone, `${alert.title}\n\n${alert.body}\n\n${alert.url}`);
      if (wamid) {
        sentWhatsapp++;
        channelsSent.push("whatsapp");
      } else {
        failed++;
      }
    }

    // Record the alert ONLY if at least one channel landed — so a transient send
    // failure is retried on the next pass instead of being silently deduped away.
    if (channelsSent.length > 0) {
      alerted.add(key); // guard a duplicate opportunity within this same pass
      await recordAlert(key, op, channelsSent);
    }
  }

  return {
    ok: true,
    watched: watched.length,
    opportunities,
    candidates,
    sentPush,
    sentWhatsapp,
    failed,
    pruned,
    suppressed: suppressedCount,
    quietHoursSkipped,
    dryRun,
  };
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

  const cfg = await resolveCfgCached();
  const push = resolvePushCfg();

  if (req.method === "GET") {
    const action = new URL(req.url).searchParams.get("action");
    if (action === "health" || action === null) {
      const authed = !!cfg.webhookSecret &&
        (await safeEqual(req.headers.get("x-webhook-secret") ?? "", cfg.webhookSecret));
      const grants = authed
        ? {
          tracked_plans: await tableGrantProbe("tracked_plans"),
          plan_price_history: await tableGrantProbe("plan_price_history"),
          marketing_suppression: await tableGrantProbe("marketing_suppression"),
          savings_watch_alerts: await tableGrantProbe("savings_watch_alerts"),
        }
        : undefined;
      return json({
        ok: true,
        function: "savings-watch",
        configured: {
          vapid: pushConfigured(push),
          whatsapp: whatsappConfigured(),
          webhook_secret: !!cfg.webhookSecret,
        },
        quiet_hours_now: inQuietHours(),
        ...(authed ? { table_grants: grants } : {}),
      });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // Auth: shared webhook secret (constant-time), fail-closed when unset.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  const limited = await rateLimited(cfg.webhookSecret);
  if (limited) return limited;

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body = full run */ }

  // At least one delivery channel must be configured to do real sends. A dry run
  // still works (it sends nothing) so ops can validate selection before keys land.
  const dryRun = payload.dryRun === true;
  if (!dryRun && !pushConfigured(push) && !whatsappConfigured()) {
    return json({ ok: false, error: "no delivery channel configured (VAPID / WhatsApp)" }, 503);
  }

  const windowMs = typeof payload.windowMs === "number" && payload.windowMs > 0
    ? Math.min(payload.windowMs, 30 * 24 * 60 * 60 * 1000) // cap look-back at 30d
    : 7 * 24 * 60 * 60 * 1000;

  const result = await runPass(push, windowMs, dryRun);
  return json(result, result.ok ? 200 : 500);
});
