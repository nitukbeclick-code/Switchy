import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// community-digest — Switchy AI · roadmap item #5 (re-engagement email).
//
// A WEEKLY, cron-driven email summarising a member's OWN unread community
// notifications (replies/mentions/reactions/likes/pins on their content), sent
// ONLY to people who explicitly opted in (profiles.community_digest_opt_in, default
// false — §30A prior-consent). Truth-only: a member with zero unread updates is
// skipped, never sent a hollow "nothing new"; every number is a real read.
//
// TWO entry points:
//   • GET  ?unsub=<uid>&sig=<hmac>  — the one-click unsubscribe in every email.
//     The HMAC (keyed by the server-only service-role key) authenticates the
//     request, so no login is needed and a recipient can flip only their OWN
//     opt-in. Flips community_digest_opt_in→false and shows a small HTML page.
//   • POST { dryRun? } — the cron trigger. Fail-CLOSED on the shared
//     x-webhook-secret (like lead-digest/notify-lead). dryRun builds everything
//     and returns what WOULD send, without emailing.
//
// Fail-soft everywhere: a failed read/send is logged and degrades; a run just
// retries next week. Deploy: supabase functions deploy community-digest
// Schedule: supabase/community-digest-cron-2026-07.sql (weekly, Vault secret).
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { fetchRows, serviceFetch } from "../_shared/db.ts";
import { sendCustomerEmail, unsubscribeUrlFor } from "../_shared/email.ts";
import { inQuietHours, israelHour } from "../_shared/compliance.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";
import {
  buildDigestEmail,
  digestSubject,
  eligibleRecipients,
  fetchAllPaged,
  fetchUnreadChunked,
  groupUnread,
  MAX_RECIPIENT_PAGES,
  type NotifRow,
  RECIPIENT_PAGE,
  type RecipientRow,
  signUnsub,
  UNREAD_CHUNK,
  verifyUnsub,
  WINDOW_DAYS,
} from "./lib.ts";

const enc = encodeURIComponent;

function corsHeaders(): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders() } });
}
function htmlPage(inner: string, status = 200): Response {
  const doc =
    `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>קהילת חוסך</title></head>` +
    `<body style="font-family:Arial,Helvetica,sans-serif;background:#F5F7F8;margin:0;padding:40px 16px;text-align:center;color:#0B0F14">` +
    `<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E5E7EB;border-radius:18px;padding:32px">${inner}</div>` +
    `</body></html>`;
  return new Response(doc, { status, headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() } });
}

function appBase(): string {
  return (Deno.env.get("APP_BASE_URL") || "https://app.switchy-ai.com").replace(/\/+$/, "");
}
function fnBase(): string {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
  return url ? `${url}/functions/v1/community-digest` : "";
}
function unsubKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

// Count non-flagged posts created since `cutoffIso` via the exact-count header (no
// rows transferred). null on any error so the email omits the line rather than
// fabricating a 0. Fail-soft.
async function countNewPosts(cutoffIso: string): Promise<number | null> {
  try {
    const r = await serviceFetch(
      `/rest/v1/community_posts?is_flagged=eq.false&created_at=gte.${enc(cutoffIso)}&select=id`,
      { method: "GET", headers: { "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0" } },
    );
    if (!r || (!r.ok && r.status !== 206)) {
      await r?.body?.cancel?.().catch(() => {});
      return null;
    }
    const cr = r.headers.get("content-range") ?? "";
    await r.body?.cancel?.().catch(() => {});
    const n = Number(cr.split("/")[1]);
    return Number.isFinite(n) ? n : null;
  } catch (_) {
    return null;
  }
}

