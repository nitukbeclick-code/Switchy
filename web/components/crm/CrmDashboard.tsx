"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmDashboard> — the console overview AND the rep's morning launcher: pipeline
// KPIs (lead counts per stage + close rate), a proportional pipeline bar, a
// "פגישות היום" strip (today's bookings, straight into the meeting drawer), and
// the most recent conversations. Reads crm-api `overview` + `listMeetings`
// (service_role, access-gated) — every figure is a real count, nothing
// fabricated. KPI and conversation cards are clickable: each deep-links into its
// console tab (?tab=) via the shell's onNavigate, so the morning triage is one
// click per queue. Owns its own load / loading / error states so the console
// shell stays a thin router.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  type CrmFailure,
  type CrmMeeting,
  type CrmOverview,
  type CrmPipeline,
  type CrmSla,
  fetchCrmMeetings,
  fetchCrmOverview,
  fetchCrmSla,
} from "@/lib/crm-admin";
import { useCrmEvents } from "@/lib/use-crm-events";
import CrmMeetingDrawer from "./CrmMeetingDrawer";
import {
  ConversationStatusPill,
  ErrorNotice,
  formatMinutes,
  LEAD_STATUS_META,
  MeetingStatusPill,
  NoticeCard,
  StatCard,
  when,
} from "./ui";

const he = (n: number) => n.toLocaleString("he-IL");

/** The tabs the launcher cards can deep-link to (members of the shell's TabKey). */
type LauncherTab = "leads" | "meetings" | "conversations";

/** True when the meeting happens on the same local calendar day as `now`:
 *  prefer the exact starts_at timestamp, else the stored meeting_date string
 *  (YYYY-MM-DD, compared against the LOCAL date — Israel bookings). */
function isToday(m: CrmMeeting, now: Date): boolean {
  const localIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (m.startsAt) {
    const d = new Date(m.startsAt);
    if (!Number.isNaN(d.getTime())) {
      return (
        d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
      );
    }
  }
  return !!m.meetingDate && m.meetingDate.slice(0, 10) === localIso;
}

// The booking's human time: prefer the exact timestamp, else the date + slot.
function meetingWhen(m: CrmMeeting): string {
  if (m.startsAt) return when(m.startsAt);
  return [m.meetingDate, m.slot].filter(Boolean).join(" ");
}

// listMeetings returns furthest-future-first (starts_at.desc.nullslast), caps
// `limit` at 200 rows/page server-side, and exposes no date filter and no
// ascending option (see supabase/functions/crm-api/actions_meetings.ts). So when
// ≥200 future bookings sit AHEAD of today's in that order, the default single
// window never reaches today and the strip goes wrongly empty. We instead PAGE
// from the far-future end toward today (offset += 200) and stop the moment a page
// crosses below the start of today: today's block sorts after every future row
// and before every past row, so the first row that starts before today means
// today's block has been fully seen. We also stop when the server reports no more
// rows. Bounded at MAX_MEETING_PAGES as a safety valve so a pathological table can
// never loop unbounded; in the common case (<200 future bookings) this is exactly
// ONE request — unchanged from before.
const MEETING_PAGE = 200; // == the server's LIST_LIMIT (the max it will return)
const MAX_MEETING_PAGES = 25; // ≤ 5000 future+today rows scanned before we give up

async function collectTodayMeetings(now: Date): Promise<CrmMeeting[] | null> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today: CrmMeeting[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_MEETING_PAGES; page++) {
    const res = await fetchCrmMeetings({ limit: MEETING_PAGE, offset });
    // Best-effort: a mid-page failure keeps whatever today's rows we already
    // gathered; a first-page failure hides the strip (null), exactly as before.
    if (!res) return page === 0 ? null : today;
    let crossedToday = false;
    for (const m of res.meetings) {
      if (isToday(m, now)) today.push(m);
      else if (m.startsAt) {
        const t = new Date(m.startsAt).getTime();
        if (!Number.isNaN(t) && t < startOfToday) crossedToday = true;
      }
    }
    if (crossedToday || !res.hasMore) break;
    offset += MEETING_PAGE;
  }
  return today;
}

