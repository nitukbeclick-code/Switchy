import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// notify-lead — חוסך
// The team's Telegram "digital rep". Fired by a Postgres trigger on every
// INSERT into public.leads; also serves the bot's webhook and chat commands.
//
// GET ?action=health                  -> integrations status (sources only with a valid secret)
// GET ?action=telegram-chats          -> recent chats for the bot (find chat_id); gated
// GET ?action=set-telegram-webhook    -> register webhook + bot commands; gated
// GET ?action=delete-telegram-webhook -> unregister (re-enables telegram-chats); gated
// POST (webhook)                      -> { record } from the trigger, or a raw lead
// POST ?action=telegram-update        -> Telegram webhook: status/claim/undo buttons,
//                                        reply-notes, won-flow savings, /commands
//
// Lead cards carry buttons: דיברתי/נסגר/לא רלוונטי, 🙋 אני על זה (atomic claim),
// 💬 וואטסאפ מוכן (AI-drafted opener prefilled). Status changes stream to the
// app tracker (leadStepStream) and land in the lead_events audit table.
// Successful sends stamp notified_at; the 10-minute sweep re-delivers misses.
//
// Deploy: supabase functions deploy notify-lead --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import type { Lead, TgUpdate } from "../_shared/types.ts";
import { resolveCfgCached, safeEqual, tgWebhookToken } from "../_shared/config.ts";
import { sendTelegram, tgApi } from "../_shared/telegram.ts";
import { serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { buildHtml, buildText, leadKeyboard } from "../_shared/leads.ts";
import { aiTriage } from "./triage.ts";
import { BOT_COMMANDS } from "./commands.ts";
import { handleCallback, handleTeamMessage } from "./callbacks.ts";

// Stamp the lead as notified so the sweep doesn't re-send it. Fail-soft: a
// missed stamp costs at most one duplicate message.
async function markNotified(leadId: unknown): Promise<void> {
  if (!leadId) return;
  try {
    await serviceFetch(`/rest/v1/leads?id=eq.${encodeURIComponent(String(leadId))}`, {
      method: "PATCH",
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
  } catch (_) { /* the sweep retries */ }
}

async function sendEmail(cfg: { resend: string; resendFrom: string; notifyEmail: string }, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.resend || !cfg.resendFrom || !cfg.notifyEmail) return { ok: false, error: "resend not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.resendFrom, to: [cfg.notifyEmail], subject, html }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (!r.ok) jlog({ at: "sendEmail", ok: false, status: r.status, error: j?.message ?? j?.name });
    return { ok: r.ok, error: (j?.message ?? j?.name) as string | undefined };
  } catch (e) {
    jlog({ at: "sendEmail", ok: false, error: String(e) });
    return { ok: false, error: String(e) };
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const cfg = await resolveCfgCached();

  if (req.method === "GET") {
    if (action === "health" || action === null) {
      // `source` (vault|env|none) is ops metadata — show it only to the team.
      const authed = !!cfg.webhookSecret &&
        (await safeEqual(req.headers.get("x-webhook-secret") ?? "", cfg.webhookSecret));
      const entry = (present: boolean, source: string) => (authed ? { present, source } : { present });
      return json({
        ok: true,
        function: "notify-lead",
        configured: {
          telegram_bot_token: entry(!!cfg.tgToken, cfg.src.telegram_bot_token),
          telegram_chat_id: entry(!!cfg.tgChat, cfg.src.telegram_chat_id),
          resend_api_key: entry(!!cfg.resend, cfg.src.resend_api_key),
          resend_from: entry(!!cfg.resendFrom, cfg.src.resend_from),
          leads_notify_email: entry(!!cfg.notifyEmail, cfg.src.leads_notify_email),
          ai_key: entry(!!(cfg.openai || cfg.anthropic), cfg.openai ? cfg.src.openai_api_key : cfg.src.anthropic_api_key),
          lead_webhook_secret: entry(!!cfg.webhookSecret, cfg.src.lead_webhook_secret),
          telegram_allowed_user_ids: entry(cfg.allowedUserIds.length > 0, cfg.src.telegram_allowed_user_ids),
        },
      });
    }
    if (action === "telegram-chats") {
      // header-only: secrets in query strings leak into request logs
      const provided = req.headers.get("x-webhook-secret") ?? "";
      if (!cfg.webhookSecret || !(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);
      if (!cfg.tgToken) return json({ ok: false, error: "telegram token not set" }, 400);
      // explicit empty allowed_updates: resets the bot-global filter a previous
      // setWebhook(allowed_updates) leaves behind — without it, message updates
      // (needed for chat discovery) never arrive again.
      const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_updates: [] }),
      });
      const j = await r.json();
      const seen: Record<string, unknown> = {};
      for (const u of (j.result ?? [])) {
        const c = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat ?? u.edited_message?.chat;
        if (c && c.id !== undefined) seen[String(c.id)] = { id: c.id, type: c.type, title: c.title, username: c.username, first_name: c.first_name };
      }
      return json({ ok: true, telegram_ok: j.ok !== false, error: j.description, hint: "Message the bot or add it to your group, then call again. Use one of these ids as telegram_chat_id.", chats: Object.values(seen) });
    }
    if (action === "set-telegram-webhook" || action === "delete-telegram-webhook") {
      const provided = req.headers.get("x-webhook-secret") ?? "";
      if (!cfg.webhookSecret || !(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);
      if (!cfg.tgToken) return json({ ok: false, error: "telegram token not set" }, 400);
      if (action === "delete-telegram-webhook") return json(await tgApi(cfg, "deleteWebhook", {}));
      const base = Deno.env.get("SUPABASE_URL") ?? "";
      if (!base) return json({ ok: false, error: "SUPABASE_URL not available" }, 500);
      const hookUrl = `${base}/functions/v1/notify-lead?action=telegram-update`;
      const r = await tgApi(cfg, "setWebhook", {
        url: hookUrl,
        secret_token: await tgWebhookToken(cfg.webhookSecret),
        allowed_updates: ["callback_query", "message"],
      });
      const cmds = await tgApi(cfg, "setMyCommands", { commands: BOT_COMMANDS });
      return json({
        ...r,
        commands_registered: cmds.ok,
        webhook_url: hookUrl,
        note: "getUpdates (?action=telegram-chats) is disabled while a webhook is set — delete-telegram-webhook re-enables it.",
      });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  // Telegram webhook updates authenticate with the secret_token registered at
  // setWebhook (a digest of lead_webhook_secret) — not the x-webhook-secret header.
  if (action === "telegram-update") {
    const token = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!cfg.webhookSecret || !(await safeEqual(token, await tgWebhookToken(cfg.webhookSecret)))) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    let update: TgUpdate = {};
    try { update = await req.json() as TgUpdate; } catch (_) { /* empty body */ }
    if (update.message) return json(await handleTeamMessage(cfg, update.message));
    if (update.callback_query) return json(await handleCallback(cfg, update.callback_query));
    return json({ ok: true, skipped: "unhandled update type" });
  }

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body */ }
  const lead = (payload.record ?? payload.lead ?? payload) as Lead;
  if (!lead || (!lead.name && !lead.phone)) return json({ ok: false, error: "no lead in payload" }, 400);

  const triage = await aiTriage(cfg, lead);
  const [tg, email] = await Promise.all([
    sendTelegram(cfg, buildText(lead, triage), leadKeyboard(lead, triage.draft)),
    sendEmail(cfg, "🔔 פנייה חדשה — חוסך", buildHtml(lead, triage)),
  ]);
  // stamp only on Telegram success: an email-only delivery has no interactive
  // card, so the sweep should keep retrying the chat path
  if (tg.ok) await markNotified(lead.id);
  jlog({ at: "notify", lead: lead.id, telegram: tg.ok, email: email.ok, hot: triage.score >= 4 });

  return json({ ok: tg.ok || email.ok, telegram: { ok: tg.ok, error: tg.error }, email });
});
