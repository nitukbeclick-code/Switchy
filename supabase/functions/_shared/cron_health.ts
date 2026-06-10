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
const MAX_SILENCE_HOURS: Record<string, number> = {
  "renewal-reminders-daily": 26,
  "lead-sweep-10min": 1,
  "lead-followup-hourly": 3,
  "weekly-digest": 8 * 24,
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
