import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const telegramGroupId = Deno.env.get("TELEGRAM_SUPPORT_GROUP_ID") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

interface SupportRequest {
  ticketId: string;
  userId: string;
  userMessage: string;
  role?: "user" | "agent" | "human";
}

async function sendTelegramNotification(
  ticketId: string,
  userName: string,
  userMessage: string,
  priority: "escalation" | "reply" = "escalation"
): Promise<boolean> {
  if (!telegramBotToken || !telegramGroupId) {
    console.warn("Telegram not configured for support notifications");
    return false;
  }

  try {
    const escapeHtml = (text: string) =>
      text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    let message = "";
    if (priority === "escalation") {
      message = `<b>🔔 New Support Escalation</b>\n\n<b>Ticket:</b> #${ticketId}\n<b>From:</b> ${escapeHtml(userName)}\n\n<b>Message:</b>\n${escapeHtml(userMessage)}\n\n<a href="https://t.me/chosech_bot?start=ticket_${ticketId}">View Ticket</a>`;
    } else {
      message = `<b>💬 New Reply on Ticket #${ticketId}</b>\n\n${escapeHtml(userMessage)}`;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramGroupId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
    return false;
  }
}

async function processUserMessage(
  ticketId: string,
  userId: string,
  userMessage: string
): Promise<{
  success: boolean;
  agentResponse?: string;
  escalated?: boolean;
  error?: string;
}> {
  try {
    const { error: insertError } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        role: "user",
        message_text: userMessage,
        metadata: { intent: "user_inquiry" },
      });

    if (insertError) {
      console.error("Error saving user message:", insertError);
      return { success: false, error: insertError.message };
    }

    const escalationKeywords = [
      "חבר אותי לנציג",
      "אדם",
      "human",
      "representative",
      "support",
      "עזרה",
      "speak to human",
    ];

    const shouldEscalate = escalationKeywords.some((keyword) =>
      userMessage.toLowerCase().includes(keyword.toLowerCase())
    );

    if (shouldEscalate) {
      const { error: updateError } = await supabase
        .from("support_tickets")
        .update({
          status: "human_assigned",
          escalated_at: new Date().toISOString(),
        })
        .eq("id", ticketId);

      if (updateError) {
        console.error("Error updating ticket status:", updateError);
      }

      const { data: userData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      const userName = userData?.full_name || "User";

      await sendTelegramNotification(ticketId, userName, userMessage);

      await supabase.from("support_messages").insert({
        ticket_id: ticketId,
        role: "agent",
        message_text:
          "Your request has been escalated to a human representative. They will respond shortly.",
        metadata: { type: "escalation_notification" },
      });

      return {
        success: true,
        escalated: true,
        agentResponse:
          "Your request has been escalated to a human representative. They will respond shortly.",
      };
    }

    const agentResponse = generateAgentResponse(userMessage);

    const { error: responseError } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        role: "agent",
        message_text: agentResponse,
        metadata: { intent: "agent_response" },
      });

    if (responseError) {
      console.error("Error saving agent response:", responseError);
      return { success: false, error: responseError.message };
    }

    return { success: true, agentResponse, escalated: false };
  } catch (error) {
    console.error("Error processing user message:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

function generateAgentResponse(userMessage: string): string {
  const responses = [
    "Thank you for your question! I'm looking at your account details. One moment please...",
    "I understand your concern. Let me help you find the best plan for your needs.",
    "Great question! Based on your usage, I can recommend a few options.",
    "I'm analyzing your current plan and comparing it with available alternatives.",
    "If you need more personalized assistance, I can connect you with a human representative.",
  ];

  const index = Math.floor(Math.random() * responses.length);
  return responses[index];
}

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 });
  }

  try {
    const body: SupportRequest = await req.json();

    if (!body.ticketId || !body.userId || !body.userMessage) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing required fields: ticketId, userId, userMessage",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: ticket, error: fetchError } = await supabase
      .from("support_tickets")
      .select("user_id")
      .eq("id", body.ticketId)
      .single();

    if (fetchError || !ticket || ticket.user_id !== body.userId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Unauthorized: ticket not found or user mismatch",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await processUserMessage(
      body.ticketId,
      body.userId,
      body.userMessage
    );

    if (!result.success) {
      return new Response(JSON.stringify({ ok: false, error: result.error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        escalated: result.escalated || false,
        agentResponse: result.agentResponse,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing support request:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
