// Config resolution (Vault-first, env fallback) + secret comparison helpers.
// Shared by notify-lead and renewal-reminders.

import type { Cfg } from "./types.ts";

export function firstEnv(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (v && v.trim() !== "") return v.trim();
  }
  return "";
}

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

function parseUserIds(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
}

async function resolveCfg(): Promise<Cfg> {
  const v = await vaultConfig();
  const pick = (vaultName: string, envVal: string): [string, string] => {
    const vv = String(v[vaultName] ?? "").trim();
    if (vv) return [vv, "vault"];
    return envVal ? [envVal, "env"] : ["", "none"];
  };
  const [tgToken, a] = pick("telegram_bot_token", firstEnv(["TELEGRAM_BOT_TOKEN", "TELEGRAM_TOKEN", "TG_BOT_TOKEN", "BOT_TOKEN", "TELEGRAM_KEY"]));
  const [tgChat, b] = pick("telegram_chat_id", firstEnv(["TELEGRAM_CHAT_ID", "TELEGRAM_CHAT", "TG_CHAT_ID", "CHAT_ID"]));
  const [resend, c] = pick("resend_api_key", firstEnv(["RESEND_API_KEY", "RESEND_KEY", "RESEND_TOKEN"]));
  const [resendFrom, d] = pick("resend_from", firstEnv(["RESEND_FROM", "LEADS_FROM_EMAIL", "EMAIL_FROM"]));
  const [notifyEmail, e] = pick("leads_notify_email", firstEnv(["LEADS_NOTIFY_EMAIL", "LEADS_TO_EMAIL", "TEAM_EMAIL", "NOTIFY_EMAIL"]));
  const [openai, f] = pick("openai_api_key", firstEnv(["OPENAI_API_KEY", "OPENAI_KEY"]));
  const [anthropic, g] = pick("anthropic_api_key", firstEnv(["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"]));
  const [webhookSecret, h] = pick("lead_webhook_secret", firstEnv(["LEAD_WEBHOOK_SECRET", "WEBHOOK_SECRET"]));
  const [allowedCsv, i] = pick("telegram_allowed_user_ids", firstEnv(["TELEGRAM_ALLOWED_USER_IDS"]));
  return {
    tgToken, tgChat, resend, resendFrom, notifyEmail, openai, anthropic, webhookSecret,
    allowedUserIds: parseUserIds(allowedCsv),
    src: {
      telegram_bot_token: a, telegram_chat_id: b, resend_api_key: c, resend_from: d,
      leads_notify_email: e, openai_api_key: f, anthropic_api_key: g, lead_webhook_secret: h,
      telegram_allowed_user_ids: i,
    },
  };
}

// Vault lookups hit PostgREST with the service-role key; memoize briefly so
// anonymous traffic (health probes, 401s) can't amplify into DB load.
let cfgCache: { cfg: Cfg; at: number } | null = null;
export async function resolveCfgCached(): Promise<Cfg> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.cfg;
  const cfg = await resolveCfg();
  cfgCache = { cfg, at: Date.now() };
  return cfg;
}

// Telegram's secret_token charset is restricted to [A-Za-z0-9_-], while
// lead_webhook_secret is unconstrained — register/verify a hex digest instead.
export async function tgWebhookToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time secret comparison: digest both sides to fixed length, then
// XOR-compare every byte so timing reveals nothing about the expected value.
export async function safeEqual(a: string, b: string): Promise<boolean> {
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
