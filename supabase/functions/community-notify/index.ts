import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// community-notify — team Telegram ping on new community activity
// Target of a Supabase Database Webhook (Database → Webhooks) on INSERT into
// public.community_posts / community_replies / provider_reviews. Formats a short
// Hebrew message and sends it to the team chat via the shared Telegram helper.
//
// Security: the webhook must send header `x-webhook-secret: <lead_webhook_secret>`
// (configured in the dashboard webhook). Without a matching secret the request is
// rejected — this endpoint is otherwise public, and we never want it spammable.
//
// Deploy: supabase functions deploy community-notify --no-verify-jwt
// Then add a Database Webhook per table pointing here with the secret header.
// ─────────────────────────────────────────────────────────────────────────────

import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import { jlog } from "../_shared/log.ts";

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

Deno.serve(async (req: Request) => {
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

  const r = await sendTelegram(cfg, text);
  if (!r.ok) {
    jlog({ at: "community-notify", ok: false, table, error: r.error });
    return json({ error: "telegram send failed" }, 502);
  }
  return json({ ok: true });
});
