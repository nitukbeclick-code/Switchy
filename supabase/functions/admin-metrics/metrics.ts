// Pure helpers for the admin-metrics observability reader.
//
// All logic that shapes the metrics payload lives here — input clamping, the
// agent_tool_calls success-rate rollup, the security-audit event histogram, and
// the cron-health summary projection — so it can be unit-tested without booting
// the server or touching the DB (see tests/admin_metrics_test.ts). index.ts does
// the I/O (auth + service-role reads) and calls into these.
//
// TRUTH-ONLY: every number here is a faithful projection of real rows. We never
// invent counts; an empty input yields honest zeros / empty arrays, not made-up
// activity.

// Null-safe string coercion (mirrors crm_logic.s / the rest of _shared).
export function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

// Clamp the requested look-back window to a sane range. The default of 7 days
// keeps the rollups cheap; the ceiling of 90 matches the analytics retention
// window (audit-observability-2026-06.sql purges analytics_events past 90 days,
// so asking for more would only ever read partial history).
export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 90;
export const MIN_DAYS = 1;

export function clampDays(raw: unknown): number {
  // Treat "absent" (null / undefined / empty string) as the default rather than
  // coercing through Number() — Number(null) is 0 and Number("") is 0, which
  // would otherwise floor to MIN_DAYS instead of meaning "no window given".
  if (raw === null || raw === undefined || raw === "") return DEFAULT_DAYS;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  const i = Math.trunc(n);
  if (i < MIN_DAYS) return MIN_DAYS;
  if (i > MAX_DAYS) return MAX_DAYS;
  return i;
}

// ── analytics_events per-day rollup ──────────────────────────────────────────
// The get_analytics_events RPC returns rows of { day, events } for ONE event
// name. We call it once per known funnel event and stitch the results into a
// per-event series + a total. This shaper takes the already-fetched rows and
// produces the stable response shape; it does no I/O.

export type DayCount = { day: string; events: number };

// A single funnel event's trailing series + its total over the window.
export type EventSeries = {
  event: string;
  total: number;
  days: DayCount[];
};

// Normalise one RPC result (possibly null on a failed read) into a clean series.
// A failed/empty read is honest zeros — never fabricated points.
export function toEventSeries(event: string, rows: DayCount[] | null): EventSeries {
  const days: DayCount[] = [];
  let total = 0;
  for (const r of rows ?? []) {
    const day = s(r.day).slice(0, 10); // YYYY-MM-DD
    const n = Number(r.events);
    const events = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
    if (!day) continue;
    days.push({ day, events });
    total += events;
  }
  // Newest day first (the RPC already orders desc, but don't depend on it).
  days.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return { event, total, days };
}

// ── agent_tool_calls success rates ───────────────────────────────────────────
// Rows are { channel, tool, ok }. We aggregate calls / successes and derive a
// success rate, grouped two ways: by tool and by channel. Pure reduction over an
// in-memory row set (index.ts fetches a bounded recent window).

export type ToolCallRow = { channel?: unknown; tool?: unknown; ok?: unknown };

export type RateBucket = {
  key: string;     // tool name OR channel name
  calls: number;
  ok: number;
  rate: number;    // ok/calls, 0..1, rounded to 4 decimals; 0 when calls===0
};

function rate(ok: number, calls: number): number {
  if (calls <= 0) return 0;
  return Math.round((ok / calls) * 10000) / 10000;
}

// Reduce rows into sorted buckets keyed by `field` (e.g. "tool" or "channel").
// `ok` is treated as a strict boolean true — anything else counts as a failure,
// so a malformed/missing flag never inflates the success rate.
export function rateBy(rows: ToolCallRow[], field: "tool" | "channel"): RateBucket[] {
  const calls = new Map<string, number>();
  const oks = new Map<string, number>();
  for (const r of rows) {
    const key = s(r[field]).trim() || "(unknown)";
    calls.set(key, (calls.get(key) ?? 0) + 1);
    if (r.ok === true) oks.set(key, (oks.get(key) ?? 0) + 1);
  }
  const out: RateBucket[] = [];
  for (const [key, c] of calls) {
    const o = oks.get(key) ?? 0;
    out.push({ key, calls: c, ok: o, rate: rate(o, c) });
  }
  // Most-used first; tie-break alphabetically for a stable order.
  out.sort((a, b) => (b.calls - a.calls) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

export type ToolCallSummary = {
  total: number;
  ok: number;
  rate: number;
  byTool: RateBucket[];
  byChannel: RateBucket[];
};

export function summariseToolCalls(rows: ToolCallRow[] | null): ToolCallSummary {
  const r = rows ?? [];
  const total = r.length;
  const ok = r.reduce((n, x) => n + (x.ok === true ? 1 : 0), 0);
  return {
    total,
    ok,
    rate: rate(ok, total),
    byTool: rateBy(r, "tool"),
    byChannel: rateBy(r, "channel"),
  };
}

// ── security_audit_log recent event histogram ────────────────────────────────
// Rows are { event }. We bucket counts per event label so the admin can see, at
// a glance, how many takeovers / opt-outs / purges happened in the window. No
// PII — only the event label + a count.

export type AuditRow = { event?: unknown };
export type AuditBucket = { event: string; count: number };

export function summariseAudit(rows: AuditRow[] | null): { total: number; byEvent: AuditBucket[] } {
  const r = rows ?? [];
  const counts = new Map<string, number>();
  for (const row of r) {
    const ev = s(row.event).trim() || "(unknown)";
    counts.set(ev, (counts.get(ev) ?? 0) + 1);
  }
  const byEvent: AuditBucket[] = [...counts].map(([event, count]) => ({ event, count }));
  byEvent.sort((a, b) => (b.count - a.count) || (a.event < b.event ? -1 : a.event > b.event ? 1 : 0));
  return { total: r.length, byEvent };
}

// ── known funnel events (mirrors analytics-track ALLOWED_EVENTS) ──────────────
// We roll up each of these via get_analytics_events. Keeping the list aligned
// with the writer means we never silently miss a real event nor invent one the
// app can't actually emit.
export const KNOWN_EVENTS: readonly string[] = [
  "appOpen",
  "leadStart",
  "leadSubmit",
  "quizComplete",
  "compareView",
  "shortlistCreate",
  "shortlistShare",
  "shortlistLeadClick",
  "searchQuery",
  "whatsappClick",
  "savingsViewed",
  "planView",
  "meetingRequest",
] as const;
