import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// renewal-reminders — חוסך
// Triggered daily at 08:00 UTC by pg_cron + pg_net (see supabase/schema.sql).
// Queries tracked_plans for upcoming promo expirations and sends the sales team
// a Telegram digest so they can proactively call customers before the promo ends.
//
// Auth: x-webhook-secret header (same secret as notify-lead).
// GET  ?action=health   -> config status
// POST { days?: number } -> run the digest (default: 14 days look-ahead)
// ─────────────────────────────────────────────────────────────────────────────

const NL = String.fromCharCode(10);

function firstEnv(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim() !== "") return v.trim();
  }
  return "";
}

const ENV = {
  tgToken: firstEnv(["TELEGRAM_BOT_TOKEN", "TELEGRAM_TOKEN", "TG_BOT_TOKEN", "BOT_TOKEN"]),
  tgChat: firstEnv(["TELEGRAM_CHAT_ID", "TELEGRAM_CHAT", "TG_CHAT_ID", "CHAT_ID"]),
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
  } catch (_) {}
  return {};
}

type Cfg = { tgToken: string; tgChat: string; webhookSecret: string; };

async function resolveCfg(): Promise<Cfg> {
  const v = await vaultConfig();
  const pick = (vaultName: string, envVal: string) =>
    String(v[vaultName] ?? "").trim() || envVal;
  return {
    tgToken: pick("telegram_bot_token", ENV.tgToken),
    tgChat: pick("telegram_chat_id", ENV.tgChat),
    webhookSecret: pick("lead_webhook_secret", ENV.webhookSecret),
  };
}

type RenewalRow = {
  provider: string;
  plan_name: string;
  monthly_price: number;
  promo_end_date: string;
  category: string;
  name: string | null;
  phone: string | null;
};

async function fetchUpcomingRenewals(days: number): Promise<RenewalRow[]> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return [];
  try {
    const r = await fetch(`${url}/rest/v1/rpc/get_upcoming_renewals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ days }),
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? (j as RenewalRow[]) : [];
  } catch (_) { return []; }
}

const CAT_HE: Record<string, string> = {
  cellular: "סלולר", internet: "אינטרנט", tv: "טלוויזיה",
  triple: "חבילה משולבת", abroad: "חו\"ל",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function waLink(phone: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/[^0-9]/g, "");
  if (d.length < 9) return "";
  const intl = d.startsWith("0") ? "972" + d.slice(1) : d;
  return ` — <a href="https://wa.me/${intl}">WhatsApp</a>`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function buildDigest(rows: RenewalRow[], days: number): string {
  if (rows.length === 0) {
    return `📅 <b>חידושים קרובים — חוסך</b>${NL}${NL}אין מסלולים המתחדשים ב-${days} הימים הקרובים.`;
  }
  const lines: string[] = [`📅 <b>חידושים קרובים — חוסך (${days} ימים)</b>`, ""];
  for (const r of rows) {
    const d = daysUntil(r.promo_end_date);
    const urgency = d <= 3 ? "🔴" : d <= 7 ? "🟡" : "🟢";
    const cat = CAT_HE[r.category] ?? r.category;
    lines.push(`${urgency} <b>${esc(r.name ?? "ללא שם")}</b> — ${esc(r.phone ?? "")}${waLink(r.phone)}`);
    lines.push(`   📦 ${esc(r.provider)} · ${esc(r.plan_name)} · ₪${r.monthly_price}/חודש · ${cat}`);
    lines.push(`   📆 מתחדש: ${r.promo_end_date} (עוד ${d} ימים)`);
    lines.push("");
  }
  lines.push(`<i>נשלח אוטומטית על ידי מערכת חוסך</i>`);
  return lines.join(NL);
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
    return { ok: r.ok && (j as Record<string, unknown>).ok !== false, error: (j as Record<string, unknown>).description as string | undefined };
  } catch (e) { return { ok: false, error: String(e) }; }
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

  const cfg = await resolveCfg();

  if (req.method === "GET") {
    return json({
      ok: true,
      function: "renewal-reminders",
      configured: {
        telegram: { present: !!(cfg.tgToken && cfg.tgChat) },
        webhook_secret: { present: !!cfg.webhookSecret },
      },
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (provided !== cfg.webhookSecret) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) {}
  const days = typeof payload.days === "number" ? Math.min(Math.max(payload.days, 1), 90) : 14;

  const rows = await fetchUpcomingRenewals(days);
  const message = buildDigest(rows, days);
  const tg = await sendTelegram(cfg, message);

  return json({ ok: tg.ok, count: rows.length, telegram: tg });
});
