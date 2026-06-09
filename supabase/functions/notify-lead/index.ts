import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// notify-lead — חוסך
// Fired by a Postgres trigger on every INSERT into public.leads (app, website,
// anywhere). Sends the lead to the team's Telegram chat + an email via Resend,
// with an optional one-line AI triage.
//
// Config resolution: each value is read from Vault first (via the service-role
// RPC public.get_lead_notify_config, using the auto-injected SERVICE_ROLE_KEY),
// then falls back to an Edge Function env var. This lets values that can't be set
// as Edge secrets (managed here) live in Vault, while keys set in the dashboard
// still work. verify_jwt is disabled; the webhook is authed by a shared secret.
//
// GET ?action=health         -> which integrations are configured + source
// GET ?action=telegram-chats -> recent chats for the bot (find chat_id); gated
// POST (webhook)             -> { record } from the trigger, or a raw lead
//
// Deploy: supabase functions deploy notify-lead --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

function firstEnv(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim() !== "") return v.trim();
  }
  return "";
}

const ENV = {
  tgToken: firstEnv(["TELEGRAM_BOT_TOKEN", "TELEGRAM_TOKEN", "TG_BOT_TOKEN", "BOT_TOKEN", "TELEGRAM_KEY"]),
  tgChat: firstEnv(["TELEGRAM_CHAT_ID", "TELEGRAM_CHAT", "TG_CHAT_ID", "CHAT_ID"]),
  resend: firstEnv(["RESEND_API_KEY", "RESEND_KEY", "RESEND_TOKEN"]),
  resendFrom: firstEnv(["RESEND_FROM", "LEADS_FROM_EMAIL", "EMAIL_FROM"]),
  notifyEmail: firstEnv(["LEADS_NOTIFY_EMAIL", "LEADS_TO_EMAIL", "TEAM_EMAIL", "NOTIFY_EMAIL"]),
  openai: firstEnv(["OPENAI_API_KEY", "OPENAI_KEY"]),
  anthropic: firstEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"]),
  webhookSecret: firstEnv(["LEAD_WEBHOOK_SECRET", "WEBHOOK_SECRET"]),
};

async function vaultConfig(): Promise<Record<string, string>> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return {};
  try {
    const r = await fetch(`${url}/rest/v1/rpc/get_lead_notify_config`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` },
      body: "{}",
    });
    if (r.ok) {
      const j = await r.json();
      if (j && typeof j === "object") return j as Record<string, string>;
    }
  } catch (_) { /* ignore — fall back to env */ }
  return {};
}

type Cfg = {
  tgToken: string; tgChat: string; resend: string; resendFrom: string;
  notifyEmail: string; openai: string; anthropic: string; webhookSecret: string;
  src: Record<string, string>;
};

async function resolveCfg(): Promise<Cfg> {
  const v = await vaultConfig();
  const pick = (vaultName: string, envVal: string): [string, string] => {
    const vv = String(v[vaultName] ?? "").trim();
    if (vv) return [vv, "vault"];
    return envVal ? [envVal, "env"] : ["", "none"];
  };
  const [tgToken, a] = pick("telegram_bot_token", ENV.tgToken);
  const [tgChat, b] = pick("telegram_chat_id", ENV.tgChat);
  const [resend, c] = pick("resend_api_key", ENV.resend);
  const [resendFrom, d] = pick("resend_from", ENV.resendFrom);
  const [notifyEmail, e] = pick("leads_notify_email", ENV.notifyEmail);
  const [openai, f] = pick("openai_api_key", ENV.openai);
  const [anthropic, g] = pick("anthropic_api_key", ENV.anthropic);
  const [webhookSecret, h] = pick("lead_webhook_secret", ENV.webhookSecret);
  return {
    tgToken, tgChat, resend, resendFrom, notifyEmail, openai, anthropic, webhookSecret,
    src: {
      telegram_bot_token: a, telegram_chat_id: b, resend_api_key: c, resend_from: d,
      leads_notify_email: e, openai_api_key: f, anthropic_api_key: g, lead_webhook_secret: h,
    },
  };
}

const CALLBACK_HE: Record<string, string> = { now: "עכשיו", noon: "בצהריים", evening: "בערב", tomorrow: "מחר" };
const NL = String.fromCharCode(10);

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function waLink(phone: unknown): string | null {
  const d = String(phone ?? "").replace(/[^0-9]/g, "");
  if (d.length < 9) return null;
  return `https://wa.me/${d.startsWith("0") ? "972" + d.slice(1) : d}`;
}

async function aiTriage(cfg: Cfg, lead: Record<string, unknown>): Promise<string> {
  const sys = "אתה עוזר מכירות לחברת השוואת תקשורת. נסח בעברית שורה אחת קצרה (עד 18 מילים) שמסכמת את הפנייה ומעריכה כוונת רכישה. בלי הקדמות, רק המשפט.";
  const user = `פנייה חדשה: שם=${lead.name ?? ""}, ספק=${lead.provider ?? ""}, מסלול=${lead.plan_id ?? ""}, זמן חזרה מועדף=${lead.callback_time ?? ""}.`;
  try {
    if (cfg.openai) {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${cfg.openai}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 80, temperature: 0.3, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
      });
      if (r.ok) { const j = await r.json(); return (j.choices?.[0]?.message?.content ?? "").trim(); }
    } else if (cfg.anthropic) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": cfg.anthropic, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 100, system: sys, messages: [{ role: "user", content: user }] }),
      });
      if (r.ok) { const j = await r.json(); return (j.content?.[0]?.text ?? "").trim(); }
    }
  } catch (_) { /* fail-soft: triage is optional */ }
  return "";
}

