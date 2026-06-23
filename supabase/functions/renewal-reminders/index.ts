import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// renewal-reminders — חוסך
// The bot's scheduled brain. pg_cron POSTs here with a `mode` (see the
// schedule block in supabase/schema.sql); auth is the shared x-webhook-secret.
//
// GET  ?action=health        -> config status
// POST {mode:"digest",days?} -> daily renewal digest + per-renewal "create
//                               lead" buttons for the urgent ones + open-lead
//                               count + today's confirmed video meetings
//                               (default mode; legacy {days} works)
// POST {mode:"sweep"}        -> re-deliver unnotified leads (every 10 min) and
//                               meeting cards; claim-before-send so overlapping
//                               runs and the trigger race can't duplicate
// POST {mode:"follow-up"}    -> hourly: SLA escalations (2h→6h→daily ladder)
//                               + "the customer asked for evening" pings
//                               + meeting rep-reminders (≤2h) and expirations
// POST {mode:"weekly"}       -> weekly business report (also /weekly in chat)
//
// Deploy: supabase functions deploy renewal-reminders --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

import type { Cfg, Lead, MeetingRow, RenewalRow } from "../_shared/types.ts";
import { resolveCfgCached, safeEqual } from "../_shared/config.ts";
import { rateLimit, secretFingerprint } from "../_shared/ratelimit.ts";
import { esc, NL, sendTelegram } from "../_shared/telegram.ts";
import { fetchRows, logMeetingEvent, patchCount, rpcRows, serviceFetch } from "../_shared/db.ts";
import { jlog } from "../_shared/log.ts";
import { buildText, CALLBACK_HE, leadKeyboard } from "../_shared/leads.ts";
import { buildMeetingText, formatMeetingTime, formatMeetingWhen, meetingKeyboardFor } from "../_shared/meetings.ts";
import { buildDigest, daysUntil } from "../_shared/digests.ts";
import { agendaIsEmpty, buildAgenda } from "../_shared/agenda.ts";
import { buildWeeklyReport } from "../_shared/weekly.ts";
import { israelDateOf, israelHourOf, planFollowUps } from "../_shared/followup.ts";
import { planMeetingFollowUps } from "../_shared/meeting_followup.ts";
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
  // Today's confirmed video meetings (Israel calendar day) — only when non-empty.
  // The ±24h window over-fetches; the israelDateOf filter trims to today.
  const winStart = enc(new Date(Date.now() - 24 * 3_600_000).toISOString());
  const winEnd = enc(new Date(Date.now() + 24 * 3_600_000).toISOString());
  const confirmedMeetings = await fetchRows<MeetingRow>(
    `/rest/v1/meetings?select=*&status=eq.confirmed&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=20`,
  );
  const today = israelDateOf(new Date());
  const todaysMeetings = (confirmedMeetings ?? []).filter((m) => {
    const t = Date.parse(String(m.starts_at ?? ""));
    return Number.isFinite(t) && israelDateOf(new Date(t)) === today;
  });
  if (todaysMeetings.length > 0) {
    message += `${NL}${NL}🎥 <b>פגישות וידאו היום:</b>`;
    for (const m of todaysMeetings) {
      message += `${NL}• ${esc(formatMeetingTime(m))} — ${esc(m.name ?? "")}${m.provider ? ` (${esc(m.provider)})` : ""}`;
    }
  }
  const tg = await sendTelegram(cfg, message);

  // Morning agenda push: today's confirmed + pending meetings and uncontacted
  // leads, as one tidy /today briefing. Reuses the ±24/36h window already
  // fetched above for confirmed meetings; pending + uncontacted are cheap adds.
  // Skip entirely when there's nothing actionable (no spam on quiet mornings).
  let agendaSent = false;
  {
    const winStart = enc(new Date(Date.now() - 24 * 3_600_000).toISOString());
    const winEnd = enc(new Date(Date.now() + 36 * 3_600_000).toISOString());
    const [pendingMeetings, uncontacted] = await Promise.all([
      fetchRows<MeetingRow>(`/rest/v1/meetings?select=*&status=eq.pending&starts_at=gte.${winStart}&starts_at=lt.${winEnd}&order=starts_at.asc&limit=30`),
      fetchRows<Lead>(`/rest/v1/leads?select=*&status=eq.new&order=created_at.asc&limit=30`),
    ]);
    const agendaInput = {
      confirmed: confirmedMeetings ?? [],
      pending: pendingMeetings ?? [],
      uncontacted: uncontacted ?? [],
    };
    const now = Date.now();
    if (!agendaIsEmpty(agendaInput, now)) {
      const at = await sendTelegram(cfg, buildAgenda(agendaInput, now));
      agendaSent = at.ok;
    }
  }

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
  return { ok: tg.ok, count: rows.length, new_leads: newLeads, meetings_today: todaysMeetings.length, agenda_sent: agendaSent, renewal_buttons: buttons, telegram: tg };
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

  // Meetings whose INSERT-trigger card never landed — same claim-before-send
  // discipline, but the card goes out inline (no triage/email leg to re-run).
  // 2-minute grace: the trigger path is a single Telegram send.
  const meetCutoff = enc(new Date(Date.now() - 2 * 60 * 1000).toISOString());
  const meetRows = await fetchRows<MeetingRow>(
    `/rest/v1/meetings?select=*&notified_at=is.null&created_at=lt.${meetCutoff}&order=created_at.asc&limit=5`,
  );
  let meetingsResent = 0, meetingsFailed = 0;
  if (meetRows !== null) {
    for (const m of meetRows) {
      if (!m.id) continue;
      const claimTs = new Date().toISOString();
      const claimed = await patchCount(`/rest/v1/meetings?id=eq.${m.id}&notified_at=is.null`, { notified_at: claimTs });
      if (claimed === 0) continue; // someone else delivered it meanwhile
      const sent = await sendTelegram(cfg, buildMeetingText(m), meetingKeyboardFor(m));
      if (sent.ok) {
        meetingsResent++;
      } else {
        meetingsFailed++;
        await patchCount(`/rest/v1/meetings?id=eq.${m.id}&notified_at=eq.${enc(claimTs)}`, { notified_at: null });
      }
    }
    if (meetingsFailed > 0) jlog({ at: "sweep", meetings_pending: meetRows.length, meetings_resent: meetingsResent, meetings_failed: meetingsFailed });
  }
  return {
    ok: true, pending: rows.length, resent, failed,
    meetings_pending: meetRows?.length ?? 0, meetings_resent: meetingsResent, meetings_failed: meetingsFailed,
  };
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

  // Meeting follow-ups: remind the team about soon-starting unconfirmed
  // meetings; expire pending meetings whose slot already passed. The lt-48h
  // horizon covers everything plannable (past + the reminder window).
  const horizon = enc(new Date(now.getTime() + 48 * 3_600_000).toISOString());
  const pendingMeetings = await fetchRows<MeetingRow>(
    `/rest/v1/meetings?select=*&status=eq.pending&starts_at=lt.${horizon}&order=starts_at.asc&limit=50`,
  );
  let meetingReminders = 0, meetingsExpired = 0;
  if (pendingMeetings !== null) {
    for (const f of planMeetingFollowUps(pendingMeetings, now.getTime())) {
      const m = f.meeting;
      if (!m.id) continue;
      if (f.kind === "rep_reminder") {
        const r = await sendTelegram(
          cfg,
          `⏳ <b>פגישת וידאו בעוד פחות משעתיים וטרם אושרה</b>${NL}${NL}` + buildMeetingText(m),
          meetingKeyboardFor(m),
        );
        if (r.ok) meetingReminders++;
        // stamp even when the send failed — one permanently-unsendable card
        // must not re-fire every hour until the meeting expires
        await patchCount(`/rest/v1/meetings?id=eq.${m.id}`, { reminded_rep_at: now.toISOString() });
        await logMeetingEvent({ meeting_id: m.id, event: "reminder" });
      } else {
        // status=eq.pending guard: a confirm racing this run wins
        const n = await patchCount(`/rest/v1/meetings?id=eq.${m.id}&status=eq.pending`, { status: "expired" });
        if (n === 0) continue;
        meetingsExpired++;
        await logMeetingEvent({ meeting_id: m.id, event: "status_change", old_status: "pending", new_status: "expired" });
        await sendTelegram(cfg, `⌛ פגישת הווידאו עם ${esc(m.name ?? "")} (${esc(formatMeetingWhen(m))}) לא אושרה בזמן — סומנה כפג תוקף.`);
      }
    }
  }
  return {
    ok: true, open: openLeads.length, planned: plan.length, sent,
    meeting_reminders: meetingReminders, meetings_expired: meetingsExpired,
  };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", ...(extraHeaders ?? {}) },
  });
}

// Light per-route throttle, applied ONLY after the x-webhook-secret gate passes,
// so it can never weaken auth. Each scheduled run does heavy work (digest fan-out,
// the lead/meeting sweep, SLA follow-ups, the weekly report). pg_cron fires these
// at most a few times an hour, so the per-minute cap below sits far above real
// traffic and only sheds a runaway loop / leaked-secret flood. The bucket key is
// the route plus a non-reversible fingerprint of the secret — never the raw value.
const RL_LIMIT = 60; // authenticated POSTs per window
const RL_WINDOW_MS = 60_000; // 1 minute
async function rateLimited(secret: string): Promise<Response | null> {
  const fp = await secretFingerprint(secret);
  const res = rateLimit(`renewal-reminders:post:${fp}`, RL_LIMIT, RL_WINDOW_MS);
  if (res.allowed) return null;
  jlog({ at: "rate-limit", fn: "renewal-reminders", secret_fp: fp, retry_after: res.retryAfterSec });
  return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": String(res.retryAfterSec) });
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

  // Authenticated → throttle. Scheduled runs are sparse; this only sheds abuse.
  const limited = await rateLimited(cfg.webhookSecret);
  if (limited) return limited;

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