// ── GET: one-click unsubscribe ────────────────────────────────────────────────
async function handleUnsub(url: URL): Promise<Response> {
  const uid = (url.searchParams.get("unsub") ?? "").trim();
  const sig = (url.searchParams.get("sig") ?? "").trim();
  if (!uid || !sig) {
    return htmlPage(`<h1 style="font-size:20px;margin:0 0 8px">קישור חסר פרטים</h1><p style="color:#6B7280;margin:0">לא ניתן לעבד את הבקשה.</p>`, 400);
  }
  const ok = await verifyUnsub(uid, sig, unsubKey());
  if (!ok) {
    return htmlPage(`<h1 style="font-size:20px;margin:0 0 8px">הקישור אינו תקין</h1><p style="color:#6B7280;margin:0">ייתכן שהקישור נפגם. אפשר לנהל התראות מתוך הפרופיל בקהילה.</p>`, 400);
  }
  // Flip the opt-in off. Distinguish a real success (any 2xx — the row was updated,
  // or is already off / gone, both fine) from a transport/DB FAILURE, so we never
  // falsely tell someone they've been removed while their opt-in silently stays
  // true. §30A: the opt-out must actually take effect before we confirm it.
  const patch = await serviceFetch(`/rest/v1/profiles?id=eq.${enc(uid)}`, {
    method: "PATCH",
    headers: { "Prefer": "return=minimal" },
    body: JSON.stringify({ community_digest_opt_in: false }),
  });
  if (!patch || !patch.ok) {
    jlog({ at: "community-digest", ok: false, action: "unsubscribe", status: patch?.status });
    return htmlPage(
      `<h1 style="font-size:20px;margin:0 0 8px">לא הצלחנו להשלים כרגע</h1>` +
        `<p style="color:#6B7280;margin:0 0 16px">אירעה תקלה זמנית ולא הסרנו אותך עדיין. נסו שוב בעוד רגע, או נהלו התראות ישירות מתוך הפרופיל בקהילה.</p>` +
        `<a href="${appBase()}/community" style="display:inline-block;padding:12px 26px;background:#16A34A;color:#fff;border-radius:12px;text-decoration:none;font-weight:bold">לקהילת חוסך</a>`,
      503,
    );
  }
  jlog({ at: "community-digest", ok: true, action: "unsubscribe" });
  return htmlPage(
    `<h1 style="font-size:20px;margin:0 0 8px">הוסרת מרשימת הסיכומים ✅</h1>` +
      `<p style="color:#6B7280;margin:0 0 16px">לא יישלחו אליך יותר סיכומים שבועיים במייל. אפשר לחזור ולהצטרף בכל עת מתוך הפרופיל בקהילה.</p>` +
      `<a href="${appBase()}/community" style="display:inline-block;padding:12px 26px;background:#16A34A;color:#fff;border-radius:12px;text-decoration:none;font-weight:bold">לקהילת חוסך</a>`,
  );
}

