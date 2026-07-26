// Pure follow-up planner: given open leads and the current time, decide which
// SLA escalations and callback-time pings are due. No I/O — unit-tested.

import type { Lead } from "./types.ts";

export type FollowUp = {
  lead: Lead;
  kind: "sla" | "callback" | "followup";
  urgency: "🟡" | "🟠" | "🔴" | "⏰" | "📌";
  ageHours: number;
};

const HOUR = 3_600_000;

export function israelHourOf(date: Date): number {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false })
    .format(date);
  return Number(h) % 24;
}

export function israelDateOf(date: Date): string {
  // en-CA gives YYYY-MM-DD, comparable as a string
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(date);
}

// A callback ping counts as a nudge too (the runner stamps both), so the SLA
// ladder takes whichever reminder the lead saw last.
function lastNudgeMs(lead: Lead): number {
  const nudged = Date.parse(String(lead.nudged_at ?? ""));
  const pinged = Date.parse(String(lead.callback_pinged_at ?? ""));
  const vals = [nudged, pinged].filter(Number.isFinite);
  return vals.length ? Math.max(...vals) : NaN;
}

// Escalation ladder: first nudge after 2h, again after 6h, then daily.
function slaDue(lead: Lead, now: number): { due: boolean; urgency: "🟡" | "🟠" | "🔴"; ageHours: number } {
  const created = Date.parse(String(lead.created_at ?? ""));
  if (!Number.isFinite(created)) return { due: false, urgency: "🟡", ageHours: 0 };
  const ageHours = (now - created) / HOUR;
  const urgency = ageHours >= 24 ? "🔴" : ageHours >= 6 ? "🟠" : "🟡";
  if (ageHours < 2) return { due: false, urgency, ageHours };
  const last = lastNudgeMs(lead);
  if (!Number.isFinite(last)) return { due: true, urgency, ageHours };
  const sinceNudge = (now - last) / HOUR;
  const gap = ageHours >= 24 ? 24 : ageHours >= 6 ? 6 : 2;
  return { due: sinceNudge >= gap, urgency, ageHours };
}

// callback_time windows in Israel local time. 'now' is handled by the
// immediate notification. Windows are bounded so the ping lands when calling
// actually makes sense, and each fires at most once (callback_pinged_at).
function callbackDue(lead: Lead, now: number, israelHour: number): boolean {
  if (lead.callback_pinged_at) return false;
  const created = Date.parse(String(lead.created_at ?? ""));
  if (!Number.isFinite(created)) return false;
  const ageHours = (now - created) / HOUR;
  if (ageHours > 72) return false; // stale — the SLA ladder owns it by now
  switch (String(lead.callback_time ?? "")) {
    case "noon":
      return israelHour >= 12 && israelHour <= 17 && ageHours >= 1;
    case "evening":
      return israelHour >= 18 && israelHour <= 22 && ageHours >= 1;
    case "tomorrow": {
      // must have crossed an Israel calendar-day boundary since creation —
      // "מחר" for a 08:30 lead is NOT the same evening
      const createdDay = israelDateOf(new Date(created));
      const nowDay = israelDateOf(new Date(now));
      return nowDay > createdDay && israelHour >= 10 && israelHour <= 20;
    }
    default:
      return false;
  }
}

// Quiet hours: SLA nudges are for the team, and a 03:00 ping trains everyone
// to mute the bot. Callback windows are already daytime-bounded.
function isQuietHour(israelHour: number): boolean {
  return israelHour >= 22 || israelHour < 8;
}

// A rep-scheduled next action that has come due.
//
// WHY THIS EXISTS: every nudge below used to apply ONLY to status='new'. The
// instant a rep marked a lead 'contacted' — i.e. the instant it became a live
// opportunity — all automated pressure stopped permanently. Meanwhile crm-api
// WRITES follow_up_at (setLeadWorkflow / setLeadNote) and READS it back
// (attentionLeads), so the signal existed but was PULL-ONLY: it surfaced if a
// human happened to open that view, and pushed nothing.
//
// Fires once per scheduled time: nudged_at is stamped on send, so a later
// nudged_at than follow_up_at means this reminder already went out and the lead
// stays quiet until the rep schedules a NEW one. No extra column needed.
function followUpDue(lead: Lead, now: number): boolean {
  const due = Date.parse(String(lead.follow_up_at ?? ""));
  if (!Number.isFinite(due) || due > now) return false;
  const nudged = Date.parse(String(lead.nudged_at ?? ""));
  return !Number.isFinite(nudged) || nudged < due;
}

// Plan at most `cap` messages per run, most-specific first:
//   1. callback pings   — the customer named a time and it's now (best converting)
//   2. rep follow-ups   — a human explicitly scheduled this next action
//   3. SLA escalations  — the generic "nobody has touched this" ladder, oldest first
//
// STATUS SCOPE: the SLA ladder and callback pings stay 'new'-only (nudging a lead
// a rep is already working is noise). 'contacted' leads get exactly one thing —
// the reminder that rep set for themselves.
export function planFollowUps(openLeads: Lead[], nowMs: number, israelHour: number, cap = 5): FollowUp[] {
  const callbacks: FollowUp[] = [];
  const followups: FollowUp[] = [];
  const slas: FollowUp[] = [];
  const ageOf = (lead: Lead) => (nowMs - Date.parse(String(lead.created_at ?? ""))) / HOUR;
  for (const lead of openLeads) {
    const status = String(lead.status ?? "new");
    if (status === "contacted") {
      // Quiet-hours-gated like every other TEAM-facing nudge.
      if (!isQuietHour(israelHour) && followUpDue(lead, nowMs)) {
        followups.push({ lead, kind: "followup", urgency: "📌", ageHours: ageOf(lead) });
      }
      continue;
    }
    if (status !== "new") continue;
    if (callbackDue(lead, nowMs, israelHour)) {
      callbacks.push({ lead, kind: "callback", urgency: "⏰", ageHours: ageOf(lead) });
      continue; // a callback ping supersedes an SLA nudge this round
    }
    if (isQuietHour(israelHour)) continue;
    const sla = slaDue(lead, nowMs);
    if (sla.due) slas.push({ lead, kind: "sla", urgency: sla.urgency, ageHours: sla.ageHours });
  }
  followups.sort((a, b) => Date.parse(String(a.lead.follow_up_at ?? "")) - Date.parse(String(b.lead.follow_up_at ?? "")));
  slas.sort((a, b) => b.ageHours - a.ageHours);
  return [...callbacks, ...followups, ...slas].slice(0, cap);
}
