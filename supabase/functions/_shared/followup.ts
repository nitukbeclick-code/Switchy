// Pure follow-up planner: given open leads and the current time, decide which
// SLA escalations and callback-time pings are due. No I/O — unit-tested.

import type { Lead } from "./types.ts";

export type FollowUp = {
  lead: Lead;
  kind: "sla" | "callback";
  urgency: "🟡" | "🟠" | "🔴" | "⏰";
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

// Plan at most `cap` messages per run: callback pings first (time-sensitive,
// highest conversion), then SLA escalations oldest-first.
export function planFollowUps(openLeads: Lead[], nowMs: number, israelHour: number, cap = 5): FollowUp[] {
  const callbacks: FollowUp[] = [];
  const slas: FollowUp[] = [];
  for (const lead of openLeads) {
    if (String(lead.status ?? "new") !== "new") continue;
    if (callbackDue(lead, nowMs, israelHour)) {
      const ageHours = (nowMs - Date.parse(String(lead.created_at ?? ""))) / HOUR;
      callbacks.push({ lead, kind: "callback", urgency: "⏰", ageHours });
      continue; // a callback ping supersedes an SLA nudge this round
    }
    const sla = slaDue(lead, nowMs);
    if (sla.due) slas.push({ lead, kind: "sla", urgency: sla.urgency, ageHours: sla.ageHours });
  }
  slas.sort((a, b) => b.ageHours - a.ageHours);
  return [...callbacks, ...slas].slice(0, cap);
}
