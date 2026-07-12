// ─────────────────────────────────────────────────────────────────────────────
// telegram-webhook — Switchy AI
// The INTERNAL rep/link Telegram bot. Two jobs:
//   1. /start user_<uuid> — link an app profile's notifications to a Telegram
//      chat (hijack-guarded: canonical-UUID gate, per-chat link cap, never
//      overwrites an existing link).
//   2. Rep → WhatsApp relay — a plain text reply from an AUTHORIZED rep in the
//      team chat is forwarded to the customer's WhatsApp conversation
//      (threaded via telegram_thread_id, else the rep's most recent contact).
//
// This is NOT the public customer bot (telegram-user-webhook/) — that one
// trusts no one; this one trusts the telegram_allowed_user_ids allowlist.
//
// POST (webhook) — Telegram update, authenticated via secret_token
//   (x-telegram-bot-api-secret-token = SHA-256 digest of lead_webhook_secret,
//   the same scheme notify-lead / telegram-user-webhook use). Fail-closed.
// Any other method — plain 200 "OK" (the bot-health workflow probes GET).
//
// Deploy: supabase functions deploy telegram-webhook --no-verify-jwt
// Env: TELEGRAM_BOT_TOKEN (the rep bot's token), lead_webhook_secret via
//   vault/env, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for persistence,
//   WHATSAPP_TOKEN (via _shared/whatsapp.ts) for the relay.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { resolveCfgCached, safeEqual, tgWebhookToken } from "../_shared/config.ts";
import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { sendText } from "../_shared/whatsapp.ts";

// The rep bot's OWN token — distinct from the user bot's TELEGRAM_USER_BOT_TOKEN.
// Read at module load; the value is stable for the isolate's lifetime.
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

// A canonical UUID — the /start payload is an UNTRUSTED, attacker-controllable
// string, so we never feed it to a DB query before it matches this exactly.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A single Telegram chat may legitimately link at most a couple of app
// profiles (e.g. a re-link after re-install). More than this from one chat is
// almost certainly an attempt to harvest other users' notifications, so we
// refuse further links from that chat.
const MAX_PROFILES_PER_CHAT = 2;

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
  // Present when the rep taps "Reply" on one of the bot's WhatsApp cards — lets
  // us match the relay back to a specific conversation via telegram_thread_id.
  reply_to_message?: TelegramMessage;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// HTML-escape an untrusted string before interpolating it into a parse_mode:
// "HTML" Telegram message. first_name is attacker-controllable (any Telegram
// user sets their own name), so an unescaped "<b>" / "&" would corrupt — or
// inject markup into — the rendered message. Mirrors console.ts's esc().
function esc(s: string): string {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string),
  );
}

async function sendTelegramMessage(
  chatId: number,
  text: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML",
        }),
      },
    );
    return response.ok;
  } catch (error) {
    jlog({ at: "telegram-webhook.send", ok: false, error: String(error) });
    return false;
  }
}

