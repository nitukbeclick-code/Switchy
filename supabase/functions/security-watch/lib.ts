// Pure anomaly-analysis for security-watch — extracted so it can be unit-tested
// without booting Deno.serve (the lead-digest/lib.ts pattern). No I/O, no clock
// dependence beyond what the caller passes in.

import { esc, NL } from "../_shared/telegram.ts";

type Row = Record<string, unknown>;

// Look-back window (minutes). A little wider than the ~15-min cadence so a tick
// that fires late still overlaps the previous window — a re-fired alert is far
// better than a missed one.
export const WINDOW_MIN = 20;

// Per-actor threshold within one window. A human admin does far fewer; only a
// scripted pull or a stolen token crosses this.
export const REVEAL_THRESHOLD = 25; // raw-PII reveals by one actor

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export interface Finding {
  severity: "high" | "medium";
  line: string;
}

// Build the anomaly findings from the recent security_audit_log rows.
export function analyze(rows: Row[]): Finding[] {
  const findings: Finding[] = [];
  const revealsByActor = new Map<string, number>();
  let adminGrants = 0;
  let rateLimited = 0;

  for (const r of rows) {
    const event = s(r.event);
    const actor = s(r.user_id) || "unknown";
    if (event === "admin_grant") adminGrants++;
    else if (event === "crm_rate_limited") rateLimited++;
    else if (event === "crm_pii_reveal") {
      revealsByActor.set(actor, (revealsByActor.get(actor) ?? 0) + 1);
    }
  }

  // Any admin-grant is always worth a heads-up (privilege change).
  if (adminGrants > 0) {
    findings.push({
      severity: "high",
      line: `🔑 ${adminGrants} שינויי הרשאת-אדמין (admin_grant) בחלון האחרון`,
    });
  }
  // Rate-limit trips mean someone (or something) is pushing hard.
  if (rateLimited > 0) {
    findings.push({
      severity: "medium",
      line: `⛔ ${rateLimited} חסימות קצב (rate-limit) — ניסיון שליפה מוגבר`,
    });
  }
  for (const [actor, n] of revealsByActor) {
    if (n >= REVEAL_THRESHOLD) {
      findings.push({
        severity: "high",
        line: `👁️ משתמש ${actor.slice(0, 8)}… חשף ${n} פרטי-קשר גולמיים`,
      });
    }
  }
  return findings;
}

// Compose the Telegram alert body for a non-empty finding set.
export function composeAlert(findings: Finding[], eventCount: number): string {
  const high = findings.some((f) => f.severity === "high");
  const header = high ? "🚨 <b>התראת אבטחת CRM</b>" : "⚠️ <b>שים לב — פעילות CRM חריגה</b>";
  return [
    header,
    esc(`חלון ${WINDOW_MIN} דק׳ · ${eventCount} אירועי audit`),
    "",
    ...findings.map((f) => esc(f.line)),
    "",
    esc("בדוק את security_audit_log ליומן המלא."),
  ].join(NL);
}
