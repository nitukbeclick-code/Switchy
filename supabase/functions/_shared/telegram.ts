// Telegram API helpers — single retry on 429 (honoring retry_after) and on
// transient network failures, structured logging on errors.

import type { Cfg, TgResult } from "./types.ts";
import { jlog } from "./log.ts";

export const NL = String.fromCharCode(10);

export function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function intlPhone(phone: unknown): string | null {
  const d = String(phone ?? "").replace(/[^0-9]/g, "");
  if (d.length < 9) return null;
  return d.startsWith("0") ? "972" + d.slice(1) : d;
}

export function waLink(phone: unknown): string | null {
  const intl = intlPhone(phone);
  return intl ? `https://wa.me/${intl}` : null;
}

// One-tap WhatsApp with the opener prefilled — the rep just hits send.
export function waDraftLink(phone: unknown, draft: string): string | null {
  const intl = intlPhone(phone);
  if (!intl) return null;
  return draft ? `https://wa.me/${intl}?text=${encodeURIComponent(draft)}` : `https://wa.me/${intl}`;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function tgApi(
  cfg: Cfg,
  method: string,
  body: Record<string, unknown>,
  attempt = 0,
): Promise<TgResult> {
  if (!cfg.tgToken) return { ok: false, error: "telegram token not set" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (r.status === 429 && attempt === 0) {
      const retryAfter = Number((j.parameters as Record<string, unknown> | undefined)?.retry_after ?? 1);
      jlog({ at: "tgApi", method, retry: "429", retryAfter });
      await sleep(Math.min(Math.max(retryAfter, 1), 5) * 1000);
      return await tgApi(cfg, method, body, 1);
    }
    const ok = r.ok && j.ok !== false;
    if (!ok) jlog({ at: "tgApi", method, ok: false, status: r.status, error: j.description });
    return { ok, error: j.description as string | undefined, result: j.result };
  } catch (e) {
    if (attempt === 0) {
      await sleep(800);
      return await tgApi(cfg, method, body, 1);
    }
    jlog({ at: "tgApi", method, ok: false, error: String(e) });
    return { ok: false, error: String(e) };
  }
}

export async function sendTelegram(
  cfg: Cfg,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<TgResult> {
  if (!cfg.tgToken || !cfg.tgChat) return { ok: false, error: "telegram not configured" };
  const r = await tgApi(cfg, "sendMessage", {
    chat_id: cfg.tgChat,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  // A message that Telegram permanently rejects (HTML-escape expansion pushed
  // it past 4096 chars, or broken entities) would otherwise poison the sweep
  // and follow-up queues forever — degrade to clipped plain text instead.
  if (!r.ok && /too long|can't parse/i.test(String(r.error ?? ""))) {
    jlog({ at: "sendTelegram", fallback: "plain", error: r.error });
    return await tgApi(cfg, "sendMessage", {
      chat_id: cfg.tgChat,
      text: text.replace(/<[^>]+>/g, "").slice(0, 3900),
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
  return r;
}
