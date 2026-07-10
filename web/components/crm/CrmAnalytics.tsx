"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmAnalytics> — the owner observability panel: the activity funnel, agent
// tool-call success (by tool + channel), the admin-action audit histogram, and
// cron health. Reads admin-metrics (admin-gated, read-only). Every number is a
// faithful projection of real rows — empty data shows honest zeros, never
// fabricated activity.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { type AdminMetrics, fetchAdminMetrics, fetchRepLeaderboard, type RepStat } from "@/lib/crm-admin";
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

function chip(active: boolean): string {
  return `interactive rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active
      ? "border-accent bg-accent/10 text-accent-text"
      : "border-border text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
  }`;
}

function Bar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  const w = max > 0 && value > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted">{suffix ?? he(value)}</span>
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
      <h3 className="mb-3 font-display text-sm font-bold text-ink">{title}</h3>
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

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(false);
    const m = await fetchAdminMetrics(d);
    if (m) setData(m);
    else setError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  useEffect(() => {
    void (async () => {
      const r = await fetchRepLeaderboard();
      if (r) setReps({ reps: r.reps, capped: r.capped });
    })();
  }, []);

  const windows = [7, 30, 90];

  return (
    <div className="space-y-6">
      {reps && reps.reps.length > 0 && (
        <Section title="לוח מובילים — נציגים">
          {reps.capped && <p className="mb-2 text-xs text-muted">מוצג לפי מדגם הלידים האחרונים.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-3 py-2 font-medium">נציג</th>
                  <th scope="col" className="px-3 py-2 font-medium">לידים</th>
                  <th scope="col" className="px-3 py-2 font-medium">נסגרו</th>
                  <th scope="col" className="px-3 py-2 font-medium">אבודים</th>
                  <th scope="col" className="px-3 py-2 font-medium">חיסכון שנרשם</th>
                </tr>
              </thead>
              <tbody>
                {reps.reps.map((r) => (
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

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="חלון זמן">
        {windows.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
            {d} ימים
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" aria-hidden="true" />
      ) : error || !data ? (
        <NoticeCard action={<button type="button" onClick={() => void load(days)} className={BTN_GHOST}>נסו שוב</button>}>
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
              <div className="space-y-3">
                {[...data.analytics.events]
                  .sort((a, b) => b.total - a.total)
                  .map((e) => (
                    <Bar
                      key={e.event}
                      label={EVENT_LABEL[e.event] ?? e.event}
                      value={e.total}
                      max={data.analytics.events.reduce((m, x) => Math.max(m, x.total), 0)}
                    />
                  ))}
              </div>
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
              <p className="text-xs text-muted">
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
