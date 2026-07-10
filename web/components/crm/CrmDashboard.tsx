"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmDashboard> — the console overview: pipeline KPIs (lead counts per stage +
// close rate), a proportional pipeline bar, and the most recent conversations.
// Reads crm-api `overview` (service_role, admin-gated) — every figure is a real
// count, nothing fabricated. Owns its own load / loading / error states so the
// console shell stays a thin router.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { type CrmOverview, type CrmPipeline, type CrmSla, fetchCrmOverview, fetchCrmSla } from "@/lib/crm-admin";
import {
  BTN_GHOST,
  ConversationStatusPill,
  formatMinutes,
  LEAD_STATUS_META,
  NoticeCard,
  StatCard,
  when,
} from "./ui";

const he = (n: number) => n.toLocaleString("he-IL");

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

export default function CrmDashboard() {
  const [data, setData] = useState<CrmOverview | null>(null);
  const [sla, setSla] = useState<CrmSla | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    // Overview drives the error/empty state; the SLA rollup is best-effort — if it
    // fails we simply hide that section rather than blocking the whole dashboard.
    const [d, sm] = await Promise.all([fetchCrmOverview(), fetchCrmSla()]);
    if (d) setData(d);
    else setError(true);
    setSla(sm?.sla ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <NoticeCard
        action={
          <button type="button" onClick={() => void load()} className={BTN_GHOST}>
            נסו שוב
          </button>
        }
      >
        לא הצלחנו לטעון את הסקירה.
      </NoticeCard>
    );
  }

  const p = data.pipeline;
  const total = p.new + p.contacted + p.won + p.lost;
  const closed = p.won + p.lost;
  const closeRate = closed > 0 ? Math.round((p.won / closed) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="סה״כ לידים" value={he(total)} />
        <StatCard label="חדשים" value={he(p.new)} tone="info" />
        <StatCard label="ביצירת קשר" value={he(p.contacted)} />
        <StatCard label="נסגרו בהצלחה" value={he(p.won)} tone="value" />
        <StatCard label="אבודים" value={he(p.lost)} tone="danger" />
        <StatCard
          label="אחוז סגירה"
          value={closeRate === null ? "—" : `${closeRate}%`}
          tone="value"
          hint={closed > 0 ? `מתוך ${he(closed)} שנסגרו` : "אין עדיין עסקאות סגורות"}
        />
      </div>

      <PipelineBar pipeline={p} total={total} />

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
            />
            <StatCard
              label={`מעבר ל-SLA (${sla.slaHours} שע׳)`}
              value={he(sla.breaching)}
              tone={sla.breaching > 0 ? "danger" : "value"}
              hint={sla.breaching > 0 ? "לידים חדשים שממתינים מעל הזמן" : "אין חריגות מה-SLA"}
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
            {data.recent.map((c) => (
              <li key={c.conversationId} className="rounded-2xl border border-border bg-surface p-3 shadow-soft">
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
                    {c.lastAt && <p className="mt-1 text-[11px] text-muted">{when(c.lastAt)}</p>}
                  </div>
                </div>
                {c.lastSnippet && <p className="mt-2 line-clamp-2 text-xs text-foreground">{c.lastSnippet}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
