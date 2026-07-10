"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmLeads> — the lead pipeline as a filterable, responsive table (desktop) /
// card list (mobile). Reads crm-api `listLeads` (service_role, admin-gated),
// which returns a deliberately column-limited, PII-safe shape (name, phone,
// provider, source, status, created_at — no email/notes/source_ip/consent).
// Filter by stage, a client-side created-at quick-view (24h/7d/30d) and rep,
// search by name/phone (debounced), sort by recency, export the current view as
// CSV (built in-browser, no new endpoint), and multi-select rows for a bulk stage
// change (each write is the same audited setLeadStatus, fanned out in bounded
// waves); each row opens the detail drawer (status, won-flow, brief).
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type CrmLead, fetchCrmLeads, LEAD_STATUSES, type LeadSort, type LeadStatus, setCrmLeadStatus } from "@/lib/crm-admin";
import { runChunked } from "@/lib/batch";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { type DateRange, withinRange } from "@/lib/date-range";
import CrmLeadDrawer from "./CrmLeadDrawer";
import { BTN_GHOST, LEAD_STATUS_META, NoticeCard, StatusPill, when } from "./ui";

type Filter = LeadStatus | "all";

// Stages a bulk action can move a selection to. `won` is deliberately excluded —
// closing as won goes through the drawer's guided flow (it records the real annual
// saving); these two are the safe "triage" transitions that need no extra data.
const BULK_TARGETS: { status: LeadStatus; label: string }[] = [
  { status: "contacted", label: "יצרנו קשר" },
  { status: "lost", label: "אבוד" },
];

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
  const [range, setRange] = useState<DateRange>("all");
  const [rep, setRep] = useState<string>("all");
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Bulk selection (by lead id) + its in-flight/result state. `bulkMsg.ok`
  // drives the tone: full success renders in the value token, a partial
  // failure in the danger token so it can't be skimmed past as a win.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Two-step confirm for the bulk stage buttons: the first click arms the
  // target, the second actually applies it (no window.confirm).
  const [confirmStatus, setConfirmStatus] = useState<LeadStatus | null>(null);
  // Monotonic sequence for loads: rapid filter/sort switches fire overlapping
  // fetches, and HTTP ordering isn't guaranteed — only the newest may land.
  const loadSeq = useRef(0);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // The set of reps present in the loaded window, for the rep filter dropdown.
  const repOptions = useMemo(
    () => [...new Set((leads ?? []).map((l) => l.claimedBy).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b)),
    [leads],
  );

  // Quick-view date window + rep filter, applied CLIENT-side over the fetched rows
  // (already server-sorted), so switching is instant and needs no round-trip.
  // Everything downstream — count, export, select-all — reads `shown`, not `leads`.
  const shown = useMemo(
    () =>
      (leads ?? []).filter(
        (l) => withinRange(l.createdAt, range, Date.now()) && (rep === "all" || l.claimedBy === rep),
      ),
    [leads, range, rep],
  );

  const clearOnFilterChange = useCallback(() => {
    setSelected(new Set()); // a narrower view invalidates a selection of hidden rows
    setBulkMsg(null);
    setConfirmStatus(null);
  }, []);

  const changeRange = useCallback((r: DateRange) => {
    setRange(r);
    clearOnFilterChange();
  }, [clearOnFilterChange]);

  const changeRep = useCallback((r: string) => {
    setRep(r);
    clearOnFilterChange();
  }, [clearOnFilterChange]);

  // If a reload drops the currently-filtered rep from the window, fall back to all.
  useEffect(() => {
    if (rep !== "all" && !repOptions.includes(rep)) setRep("all");
  }, [repOptions, rep]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(false);
    setSelected(new Set()); // a fresh view invalidates any prior selection
    setConfirmStatus(null);
    const res = await fetchCrmLeads({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
      sort,
    });
    if (seq !== loadSeq.current) return; // a newer load superseded this one
    if (res) setLeads(res.leads);
    else setError(true);
    setLoading(false);
  }, [filter, search, sort]);

  const toggleOne = useCallback((id: string) => {
    setBulkMsg(null);
    setConfirmStatus(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setBulkMsg(null);
    setConfirmStatus(null);
    setSelected((prev) => {
      if (shown.length > 0 && shown.every((l) => prev.has(l.id))) return new Set();
      return new Set(shown.map((l) => l.id));
    });
  }, [shown]);

  // Apply a stage to every selected lead. Each call is the SAME audited
  // setLeadStatus the drawer uses (server writes lead_events + security_audit_log),
  // just fanned out in small waves. Partial failures are reported, not swallowed.
  const applyBulkStatus = useCallback(
    async (status: LeadStatus) => {
      if (selected.size === 0 || bulkBusy) return;
      setBulkBusy(true);
      setBulkMsg(null);
      setConfirmStatus(null);
      const ids = [...selected];
      const ok = await runChunked(ids, 5, (id) => setCrmLeadStatus(id, status));
      setBulkBusy(false);
      setBulkMsg(
        ok === ids.length
          ? { text: `עודכנו ${ok} לידים.`, ok: true }
          : { text: `עודכנו ${ok} מתוך ${ids.length} לידים (חלק נכשלו).`, ok: false },
      );
      await load(); // refresh statuses + clear the (now-stale) selection
    },
    [selected, bulkBusy, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Export the CURRENT view as CSV. The rows are already in the admin's browser
  // (fetched via crm-api behind the admin gate), so this adds no new endpoint and
  // no new PII surface — csv.ts guards against formula injection on the way out.
  const exportCsv = useCallback(() => {
    if (shown.length === 0) return;
    const headers = ["שם", "טלפון", "ספק", "מקור", "נציג", "שלב", "נוצר"];
    const rows = shown.map((l) => [
      l.name,
      l.phone,
      l.provider ?? "",
      l.source ?? "",
      l.claimedBy ?? "",
      LEAD_STATUS_META[l.status]?.label ?? l.status,
      l.createdAt ?? "",
    ]);
    downloadCsv(`leads-${filter}${range === "all" ? "" : `-${range}`}.csv`, buildCsv(headers, rows));
  }, [shown, filter, range]);

  const canExport = shown.length > 0;
  const allSelected = shown.length > 0 && shown.every((l) => selected.has(l.id));
  const someSelected = selected.size > 0 && !allSelected;

  const RANGES: { key: DateRange; label: string }[] = [
    { key: "all", label: "הכול" },
    { key: "1d", label: "24 שעות" },
    { key: "7d", label: "7 ימים" },
    { key: "30d", label: "30 יום" },
  ];

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "הכול" },
    ...LEAD_STATUSES.map((s) => ({ key: s as Filter, label: LEAD_STATUS_META[s].label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי שלב">
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
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

      <div className="flex flex-wrap items-center gap-1 text-xs text-muted" role="group" aria-label="טווח זמן ונציג">
        <span>נוצרו:</span>
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => changeRange(r.key)}
            aria-pressed={range === r.key}
            className={`rounded-full border px-2.5 py-1 font-medium ${range === r.key ? "border-accent bg-accent/10 text-accent-text" : "border-border"}`}
          >
            {r.label}
          </button>
        ))}
        {repOptions.length > 0 && (
          <>
            <span className="ms-2">נציג:</span>
            <select
              value={rep}
              onChange={(e) => changeRep(e.target.value)}
              aria-label="סינון לפי נציג"
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
            >
              <option value="all">הכול</option>
              {repOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </>
        )}
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
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-3">
              <span className="text-sm font-semibold text-ink">{selected.size.toLocaleString("he-IL")} נבחרו</span>
              <span className="text-xs text-muted">העבר ל־</span>
              {BULK_TARGETS.map((t) =>
                confirmStatus === t.status ? (
                  // Armed: the first click swapped the button for an explicit
                  // confirm + escape, so a bulk stage change is never one click.
                  <span key={t.status} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void applyBulkStatus(t.status)}
                      disabled={bulkBusy}
                      className={`${BTN_GHOST} text-xs ${t.status === "lost" ? "border-danger/40 text-danger-text" : "border-accent/40 text-accent-text"}`}
                    >
                      {`אישור: העבר ${selected.size.toLocaleString("he-IL")} ל״${t.label}״`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmStatus(null)}
                      disabled={bulkBusy}
                      className={`${BTN_GHOST} text-xs`}
                    >
                      ביטול
                    </button>
                  </span>
                ) : (
                  <button
                    key={t.status}
                    type="button"
                    onClick={() => setConfirmStatus(t.status)}
                    disabled={bulkBusy}
                    className={`${BTN_GHOST} text-xs`}
                  >
                    {t.label}
                  </button>
                ),
              )}
              {bulkBusy && <span className="text-xs text-muted">מעדכן…</span>}
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setConfirmStatus(null);
                }}
                disabled={bulkBusy}
                className="ms-auto text-xs text-muted underline underline-offset-2 disabled:opacity-50"
              >
                בטל בחירה
              </button>
            </div>
          )}
          {bulkMsg && (
            <p className={`text-xs font-medium ${bulkMsg.ok ? "text-value-text" : "text-danger-text"}`} role="status">
              {bulkMsg.text}
            </p>
          )}
          {shown.length === 0 ? (
            <NoticeCard>אין לידים בטווח הזמן שנבחר.</NoticeCard>
          ) : (
          <>
          <p className="text-xs text-muted">
            {shown.length.toLocaleString("he-IL")} לידים
            {range === "all" && leads && leads.length >= 200 ? " (מתוך 200 שנטענו)" : ""}
          </p>

          {/* Desktop: a semantic table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft md:block">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="w-10 px-4 py-2 font-medium">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      aria-label="בחר את כל הלידים המוצגים"
                      className="h-4 w-4 cursor-pointer accent-accent"
                    />
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">שם</th>
                  <th scope="col" className="px-4 py-2 font-medium">טלפון</th>
                  <th scope="col" className="px-4 py-2 font-medium">ספק</th>
                  <th scope="col" className="px-4 py-2 font-medium">מקור</th>
                  <th scope="col" className="px-4 py-2 font-medium">נציג</th>
                  <th scope="col" className="px-4 py-2 font-medium">שלב</th>
                  <th scope="col" className="px-4 py-2 font-medium">נוצר</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  // A plain <tr> keeps row/cell semantics (the scope="col" headers
                  // stay associated); the row onClick is a pointer-only convenience.
                  // Keyboard/AT access lives on the real name-cell <button> below,
                  // a sibling control of the selection checkbox.
                  <tr
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    className={`cursor-pointer border-b border-border/60 last:border-0 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5 ${
                      selected.has(l.id) ? "bg-accent/5" : ""
                    }`}
                  >
                    <td
                      className="px-4 py-2"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(l.id)}
                        onChange={() => toggleOne(l.id)}
                        aria-label={`בחירת הליד ${l.name || l.phone}`}
                        className="h-4 w-4 cursor-pointer accent-accent"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(l.id)}
                        aria-label={`פרטי הליד ${l.name || l.phone}`}
                        className="font-medium text-ink underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
                      >
                        {l.name || "—"}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-muted" dir="ltr">{l.phone || "—"}</td>
                    <td className="px-4 py-2 text-foreground">{l.provider || "—"}</td>
                    <td className="px-4 py-2 text-muted">{l.source || "—"}</td>
                    <td className="px-4 py-2 text-muted">{l.claimedBy || "—"}</td>
                    <td className="px-4 py-2"><StatusPill status={l.status} /></td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <ul className="space-y-2 md:hidden">
            {shown.map((l) => (
              // Plain <li>: the card onClick is a pointer-only convenience;
              // keyboard/AT access lives on the real name <button>, a sibling
              // control of the selection checkbox (no nested-interactive ARIA).
              <li
                key={l.id}
                onClick={() => setSelectedId(l.id)}
                className="cursor-pointer rounded-2xl border border-border bg-surface p-3 shadow-soft [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      aria-label={`בחירת הליד ${l.name || l.phone}`}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(l.id)}
                        aria-label={`פרטי הליד ${l.name || l.phone}`}
                        className="block max-w-full truncate text-start text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {l.name || "—"}
                      </button>
                      <p className="truncate text-xs text-muted" dir="ltr">{l.phone || "—"}</p>
                    </div>
                  </div>
                  <StatusPill status={l.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {l.provider && <span>ספק: {l.provider}</span>}
                  {l.source && <span>מקור: {l.source}</span>}
                  {l.claimedBy && <span>נציג: {l.claimedBy}</span>}
                  {l.createdAt && <span>{when(l.createdAt)}</span>}
                </div>
              </li>
            ))}
          </ul>
          </>
          )}
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
