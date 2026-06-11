import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

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
  userId: string,
  chatId: number,
  firstName: string
) {
  try {
    // Extract user ID from deep link parameter
    // Format: /start=user_[USER_ID]
    const userIdMatch = userId.match(/user_(.+)/);

    if (!userIdMatch) {
      await sendTelegramMessage(
        chatId,
        "Invalid link. Please use the link from the app."
      );
      return;
    }

    const appUserId = userIdMatch[1];

    // Update user's telegram_chat_id in profiles table
    const { error } = await supabase
      .from("profiles")
      .update({
        telegram_chat_id: chatId.toString(),
        telegram_enabled: true,
        telegram_connected_at: new Date().toISOString(),
      })
      .eq("id", appUserId);

    if (error) {
      console.error("Error updating profile:", error);
      await sendTelegramMessage(
        chatId,
        "Sorry, couldn't connect your account. Please try again."
      );
      return;
    }

    // Send confirmation
    await sendTelegramMessage(
      chatId,
      `<b>✅ Connected!</b>\n\nHi ${firstName}! You'll now receive notifications about:\n• Meeting confirmations\n• Renewal reminders\n• Better deal alerts\n• Special offers\n\nManage your preferences in the app settings.`
    );

    console.log(`Successfully connected Telegram for user: ${appUserId}`);
  } catch (error) {
    console.error("Error handling /start command:", error);
    await sendTelegramMessage(
      chatId,
      "An error occurred. Please try again later."
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

    console.log("Received Telegram update:", JSON.stringify(update));

    // Handle message updates
    if (update.message?.text) {
      const message = update.message;
      const chatId = message.chat.id;
      const text = message.text;
      const firstName = message.from.first_name || "User";

      // Handle /start command with deep link parameter
      if (text.startsWith("/start")) {
        const params = text.substring(6).trim();
        await handleStartCommand(params, chatId, firstName);
      } else if (text === "/help") {
        await sendTelegramMessage(
          chatId,
          `<b>Chosech Bot Help</b>\n\n<b>Commands:</b>\n/start - Connect your account\n/help - Show this message\n\nGet notified about:\n✅ Meeting confirmations\n⏰ Renewal reminders\n🎉 Better deals\n💰 Savings opportunities`
        );
      } else {
        // Unknown command
        await sendTelegramMessage(
          chatId,
          `Unknown command. Type /help for available commands, or connect your account with /start.`
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