// A proportional stacked bar of the pipeline. Widths are share-of-total; the
// numbers themselves are shown on the KPI cards, so this is a shape-at-a-glance.
function PipelineBar({ pipeline, total }: { pipeline: CrmPipeline; total: number }) {
  const segments: { key: keyof CrmPipeline; cls: string }[] = [
    { key: "new", cls: "bg-accent" },
    { key: "contacted", cls: "bg-border-strong" },
    { key: "won", cls: "bg-value" },
    { key: "lost", cls: "bg-danger" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="mb-2 text-xs font-medium text-muted">צנרת המכירות</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-background" role="img" aria-label="התפלגות הלידים לפי שלב">
        {total > 0 &&
          segments.map((s) =>
            pipeline[s.key] > 0 ? (
              <div key={s.key} className={s.cls} style={{ width: `${(pipeline[s.key] / total) * 100}%` }} />
            ) : null,
          )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${s.cls}`} />
            {LEAD_STATUS_META[s.key].label} · <span className="tabular-nums">{he(pipeline[s.key])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
      <div className="h-20 animate-pulse rounded-2xl border border-border bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
    </div>
  );
}

export default function CrmDashboard({ onNavigate }: { onNavigate?: (tab: LauncherTab) => void }) {
  const [data, setData] = useState<CrmOverview | null>(null);
  const [sla, setSla] = useState<CrmSla | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [failure, setFailure] = useState<CrmFailure | null>(null);
  // Today's bookings (best-effort — a failure just hides the strip) + the
  // meeting whose drawer is open.
  const [todayMeetings, setTodayMeetings] = useState<CrmMeeting[] | null>(null);
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

  // `silent` refreshes (from the Realtime feed) skip the skeleton + keep stale data
  // on failure, so a live update never flashes or blanks the dashboard.
  // Loading/error resets are event-driven: the useState initializers cover the
  // mount load, and the retry/Realtime callers reset before calling — so the
  // load effect never sets state synchronously (react-hooks/set-state-in-effect):
  // state only lands in the .then continuation.
  const load = useCallback(
    (silent = false) => {
      // Overview drives the error/empty state; the SLA rollup + today's meetings
      // are best-effort — if either fails we simply hide that section rather
      // than blocking the whole dashboard. collectTodayMeetings pages the
      // furthest-future-first window down to today so the strip can't go empty
      // just because ≥200 future bookings sit ahead of today's.
      const now = new Date();
      return Promise.all([fetchCrmOverview(), fetchCrmSla(), collectTodayMeetings(now)]).then(([d, sm, mm]) => {
        if (d.data) setData(d.data);
        else if (!silent) {
          setFailure(d.failure);
          setError(true);
        }
        if (sm.data) setSla(sm.data.sla);
        if (mm) setTodayMeetings(mm); // already today-only
        if (!silent) setLoading(false);
      });
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Retry from the error notice: reset, then re-fetch with the skeleton up.
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    setFailure(null);
    void load();
  }, [load]);

  // Live-refresh the overview the moment a crm_events row lands (rep reply /
  // takeover / inbound). Fail-soft: if Realtime is off, the initial load still ran.
  useCrmEvents(() => {
    setError(false); // a silent refresh starts by clearing any stale error
    setFailure(null);
    void load(true);
  });

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return <ErrorNotice failure={failure} fallback="לא הצלחנו לטעון את הסקירה." onRetry={reload} />;
  }

  const p = data.pipeline;
  const total = p.new + p.contacted + p.won + p.lost;
  const closed = p.won + p.lost;
  const closeRate = closed > 0 ? Math.round((p.won / closed) * 100) : null;

  const toLeads = onNavigate ? () => onNavigate("leads") : undefined;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="סה״כ לידים" value={he(total)} onClick={toLeads} />
        <StatCard label="חדשים" value={he(p.new)} tone="info" onClick={toLeads} />
        <StatCard label="ביצירת קשר" value={he(p.contacted)} onClick={toLeads} />
        <StatCard label="נסגרו בהצלחה" value={he(p.won)} tone="value" onClick={toLeads} />
        <StatCard label="אבודים" value={he(p.lost)} tone="danger" onClick={toLeads} />
        <StatCard
          label="אחוז סגירה"
          value={closeRate === null ? "—" : `${closeRate}%`}
          tone="value"
          hint={closed > 0 ? `מתוך ${he(closed)} שנסגרו` : "אין עדיין עסקאות סגורות"}
        />
      </div>

      <PipelineBar pipeline={p} total={total} />

      {todayMeetings && todayMeetings.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-bold text-ink">פגישות היום</h2>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate("meetings")}
                className="text-xs font-medium text-accent-text underline underline-offset-2"
              >
                לכל הפגישות
              </button>
            )}
          </div>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {todayMeetings.map((m) => (
              <li key={m.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenMeetingId(m.id)}
                  className="interactive w-56 rounded-2xl border border-border bg-surface p-3 text-start shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{m.name || "—"}</span>
                    <MeetingStatusPill status={m.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-foreground">{meetingWhen(m) || "—"}</p>
                  {m.provider && <p className="mt-0.5 truncate text-xs text-muted">ספק: {m.provider}</p>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sla && (
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-ink">מהירות טיפול (Speed-to-Lead)</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="זמן תגובה חציוני"
              value={formatMinutes(sla.medianResponseMinutes)}
              hint={sla.responseSampleSize > 0 ? `מתוך ${he(sla.responseSampleSize)} לידים שטופלו` : "אין עדיין נתוני תגובה"}
            />
            <StatCard
              label="ממתינים למענה"
              value={he(sla.uncontacted)}
              tone={sla.uncontacted > 0 ? "info" : "neutral"}
              hint={sla.oldestUncontactedAt ? `הוותיק מ־${when(sla.oldestUncontactedAt)}` : "כל הלידים טופלו"}
              onClick={toLeads}
            />
            <StatCard
              label={`מעבר ל-SLA (${sla.slaHours} שע׳)`}
              value={he(sla.breaching)}
              tone={sla.breaching > 0 ? "danger" : "value"}
              hint={sla.breaching > 0 ? "לידים חדשים שממתינים מעל הזמן" : "אין חריגות מה-SLA"}
              onClick={toLeads}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-ink">שיחות אחרונות</h2>
        {data.recent.length === 0 ? (
          <NoticeCard>אין עדיין שיחות להצגה.</NoticeCard>
        ) : (
          <ul className="space-y-2">
            {data.recent.map((c) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{c.name || "ללא שם"}</p>
                      {c.phone && (
                        <p className="truncate text-xs text-muted" dir="ltr">
                          {c.phone}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-start">
                      <ConversationStatusPill status={c.status} />
                      {c.lastAt && <p className="mt-1 text-xs text-muted">{when(c.lastAt)}</p>}
                    </div>
                  </div>
                  {c.lastSnippet && <p className="mt-2 line-clamp-2 text-xs text-foreground">{c.lastSnippet}</p>}
                </>
              );
              return (
                <li key={c.conversationId}>
                  {onNavigate ? (
                    <button
                      type="button"
                      onClick={() => onNavigate("conversations")}
                      className="interactive block w-full rounded-2xl border border-border bg-surface p-3 text-start shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-border bg-surface p-3 shadow-soft">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {openMeetingId && (
        <CrmMeetingDrawer
          meetingId={openMeetingId}
          onClose={() => setOpenMeetingId(null)}
          onChanged={() => {
            // A status change from the drawer may move a today-card's pill —
            // refresh the dashboard silently.
            void load(true);
          }}
        />
      )}
    </div>
  );
}
