"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmAnalytics> — the owner observability panel: the activity funnel (bars +
// per-day sparklines from the series already in memory + stage-to-stage
// conversion ratios), agent tool-call success (by tool + channel), the
// admin-action audit histogram, cron health, and a sortable per-rep leaderboard.
// Reads admin-metrics (admin-gated, read-only). Every number is a faithful
// projection of real rows — empty data shows honest zeros, never fabricated
// activity. Overlapping window loads are sequence-guarded so a slow older
// response can't overwrite a newer window's data.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AdminMetrics,
  fetchAdminMetrics,
  fetchRepLeaderboard,
  type MetricEventSeries,
  type RepStat,
} from "@/lib/crm-admin";
import { BTN_GHOST, NoticeCard, StatCard } from "./ui";

const he = (n: number) => n.toLocaleString("he-IL");
const pct = (r: number) => `${Math.round(r * 100)}%`;
const ils = (n: number) => `₪${he(n)}`;

const EVENT_LABEL: Record<string, string> = {
  appOpen: "פתיחות אפליקציה",
  leadStart: "התחלת ליד",
  leadSubmit: "שליחת ליד",
  quizComplete: "השלמת שאלון",
  compareView: "צפיות בהשוואה",
  searchQuery: "חיפושים",
  whatsappClick: "קליקים לוואטסאפ",
  savingsViewed: "צפיות בחיסכון",
  planView: "צפיות במסלול",
  meetingRequest: "בקשות פגישה",
};

// Consecutive funnel stages whose ratio is a real conversion the owner tracks.
// Computed from the SAME window totals already on screen — nothing re-fetched,
// nothing invented; a pair renders only when its "from" stage has events.
const FUNNEL_STEPS: { from: string; to: string; label: string }[] = [
  { from: "appOpen", to: "leadStart", label: "פתיחה ← התחלת ליד" },
  { from: "leadStart", to: "leadSubmit", label: "התחלת ליד ← שליחה" },
  { from: "leadSubmit", to: "meetingRequest", label: "שליחה ← בקשת פגישה" },
];

// Leaderboard sorting: column key + direction. Numeric columns default to
// descending (biggest first); the rep name toggles alphabetically.
type RepSortKey = "rep" | "claimed" | "won" | "lost" | "totalSaving";
const REP_COLUMNS: { key: RepSortKey; label: string }[] = [
  { key: "rep", label: "נציג" },
  { key: "claimed", label: "לידים" },
  { key: "won", label: "נסגרו" },
  { key: "lost", label: "אבודים" },
  { key: "totalSaving", label: "חיסכון שנרשם" },
];

function chip(active: boolean): string {
  return `interactive rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active
      ? "border-accent bg-accent/10 text-accent-text"
      : "border-border text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
  }`;
}

