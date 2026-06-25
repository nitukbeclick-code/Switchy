import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

import { resolveCfgCached, safeEqual, tgWebhookToken } from "../_shared/config.ts";
import { fetchRows, insertRow, serviceFetch } from "../_shared/db.ts";
import { sendText } from "../_shared/whatsapp.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function sendTelegramMessage(
  chatId: number,
  text: string
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
      }
    );
    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    return false;
  }
}

async function handleStartCommand(
  payload: string,
  chatId: number,
  firstName: string
) {
  try {
    // Deep link format: /start user_[USER_ID]
    const match = payload.match(/^user_(.+)$/);
    const appUserId = match?.[1]?.trim() ?? "";

    // SECURITY: validate the id is a real UUID *before* any DB access. Without
    // this an attacker could pass an arbitrary id and bind their own chat to a
    // victim's profile, hijacking that victim's notifications.
    if (!match || !UUID_RE.test(appUserId)) {
      await sendTelegramMessage(
        chatId,
        "קישור לא תקין. אנא השתמשו בקישור מתוך האפליקציה."
      );
      console.warn("Rejected /start with invalid uuid payload");
      return;
    }

    const chatIdStr = chatId.toString();

    // RATE LIMIT: a single chat must not collect many profiles. Count how many
    // profiles are already bound to this chat (excluding the target) and refuse
    // once the cap is hit.
    const { data: boundRows, error: boundErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_chat_id", chatIdStr)
      .neq("id", appUserId);

    if (boundErr) {
      console.error("Error checking existing chat links:", boundErr.message);
      await sendTelegramMessage(
        chatId,
        "אירעה שגיאה. נסו שוב מאוחר יותר."
      );
      return;
    }

    if ((boundRows?.length ?? 0) >= MAX_PROFILES_PER_CHAT) {
      await sendTelegramMessage(
        chatId,
        "חרגתם ממספר החשבונות שניתן לקשר מצ׳אט זה — פנו לתמיכה."
      );
      console.warn("Rate-limited: chat exceeded max linked profiles");
      return;
    }

    // Look up the target profile and only link if it is currently unlinked.
    // We never silently overwrite an existing telegram_chat_id — that is the
    // exact hijack we are guarding against.
    const { data: profile, error: lookupErr } = await supabase
      .from("profiles")
      .select("id, telegram_chat_id")
      .eq("id", appUserId)
      .maybeSingle();

    if (lookupErr) {
      console.error("Error looking up profile:", lookupErr.message);
      await sendTelegramMessage(
        chatId,
        "אירעה שגיאה. נסו שוב מאוחר יותר."
      );
      return;
    }

    if (!profile) {
      await sendTelegramMessage(
        chatId,
        "קישור לא תקין. אנא השתמשו בקישור מתוך האפליקציה."
      );
      return;
    }

    const existing = profile.telegram_chat_id as string | null;
    if (existing) {
      // Already linked. If it's already THIS chat, reassure; otherwise refuse
      // and route to support rather than overwriting.
      if (existing === chatIdStr) {
        await sendTelegramMessage(
          chatId,
          `<b>✅ כבר מחוברים!</b>\n\nשלום ${firstName}, החשבון שלכם כבר מקושר לצ׳אט הזה.`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          "כבר מקושר — פנו לתמיכה."
        );
        console.warn("Refused re-link: profile already bound to another chat");
      }
      return;
    }

    // Conditional update: only succeeds while telegram_chat_id is still null,
    // closing the race where two requests try to claim the same profile.
    const { data: updated, error: updateErr } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: chatIdStr,
        telegram_enabled: true,
        telegram_connected_at: new Date().toISOString(),
      })
      .eq("id", appUserId)
      .is("telegram_chat_id", null)
      .select("id");

    if (updateErr) {
      console.error("Error updating profile:", updateErr.message);
      await sendTelegramMessage(
        chatId,
        "מצטערים, לא הצלחנו לחבר את החשבון. נסו שוב."
      );
      return;
    }

    if (!updated || updated.length === 0) {
      // Lost the race — someone linked between our lookup and update.
      await sendTelegramMessage(
        chatId,
        "כבר מקושר — פנו לתמיכה."
      );
      return;
    }

    await sendTelegramMessage(
      chatId,
      `<b>✅ מחוברים!</b>\n\nשלום ${firstName}! מעכשיו תקבלו התראות על:\n• אישורי פגישות\n• תזכורות חידוש\n• התראות על דילים משתלמים יותר\n• הצעות מיוחדות\n\nניתן לנהל את ההעדפות בהגדרות האפליקציה.`
    );

    console.log("Successfully linked Telegram chat to profile");
  } catch (error) {
    console.error("Error handling /start command:", error);
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
    console.error("Error reacting to Telegram message:", error);
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

serve(async (req: Request) => {
  // Only accept POST requests
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
          `<b>עזרה — בוט Switchy AI</b>\n\n<b>פקודות:</b>\n/start - חיבור החשבון\n/help - הצגת הודעה זו\n\nקבלו התראות על:\n✅ אישורי פגישות\n⏰ תזכורות חידוש\n🎉 דילים משתלמים יותר\n💰 הזדמנויות חיסכון`
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
    console.error("Error processing Telegram webhook:", error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
