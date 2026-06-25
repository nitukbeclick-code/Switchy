import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// community-notify — team Telegram ping + participant @mention fan-out
// Target of a Supabase Database Webhook (Database → Webhooks) on INSERT into
// public.community_posts / community_replies / provider_reviews.
//
//   (1) TEAM ping — formats a short Hebrew message and sends it to the team chat
//       via the shared Telegram helper (the rep sees new community activity).
//   (2) PARTICIPANT @mention fan-out — extracts @שם / @name tokens from a new
//       post/reply body and writes kind='mention' rows to
//       public.community_notifications for the mentioned, OPTED-IN users. The
//       reply→post-author 'reply' notification is handled DB-side
//       (notify_post_author_on_reply); this adds the mention inbox the schema
//       reserved but nothing wrote. Resolution + opt-out filtering + insert all
//       happen in ONE SECURITY-DEFINER RPC (resolve_community_mentions) so the
//       edge function never needs broad profile read access.
//
// Opt-out: a mentioned user with profiles.community_notify_opt_out = true is
// silently skipped by the RPC — respected centrally, never bypassed here. The
// team Telegram ping is internal/operational (not user-facing marketing).
//
// Security: the webhook must send header `x-webhook-secret: <lead_webhook_secret>`
// (configured in the dashboard webhook). Without a matching secret the request is
// rejected — this endpoint is otherwise public, and we never want it spammable.
//
// auth.users is empty in this project today, so the mention RPC simply resolves
// to zero rows (fail-soft); the team ping still works. It lights up once the
// community has seeded users.
//
// Deploy: supabase functions deploy community-notify --no-verify-jwt
// Then add a Database Webhook per table pointing here with the secret header.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { rpcRows } from "../_shared/db.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";

type WebhookBody = {
  type?: string; // INSERT | UPDATE | DELETE
  table?: string;
  schema?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clip(v: unknown, n = 280): string {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

const CHANNEL_HE: Record<string, string> = {
  general: "כללי", switch: "מעבר ספק", questions: "שאלות", tips: "טיפים",
};

// Builds the team message for a given table+row, or null if the table is one we
// don't notify on (so an over-broad webhook can't produce noise).
function format(table: string, r: Record<string, unknown>): string | null {
  const author = esc(clip(r.author ?? "משתמש", 60));
  const body = esc(clip(r.body, 280));
  if (table === "community_posts") {
    const ch = CHANNEL_HE[String(r.channel ?? "")] ?? esc(clip(r.channel, 30));
    return `📝 <b>פוסט חדש בקהילה</b>${ch ? ` · ${ch}` : ""}${NL}מאת ${author}${body ? NL + body : ""}`;
  }
  if (table === "community_replies") {
    return `💬 <b>תגובה חדשה בקהילה</b>${NL}מאת ${author}${body ? NL + body : ""}`;
  }
  if (table === "provider_reviews") {
    const provider = esc(clip(r.provider ?? "", 40));
    const overall = Number(r.overall);
    const stars = Number.isFinite(overall) ? "⭐".repeat(Math.min(Math.max(overall, 1), 5)) : "";
    return `⭐ <b>ביקורת חדשה</b> על ${provider} ${stars} (${Number.isFinite(overall) ? overall : "?"}/5)${body ? NL + body : ""}`;
  }
  return null;
}

// Extracts distinct @mention names from a body. A mention is a SINGLE token — the
// universal convention (@דנה, @Yossi_2024) — covering Hebrew letters, Latin
// letters, digits and underscore. We deliberately do NOT span spaces: a connector
// after the name (e.g. "@דנה ו…") must not be absorbed into it, and multi-word
// display names simply aren't @-mentionable (the RPC matches profiles.name exactly).
// Bounded to MAX_MENTIONS so a body crammed with @s can't fan out unboundedly.
// Names are returned WITHOUT the leading @, trimmed, deduped case-insensitively.
const MAX_MENTIONS = 10;
const MENTION_RE = /@([A-Za-z0-9_֐-׿]+)/g;

export function extractMentions(body: unknown): string[] {
  const s = String(body ?? "");
  if (!s.includes("@")) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of s.matchAll(MENTION_RE)) {
    const name = m[1].trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_MENTIONS) break;
  }
  return out;
}