// A tiny inline per-day trend from MetricEventSeries.days — the series is
// ALREADY in memory from the same admin-metrics response, so this adds zero
// network cost. Decorative (the totals carry the numbers) → aria-hidden.
function Sparkline({ days }: { days: MetricEventSeries["days"] }) {
  if (days.length < 2) return null;
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  const max = sorted.reduce((m, d) => Math.max(m, d.events), 0);
  const W = 96;
  const H = 24;
  const points = sorted
    .map((d, i) => {
      const x = (i / (sorted.length - 1)) * W;
      const y = H - 1 - (max > 0 ? (d.events / max) * (H - 2) : 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-24 shrink-0 text-accent" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Bar({ label, value, max, suffix, trend }: { label: string; value: number; max: number; suffix?: string; trend?: MetricEventSeries["days"] }) {
  const w = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {trend && <Sparkline days={trend} />}
          <span className="tabular-nums text-muted">{suffix ?? he(value)}</span>
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-background">
        <div className="h-full rounded-full bg-accent" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <h3 className="mb-3 font-display text-lg font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export default function CrmAnalytics() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // The rep leaderboard is lifetime-to-date (not time-windowed), so it loads once
  // and is best-effort — a failure just hides the section, never blocks the panel.
  const [reps, setReps] = useState<{ reps: RepStat[]; capped: boolean } | null>(null);
  const [repsError, setRepsError] = useState(false);
  const [repSort, setRepSort] = useState<{ key: RepSortKey; dir: 1 | -1 }>({ key: "totalSaving", dir: -1 });
  // Orders overlapping window loads (rapid 7/30/90 switches) so a slower, older
  // response can never overwrite a newer window's data.
  const loadSeq = useRef(0);

  // Fetch a window's metrics. Loading/error resets are event-driven: the
  // useState initializers cover the mount load, and every later load starts
  // from an event (`changeDays`, `reload`) that resets first — so the load
  // effect never sets state synchronously (react-hooks/set-state-in-effect):
  // state only lands in the .then continuation.
  const load = useCallback((d: number) => {
    const seq = ++loadSeq.current;
    return fetchAdminMetrics(d).then((m) => {
      if (seq !== loadSeq.current) return; // stale — a newer window owns the view
      if (m) setData(m);
      else setError(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  // Retry the current window from the error notice.
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    void load(days);
  }, [load, days]);

  // Switch windows: reset the view in the click, then the effect refetches.
  const changeDays = useCallback(
    (next: number) => {
      if (next === days) return; // same chip — no reload, same as before
      setLoading(true);
      setError(false);
      setDays(next);
    },
    [days],
  );

  const loadReps = useCallback(async () => {
    setRepsError(false);
    const r = await fetchRepLeaderboard();
    if (r) setReps({ reps: r.reps, capped: r.capped });
    else setRepsError(true);
  }, []);

  useEffect(() => {
    void loadReps();
  }, [loadReps]);

  // Click a column header: same column flips direction, a new column starts at
  // its natural order (name ascending, numbers descending).
  const sortReps = useCallback((key: RepSortKey) => {
    setRepSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: key === "rep" ? 1 : -1 },
    );
  }, []);

  const sortedReps = useMemo(() => {
    if (!reps) return [];
    const { key, dir } = repSort;
    return [...reps.reps].sort((a, b) => {
      const cmp = key === "rep" ? a.rep.localeCompare(b.rep) : a[key] - b[key];
      return cmp * dir;
    });
  }, [reps, repSort]);

  const windows = [7, 30, 90];

  // Hoisted once per render (previously an O(n²) reduce inside the bars' map).
  const events = data?.analytics.events ?? [];
  const maxEventTotal = events.reduce((m, e) => Math.max(m, e.total), 0);
  const eventTotals = new Map(events.map((e) => [e.event, e.total]));
  const conversions = FUNNEL_STEPS.map((s) => {
    const from = eventTotals.get(s.from) ?? 0;
    const to = eventTotals.get(s.to) ?? 0;
    return { ...s, from, to, rate: from > 0 ? to / from : null };
  }).filter((c) => c.from > 0);

  return (
    <div className="space-y-6">
      {repsError && (
        <NoticeCard action={<button type="button" onClick={() => void loadReps()} className={BTN_GHOST}>נסו שוב</button>}>
          לא הצלחנו לטעון את לוח המובילים.
        </NoticeCard>
      )}
      {reps && reps.reps.length > 0 && (
        <Section title="לוח מובילים — נציגים">
          {reps.capped && <p className="mb-2 text-xs text-muted">מוצג לפי מדגם הלידים האחרונים.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  {REP_COLUMNS.map((c) => {
                    const active = repSort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (repSort.dir === 1 ? "ascending" : "descending") : "none"}
                        className="px-3 py-2 font-medium"
                      >
                        <button
                          type="button"
                          onClick={() => sortReps(c.key)}
                          className={`inline-flex items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            active ? "text-accent-text" : ""
                          }`}
                        >
                          {c.label}
                          <span aria-hidden="true" className="text-[10px]">
                            {active ? (repSort.dir === 1 ? "▲" : "▼") : ""}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedReps.map((r) => (
                  <tr key={r.rep} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{r.rep}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{he(r.claimed)}</td>
                    <td className="px-3 py-2 tabular-nums text-value-text">{he(r.won)}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{he(r.lost)}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums text-value-text">{ils(r.totalSaving)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="חלון זמן">
        {windows.map((d) => (
          <button key={d} type="button" aria-pressed={days === d} onClick={() => changeDays(d)} className={chip(days === d)}>
            {d} ימים
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" aria-hidden="true" />
      ) : error || !data ? (
        <NoticeCard action={<button type="button" onClick={reload} className={BTN_GHOST}>נסו שוב</button>}>
          לא הצלחנו לטעון את הנתונים.
        </NoticeCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="אירועי משפך" value={he(data.analytics.total)} />
            <StatCard
              label="הצלחת כלי הסוכן"
              value={data.toolCalls.total > 0 ? pct(data.toolCalls.rate) : "—"}
              tone="value"
              hint={`${he(data.toolCalls.ok)}/${he(data.toolCalls.total)}`}
            />
            <StatCard label="פעולות ניהול" value={he(data.audit.total)} />
            <StatCard
              label="בריאות Cron"
              value={data.cron.ok ? "תקין" : "בעיה"}
              tone={data.cron.ok ? "value" : "danger"}
              hint={`${he(data.cron.known)} משימות`}
            />
          </div>

          <Section title="משפך פעילות">
            {data.analytics.total === 0 ? (
              <p className="text-xs text-muted">אין עדיין נתוני פעילות בחלון הזה.</p>
            ) : (
              <>
                {conversions.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {conversions.map((c) => (
                      <span
                        key={`${c.from}-${c.to}`}
                        title={`${he(c.to)} מתוך ${he(c.from)}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted"
                      >
                        {c.label}
                        <span className="font-semibold tabular-nums text-ink">
                          {c.rate == null ? "—" : pct(c.rate)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="space-y-3">
                  {[...events]
                    .sort((a, b) => b.total - a.total)
                    .map((e) => (
                      <Bar
                        key={e.event}
                        label={EVENT_LABEL[e.event] ?? e.event}
                        value={e.total}
                        max={maxEventTotal}
                        trend={e.days}
                      />
                    ))}
                </div>
              </>
            )}
          </Section>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="הצלחת כלי הסוכן">
              {data.toolCalls.byTool.length === 0 ? (
                <p className="text-xs text-muted">אין נתונים בחלון הזה.</p>
              ) : (
                <div className="space-y-3">
                  {data.toolCalls.byTool.slice(0, 10).map((b) => (
                    <Bar key={b.key} label={`${b.key} · ${he(b.calls)}`} value={Math.round(b.rate * 100)} max={100} suffix={pct(b.rate)} />
                  ))}
                </div>
              )}
            </Section>
            <Section title="לפי ערוץ">
              {data.toolCalls.byChannel.length === 0 ? (
                <p className="text-xs text-muted">אין נתונים בחלון הזה.</p>
              ) : (
                <div className="space-y-3">
                  {data.toolCalls.byChannel.map((b) => (
                    <Bar key={b.key} label={`${b.key} · ${he(b.calls)}`} value={Math.round(b.rate * 100)} max={100} suffix={pct(b.rate)} />
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="פעולות ניהול (יומן ביקורת)">
              {data.audit.byEvent.length === 0 ? (
                <p className="text-xs text-muted">אין פעולות בחלון הזה.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.audit.byEvent.slice(0, 12).map((a) => (
                    <li key={a.event} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-foreground">{a.event}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">{he(a.count)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="בריאות משימות מתוזמנות">
              <p className={`text-xs tabular-nums ${data.cron.ok ? "text-value-text" : "text-muted"}`}>
                {he(data.cron.known)} משימות מוכרות · {data.cron.ok ? "הכול תקין ✓" : "יש בעיות"}
              </p>
              {data.cron.failing.length > 0 && (
                <p className="mt-2 text-xs text-danger-text">נכשלות: {data.cron.failing.join(", ")}</p>
              )}
              {data.cron.stale.length > 0 && (
                <p className="mt-1 text-xs text-muted">מתעכבות: {data.cron.stale.join(", ")}</p>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
