import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// notify-lead — חוסך
// The team's Telegram "digital rep". Fired by a Postgres trigger on every
// INSERT into public.leads AND public.meetings ({ table: 'meetings', record });
// also serves the bot's webhook and chat commands.
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

import type { Cfg, Lead, MeetingRow, TgUpdate } from "../_shared/types.ts";
import { botFullyConfigured, resolveCfgCached, safeEqual, tgWebhookToken } from "../_shared/config.ts";
import { sendTelegram, tgApi } from "../_shared/telegram.ts";
import { fetchRows, rpcRows, serviceFetch } from "../_shared/db.ts";
import { sendEmail } from "../_shared/email.ts";
import { jlog } from "../_shared/log.ts";
import { buildHtml, buildText, leadKeyboard } from "../_shared/leads.ts";
import { buildMeetingText, meetingKeyboard } from "../_shared/meetings.ts";
import { buildReturningLine, type PriorLead, type PriorMeeting } from "../_shared/agenda.ts";
import { zoomConfigured } from "../_shared/zoom.ts";
import { gcalConfigured } from "../_shared/google_calendar.ts";
import { aiTriage } from "./triage.ts";
import { BOT_COMMANDS } from "./commands.ts";
import { handleCallback, handleTeamMessage } from "./callbacks.ts";
import { handleConsoleAct, handleConsoleData, renderConsoleHtml } from "./console.ts";