// Fan out @mention notifications for a new post/reply. Resolution (name→user_id),
// opt-out filtering, self-mention skip, and the insert all happen inside the
// SECURITY-DEFINER RPC resolve_community_mentions — this just hands it the parsed
// names + context. Fail-soft: any error is logged and never fails the webhook
// (the team ping has already been sent). Returns the number of rows written.
async function fanOutMentions(table: string, r: Record<string, unknown>): Promise<number> {
  const names = extractMentions(r.body);
  if (names.length === 0) return 0;

  const isPost = table === "community_posts";
  const postId = String((isPost ? r.id : r.post_id) ?? "");
  const replyId = isPost ? null : String(r.id ?? "");
  const actorId = typeof r.user_id === "string" ? r.user_id : null;
  const actor = clip(r.author ?? "", 60);
  if (!postId) return 0;

  const rows = await rpcRows<{ notified: number }>("resolve_community_mentions", {
    p_names: names,
    p_post_id: postId,
    p_reply_id: replyId,
    p_actor_id: actorId,
    p_actor: actor,
  });
  // rpcRows returns null on a FAILED call (e.g. the RPC not yet deployed) — treat
  // as 0 and keep going. A scalar-returning RPC comes back as a single-row array.
  const written = Number(rows?.[0]?.notified ?? 0);
  jlog({ at: "community-notify.mentions", table, mentions: names.length, written });
  return written;
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const cfg = await resolveCfgCached();

  // Fail-closed on the shared secret: an unauthenticated caller must not be able
  // to push arbitrary messages into the team chat.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret || !(await safeEqual(provided, cfg.webhookSecret))) {
    jlog({ at: "community-notify", ok: false, error: "bad secret" });
    return json({ error: "unauthorized" }, 401);
  }

  let body: WebhookBody;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "invalid json" }, 400);
  }

  // Only act on INSERTs into the community tables; everything else is a no-op 200
  // so the webhook never retries or errors on rows we deliberately ignore.
  if (body.type && body.type !== "INSERT") return json({ ok: true, skipped: "not-insert" });
  const table = String(body.table ?? "");
  const record = body.record ?? {};
  const text = format(table, record);
  if (!text) return json({ ok: true, skipped: "unhandled-table" });

  // Participant @mention fan-out (posts/replies only) runs independently of the
  // team ping — they are separate concerns, so a Telegram outage must not drop
  // the in-app mention notifications. Fail-soft inside fanOutMentions.
  const mentioned = (table === "community_posts" || table === "community_replies")
    ? await fanOutMentions(table, record)
    : 0;

  const r = await sendTelegram(cfg, text);
  if (!r.ok) {
    jlog({ at: "community-notify", ok: false, table, error: r.error });
    // The mention fan-out may already have succeeded; report it so the failure is
    // scoped to the team ping (the webhook still 502s so Telegram is retried).
    return json({ error: "telegram send failed", mentioned }, 502);
  }
  return json({ ok: true, mentioned });
}

// Observability wrapper (fire-and-forget; dark until a Sentry DSN is configured).
// An UNEXPECTED throw outside handle's own fail-soft paths (e.g. config resolve,
// an outbound send) is surfaced to captureError and degraded to the function's
// existing 500-shaped error response — never a new status/body. captureError is
// NOT awaited and never throws/blocks.
Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    captureError(e, { fn: "community-notify", method: req.method });
    jlog({ at: "community-notify", ok: false, error: String(e) });
    return json({ error: "internal error" }, 500);
  }
});
