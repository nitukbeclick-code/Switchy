// security-watch — active anomaly alerting over the CRM security-audit trail.
//
// The CRM writes a tamper-evident row to public.security_audit_log for every
// admin mutation, every raw-PII reveal (crm_pii_reveal), every rate-limit trip
// (crm_rate_limited) and every admin grant (admin_grant). Those logs are PASSIVE.
// This function turns them ACTIVE: a pg_cron tick (every ~15 min) POSTs here, we
// scan the recent window (WINDOW_MIN), and if anything looks like abuse we push
// ONE Telegram alert to the owner. No anomaly ⇒ total silence (never spam an
// "all clear"). The analysis itself lives in ./lib.ts (pure, unit-tested).
//
// Auth: fail-CLOSED on the shared x-webhook-secret (identical contract to
// lead-digest / notify-lead). All reads are service-role via _shared/db.ts.
//
// Deploy: supabase functions deploy security-watch --no-verify-jwt
// Schedule: see supabase/crm-security-hardening-2026-07.sql.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { fetchRows } from "../_shared/db.ts";
import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { sendTelegram } from "../_shared/telegram.ts";
import { jlog } from "../_shared/log.ts";
import { analyze, composeAlert, WINDOW_MIN } from "./lib.ts";

type Row = Record<string, unknown>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function fetchRecent(): Promise<Row[] | null> {
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  return await fetchRows<Row>(
    `/rest/v1/security_audit_log?created_at=gte.${encodeURIComponent(since)}&select=event,user_id,created_at&order=created_at.desc&limit=2000`,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const cfg = await resolveCfgCached();
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let dryRun = false;
  try {
    const b = await req.json() as { dryRun?: boolean };
    dryRun = b?.dryRun === true;
  } catch (_) { /* empty body is fine */ }

  const rows = await fetchRecent();
  if (rows === null) {
    jlog({ at: "security-watch", ok: false, error: "audit read failed" });
    return json({ ok: false, error: "audit read failed" }, 502);
  }

  const findings = analyze(rows);
  if (!findings.length) return json({ ok: true, findings: 0 }); // silence on all-clear

  const text = composeAlert(findings, rows.length);
  if (dryRun) return json({ ok: true, dryRun: true, findings: findings.length, text });

  const sent = await sendTelegram(cfg, text);
  return json({ ok: sent.ok, findings: findings.length });
});
