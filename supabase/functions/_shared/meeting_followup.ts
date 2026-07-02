// Pure meeting follow-up planner: given open meetings and the current time,
// decide which rep reminders, expirations and BOOKER emails are due. No I/O —
// unit-tested.

import type { MeetingRow } from "./types.ts";

export type MeetingFollowUp = {
  meeting: MeetingRow;
  kind: "rep_reminder" | "expire" | "user_confirmation" | "user_reminder";
};

const HOUR = 3_600_000;

// rep_reminder: still pending, starts within the next 2 hours, and the team
// hasn't been reminded yet. expire: still pending but the slot has passed —
// nobody confirmed in time, so the booking is dead.
//
// Booker (customer) emails — CONFIRMED meetings that haven't started yet:
//   user_confirmation: join_url present, an address to send to, and no
//     confirmation_emailed_at stamp. The safety net for meetings whose
//     confirm-time email failed (or that were confirmed by a path that never
//     emails) — surface-independent, so web-invisible bookings get their link.
//   user_reminder: starts within <=24h, not yet reminded, confirmation already
//     emailed OR a join_url to include; never in the same run as its own
//     user_confirmation (the confirmation already carries the link — one email
//     per run per meeting).
// PRE-MIGRATION SAFETY (supabase/meetings-user-emails-2026-07.sql not applied):
// the two stamp columns simply don't appear on select=* rows — they read as
// undefined here, which plans a send, and the CONSUMER's claim-PATCH on the
// unknown column then 400s → 0 rows claimed → nothing is sent. No crash either
// side.
export function planMeetingFollowUps(open: MeetingRow[], nowMs: number): MeetingFollowUp[] {
  const out: MeetingFollowUp[] = [];
  for (const m of open) {
    const status = String(m.status ?? "");
    const starts = Date.parse(String(m.starts_at ?? ""));
    if (!Number.isFinite(starts)) continue;
    const until = starts - nowMs;
    if (status === "pending") {
      if (until <= 0) {
        out.push({ meeting: m, kind: "expire" });
      } else if (until <= 2 * HOUR && !m.reminded_rep_at) {
        out.push({ meeting: m, kind: "rep_reminder" });
      }
    } else if (status === "confirmed" && until > 0 && m.email) {
      if (m.join_url && !m.confirmation_emailed_at) {
        out.push({ meeting: m, kind: "user_confirmation" });
      } else if (
        until <= 24 * HOUR && !m.reminded_user_at &&
        (m.confirmation_emailed_at || m.join_url)
      ) {
        out.push({ meeting: m, kind: "user_reminder" });
      }
    }
  }
  return out;
}