async function handleStartCommand(
  payload: string,
  chatId: number,
  firstName: string,
) {
  try {
    // Deep link format: /start user_[USER_ID]
    const match = payload.match(/^user_(.+)$/);
    const appUserId = match?.[1]?.trim() ?? "";

    // SECURITY: validate the id is a real UUID *before* any DB access. Without
    // this an attacker could pass an arbitrary id and bind their own chat to a
    // victim's profile, hijacking that victim's notifications. Only after this
    // gate is appUserId safe to interpolate into a PostgREST path below.
    if (!match || !UUID_RE.test(appUserId)) {
      await sendTelegramMessage(
        chatId,
        "קישור לא תקין. אנא השתמשו בקישור מתוך האפליקציה."
      );
      jlog({ at: "telegram-webhook.start", ok: false, reason: "invalid uuid payload" });
      return;
    }

    const chatIdStr = chatId.toString();

    // RATE LIMIT: a single chat must not collect many profiles. Count how many
    // profiles are already bound to this chat (excluding the target) and refuse
    // once the cap is hit. fetchRows is null ONLY on a failed query ([] when
    // genuinely empty), so a DB outage takes the "try again" path, never the cap.
    const boundRows = await fetchRows<{ id: string }>(
      `/rest/v1/profiles?select=id&telegram_chat_id=eq.${chatIdStr}&id=neq.${appUserId}`,
    );

    if (boundRows === null) {
      jlog({ at: "telegram-webhook.start", ok: false, step: "check existing chat links" });
      await sendTelegramMessage(
        chatId,
        "אירעה שגיאה. נסו שוב מאוחר יותר."
      );
      return;
    }

    if (boundRows.length >= MAX_PROFILES_PER_CHAT) {
      await sendTelegramMessage(
        chatId,
        "חרגתם ממספר החשבונות שניתן לקשר מצ׳אט זה — פנו לתמיכה."
      );
      jlog({ at: "telegram-webhook.start", ok: false, reason: "chat exceeded max linked profiles" });
      return;
    }

    // Look up the target profile and only link if it is currently unlinked.
    // We never silently overwrite an existing telegram_chat_id — that is the
    // exact hijack we are guarding against.
    const profiles = await fetchRows<{ id: string; telegram_chat_id: string | null }>(
      `/rest/v1/profiles?select=id,telegram_chat_id&id=eq.${appUserId}&limit=1`,
    );

    if (profiles === null) {
      jlog({ at: "telegram-webhook.start", ok: false, step: "look up profile" });
      await sendTelegramMessage(
        chatId,
        "אירעה שגיאה. נסו שוב מאוחר יותר."
      );
      return;
    }

    const profile = profiles.length ? profiles[0] : null;
    if (!profile) {
      await sendTelegramMessage(
        chatId,
        "קישור לא תקין. אנא השתמשו בקישור מתוך האפליקציה."
      );
      return;
    }

    const existing = profile.telegram_chat_id;
    if (existing) {
      // Already linked. If it's already THIS chat, reassure; otherwise refuse
      // and route to support rather than overwriting.
      if (existing === chatIdStr) {
        await sendTelegramMessage(
          chatId,
          `<b>✅ כבר מחוברים!</b>\n\nשלום ${esc(firstName)}, החשבון שלכם כבר מקושר לצ׳אט הזה.`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          "כבר מקושר — פנו לתמיכה."
        );
        jlog({ at: "telegram-webhook.start", ok: false, reason: "profile already bound to another chat" });
      }
      return;
    }

    // Conditional update: only succeeds while telegram_chat_id is still null,
    // closing the race where two requests try to claim the same profile. The
    // returned representation tells failure (null) apart from a lost race ([]).
    const r = await serviceFetch(
      `/rest/v1/profiles?id=eq.${appUserId}&telegram_chat_id=is.null&select=id`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          telegram_chat_id: chatIdStr,
          telegram_enabled: true,
          telegram_connected_at: new Date().toISOString(),
        }),
      },
    );

    let updated: Array<{ id: string }> | null = null;
    if (r && r.ok) {
      const rows = await r.json().catch(() => null);
      if (Array.isArray(rows)) updated = rows as Array<{ id: string }>;
    }

    if (updated === null) {
      jlog({ at: "telegram-webhook.start", ok: false, step: "update profile", status: r?.status });
      await sendTelegramMessage(
        chatId,
        "מצטערים, לא הצלחנו לחבר את החשבון. נסו שוב."
      );
      return;
    }

    if (updated.length === 0) {
      // Lost the race — someone linked between our lookup and update.
      await sendTelegramMessage(
        chatId,
        "כבר מקושר — פנו לתמיכה."
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      `<b>✅ מחוברים!</b>\n\nשלום ${esc(firstName)}! החשבון קושר לצ׳אט הזה.\nכשנפעיל התראות בטלגרם — אישורי פגישות, תזכורות חידוש ודילים — הן יגיעו לכאן אוטומטית.\nבינתיים העדכונים נשלחים באפליקציה ובמייל; אפשר לנתק בכל רגע בהגדרות האפליקציה.`
    );

    jlog({ at: "telegram-webhook.start", ok: true, linked: true });
  } catch (error) {
    jlog({ at: "telegram-webhook.start", ok: false, error: String(error) });
    await sendTelegramMessage(
      chatId,
      "אירעה שגיאה. נסו שוב מאוחר יותר."
    );
  }
}

// ── Rep → WhatsApp relay ─────────────────────────────────────────────────────
// When an AUTHORIZED rep types a plain (non-command) text reply in the team chat,
// we forward it to the customer over WhatsApp. The whole path is fail-soft: any
// miss (no token, no assigned contact, send fails) is logged + acknowledged in
// Telegram rather than thrown, so it never disturbs /start, /help or the bot.

