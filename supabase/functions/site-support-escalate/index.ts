// site-support-escalate — חוסך human-rep escalation
// Public, unauthenticated. Called by the global floating chat widget
// (site/script.js, every page) when a visitor asks for a human, or clicks
// "🆘 לדבר עם נציג". Sends an immediate Telegram notification with the
// visitor's message + recent chat context, returns the same Hebrew
// acknowledgement used by the Flutter app's support-agent escalation.
//
// POST { message: string, history?: Array<{role:'user'|'bot', text:string}>, page?: string }
// -> { ok: true, reply: string }
//
// Stateless: no database writes. Fail-soft: Telegram errors are logged but
// the visitor still gets a success reply.
//
// Deploy: supabase functions deploy site-support-escalate --no-verify-jwt

const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY = 6;
const MAX_HISTORY_IN_NOTIFICATION = 2;

// Exact string from supabase/functions/support-agent/index.ts — keep in sync.
const ESCALATION_MESSAGE = "הפנייה שלך הועברה לנציג אנושי, הוא יחזור אליך בקרוב";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

function firstEnv(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim() !== "") return v.trim();
  }
  return "";
}

function jlog(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
  } catch (_) {
    console.log(String(fields.at ?? "log"), String(fields.error ?? ""));
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
  });
}

// Same escaping as telegram-webhook/index.ts — keep in sync.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTelegramMessage(message: string, history: ChatMessage[], page: string): string {
  const lines: string[] = ["🆘 <b>פנייה לנציג מהאתר</b>", ""];
  if (history.length) {
    lines.push("<b>הקשר השיחה:</b>");
    for (const h of history.slice(-MAX_HISTORY_IN_NOTIFICATION)) {
      const who = h.role === "user" ? "🙋 משתמש" : "🤖 חוסך AI";
      lines.push(`${who}: ${escapeHtml(h.text.slice(0, MAX_MESSAGE_LEN))}`);
    }
    lines.push("");
  }
  lines.push("<b>הודעה:</b>", escapeHtml(message), "");
  if (page) lines.push(`<b>עמוד:</b> ${escapeHtml(page)}`);
  lines.push(`<b>זמן:</b> ${escapeHtml(new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }))}`);
  return lines.join("\n");
}

async function sendTelegramNotification(text: string): Promise<void> {
  const botToken = firstEnv(["TELEGRAM_BOT_TOKEN"]);
  const groupId = firstEnv(["TELEGRAM_SUPPORT_GROUP_ID"]);
  if (!botToken || !groupId) {
    jlog({ at: "site-support-escalate", ok: false, error: "telegram not configured" });
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: groupId, text, parse_mode: "HTML" }),
  });
  if (!res.ok) jlog({ at: "site-support-escalate", ok: false, status: res.status });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  let body: { message?: unknown; history?: unknown; page?: unknown };
  try {
    body = await req.json();
  } catch (_) {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_LEN);
  if (!message) return json({ ok: false, error: "missing message" }, 400);

  const history: ChatMessage[] = Array.isArray(body.history)
    ? body.history
      .filter((h): h is ChatMessage =>
        !!h && (h.role === "user" || h.role === "bot") && typeof h.text === "string")
      .slice(-MAX_HISTORY)
    : [];

  const page = String(body.page ?? "").trim().slice(0, 200);

  try {
    await sendTelegramNotification(buildTelegramMessage(message, history, page));
  } catch (e) {
    jlog({ at: "site-support-escalate", ok: false, error: String(e) });
  }

  return json({ ok: true, reply: ESCALATION_MESSAGE });
});
