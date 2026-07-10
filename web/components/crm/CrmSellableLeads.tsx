"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmSellableLeads> — the READ-ONLY third-party-sharing feed. Reads crm-api
// `listSellableLeads` (service_role, admin-gated), which returns ONLY leads
// carrying an explicit consent_share_at (the SAME hard legal gate the lead-export
// function uses) through an allowlist DTO (no source_ip / notes). Every load is
// audited server-side (crm_lead_export). This surface NEVER pushes anything to a
// buyer — the secret-gated export cron stays the only path that can. §7b + the DPA
// with any buyer are the owner's legal obligations (called out in the notice).
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { type CrmSellableLead, fetchSellableLeads } from "@/lib/crm-admin";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { BTN_GHOST, NoticeCard, StatusPill, when } from "./ui";

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}

export default function CrmSellableLeads() {
  const [leads, setLeads] = useState<CrmSellableLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const res = await fetchSellableLeads();
    if (res) setLeads(res.leads);
    else setError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = useCallback(() => {
    if (!leads || leads.length === 0) return;
    const headers = ["שם", "טלפון", "אימייל", "ספק", "מקור", "שלב", "הסכמת שיתוף", "נוצר"];
    const rows = leads.map((l) => [
      l.name,
      l.phone,
      l.email ?? "",
      l.provider ?? "",
      l.source ?? "",
      l.status,
      l.consentShareAt ?? "",
      l.createdAt ?? "",
    ]);
    downloadCsv("sellable-leads.csv", buildCsv(headers, rows));
  }, [leads]);

  const canExport = !!leads && leads.length > 0;

  return (
    <div className="space-y-4">
      {/* Legal boundary — always shown, before any data. */}
      <div className="rounded-2xl border border-value/40 bg-value/5 p-4 text-sm text-foreground">
        <p className="font-semibold text-ink">פיד לידים בהסכמת שיתוף</p>
        <p className="mt-1 text-muted">
          כולל <strong>אך ורק</strong> לידים שאישרו במפורש העברת פרטיהם לצד שלישי
          (consent_share_at). תצוגה זו לקריאה בלבד ו<strong>אינה שולחת דבר לרוכש</strong>.
          חובת גילוי העמלה (§7b) וההסכם מול הרוכש (DPA) הן באחריותך המשפטית — יש לוודא
          שנוסח ההסכמה תואם את הרוכש הספציפי לפני כל העברה.
        </p>
      </div>

      {loading ? (
        <Skeleton />
      ) : error || !leads ? (
        <NoticeCard
          action={
            <button type="button" onClick={() => void load()} className={BTN_GHOST}>
              נסו שוב
            </button>
          }
        >
          לא הצלחנו לטעון את הפיד.
        </NoticeCard>
      ) : leads.length === 0 ? (
        <NoticeCard>אין כרגע לידים בהסכמת שיתוף.</NoticeCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-muted">
              {leads.length.toLocaleString("he-IL")} לידים בהסכמת שיתוף
              {leads.length >= 500 ? " (מוצגים 500 האחרונים)" : ""}
            </p>
            <button
              type="button"
              onClick={exportCsv}
              disabled={!canExport}
              className={`${BTN_GHOST} ms-auto text-xs disabled:cursor-not-allowed disabled:opacity-50`}
              title="ייצוא הפיד כקובץ CSV (בדפדפן-המנהל בלבד)"
            >
              ייצוא CSV
            </button>
          </div>

          {/* Desktop: a semantic table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft md:block">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">שם</th>
                  <th scope="col" className="px-4 py-2 font-medium">טלפון</th>
                  <th scope="col" className="px-4 py-2 font-medium">אימייל</th>
                  <th scope="col" className="px-4 py-2 font-medium">ספק</th>
                  <th scope="col" className="px-4 py-2 font-medium">שלב</th>
                  <th scope="col" className="px-4 py-2 font-medium">הסכמת שיתוף</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{l.name || "—"}</td>
                    <td className="px-4 py-2 text-muted" dir="ltr">{l.phone || "—"}</td>
                    <td className="px-4 py-2 text-muted" dir="ltr">{l.email || "—"}</td>
                    <td className="px-4 py-2 text-foreground">{l.provider || "—"}</td>
                    <td className="px-4 py-2"><StatusPill status={l.status} /></td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(l.consentShareAt) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <ul className="space-y-2 md:hidden">
            {leads.map((l) => (
              <li key={l.id} className="rounded-2xl border border-border bg-surface p-3 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{l.name || "—"}</p>
                    <p className="truncate text-xs text-muted" dir="ltr">{l.phone || "—"}</p>
                    {l.email && <p className="truncate text-xs text-muted" dir="ltr">{l.email}</p>}
                  </div>
                  <StatusPill status={l.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {l.provider && <span>ספק: {l.provider}</span>}
                  {l.consentShareAt && <span>הסכמת שיתוף: {when(l.consentShareAt)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