async function sendTelegram(cfg: Cfg, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.tgToken || !cfg.tgChat) return { ok: false, error: "telegram not configured" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.tgChat, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j.ok !== false, error: j.description };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function sendEmail(cfg: Cfg, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.resend || !cfg.resendFrom || !cfg.notifyEmail) return { ok: false, error: "resend not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.resendFrom, to: [cfg.notifyEmail], subject, html }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, error: j?.message ?? j?.name };
  } catch (e) { return { ok: false, error: String(e) }; }
}

function buildText(lead: Record<string, unknown>, triage: string): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const wa = waLink(lead.phone);
  const lines: (string | null)[] = [
    "🔔 <b>פנייה חדשה — חוסך</b>",
    "",
    `👤 <b>שם:</b> ${esc(lead.name)}`,
    `📞 <b>טלפון:</b> ${esc(lead.phone)}` + (wa ? ` — <a href="${wa}">WhatsApp</a>` : ""),
    lead.email ? `📧 <b>אימייל:</b> ${esc(lead.email)}` : null,
    (lead.provider || lead.plan_id) ? `📦 <b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}` : null,
    `⏰ <b>זמן חזרה מועדף:</b> ${esc(cb)}`,
    triage ? "" : null,
    triage ? `🤖 <i>${esc(triage)}</i>` : null,
  ];
  return lines.filter((x) => x !== null).join(NL);
}

function buildHtml(lead: Record<string, unknown>, triage: string): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#15281e">`
    + `<h2 style="color:#15603E">🔔 פנייה חדשה — חוסך</h2>`
    + `<p><b>שם:</b> ${esc(lead.name)}<br>`
    + `<b>טלפון:</b> ${esc(lead.phone)}<br>`
    + (lead.email ? `<b>אימייל:</b> ${esc(lead.email)}<br>` : "")
    + `<b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}<br>`
    + `<b>זמן חזרה מועדף:</b> ${esc(cb)}</p>`
    + (triage ? `<p style="background:#F4F0E8;padding:10px;border-radius:8px">🤖 ${esc(triage)}</p>` : "")
    + `</div>`;
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
  const cfg = await resolveCfg();

  if (req.method === "GET") {
    if (action === "health" || action === null) {
      return json({
        ok: true,
        function: "notify-lead",
        configured: {
          telegram_bot_token: { present: !!cfg.tgToken, source: cfg.src.telegram_bot_token },
          telegram_chat_id: { present: !!cfg.tgChat, source: cfg.src.telegram_chat_id },
          resend_api_key: { present: !!cfg.resend, source: cfg.src.resend_api_key },
          resend_from: { present: !!cfg.resendFrom, source: cfg.src.resend_from },
          leads_notify_email: { present: !!cfg.notifyEmail, source: cfg.src.leads_notify_email },
          ai_key: { present: !!(cfg.openai || cfg.anthropic), source: cfg.openai ? cfg.src.openai_api_key : cfg.src.anthropic_api_key },
          lead_webhook_secret: { present: !!cfg.webhookSecret, source: cfg.src.lead_webhook_secret },
        },
      });
    }
    if (action === "telegram-chats") {
      const provided = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
      if (!cfg.webhookSecret || provided !== cfg.webhookSecret) return json({ ok: false, error: "unauthorized" }, 401);
      if (!cfg.tgToken) return json({ ok: false, error: "telegram token not set" }, 400);
      const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/getUpdates`);
      const j = await r.json();
      const seen: Record<string, unknown> = {};
      for (const u of (j.result ?? [])) {
        const c = u.message?.chat ?? u.channel_post?.chat ?? u.my_chat_member?.chat ?? u.edited_message?.chat;
        if (c && c.id !== undefined) seen[String(c.id)] = { id: c.id, type: c.type, title: c.title, username: c.username, first_name: c.first_name };
      }
      return json({ ok: true, telegram_ok: j.ok !== false, error: j.description, hint: "Message the bot or add it to your group, then call again. Use one of these ids as telegram_chat_id.", chats: Object.values(seen) });
    }
    return json({ ok: false, error: "unknown action" }, 400);
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (provided !== cfg.webhookSecret) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body */ }
  const lead = (payload.record ?? payload.lead ?? payload) as Record<string, unknown>;
  if (!lead || (!lead.name && !lead.phone)) return json({ ok: false, error: "no lead in payload" }, 400);

  const triage = await aiTriage(cfg, lead);
  const [tg, email] = await Promise.all([
    sendTelegram(cfg, buildText(lead, triage)),
    sendEmail(cfg, "🔔 פנייה חדשה — חוסך", buildHtml(lead, triage)),
  ]);

  return json({ ok: tg.ok || email.ok, telegram: tg, email });
});