type WaContact = { id: string; wa_phone: string; assigned_tg_id?: number | null };
type WaConversation = { id: string; contact_id: string };

// Sets a ✅ reaction on the rep's message (best-effort — older Telegram clients
// or group settings may reject reactions; we never block the relay on it).
async function tgReact(chatId: number, messageId: number): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/setMessageReaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: "emoji", emoji: "✅" }],
      }),
    });
  } catch (error) {
    jlog({ at: "telegram-webhook.react", ok: false, error: String(error) });
  }
}

// Resolve which customer this rep reply targets:
//  1. If it's a reply to a known card, match the conversation by its pinned
//     telegram_thread_id (the message id of the card) and use that contact.
//  2. Otherwise fall back to the rep's most-recently-active assigned contact.
async function resolveRelayTarget(
  repId: number,
  replyToMessageId: number | null,
): Promise<{ contact: WaContact; conversation: WaConversation } | null> {
  // (1) Threaded reply → conversation pinned to this card.
  if (replyToMessageId) {
    const convs = await fetchRows<WaConversation>(
      `/rest/v1/whatsapp_conversations?telegram_thread_id=eq.${replyToMessageId}` +
        `&select=id,contact_id&order=created_at.desc&limit=1`,
    );
    const conv = convs && convs.length ? convs[0] : null;
    if (conv) {
      const contacts = await fetchRows<WaContact>(
        `/rest/v1/whatsapp_contacts?id=eq.${conv.contact_id}` +
          `&select=id,wa_phone,assigned_tg_id&limit=1`,
      );
      if (contacts && contacts.length && contacts[0].wa_phone) {
        return { contact: contacts[0], conversation: conv };
      }
    }
  }

  // (2) Most-recently-active contact assigned to this rep.
  const contacts = await fetchRows<WaContact>(
    `/rest/v1/whatsapp_contacts?assigned_tg_id=eq.${repId}` +
      `&select=id,wa_phone,assigned_tg_id&order=last_message_at.desc.nullslast&limit=1`,
  );
  const contact = contacts && contacts.length ? contacts[0] : null;
  if (!contact || !contact.wa_phone) return null;

  const conv = await getOrCreateConversation(contact.id);
  if (!conv) return null;
  return { contact, conversation: conv };
}

// Most-recent open/bot/human conversation for the contact, or a fresh one. The
// relay always has a conversation to attach the outbound message + timestamp to.
async function getOrCreateConversation(contactId: string): Promise<WaConversation | null> {
  const open = await fetchRows<WaConversation>(
    `/rest/v1/whatsapp_conversations?contact_id=eq.${contactId}` +
      `&status=in.(open,bot,human)&order=created_at.desc&limit=1&select=id,contact_id`,
  );
  if (open && open.length) return open[0];
  // No live conversation — create one so the rep's reply has a home.
  const r = await serviceFetch("/rest/v1/whatsapp_conversations", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ contact_id: contactId, status: "human" }),
  });
  if (!r || !r.ok) return null;
  const rows = await r.json().catch(() => []) as WaConversation[];
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