// Stamp the row as notified so the sweep doesn't re-send it. Fail-soft: a
// missed stamp costs at most one duplicate message.
async function markNotified(table: "leads" | "meetings", id: unknown): Promise<void> {
  if (!id) return;
  try {
    await serviceFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(String(id))}`, {
      method: "PATCH",
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
  } catch (_) { /* the sweep retries */ }
}

// Returning-customer context for a phone: prior leads (via search_leads) and
// prior meetings (normalized-phone match), excluding the row being notified.
// Fail-soft: any query failure yields no line rather than blocking the card.
async function returningLineFor(
  phone: unknown, table: "leads" | "meetings", selfId: unknown,
): Promise<string> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return "";
  const [leads, meetings] = await Promise.all([
    rpcRows<PriorLead & { id?: string }>("search_leads", { q: digits }),
    fetchRows<PriorMeeting & { id?: string }>(
      `/rest/v1/meetings?select=id,meeting_date,starts_at,created_at,status&phone=ilike.*${encodeURIComponent(digits.slice(-9))}*&order=created_at.desc&limit=20`,
    ),
  ]);
  const priorLeads = (leads ?? []).filter((x) => !(table === "leads" && x.id === selfId));
  const priorMeetings = (meetings ?? []).filter((x) => !(table === "meetings" && x.id === selfId));
  return buildReturningLine(priorLeads, priorMeetings);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
  });
}

// One compact "are the integrations wired?" object, surfaced both in ?action=health
// and in the console-data payload (the console health strip renders it). Booleans
// only — never the secret values themselves.
export function integrationsStatus(cfg: Cfg): { zoom: boolean; calendar: boolean; email: boolean; telegram: boolean } {
  return {
    zoom: zoomConfigured(cfg),
    calendar: gcalConfigured(cfg),
    email: !!cfg.resend,
    telegram: !!cfg.tgToken,
  };
}

// Service-role table-grant probe: confirm the function's service-role key can
// actually read public.leads. A 200 → "ok", a 401/403 → "forbidden" (grants
// missing), anything else → "error". Fail-soft: never throws into the handler.
async function leadsGrantProbe(): Promise<"ok" | "forbidden" | "error"> {
  try {
    const r = await serviceFetch("/rest/v1/leads?select=id&limit=1", { method: "HEAD" });
    if (!r) return "error";
    if (r.ok) return "ok";
    if (r.status === 401 || r.status === 403) return "forbidden";
    return "error";
  } catch (_) {
    return "error";
  }
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
      // Ops probes (gated): the table-grant check hits the DB with the service
      // role, so only run + expose it for the authed team — anonymous health
      // stays a cheap config snapshot.
      const grant = authed ? await leadsGrantProbe() : undefined;
      return json({
        ok: true,
        function: "notify-lead",
        integrations: integrationsStatus(cfg),
        ...(authed ? { leads_table_grant: grant } : {}),
        configured: {
          telegram_bot_token: entry(!!cfg.tgToken, cfg.src.telegram_bot_token),
          telegram_chat_id: entry(!!cfg.tgChat, cfg.src.telegram_chat_id),
          resend_api_key: entry(!!cfg.resend, cfg.src.resend_api_key),
          resend_from: entry(!!cfg.resendFrom, cfg.src.resend_from),
          leads_notify_email: entry(!!cfg.notifyEmail, cfg.src.leads_notify_email),
          ai_key: entry(!!(cfg.openai || cfg.anthropic), cfg.openai ? cfg.src.openai_api_key : cfg.src.anthropic_api_key),
          lead_webhook_secret: entry(!!cfg.webhookSecret, cfg.src.lead_webhook_secret),
          telegram_allowed_user_ids: entry(cfg.allowedUserIds.length > 0, cfg.src.telegram_allowed_user_ids),
          zoom_s2s: entry(zoomConfigured(cfg), cfg.src.zoom_account_id),
        },
      });
    }
    if (action === "console") {
      // The rep console Mini App page. Public HTML (carries no data); the data
      // routes below authenticate via the Telegram initData the page sends.
      return new Response(renderConsoleHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
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
      // bot profile: what new team members see before the first message
      await tgApi(cfg, "setMyDescription", {
        description: "הנציג הדיגיטלי של חוסך — מקבל כל ליד בזמן אמת עם כפתורי סטטוס, שולח תזכורות חכמות, ומפיק דוחות. שלחו /help לרשימת הפקודות.",
      });
      await tgApi(cfg, "setMyShortDescription", { short_description: "ניהול הלידים של חוסך בטלגרם" });
      // Menu button → the rep console Mini App (one tap in the chat).
      const menu = await tgApi(cfg, "setChatMenuButton", {
        menu_button: {
          type: "web_app",
          text: "לוח הפגישות",
          web_app: { url: `${base}/functions/v1/notify-lead?action=console` },
        },
      });
      return json({
        ...r,
        commands_registered: cmds.ok,
        menu_button_set: menu.ok,
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
    // Fail-close: refuse to act on team chat / callback updates unless the bot
    // is fully configured — an empty allowlist or unset team chat would mean the
    // authorization gates default to "deny everyone", so dispatching is pointless
    // and a misconfiguration must not silently authorize anyone.
    if (!botFullyConfigured(cfg)) {
      return json({ ok: false, error: "bot not fully configured" }, 503);
    }
    let update: TgUpdate = {};
    try { update = await req.json() as TgUpdate; } catch (_) { /* empty body */ }
    if (update.message) return json(await handleTeamMessage(cfg, update.message));
    if (update.callback_query) return json(await handleCallback(cfg, update.callback_query));
    return json({ ok: true, skipped: "unhandled update type" });
  }

  // Rep console data/actions authenticate via Telegram initData (inside the
  // handlers), NOT the x-webhook-secret — so they sit ABOVE the secret gate.
  if (action === "console-data") {
    let body: { initData?: string } = {};
    try { body = await req.json(); } catch (_) { /* empty */ }
    const res = await handleConsoleData(cfg, body.initData ?? "");
    // Fold the integrations status into the payload so the console health strip
    // (BOT-2) can render it. Only merge into a 200 JSON body; pass auth failures
    // (401, etc.) through untouched.
    if (res.status === 200) {
      try {
        const payload = await res.clone().json() as Record<string, unknown>;
        return json({ ...payload, integrations: integrationsStatus(cfg) }, res.status);
      } catch (_) { /* non-JSON body — return as-is */ }
    }
    return res;
  }
  if (action === "console-act") {
    let body: { initData?: string; id?: string; act?: string; payload?: string } = {};
    try { body = await req.json(); } catch (_) { /* empty */ }
    return handleConsoleAct(cfg, body);
  }

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body */ }

  // Meeting INSERTs share this webhook: the trigger POSTs { table: 'meetings',
  // record }. No triage/email here — the card with confirm buttons is the job.
  const record = payload.record as Record<string, unknown> | undefined;
  if (payload.table === "meetings" || (record && record.meeting_date)) {
    const meeting = (record ?? payload) as MeetingRow;
    if (!meeting || (!meeting.name && !meeting.phone)) return json({ ok: false, error: "no meeting in payload" }, 400);
    const returning = meeting.id ? await returningLineFor(meeting.phone, "meetings", meeting.id) : "";
    const tg = await sendTelegram(cfg, returning + buildMeetingText(meeting), meetingKeyboard(meeting));
    if (tg.ok) await markNotified("meetings", meeting.id);
    jlog({ at: "notify-meeting", meeting: meeting.id, telegram: tg.ok });
    return json({ ok: tg.ok, telegram: { ok: tg.ok, error: tg.error } });
  }

  const lead = (payload.record ?? payload.lead ?? payload) as Lead;
  if (!lead || (!lead.name && !lead.phone)) return json({ ok: false, error: "no lead in payload" }, 400);

  // Returning customer: same phone seen before — hand the rep the context
  // (previous lead outcome + previous meeting outcome) right in the card.
  const returningLine = lead.id ? await returningLineFor(lead.phone, "leads", lead.id) : "";

  const triage = await aiTriage(cfg, lead);
  const [tg, email] = await Promise.all([
    sendTelegram(cfg, returningLine + buildText(lead, triage), leadKeyboard(lead, triage.draft)),
    sendEmail(cfg, "🔔 פנייה חדשה — חוסך", buildHtml(lead, triage)),
  ]);
  // stamp only on Telegram success: an email-only delivery has no interactive
  // card, so the sweep should keep retrying the chat path
  if (tg.ok) await markNotified("leads", lead.id);
  jlog({ at: "notify", lead: lead.id, telegram: tg.ok, email: email.ok, hot: triage.score >= 4 });

  return json({ ok: tg.ok || email.ok, telegram: { ok: tg.ok, error: tg.error }, email });
});
