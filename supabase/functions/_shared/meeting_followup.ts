// Pure meeting follow-up planner: given pending meetings and the current time,
// decide which rep reminders and expirations are due. No I/O — unit-tested.

import type { MeetingRow } from "./types.ts";

export type MeetingFollowUp = { meeting: MeetingRow; kind: "rep_reminder" | "expire" };

const HOUR = 3_600_000;

// rep_reminder: still pending, starts within the next 2 hours, and the team
// hasn't been reminded yet. expire: still pending but the slot has passed —
// nobody confirmed in time, so the booking is dead.
export function planMeetingFollowUps(open: MeetingRow[], nowMs: number): MeetingFollowUp[] {
  const out: MeetingFollowUp[] = [];
  for (const m of open) {
    if (String(m.status ?? "") !== "pending") continue;
    const starts = Date.parse(String(m.starts_at ?? ""));
    if (!Number.isFinite(starts)) continue;
    const until = starts - nowMs;
    if (until <= 0) {
      out.push({ meeting: m, kind: "expire" });
    } else if (until <= 2 * HOUR && !m.reminded_rep_at) {
      out.push({ meeting: m, kind: "rep_reminder" });
    }
  }
  return out;
}
