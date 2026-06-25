// lead-digest/lib.ts — PURE helpers for the lead-digest cron (no network, no
// Deno.serve). Split out of index.ts so tests can import these WITHOUT loading
// index.ts: a static import of index.ts would run its top-level Deno.serve(...)
// and cache the module before tests/_capture_handler.ts installs its stub,
// breaking handler capture. Keep this file side-effect-free.

import type { Lead } from "../_shared/types.ts";
import { NL } from "../_shared/telegram.ts";

// A new lead waiting longer than this without any contact has breached the SLA.
// Matches the 2h first-nudge threshold the follow-up planner and buildDailyDigest
// already use, so the nudge and the digest's "🔴 מעבר ל-SLA" count stay in sync.
export const SLA_HOURS = 2;

// ── stale-lead SLA selection ────────────────────────────────────────────────
// Pure over (rows, nowMs): a lead is "stale" when it is still new, was never
// contacted, and has been waiting at least SLA_HOURS. The DB query already pre-
// filters status/contacted_at, but we re-assert here so the helper is honest in
// isolation (and unit-testable) and a stray row can never inflate the count.
export type StaleLead = Pick<Lead, "id" | "name" | "phone" | "status" | "contacted_at" | "created_at">;

export function selectStaleLeads(rows: StaleLead[], nowMs: number, slaHours = SLA_HOURS): StaleLead[] {
  const slaMs = slaHours * 3_600_000;
  return rows
    .filter((l) => String(l.status ?? "new") === "new")
    .filter((l) => !l.contacted_at)
    .filter((l) => {
      const created = Date.parse(String(l.created_at ?? ""));
      return Number.isFinite(created) && nowMs - created >= slaMs;
    })
    .sort((a, b) => Date.parse(String(a.created_at ?? "")) - Date.parse(String(b.created_at ?? "")));
}

// Whole hours the oldest stale lead has been waiting (>= 1 once it crosses the SLA).
function oldestWaitHours(stale: StaleLead[], nowMs: number): number {
  if (stale.length === 0) return 0;
  const created = Date.parse(String(stale[0].created_at ?? ""));
  if (!Number.isFinite(created)) return 0;
  return Math.max(1, Math.floor((nowMs - created) / 3_600_000));
}

// ── nudge text ──────────────────────────────────────────────────────────────
// One short, count-led Hebrew line. '' when nothing is stale (the caller skips
// the send entirely — no "all clear" spam). Pure over (stale, nowMs).
export function buildStaleNudge(stale: StaleLead[], nowMs: number): string {
  if (stale.length === 0) return "";
  const hrs = oldestWaitHours(stale, nowMs);
  return [
    `⏰ <b>${stale.length} לידים ללא מענה</b> — מעבר ל-SLA (${SLA_HOURS}ש׳). הוותיק ממתין ${hrs}ש׳.`,
    "<i>שלחו /leads לכרטיסים עם כפתורי סטטוס.</i>",
  ].join(NL);
}