// Returns true when this message was an authorized rep reply we handled (sent or
// surfaced an error), so the caller skips the "unknown command" fallback.
async function handleRepReply(message: TelegramMessage): Promise<boolean> {
  const repId = message.from.id;
  const chatId = message.chat.id;
  const text = (message.text ?? "").trim();
  if (!text) return false;

  // Gate: only AUTHORIZED reps, only inside the configured team chat. Either
  // missing ⇒ this isn't a relay; let the normal command handling proceed.
  const cfg = await resolveCfgCached();
  if (cfg.allowedUserIds.length === 0) return false;
  if (!cfg.allowedUserIds.includes(repId)) return false;
  if (!cfg.tgChat || String(chatId) !== String(cfg.tgChat)) return false;

  const replyToId = message.reply_to_message?.message_id ?? null;
  const target = await resolveRelayTarget(repId, replyToId);
  if (!target) {
    await sendTelegramMessage(
      chatId,
      "אין שיחת WhatsApp פעילה לשיוך — פתחו את הכרטיס של הלקוח/ה והשיבו עליו, או המתינו שהלקוח/ה יכתבו."
    );
    return true; // handled (told the rep why nothing was sent)
  }

  const { contact, conversation } = target;
  const wamid = await sendText(contact.wa_phone, text);

  // Mirror the whatsapp-webhook outbound contract: store the message (idempotent
  // wamid, actor 'rep') and touch both timestamps so the CRM stays consistent.
  const now = new Date().toISOString();
  await insertRow("whatsapp_messages", {
    conversation_id: conversation.id,
    contact_id: contact.id,
    direction: "out",
    actor: "rep",
    msg_type: "text",
    body: text.slice(0, 4000),
    wa_message_id: wamid,
    status: wamid ? "sent" : "failed",
  });
  // crm_events PARITY with the CRM-app path: a rep reply relayed from Telegram
  // must appear on the console's activity feed exactly like one sent from the
  // console (crm-api actSendReply writes the same 'rep_reply' row). Preview is
  // whitespace-collapsed + clipped to 80 chars, never bytes. Best-effort.
  await insertRow("crm_events", {
    conversation_id: conversation.id,
    contact_id: contact.id,
    actor: "rep",
    event: "rep_reply",
    preview: text.trim().replace(/\s+/g, " ").slice(0, 80) || null,
  });
  await serviceFetch(`/rest/v1/whatsapp_conversations?id=eq.${conversation.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_message_at: now }),
  });
  await serviceFetch(`/rest/v1/whatsapp_contacts?id=eq.${contact.id}`, {
    method: "PATCH",
    body: JSON.stringify({ last_message_at: now }),
  });

  if (wamid) {
    await tgReact(chatId, message.message_id);
  } else {
    await sendTelegramMessage(
      chatId,
      "לא הצלחתי לשלוח את ההודעה ל-WhatsApp כרגע 🙏 נסו שוב, או בדקו את חיבור WhatsApp."
    );
  }
  return true;
}

Deno.serve(async (req: Request) => {
  // Only accept POST requests (bot-health probes GET and expects a plain "OK").
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  // SECURITY: authenticate the inbound Telegram update via the secret_token
  // registered at setWebhook (a SHA-256 digest of lead_webhook_secret), exactly
  // as notify-lead's ?action=telegram-update path does. WITHOUT this gate the
  // handler trusts `from.id` / `chat.id` straight out of the request body, so an
  // unauthenticated attacker who knows (low-entropy) rep + team-chat ids could
  // forge a rep reply and make the business WhatsApp number message real
  // customers (handleRepReply → sendText). Fail closed when the secret is unset.
  const cfg = await resolveCfgCached();
  const token = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!cfg.webhookSecret || !(await safeEqual(token, await tgWebhookToken(cfg.webhookSecret)))) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const update: TelegramUpdate = await req.json();

    // Handle message updates
    if (update.message?.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;
      const firstName = message.from.first_name || "משתמש";
      if (!text) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Handle /start command with deep link parameter
      if (text.startsWith("/start")) {
        const params = text.substring(6).trim();
        await handleStartCommand(params, chatId, firstName);
      } else if (text === "/help") {
        await sendTelegramMessage(
          chatId,
          `<b>עזרה — בוט Switchy AI</b>\n\n<b>פקודות:</b>\n/start - חיבור החשבון\n/help - הצגת הודעה זו\n\nהצ׳אט מקושר לחשבון Switchy שלכם.\nכשנפעיל כאן התראות (אישורי פגישות, תזכורות חידוש, דילים) — הן יגיעו אוטומטית; בינתיים העדכונים באפליקציה ובמייל.`
        );
      } else {
        // Non-command text. First try relaying it to a customer's WhatsApp when
        // it comes from an authorized rep in the team chat (fail-soft). Only if
        // it wasn't a handled rep reply do we fall back to the unknown-command
        // hint — so private/unauthorized chats keep the old behaviour.
        const relayed = await handleRepReply(message);
        if (!relayed) {
          await sendTelegramMessage(
            chatId,
            "פקודה לא מוכרת. הקלידו /help לרשימת הפקודות, או חברו את החשבון עם /start."
          );
        }
      }
    }

    // Return OK to Telegram
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    jlog({ at: "telegram-webhook", ok: false, error: String(error) });
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
