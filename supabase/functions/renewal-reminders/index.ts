import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// renewal-reminders — חוסך
// The bot's scheduled brain. pg_cron POSTs here with a `mode` (see the
// schedule block in supabase/schema.sql); auth is the shared x-webhook-secret.
//
// GET  ?action=health        -> config status
// POST {mode:"digest",days?} -> daily renewal digest + per-renewal "create
//                               lead" buttons for the urgent ones + open-lead
//                               count (default mode; legacy {days} works)
// POST {mode:"sweep"}        -> re-deliver unnotified leads (every 10 min);
//                               claim-before-send so overlapping runs and the
//                               trigger race can't duplicate
// POST {mode:"follow-up"}    -> hourly: SLA escalations (2h→6h→daily ladder)
//                               + "the customer asked for evening" pings
// POST {mode:"weekly"}       -> weekly business report (also /weekly in chat)
//
// Deploy: supabase functions deploy renewal-reminders --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import type { Cfg, Lead, RenewalRow } from "../_shared/types.ts";
import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import { fetchRows, patchCount, rpcRows, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { buildText, CALLBACK_HE, leadKeyboard } from "../_shared/leads.ts";
import { buildDigest, daysUntil } from "../_shared/digests.ts";
import { buildWeeklyReport } from "../_shared/weekly.ts";
import { israelHourOf, planFollowUps } from "../_shared/followup.ts";
import { type CronJobRow, evalCronHealth } from "../_shared/cron_health.ts";

const enc = encodeURIComponent;

async function fetchUpcomingRenewals(days: number): Promise<RenewalRow[] | null> {
  return await rpcRows<RenewalRow>("get_upcoming_renewals", { days });
}

async function countNewLeads(): Promise<number> {
  try {
    const r = await serviceFetch("/rest/v1/leads?status=eq.new&select=id", {
      method: "HEAD",
      headers: { "Prefer": "count=exact" },
    });
    if (!r) return 0;
    const total = Number((r.headers.get("content-range") ?? "").split("/")[1]);
    return Number.isFinite(total) ? total : 0;
  } catch (_) { return 0; }
}

// ── mode: digest ─────────────────────────────────────────────────────────────

async function runDigest(cfg: Cfg, days: number) {
  const rows = await fetchUpcomingRenewals(days);
  if (rows === null) {
    // a failed query must not read as "no renewals coming up"
    const tg = await sendTelegram(cfg, "⚠️ הדייג'סט היומי נכשל (שאילתת החידושים) — נסו /weekly מאוחר יותר.");
    return { ok: false, error: "renewals query failed", telegram: tg };
  }
  const newLeads = await countNewLeads();
  let message = buildDigest(rows, days);
  if (newLeads > 0) {
    message += `${NL}${NL}📬 <b>${newLeads} לידים בסטטוס "חדש"</b> ממתינים לטיפול — שלחו /leads לפירוט.`;
  }
  const tg = await sendTelegram(cfg, message);
  // urgent renewals (≤7 days) with a phone get their own card with a
  // "create lead" button so proactive calls enter the tracked pipeline
  let buttons = 0;
  for (const r of rows) {
    if (buttons >= 3) break;
    if (!r.phone || daysUntil(r.promo_end_date) > 7) continue;
    const sent = await sendTelegram(
      cfg,
      `☎️ <b>שיחה יזומה:</b> ${esc(r.name ?? "ללא שם")} — ${esc(r.provider)} · ${esc(r.plan_name)} מתחדש ב-${esc(r.promo_end_date)}`,
      { inline_keyboard: [[{ text: "➕ צור ליד ומעקב", callback_data: `renew:${r.id}:lead` }]] },
    );
    if (sent.ok) buttons++;
  }
  return { ok: tg.ok, count: rows.length, new_leads: newLeads, renewal_buttons: buttons, telegram: tg };
}

// ── mode: sweep ──────────────────────────────────────────────────────────────

// Re-deliver leads whose INSERT-trigger notification never landed. Claim each
// lead (stamp notified_at where still null — atomic) BEFORE sending, so
// overlapping runs and the trigger race can't double-send; revert the stamp if
// the delivery then fails so the next run retries. Batch of 5 keeps the run
// well inside the edge wall-clock limit (each send = triage + Telegram + email).
async function runSweep(cfg: Cfg) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!url || !cfg.webhookSecret) return { ok: false, error: "not configured" };
  // 10-minute grace so the trigger path can finish before we call a lead missed
  const cutoff = enc(new Date(Date.now() - 10 * 60 * 1000).toISOString());
  const rows = await fetchRows<Lead>(
    `/rest/v1/leads?select=*&notified_at=is.null&created_at=lt.${cutoff}&order=created_at.asc&limit=5`,
  );
  if (rows === null) return { ok: false, error: "sweep query failed" };
  let resent = 0, failed = 0;
  for (const lead of rows) {
    if (!lead.id) continue;
    const claimTs = new Date().toISOString();
    const claimed = await patchCount(
      `/rest/v1/leads?id=eq.${lead.id}&notified_at=is.null`,
      { notified_at: claimTs },
    );
    if (claimed === 0) continue; // someone else delivered it meanwhile
    let delivered = false;
    try {
      const r = await fetch(`${url}/functions/v1/notify-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": cfg.webhookSecret },
        body: JSON.stringify({ record: lead }),
      });
      const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
      // delivered = the interactive Telegram card landed; email-only is not
      // enough (no buttons in chat) and notify-lead won't have re-stamped
      delivered = r.ok && j.ok === true &&
        (j.telegram as Record<string, unknown> | undefined)?.ok === true;
    } catch (e) {
      jlog({ at: "sweep", lead: lead.id, ok: false, error: String(e) });
    }
    if (delivered) {
      resent++;
    } else {
      failed++;
      // revert ONLY our own claim — notify-lead may have re-stamped a
      // success this response failed to report
      await patchCount(`/rest/v1/leads?id=eq.${lead.id}&notified_at=eq.${enc(claimTs)}`, { notified_at: null });
    }
  }
  if (failed > 0) jlog({ at: "sweep", pending: rows.length, resent, failed });
  return { ok: true, pending: rows.length, resent, failed };
}

// ── mode: follow-up ──────────────────────────────────────────────────────────

async function runFollowUp(cfg: Cfg) {
  const now = new Date();
  const openLeads = await fetchRows<Lead>(
    "/rest/v1/leads?select=*&status=eq.new&order=created_at.asc&limit=50",
  );
  if (openLeads === null) return { ok: false, error: "follow-up query failed" };
  const plan = planFollowUps(openLeads, now.getTime(), israelHourOf(now));
  let sent = 0;
  for (const f of plan) {
    const lead = f.lead;
    if (!lead.id) continue;
    const header = f.kind === "callback"
      ? `⏰ <b>הגיע הזמן:</b> ${esc(lead.name)} ביקש שיחה ${CALLBACK_HE[String(lead.callback_time ?? "")] ?? ""} — עכשיו החלון.`
      : `${f.urgency} <b>ליד ממתין ${Math.floor(f.ageHours)} שעות בלי מענה</b>` +
        (lead.claimed_by ? ` (בטיפול אצל ${esc(lead.claimed_by)})` : "");
    const r = await sendTelegram(cfg, header + NL + NL + buildText(lead), leadKeyboard(lead));
    if (r.ok) sent++;
    // Stamp even when the send failed — otherwise one permanently-unsendable
    // lead occupies the cap-5 oldest-first queue forever and starves every
    // other escalation. A callback ping counts as a nudge too (no SLA card an
    // hour after the ⏰ one).
    await patchCount(
      `/rest/v1/leads?id=eq.${lead.id}`,
      f.kind === "callback"
        ? { callback_pinged_at: now.toISOString(), nudged_at: now.toISOString() }
        : { nudged_at: now.toISOString() },
    );
  }
  return { ok: true, open: openLeads.length, planned: plan.length, sent };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

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

  const cfg = await resolveCfgCached();

  if (req.method === "GET") {
    const action = new URL(req.url).searchParams.get("action");
    if (action === "cron-health") {
      // public-safe watchdog: booleans + our fixed job names only. The
      // external prober (bot-health.yml) catches "the schedules died silently".
      const rows = await rpcRows<CronJobRow>("get_cron_health", {});
      if (rows === null) {
        // RPC missing (pg_cron not set up yet) or transient — don't page
        return json({ ok: true, known_jobs: 0, note: "cron health unavailable" });
      }
      const health = evalCronHealth(rows, Date.now());
      return json({ ok: health.ok, known_jobs: health.known, stale: health.stale, failing: health.failing });
    }
    return json({
      ok: true,
      function: "renewal-reminders",
      modes: ["digest", "sweep", "follow-up", "weekly"],
      configured: {
        telegram: { present: !!(cfg.tgToken && cfg.tgChat) },
        webhook_secret: { present: !!cfg.webhookSecret },
      },
    });
  }

  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!cfg.webhookSecret) return json({ ok: false, error: "webhook secret not configured" }, 503);
  if (!(await safeEqual(provided, cfg.webhookSecret))) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch (_) { /* empty body */ }
  const mode = String(payload.mode ?? "digest");
  const days = typeof payload.days === "number" ? Math.min(Math.max(payload.days, 1), 90) : 14;

  switch (mode) {
    case "sweep":
      return json(await runSweep(cfg));
    case "follow-up":
      return json(await runFollowUp(cfg));
    case "weekly": {
      let report = await buildWeeklyReport();
      // surface dead/failing schedules to the team — pg_cron fails silently
      const cronRows = await rpcRows<CronJobRow>("get_cron_health", {});
      if (cronRows !== null) {
        const h = evalCronHealth(cronRows, Date.now());
        if (!h.ok) {
          // job names come from pg_cron rows (DB-controlled) — escape before
          // interpolating into the HTML report
          const stuck = [...h.stale, ...h.failing].map((j) => esc(j)).join(", ");
          report = `🚨 <b>משימות מתוזמנות תקועות:</b> ${stuck}${NL}${NL}` + report;
        }
      }
      const tg = await sendTelegram(cfg, report);
      // privacy retention: source_ip is abuse-prevention data — drop it after
      // 30 days (piggybacks on the weekly run)
      const ipCutoff = enc(new Date(Date.now() - 30 * 86_400_000).toISOString());
      const cleared = await patchCount(
        `/rest/v1/leads?source_ip=not.is.null&created_at=lt.${ipCutoff}`,
        { source_ip: null },
      );
      return json({ ok: tg.ok, telegram: tg, source_ips_cleared: cleared });
    }
    case "digest":
    default: {
      const result = await runDigest(cfg, days);
      // the sweep used to ride the daily digest — keep it as a belt-and-braces
      // pass even though the 10-minute job is the primary safety net
      const leadSweep = await runSweep(cfg);
      return json({ ...result, lead_sweep: leadSweep });
    }
  }
});
