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
// GET ?action=health                  -> which integrations are configured + source
// GET ?action=telegram-chats          -> recent chats for the bot (find chat_id); gated, header-only secret
// GET ?action=set-telegram-webhook    -> register this function as the bot's webhook; gated
// GET ?action=delete-telegram-webhook -> unregister (re-enables telegram-chats); gated
// POST (webhook)                      -> { record } from the trigger, or a raw lead
// POST ?action=telegram-update        -> Telegram callback_query webhook (status buttons)
//
// The lead message carries inline status buttons (דיברתי / נסגר / לא רלוונטי);
// pressing one updates leads.status, which the app's tracker streams live.
// After a successful send the lead is stamped notified_at — the daily
// renewal-reminders run re-delivers anything left unstamped (safety net).
// The team chat can also text the bot: /leads (open leads with buttons),
// /stats (pipeline by source/status), /help.
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

// Vault lookups hit PostgREST with the service-role key; memoize briefly so
// anonymous traffic (health probes, 401s) can't amplify into DB load.
let cfgCache: { cfg: Cfg; at: number } | null = null;
async function resolveCfgCached(): Promise<Cfg> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.cfg;
  const cfg = await resolveCfg();
  cfgCache = { cfg, at: Date.now() };
  return cfg;
}

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

// ── Service-role REST helpers ────────────────────────────────────────────────

async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}`,
      "Prefer": "return=minimal", ...(init.headers ?? {}),
    },
  });
}

// Stamp the lead as notified so the daily sweep in renewal-reminders doesn't
// re-send it. Fail-soft: a missed stamp costs at most one duplicate message.
async function markNotified(leadId: unknown): Promise<void> {
  if (!leadId) return;
  try {
    await serviceFetch(`/rest/v1/leads?id=eq.${encodeURIComponent(String(leadId))}`, {
      method: "PATCH",
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    });
  } catch (_) { /* the sweep retries */ }
}

async function updateLeadStatus(leadId: string, status: string): Promise<boolean> {
  try {
    // return=representation: a PATCH matching zero rows (deleted lead) still
    // answers 204 under return=minimal — count the rows to report real success.
    const r = await serviceFetch(`/rest/v1/leads?id=eq.${encodeURIComponent(leadId)}`, {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify({ status }),
    });
    if (!r || !r.ok) return false;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) { return false; }
}

// ── Telegram helpers ─────────────────────────────────────────────────────────

async function tgApi(cfg: Cfg, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.tgToken) return { ok: false, error: "telegram token not set" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && (j as Record<string, unknown>).ok !== false, error: (j as Record<string, unknown>).description as string | undefined };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// Telegram's secret_token charset is restricted to [A-Za-z0-9_-], while
// lead_webhook_secret is unconstrained — register/verify a hex digest instead.
async function tgWebhookToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time secret comparison: digest both sides to fixed length, then
// XOR-compare every byte so timing reveals nothing about the expected value.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const ua = new Uint8Array(da), ub = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

const STATUS_HE: Record<string, string> = { contacted: "דיברתי", won: "נסגר", lost: "לא רלוונטי" };
const STATUS_EMOJI: Record<string, string> = { contacted: "📞", won: "🏆", lost: "❌" };

// Inline status buttons under the lead message. Pressing one fires a
// callback_query back to this function (?action=telegram-update), which
// updates leads.status — the app's tracker (leadStepStream) picks it up live.
function leadKeyboard(leadId: unknown): Record<string, unknown> | undefined {
  if (!leadId) return undefined;
  const id = String(leadId);
  return {
    inline_keyboard: [
      [
        { text: `${STATUS_EMOJI.contacted} דיברתי`, callback_data: `lead:${id}:contacted` },
        { text: `${STATUS_EMOJI.won} נסגר`, callback_data: `lead:${id}:won` },
      ],
      [{ text: `${STATUS_EMOJI.lost} לא רלוונטי`, callback_data: `lead:${id}:lost` }],
    ],
  };
}

async function aiTriage(cfg: Cfg, lead: Record<string, unknown>): Promise<string> {
  const sys = "אתה עוזר מכירות לחברת השוואת תקשורת. נסח בעברית שורה אחת קצרה (עד 18 מילים) שמסכמת את הפנייה ומעריכה כוונת רכישה. בלי הקדמות, רק המשפט.";
  const user = `פנייה חדשה: שם=${lead.name ?? ""}, ספק=${lead.provider ?? ""}, מסלול=${lead.plan_id ?? ""}, זמן חזרה מועדף=${lead.callback_time ?? ""}${lead.notes ? `, הקשר: ${lead.notes}` : ""}.`;
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

async function sendTelegram(cfg: Cfg, text: string, replyMarkup?: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.tgToken || !cfg.tgChat) return { ok: false, error: "telegram not configured" };
  return await tgApi(cfg, "sendMessage", {
    chat_id: cfg.tgChat, text, parse_mode: "HTML", disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
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

const SOURCE_HE: Record<string, string> = { form: "טופס", plan: "דף מסלול", compare: "השוואה", advisor: "יועץ AI", callback: "בקשת התקשרות", porting: "ניוד" };

function buildText(lead: Record<string, unknown>, triage: string): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const wa = waLink(lead.phone);
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : null);
  const lines: (string | null)[] = [
    "🔔 <b>פנייה חדשה — חוסך</b>",
    "",
    `👤 <b>שם:</b> ${esc(lead.name)}`,
    `📞 <b>טלפון:</b> ${esc(lead.phone)}` + (wa ? ` — <a href="${wa}">WhatsApp</a>` : ""),
    lead.email ? `📧 <b>אימייל:</b> ${esc(lead.email)}` : null,
    (lead.provider || lead.plan_id) ? `📦 <b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}` : null,
    `⏰ <b>זמן חזרה מועדף:</b> ${esc(cb)}`,
    sourceLabel ? `📌 <b>מקור:</b> ${esc(sourceLabel)}` : null,
    lead.notes ? `📋 <b>הקשר:</b> ${esc(String(lead.notes).slice(0, 1500))}` : null,
    triage ? "" : null,
    triage ? `🤖 <i>${esc(triage)}</i>` : null,
  ];
  return lines.filter((x) => x !== null).join(NL);
}

function buildHtml(lead: Record<string, unknown>, triage: string): string {
  const cb = CALLBACK_HE[String(lead.callback_time ?? "")] ?? String(lead.callback_time ?? "—");
  const sourceLabel = SOURCE_HE[String(lead.source ?? "")] ?? (lead.source ? String(lead.source) : null);
  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#15281e">`
    + `<h2 style="color:#15603E">🔔 פנייה חדשה — חוסך</h2>`
    + `<p><b>שם:</b> ${esc(lead.name)}<br>`
    + `<b>טלפון:</b> ${esc(lead.phone)}<br>`
    + (lead.email ? `<b>אימייל:</b> ${esc(lead.email)}<br>` : "")
    + `<b>ספק / מסלול:</b> ${esc(lead.provider ?? "—")} / ${esc(lead.plan_id ?? "—")}<br>`
    + `<b>זמן חזרה מועדף:</b> ${esc(cb)}<br>`
    + (sourceLabel ? `<b>מקור:</b> ${esc(sourceLabel)}<br>` : "")
    + (lead.notes ? `<b>הקשר:</b> ${esc(String(lead.notes))}<br>` : "")
    + `</p>`
    + (triage ? `<p style="background:#F4F0E8;padding:10px;border-radius:8px">🤖 ${esc(triage)}</p>` : "")
    + `</div>`;
}

