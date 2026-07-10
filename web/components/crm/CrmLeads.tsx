"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmLeads> — the lead pipeline as a filterable, responsive table (desktop) /
// card list (mobile). Reads crm-api `listLeads` (service_role, admin-gated),
// which returns a deliberately column-limited, PII-safe shape (name, phone,
// provider, source, status, created_at — no email/notes/source_ip/consent).
// Filter by stage, search by name/phone (debounced), sort by recency, and export
// the current view as CSV (built in-browser, no new endpoint); each row opens the
// detail drawer (status changes, won-flow, call-brief).
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { type CrmLead, fetchCrmLeads, LEAD_STATUSES, type LeadSort, type LeadStatus } from "@/lib/crm-admin";
import { buildCsv, downloadCsv } from "@/lib/csv";
import CrmLeadDrawer from "./CrmLeadDrawer";
import { BTN_GHOST, LEAD_STATUS_META, NoticeCard, StatusPill, when } from "./ui";

type Filter = LeadStatus | "all";

// Enter/Space activate a row that is a clickable region (role="button").
function activateOnKey(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}

function LeadsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}

export default function CrmLeads() {
  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LeadSort>("recent");
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const res = await fetchCrmLeads({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
      sort,
    });
    if (res) setLeads(res.leads);
    else setError(true);
    setLoading(false);
  }, [filter, search, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  // Export the CURRENT view as CSV. The rows are already in the admin's browser
  // (fetched via crm-api behind the admin gate), so this adds no new endpoint and
  // no new PII surface — csv.ts guards against formula injection on the way out.
  const exportCsv = useCallback(() => {
    if (!leads || leads.length === 0) return;
    const headers = ["שם", "טלפון", "ספק", "מקור", "שלב", "נוצר"];
    const rows = leads.map((l) => [
      l.name,
      l.phone,
      l.provider ?? "",
      l.source ?? "",
      LEAD_STATUS_META[l.status]?.label ?? l.status,
      l.createdAt ?? "",
    ]);
    downloadCsv(`leads-${filter}.csv`, buildCsv(headers, rows));
  }, [leads, filter]);

  const canExport = !!leads && leads.length > 0;

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "הכול" },
    ...LEAD_STATUSES.map((s) => ({ key: s as Filter, label: LEAD_STATUS_META[s].label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="סינון לפי שלב">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.key)}
              className={`interactive rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "border-accent bg-accent/10 text-accent-text"
                  : "border-border text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="חיפוש שם / טלפון"
          aria-label="חיפוש לידים"
          className="w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <div className="ms-auto flex items-center gap-1 text-xs text-muted">
          <span>מיון:</span>
          <button
            type="button"
            onClick={() => setSort("recent")}
            aria-pressed={sort === "recent"}
            className={`rounded-full border px-2.5 py-1 font-medium ${sort === "recent" ? "border-accent bg-accent/10 text-accent-text" : "border-border"}`}
          >
            חדשים
          </button>
          <button
            type="button"
            onClick={() => setSort("oldest")}
            aria-pressed={sort === "oldest"}
            className={`rounded-full border px-2.5 py-1 font-medium ${sort === "oldest" ? "border-accent bg-accent/10 text-accent-text" : "border-border"}`}
          >
            ותיקים
          </button>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!canExport}
          className={`${BTN_GHOST} text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          title="ייצוא התצוגה הנוכחית כקובץ CSV"
        >
          ייצוא CSV
        </button>
      </div>

      {loading ? (
        <LeadsSkeleton />
      ) : error || !leads ? (
        <NoticeCard
          action={
            <button type="button" onClick={() => void load()} className={BTN_GHOST}>
              נסו שוב
            </button>
          }
        >
          לא הצלחנו לטעון את הלידים.
        </NoticeCard>
      ) : leads.length === 0 ? (
        <NoticeCard>{search ? "לא נמצאו לידים תואמים לחיפוש." : "אין לידים בשלב הזה."}</NoticeCard>
      ) : (
        <>
          <p className="text-xs text-muted">
            {leads.length.toLocaleString("he-IL")} לידים{leads.length >= 200 ? " (מוצגים 200 האחרונים)" : ""}
          </p>

          {/* Desktop: a semantic table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft md:block">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">שם</th>
                  <th scope="col" className="px-4 py-2 font-medium">טלפון</th>
                  <th scope="col" className="px-4 py-2 font-medium">ספק</th>
                  <th scope="col" className="px-4 py-2 font-medium">מקור</th>
                  <th scope="col" className="px-4 py-2 font-medium">שלב</th>
                  <th scope="col" className="px-4 py-2 font-medium">נוצר</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`פרטי הליד ${l.name || l.phone}`}
                    onClick={() => setSelectedId(l.id)}
                    onKeyDown={activateOnKey(() => setSelectedId(l.id))}
                    className="cursor-pointer border-b border-border/60 last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
                  >
                    <td className="px-4 py-2 font-medium text-ink">{l.name || "—"}</td>
                    <td className="px-4 py-2 text-muted" dir="ltr">{l.phone || "—"}</td>
                    <td className="px-4 py-2 text-foreground">{l.provider || "—"}</td>
                    <td className="px-4 py-2 text-muted">{l.source || "—"}</td>
                    <td className="px-4 py-2"><StatusPill status={l.status} /></td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <ul className="space-y-2 md:hidden">
            {leads.map((l) => (
              <li
                key={l.id}
                role="button"
                tabIndex={0}
                aria-label={`פרטי הליד ${l.name || l.phone}`}
                onClick={() => setSelectedId(l.id)}
                onKeyDown={activateOnKey(() => setSelectedId(l.id))}
                className="cursor-pointer rounded-2xl border border-border bg-surface p-3 shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{l.name || "—"}</p>
                    <p className="truncate text-xs text-muted" dir="ltr">{l.phone || "—"}</p>
                  </div>
                  <StatusPill status={l.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {l.provider && <span>ספק: {l.provider}</span>}
                  {l.source && <span>מקור: {l.source}</span>}
                  {l.createdAt && <span>{when(l.createdAt)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedId && (
        <CrmLeadDrawer
          leadId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
