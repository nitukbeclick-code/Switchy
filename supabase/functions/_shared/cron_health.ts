// Cron watchdog: pg_cron failures are silent — a dead schedule means no
// digests, no sweeps, no follow-ups, and nobody notices. evalCronHealth is
// pure (unit-tested); the data comes from the get_cron_health RPC.

export type CronJobRow = {
  jobname: string;
  schedule: string;
  active: boolean;
  last_start: string | null;
  last_status: string | null;
};

// Maximum silence per job before it counts as stale (generous slack over the
// nominal cadence to absorb deploy pauses and slow runs).
//
// The two monthly retention jobs run on a calendar cadence (1st/2nd of the month
// at ~03:30 UTC), so up to ~31 days can legitimately pass between runs. We give
// them a ~35-day window (35*24h) so a healthy monthly job never false-alarms but a
// genuinely DEAD purge — which would silently let PII / analytics rows accumulate
// past their retention windows (a Reg.13 / data-minimisation gap) — is caught.
const MONTHLY_MAX_SILENCE_HOURS = 35 * 24;
const MAX_SILENCE_HOURS: Record<string, number> = {
  "renewal-reminders-daily": 26,
  "lead-sweep-10min": 1,
  "lead-followup-hourly": 3,
  "weekly-digest": 8 * 24,
  // Retention sweeps (data-protection-2026-06.sql + audit-observability-2026-06.sql).
  "retention-purge-monthly": MONTHLY_MAX_SILENCE_HOURS,
  "analytics-purge-monthly": MONTHLY_MAX_SILENCE_HOURS,
};

export type CronHealth = {
  ok: boolean;
  known: number;       // how many of the expected jobs are registered
  stale: string[];     // job names that haven't run within their window
  failing: string[];   // job names whose last run did not succeed
};

export function evalCronHealth(rows: CronJobRow[], nowMs: number): CronHealth {
  const stale: string[] = [];
  const failing: string[] = [];
  let known = 0;
  for (const [name, maxHours] of Object.entries(MAX_SILENCE_HOURS)) {
    const job = rows.find((r) => r.jobname === name);
    if (!job || !job.active) continue; // not registered (yet) — don't alarm
    known++;
    const last = Date.parse(String(job.last_start ?? ""));
    if (!Number.isFinite(last) || (nowMs - last) / 3_600_000 > maxHours) {
      stale.push(name);
    } else if (job.last_status && job.last_status !== "succeeded") {
      failing.push(name);
    }
  }
  return { ok: stale.length === 0 && failing.length === 0, known, stale, failing };
}