// ── POST: the weekly cron run ─────────────────────────────────────────────────
async function handleCron(req: Request): Promise<Response> {
  const cfg = await resolveCfgCached();

  // Fail-CLOSED secret gate — identical to lead-digest / the internal triggers.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  let body: { dryRun?: boolean } = {};
  try { body = (await req.json()) as { dryRun?: boolean }; } catch (_) { /* empty body ok */ }
  const dryRun = body.dryRun === true;

  if (!cfg.resend || !cfg.resendFrom) return json({ ok: true, sent: 0, note: "email-not-configured" });
  // Defensive: never send in the §30A quiet window (the weekly cron slot is well
  // outside it, but a manual/off-hours trigger must still respect it).
  if (!dryRun && inQuietHours(israelHour())) return json({ ok: true, sent: 0, note: "quiet-hours" });

  // Recipients via an id-cursor pager (RECIPIENT_PAGE per request) — the old
  // single limit=2000 read silently dropped every opted-in member past the cap
  // (a full under-send). A failed FIRST page keeps the old honest note; a failed
  // LATER page degrades to the members already fetched (partial > nothing).
  const paged = await fetchAllPaged<RecipientRow>(
    (cursorId) =>
      fetchRows<RecipientRow>(
        `/rest/v1/profiles?community_digest_opt_in=eq.true&select=id,name,email,community_notify_opt_out` +
          `&order=id.asc&limit=${RECIPIENT_PAGE}` + (cursorId ? `&id=gt.${enc(cursorId)}` : ""),
      ),
    RECIPIENT_PAGE,
    MAX_RECIPIENT_PAGES,
  );
  if (paged.failed && paged.rows.length === 0) {
    return json({ ok: true, sent: 0, note: "recipients-read-failed" });
  }
  if (paged.failed) {
    jlog({ at: "community-digest", ok: false, warn: "recipient-page-failed", got: paged.rows.length });
  }
  // Surface the misfire bound rather than silently under-sending past it.
  if (paged.truncated) {
    jlog({
      at: "community-digest",
      ok: true,
      warn: "recipient-cap-hit",
      cap: RECIPIENT_PAGE * MAX_RECIPIENT_PAGES,
    });
  }
  const recipients = paged.rows;

  // Belt-and-suspenders consent (see eligibleRecipients): explicit digest opt-in
  // (DB filter) AND a real address AND not globally opted out.
  const eligible = eligibleRecipients(recipients);
  if (eligible.length === 0) return json({ ok: true, sent: 0, note: "no-eligible-recipients" });

  const now = Date.now();
  const cutoffIso = new Date(now - WINDOW_DAYS * 86_400_000).toISOString();
  // ids are DB uuid PKs (never client input); the shape guard is defensive so a
  // malformed value could never be interpolated into the PostgREST in.() filter.
  const UUID_RE = /^[0-9a-fA-F-]{36}$/;
  const ids = eligible.map((r) => r.id).filter((id) => UUID_RE.test(id));
  // Only ENGAGEMENT kinds — a moderation 'flag' notice doesn't belong in an upbeat
  // re-engagement digest (it's still visible in the in-app bell). CHUNKED at
  // UNREAD_CHUNK uuids per request: the old single in.(…2000 uuids…) query built
  // a ~74KB URL that could be rejected outright — and a rejected read meant the
  // ENTIRE run silently sent nothing. Fail-soft per chunk (a failed chunk's
  // members are skipped this week, the rest still get their digest).
  const { rows: unreadRows, failedChunks } = await fetchUnreadChunked(
    ids,
    (chunk) =>
      fetchRows<NotifRow>(
        `/rest/v1/community_notifications?read_at=is.null&created_at=gte.${enc(cutoffIso)}` +
          `&kind=in.(reply,mention,reaction,like,pinned)&user_id=in.(${chunk.join(",")})` +
          `&select=user_id,kind&limit=10000`,
      ),
    UNREAD_CHUNK,
  );
  if (failedChunks > 0) {
    jlog({ at: "community-digest", ok: false, warn: "unread-chunks-failed", failedChunks });
  }
  const grouped = groupUnread(unreadRows);
  const weeklyNewPosts = await countNewPosts(cutoffIso);
  const communityUrl = `${appBase()}/community`;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const preview: Array<{ to: string; subject: string; total: number }> = [];

  for (const r of eligible) {
    const summary = grouped.get(r.id);
    if (!summary || summary.total === 0) { skipped++; continue; }

    const sig = await signUnsub(r.id, unsubKey());
    const unsubscribeUrl = sig && fnBase()
      ? `${fnBase()}?unsub=${enc(r.id)}&sig=${enc(sig)}`
      : unsubscribeUrlFor(r.email ?? undefined); // mailto fallback — §30A always available
    const subject = digestSubject(summary.total);

    if (dryRun) {
      if (preview.length < 20) preview.push({ to: r.email as string, subject, total: summary.total });
      sent++; // counts what WOULD send
      continue;
    }

    const html = buildDigestEmail({ name: r.name, summary, communityUrl, unsubscribeUrl, weeklyNewPosts });
    const res = await sendCustomerEmail(cfg, r.email as string, subject, html, { fromName: "קהילת חוסך" });
    if (res.ok) sent++; else failed++;
  }

  jlog({ at: "community-digest", ok: true, dryRun, eligible: eligible.length, sent, failed, skipped, weeklyNewPosts });
  return json({ ok: true, dryRun, eligible: eligible.length, sent, failed, skipped, ...(dryRun ? { preview } : {}) });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method === "GET") return await handleUnsub(new URL(req.url));
  if (req.method === "POST") return await handleCron(req);
  return json({ ok: false, error: "method not allowed" }, 405);
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "community-digest", method: req.method });
    jlog({ at: "community-digest", ok: false, error: String(e) });
    return json({ ok: false, error: "temporarily unavailable" }, 503);
  }
});
