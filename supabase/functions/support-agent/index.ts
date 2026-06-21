import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// ─────────────────────────────────────────────────────────────────────────────
// support-agent — in-app support chat (support_tickets / support_messages)
// Real Gemini-backed replies (was a random canned placeholder). Escalation to
// the team Telegram on human-request keywords is unchanged.
//
// Deployed standalone via the Supabase dashboard (not part of the repo CI), so
// this file is intentionally self-contained — no ../_shared imports.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const telegramGroupId = Deno.env.get("TELEGRAM_SUPPORT_GROUP_ID") || "";
// Same key the marketing site-ai-chat uses; falls back to the Google alias.
const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_KEY") || "";

const supabase = createClient(supabaseUrl, supabaseKey);

// Tried in order; a 404 (model renamed/retired) advances to the next candidate.
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const MAX_OUTPUT_TOKENS = 320;
const MAX_HISTORY = 8;

const SUPPORT_SYSTEM =
  'את/ה נציג/ת תמיכה וירטואלי/ת של "חוסך" (Switchy) — שירות ישראלי להשוואת מסלולי ' +
  'סלולר/אינטרנט/טלוויזיה/חו"ל ומעבר ספק. כללים: ענה/י בעברית בלבד, קצר וחם (2-4 משפטים), ' +
  'עזור/י עם שאלות על האתר/האפליקציה, השוואת מסלולים, תהליך מעבר ספק וחשבון המשתמש. אל ' +
  'תמציא/י מחירים או מסלולים ספציפיים — להמלצה מדויקת הפנה/י להשוואה באתר. אם אינך יודע/ת, ' +
  'או שהמשאלה דורשת טיפול אנושי (מקרה חשבון ספציפי, תלונה, בקשה מורכבת) — הצע/י בעדינות ' +
  'להעביר לנציג אנושי (המשתמש יכול לכתוב "חבר אותי לנציג").';

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
  priority: "escalation" | "reply" = "escalation",
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
      message =
        `<b>🔔 New Support Escalation</b>\n\n<b>Ticket:</b> #${ticketId}\n<b>From:</b> ${escapeHtml(userName)}\n\n<b>Message:</b>\n${escapeHtml(userMessage)}\n\n<a href="https://t.me/chosech_bot?start=ticket_${ticketId}">View Ticket</a>`;
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
      },
    );

    return response.ok;
  } catch (error) {
    console.error("Error sending Telegram notification:", error);
    return false;
  }
}

type ChatTurn = { role: string; text: string };

async function callGeminiModel(
  model: string,
  history: ChatTurn[],
  message: string,
): Promise<Response> {
  const contents = [
    ...history.slice(-MAX_HISTORY).map((h) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: String(h.text ?? "").slice(0, 500) }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SUPPORT_SYSTEM }] },
        contents,
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
      }),
    },
  );
}

// Real AI reply (was a random canned string). Fail-soft: on any error returns a
// short honest message that nudges toward a human rep, so the chat never breaks.
async function generateAgentResponse(message: string, history: ChatTurn[]): Promise<string> {
  const FALLBACK =
    "לא הצלחתי להתחבר כרגע 🙏 אפשר לנסות שוב, או לכתוב \"חבר אותי לנציג\" ונציג אנושי יחזור אליך.";
  if (!geminiKey) return FALLBACK;
  let lastStatus = 0;
  for (const model of GEMINI_MODELS) {
    try {
      const r = await callGeminiModel(model, history, message);
      if (r.ok) {
        const j = await r.json();
        const text = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
        const out = String(text).trim();
        if (out) return out;
        return FALLBACK;
      }
      lastStatus = r.status;
      if (r.status !== 404) break; // auth/quota/5xx — stop, don't mask
    } catch (_) {
      break;
    }
  }
  console.error("support-agent gemini failed:", lastStatus);
  return FALLBACK;
}

async function processUserMessage(
  ticketId: string,
  userId: string,
  userMessage: string,
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
        .select("name")
        .eq("id", userId)
        .single();

      const userName = userData?.name || "User";

      await sendTelegramNotification(ticketId, userName, userMessage);

      const escalationMsg =
        "העברתי את הפנייה לנציג אנושי 🙋 הוא יחזור אליך בהקדם. אפשר להמשיך לכתוב כאן בינתיים.";
      await supabase.from("support_messages").insert({
        ticket_id: ticketId,
        role: "agent",
        message_text: escalationMsg,
        metadata: { type: "escalation_notification" },
      });

      return { success: true, escalated: true, agentResponse: escalationMsg };
    }

    // Real AI reply, grounded by the recent ticket history for context.
    const { data: prior } = await supabase
      .from("support_messages")
      .select("role, message_text")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY);
    const history: ChatTurn[] = (prior ?? [])
      .reverse()
      .map((m: { role: string; message_text: string }) => ({
        role: m.role === "user" ? "user" : "bot",
        text: m.message_text,
      }));

    const agentResponse = await generateAgentResponse(userMessage, history);

    const { error: responseError } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        role: "agent",
        message_text: agentResponse,
        metadata: { intent: "agent_response", ai: "gemini" },
      });

    if (responseError) {
      console.error("Error saving agent response:", responseError);
      return { success: false, error: responseError.message };
    }

    return { success: true, agentResponse, escalated: false };
  } catch (error) {
    console.error("Error processing user message:", error);
    return { success: false, error: String(error) };
  }
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
        { status: 400, headers: { "Content-Type": "application/json" } },
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
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await processUserMessage(
      body.ticketId,
      body.userId,
      body.userMessage,
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
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error processing support request:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