// ── Team chat commands (/leads, /stats, /help) ───────────────────────────────

async function fetchRows(path: string): Promise<Record<string, unknown>[]> {
  try {
    const r = await serviceFetch(path, { method: "GET" });
    if (!r || !r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch (_) { return []; }
}

async function handleCommand(cfg: Cfg, cmd: string): Promise<{ ok: boolean; command: string }> {
  if (cmd === "/leads") {
    const open = await fetchRows("/rest/v1/leads?status=in.(new,contacted)&order=created_at.desc&limit=5&select=*");
    if (open.length === 0) {
      await sendTelegram(cfg, "📭 אין לידים פתוחים — הכול טופל 🎉");
      return { ok: true, command: cmd };
    }
    await sendTelegram(cfg, `📬 <b>${open.length} הלידים הפתוחים האחרונים</b> (חדש / בטיפול):`);
    // oldest of the batch first so the newest lands closest to the input box
    for (const lead of open.reverse()) {
      await sendTelegram(cfg, buildText(lead, ""), leadKeyboard(lead.id));
    }
    return { ok: true, command: cmd };
  }
  if (cmd === "/stats") {
    const rows = await fetchRows("/rest/v1/leads_by_source?select=*");
    if (rows.length === 0) {
      await sendTelegram(cfg, "📊 אין עדיין לידים במערכת.");
      return { ok: true, command: cmd };
    }
    const tot = (k: string) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const lines = [
      "📊 <b>סטטיסטיקת לידים — חוסך</b>",
      "",
      `סה"כ: <b>${tot("total")}</b> | 🆕 ${tot("new_leads")} | 📞 ${tot("contacted")} | 🏆 ${tot("won")} | ❌ ${tot("lost")}`,
      "",
      "<b>לפי מקור:</b>",
      ...rows.map((r) => {
        const label = SOURCE_HE[String(r.source ?? "")] ?? String(r.source ?? "");
        return `• ${esc(label)} — ${r.total} (${r.new_leads} חדשים, ${r.won} נסגרו)`;
      }),
    ];
    await sendTelegram(cfg, lines.join(NL));
    return { ok: true, command: cmd };
  }
  // /help and anything unrecognized
  await sendTelegram(cfg, [
    "🤖 <b>הנציג הדיגיטלי של חוסך</b>",
    "",
    "/leads — חמשת הלידים הפתוחים האחרונים, עם כפתורי סטטוס",
    "/stats — סטטיסטיקת הלידים לפי מקור וסטטוס",
    "/help — ההודעה הזו",
    "",
    "<i>כל ליד חדש מגיע לכאן אוטומטית עם כפתורי דיברתי / נסגר / לא רלוונטי.</i>",
  ].join(NL));
  return { ok: true, command: cmd };
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
        },
      });
    }
    if (action === "telegram-chats") {
      // header-only: secrets in query strings leak into request logs
      const provided = req.headers.get("x-webhook-secret") ?? "";
      if (!cfg.webhookSecret || !(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);
      if (!cfg.tgToken) return json({ ok: false, error: "telegram token not set" }, 400);
      // explicit empty allowed_updates: resets the bot-global filter a previous
      // setWebhook(allowed_updates:["callback_query"]) leaves behind — without
      // it, message updates (needed for chat discovery) never arrive again.
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
      return json({
        ...r,
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
    let update: Record<string, unknown> = {};
    try { update = await req.json(); } catch (_) { /* empty body */ }

    // Text commands from the team chat (/leads, /stats, /help).
    const teamMsg = update.message as Record<string, unknown> | undefined;
    if (teamMsg) {
      const msgChatId = (teamMsg.chat as Record<string, unknown> | undefined)?.id;
      if (cfg.tgChat && String(msgChatId ?? "") !== cfg.tgChat) return json({ ok: true, skipped: "wrong chat" });
      const text = String(teamMsg.text ?? "").trim();
      if (!text.startsWith("/")) return json({ ok: true, skipped: "not a command" });
      // group commands arrive as /leads@BotName — strip the mention
      const cmd = text.split(/[\s@]/)[0].toLowerCase();
      return json(await handleCommand(cfg, cmd));
    }

    const cb = update.callback_query as Record<string, unknown> | undefined;
    if (!cb) return json({ ok: true, skipped: "not a callback_query" });
    const m = String(cb.data ?? "").match(/^lead:([0-9a-fA-F-]{36}):(contacted|won|lost)$/);
    if (!m) {
      // includes presses on the frozen "handled" stamp — just stop the spinner
      await tgApi(cfg, "answerCallbackQuery", { callback_query_id: cb.id });
      return json({ ok: true, skipped: "unrecognized callback" });
    }
    const [, leadId, status] = m;
    const msg = cb.message as Record<string, unknown> | undefined;
    const from = cb.from as Record<string, unknown> | undefined;
    const chatId = (msg?.chat as Record<string, unknown> | undefined)?.id;
    // Honor presses only from the configured team chat — the bot may be a
    // member of other chats, but lead status changes belong to the team.
    if (cfg.tgChat && String(chatId ?? "") !== cfg.tgChat) {
      await tgApi(cfg, "answerCallbackQuery", { callback_query_id: cb.id });
      return json({ ok: false, skipped: "wrong chat" });
    }
    const updated = await updateLeadStatus(leadId, status);
    await tgApi(cfg, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: updated ? `הסטטוס עודכן: ${STATUS_HE[status]}` : "העדכון נכשל — נסו שוב",
    });
    if (updated && msg && chatId != null) {
      const who = [from?.first_name, from?.last_name].filter(Boolean).join(" ");
      // Freeze the buttons into a stamp so the whole team sees it's handled.
      await tgApi(cfg, "editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: msg.message_id,
        reply_markup: { inline_keyboard: [[{ text: `${STATUS_EMOJI[status]} ${STATUS_HE[status]}${who ? " — " + who : ""}`, callback_data: "handled" }]] },
      });
    }
    return json({ ok: updated });
  }

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body */ }
  const lead = (payload.record ?? payload.lead ?? payload) as Record<string, unknown>;
  if (!lead || (!lead.name && !lead.phone)) return json({ ok: false, error: "no lead in payload" }, 400);

  const triage = await aiTriage(cfg, lead);
  const [tg, email] = await Promise.all([
    sendTelegram(cfg, buildText(lead, triage), leadKeyboard(lead.id)),
    sendEmail(cfg, "🔔 פנייה חדשה — חוסך", buildHtml(lead, triage)),
  ]);
  if (tg.ok || email.ok) await markNotified(lead.id);

  return json({ ok: tg.ok || email.ok, telegram: tg, email });
});
