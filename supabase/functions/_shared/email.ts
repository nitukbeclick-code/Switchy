// Resend email plumbing — one core sender shared by the team notification
// (sendEmail, → leads_notify_email) and the customer-facing meeting
// confirmation (sendCustomerEmail, → explicit recipient).

import { jlog } from "./log.ts";

async function resendSend(
  cfg: { resend: string; resendFrom: string },
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.resend || !cfg.resendFrom || !to) return { ok: false, error: "resend not configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${cfg.resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: cfg.resendFrom, to: [to], subject, html }),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (!r.ok) jlog({ at: "sendEmail", ok: false, status: r.status, error: j?.message ?? j?.name });
    return { ok: r.ok, error: (j?.message ?? j?.name) as string | undefined };
  } catch (e) {
    jlog({ at: "sendEmail", ok: false, error: String(e) });
    return { ok: false, error: String(e) };
  }
}

// Team notification — goes to the configured leads_notify_email.
export async function sendEmail(
  cfg: { resend: string; resendFrom: string; notifyEmail: string },
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.notifyEmail) return { ok: false, error: "resend not configured" };
  return await resendSend(cfg, cfg.notifyEmail, subject, html);
}

// Customer-facing email (meeting confirmations) — same plumbing, explicit
// recipient. Caller owns the address validity (it came from the booking form).
export async function sendCustomerEmail(
  cfg: { resend: string; resendFrom: string },
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  return await resendSend(cfg, to, subject, html);
}
