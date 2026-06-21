import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
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

serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
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
          `<b>עזרה — בוט חוסך</b>\n\n<b>פקודות:</b>\n/start - חיבור החשבון\n/help - הצגת הודעה זו\n\nקבלו התראות על:\n✅ אישורי פגישות\n⏰ תזכורות חידוש\n🎉 דילים משתלמים יותר\n💰 הזדמנויות חיסכון`
        );
      } else {
        // Unknown command
        await sendTelegramMessage(
          chatId,
          "פקודה לא מוכרת. הקלידו /help לרשימת הפקודות, או חברו את החשבון עם /start."
        );
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
