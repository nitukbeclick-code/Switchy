"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmLeads> — the lead pipeline as a filterable, responsive table (desktop) /
// card list (mobile). Reads crm-api `listLeads` (service_role, access-gated),
// which returns a deliberately column-limited, PII-safe shape (name, phone,
// provider, source, status, created_at — no email/notes/source_ip/consent).
// Filter by stage, a client-side created-at quick-view (24h/7d/30d) and rep,
// search by name/phone (debounced), sort by recency, export the current view as
// CSV (built in-browser, no new endpoint), and multi-select rows for a bulk stage
// change or a bulk "claim to me" (each write is the same audited crm-api action,
// fanned out in bounded waves) with a one-shot undo that restores the stages
// captured before the apply. Every filter is mirrored into the URL (shallow
// replaceState) so a refresh or tab-switch restores the exact view. New-lead rows
// carry a relative-age chip that flips to an SLA-breach tone past the server's
// slaHours. The desktop table is keyboard-navigable (↑/↓ rows, Enter opens,
// Space selects, "/" jumps to search); each row opens the detail drawer
// (status, won-flow, brief) with prev/next paging between leads.
// ────────────────────────────────────────────────────────────────────────────

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  claimCrmLead,
  type CrmFailure,
  type CrmLead,
  fetchCrmLeads,
  fetchCrmSla,
  isLeadStatus,
  LEAD_STATUSES,
  type LeadSort,
  type LeadStatus,
  setCrmLeadStatus,
} from "@/lib/crm-admin";
import { useAuth } from "@/lib/auth-context";
import { runChunked } from "@/lib/batch";
import { buildCsv, csvFileName, downloadCsv } from "@/lib/csv";
import { type DateRange, withinRange } from "@/lib/date-range";
import CrmLeadDrawer from "./CrmLeadDrawer";
import { BTN_GHOST, ErrorNotice, LEAD_STATUS_META, LeadAgeChip, mirrorUrlParams, NoticeCard, StatusPill, when } from "./ui";

type Filter = LeadStatus | "all";

// What a bulk action can do to a selection. Stage targets: `won` is deliberately
// excluded — closing as won goes through the drawer's guided flow (it records the
// real annual saving); these two are the safe "triage" transitions that need no
// extra data. "claim" assigns every selected lead to the signed-in rep.
type BulkTarget = LeadStatus | "claim";
const BULK_TARGETS: { status: LeadStatus; label: string }[] = [
  { status: "contacted", label: "יצרנו קשר" },
  { status: "lost", label: "אבוד" },
];

const RANGE_KEYS: readonly DateRange[] = ["all", "1d", "7d", "30d"];

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
  // Filters initialize from the URL (mirrored below on every change), so a
  // refresh / tab-switch / shared link restores the exact view.
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => {
    const v = params.get("lead_status");
    return isLeadStatus(v) ? v : "all";
  });
  const [searchInput, setSearchInput] = useState(() => params.get("lead_q") ?? "");
  const [search, setSearch] = useState(() => (params.get("lead_q") ?? "").trim());
  const [sort, setSort] = useState<LeadSort>(() => (params.get("lead_sort") === "oldest" ? "oldest" : "recent"));
  const [range, setRange] = useState<DateRange>(() => {
    const v = params.get("lead_range");
    return v && (RANGE_KEYS as readonly string[]).includes(v) ? (v as DateRange) : "all";
  });
  const [rep, setRep] = useState<string>(() => params.get("lead_rep") ?? "all");
  const [leads, setLeads] = useState<CrmLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // The typed reason of the last failed load (server message + retryability).
  const [failure, setFailure] = useState<CrmFailure | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The server's SLA window (hours), for the age chip on new-lead rows.
  // Best-effort: without it the chip still shows the age, just never "breach".
  const [slaHours, setSlaHours] = useState<number | null>(null);
  // Bulk selection (by lead id) + its in-flight/result state. `bulkMsg.ok`
  // drives the tone: full success renders in the value token, a partial
  // failure in the danger token so it can't be skimmed past as a win.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Two-step confirm for the bulk buttons: the first click arms the target,
  // the second actually applies it (no window.confirm).
  const [confirmTarget, setConfirmTarget] = useState<BulkTarget | null>(null);
  // One-shot undo for the last bulk STAGE change: each entry is a lead's stage
  // as captured BEFORE the apply. Consumed on use; replaced by the next apply.
  const [undoEntries, setUndoEntries] = useState<{ id: string; status: LeadStatus }[] | null>(null);
  // Roving keyboard focus over the desktop table rows.
  const [activeRow, setActiveRow] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  // Monotonic sequence for loads: rapid filter/sort switches fire overlapping
  // fetches, and HTTP ordering isn't guaranteed — only the newest may land.
  const loadSeq = useRef(0);
  // The rolling-window clock for the quick-view date filter + the age chips.
  // Sampled when the inputs of `shown` actually change (a load landing, a
  // range/rep click) — exactly when the memo used to call Date.now() — instead
  // of impurely during render (react-hooks/purity). 0 is safe: it's never read
  // before a sample (no rows before the first load; `all` ignores it).
  const [nowMs, setNowMs] = useState(0);

  const { profile } = useAuth();
  const repName = (profile?.name ?? "").trim() || "מנהל";

  // Event-side reset before a (re)load: skeleton up, stale view state cleared.
  // The useState initializers cover the mount load; every later load starts
  // from an event (filter/sort click, search debounce, retry, bulk, drawer
  // onChanged) that calls this first — so the load effect below never sets
  // state synchronously (react-hooks/set-state-in-effect).
  const beginLoad = useCallback(() => {
    setLoading(true);
    setError(false);
    setFailure(null);
    setSelected(new Set()); // a fresh view invalidates any prior selection
    setConfirmTarget(null);
  }, []);

  // Debounce the search box so we don't fire a request per keystroke; when the
  // (trimmed) query actually changes, reset the view here in the timeout
  // callback — the load effect then refetches.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return; // unchanged query — no reload, same as before
      beginLoad();
      setSearch(next);
      mirrorUrlParams({ lead_q: next || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, beginLoad]);

  // The server's SLA window, once (best-effort — failure just hides "breach").
  useEffect(() => {
    void fetchCrmSla().then((r) => {
      if (r.data) setSlaHours(r.data.sla.slaHours);
    });
  }, []);

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
        (l) => withinRange(l.createdAt, range, nowMs) && (rep === "all" || l.claimedBy === rep),
      ),
    [leads, range, rep, nowMs],
  );

  const clearOnFilterChange = useCallback(() => {
    setSelected(new Set()); // a narrower view invalidates a selection of hidden rows
    setBulkMsg(null);
    setConfirmTarget(null);
  }, []);

  const changeRange = useCallback((r: DateRange) => {
    if (r !== range) {
      setNowMs(Date.now()); // re-sample the window clock, as the memo used to
      setRange(r);
      mirrorUrlParams({ lead_range: r === "all" ? null : r });
    }
    clearOnFilterChange();
  }, [range, clearOnFilterChange]);

  const changeRep = useCallback((r: string) => {
    if (r !== rep) {
      setNowMs(Date.now()); // re-sample the window clock, as the memo used to
      setRep(r);
      mirrorUrlParams({ lead_rep: r === "all" ? null : r });
    }
    clearOnFilterChange();
  }, [rep, clearOnFilterChange]);

  // Fetch the current view. Loading/error resets are event-driven (`beginLoad`
  // above; the useState initializers cover the mount load) — so the load effect
  // never sets state synchronously (react-hooks/set-state-in-effect): state
  // only lands in the .then continuation.
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    return fetchCrmLeads({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
      sort,
    }).then((res) => {
      if (seq !== loadSeq.current) return; // a newer load superseded this one
      if (res.data) {
        setLeads(res.data.leads);
        setNowMs(Date.now()); // fresh window clock for the fresh rows
        // If this load dropped the currently-filtered rep from the window, fall
        // back to all (previously a separate effect over repOptions).
        const rows = res.data.leads;
        setRep((prev) => (prev !== "all" && !rows.some((l) => l.claimedBy === prev) ? "all" : prev));
      } else {
        setFailure(res.failure);
        setError(true);
      }
      setLoading(false);
    });
  }, [filter, search, sort]);

  // Re-fetch the current view from an event (retry, bulk apply, drawer onChanged).
  const reload = useCallback(async () => {
    beginLoad();
    await load();
  }, [beginLoad, load]);

  // Switch stage/sort: reset the view in the click, then the effect refetches.
  const changeFilter = useCallback(
    (next: Filter) => {
      if (next === filter) return; // same chip — no reload, same as before
      beginLoad();
      setFilter(next);
      mirrorUrlParams({ lead_status: next === "all" ? null : next });
    },
    [filter, beginLoad],
  );

  const changeSort = useCallback(
    (next: LeadSort) => {
      if (next === sort) return; // same button — no reload, same as before
      beginLoad();
      setSort(next);
      mirrorUrlParams({ lead_sort: next === "oldest" ? next : null });
    },
    [sort, beginLoad],
  );

  const toggleOne = useCallback((id: string) => {
    setBulkMsg(null);
    setConfirmTarget(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setBulkMsg(null);
    setConfirmTarget(null);
    setSelected((prev) => {
      if (shown.length > 0 && shown.every((l) => prev.has(l.id))) return new Set();
      return new Set(shown.map((l) => l.id));
    });
  }, [shown]);

  // Apply a bulk action to every selected lead. Each call is the SAME audited
  // crm-api write the drawer uses (the server writes lead_events +
  // security_audit_log), just fanned out in small waves. Partial failures are
  // reported, not swallowed. A stage change first captures each lead's current
  // stage so the one-shot undo below can restore exactly what was on screen.
  const applyBulk = useCallback(
    async (target: BulkTarget) => {
      if (selected.size === 0 || bulkBusy) return;
      setBulkBusy(true);
      setBulkMsg(null);
      setConfirmTarget(null);
      setUndoEntries(null); // a new apply replaces any prior (now-ambiguous) undo
      const ids = [...selected];
      let ok: number;
      if (target === "claim") {
        ok = await runChunked(ids, 5, (id) => claimCrmLead(id, repName));
        setBulkMsg(
          ok === ids.length
            ? { text: `שויכו ${ok} לידים אליך (${repName}).`, ok: true }
            : { text: `שויכו ${ok} מתוך ${ids.length} לידים (חלק נכשלו).`, ok: false },
        );
      } else {
        // Captured BEFORE the writes; only known stages are restorable.
        const prior: { id: string; status: LeadStatus }[] = [];
        for (const l of leads ?? []) {
          if (selected.has(l.id) && isLeadStatus(l.status) && l.status !== target) {
            prior.push({ id: l.id, status: l.status });
          }
        }
        ok = await runChunked(ids, 5, (id) => setCrmLeadStatus(id, target));
        if (ok > 0 && prior.length > 0) setUndoEntries(prior);
        setBulkMsg(
          ok === ids.length
            ? { text: `עודכנו ${ok} לידים.`, ok: true }
            : { text: `עודכנו ${ok} מתוך ${ids.length} לידים (חלק נכשלו).`, ok: false },
        );
      }
      setBulkBusy(false);
      await reload(); // refresh statuses + clear the (now-stale) selection
    },
    [selected, bulkBusy, leads, repName, reload],
  );

  // One-shot undo: restore the pre-apply stages (each restore is the same
  // audited setLeadStatus). Consumed immediately — success or not — so it can
  // never be double-fired against a view that already moved on.
  const applyUndo = useCallback(async () => {
    const entries = undoEntries;
    if (!entries || bulkBusy) return;
    setUndoEntries(null);
    setBulkBusy(true);
    setBulkMsg(null);
    const ok = await runChunked(entries, 5, (e) => setCrmLeadStatus(e.id, e.status));
    setBulkBusy(false);
    setBulkMsg(
      ok === entries.length
        ? { text: `שוחזרו ${ok} לידים לשלב הקודם.`, ok: true }
        : { text: `שוחזרו ${ok} מתוך ${entries.length} לידים (חלק נכשלו).`, ok: false },
    );
    await reload();
  }, [undoEntries, bulkBusy, reload]);

  useEffect(() => {
    void load();
  }, [load]);

  // Export the CURRENT view as CSV. The rows are already in the admin's browser
  // (fetched via crm-api behind the access gate), so this adds no new endpoint and
  // no new PII surface — csv.ts guards against formula injection on the way out.
  // The id column makes a row traceable back to the console; a full 200-row
  // server window gets the honest "-partial" filename suffix.
  const exportCsv = useCallback(() => {
    if (shown.length === 0) return;
    const headers = ["id", "שם", "טלפון", "ספק", "מקור", "נציג", "שלב", "נוצר"];
    const rows = shown.map((l) => [
      l.id,
      l.name,
      l.phone,
      l.provider ?? "",
      l.source ?? "",
      l.claimedBy ?? "",
      isLeadStatus(l.status) ? LEAD_STATUS_META[l.status].label : l.status,
      l.createdAt ?? "",
    ]);
    const partial = (leads?.length ?? 0) >= 200;
    downloadCsv(
      csvFileName(`leads-${filter}${range === "all" ? "" : `-${range}`}`, partial),
      buildCsv(headers, rows),
    );
  }, [shown, leads, filter, range]);

  const canExport = shown.length > 0;
  const allSelected = shown.length > 0 && shown.every((l) => selected.has(l.id));
  const someSelected = selected.size > 0 && !allSelected;

  // Roving tabindex home for the keyboard-navigable table (clamped so a
  // shrinking view can't strand the tab stop on a removed row).
  const effActiveRow = Math.min(activeRow, Math.max(0, shown.length - 1));

  // Keyboard triage on a desktop table row: ↑/↓ move (roving tabindex), Enter
  // opens the drawer, Space toggles selection, "/" jumps to the search box.
  // Enter/Space act only when the ROW itself is focused — inner controls (the
  // checkbox, the name button) keep their native keyboard behaviour.
  const onRowKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTableRowElement>, idx: number, lead: CrmLead) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = e.key === "ArrowDown" ? Math.min(idx + 1, shown.length - 1) : Math.max(idx - 1, 0);
        setActiveRow(next);
        rowRefs.current[next]?.focus();
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
        e.preventDefault();
        if (e.key === "Enter") setSelectedId(lead.id);
        else toggleOne(lead.id);
      }
    },
    [shown.length, toggleOne],
  );

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

  // prev/next paging targets for the drawer, over the CURRENT view's order.
  const selIdx = selectedId ? shown.findIndex((l) => l.id === selectedId) : -1;
  const prevLeadId = selIdx > 0 ? shown[selIdx - 1].id : null;
  const nextLeadId = selIdx >= 0 && selIdx < shown.length - 1 ? shown[selIdx + 1].id : null;

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
              onClick={() => changeFilter(f.key)}
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
          ref={searchRef}
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
            onClick={() => changeSort("recent")}
            aria-pressed={sort === "recent"}
            className={`rounded-full border px-2.5 py-1 font-medium ${sort === "recent" ? "border-accent bg-accent/10 text-accent-text" : "border-border"}`}
          >
            חדשים
          </button>
          <button
            type="button"
            onClick={() => changeSort("oldest")}
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
        <ErrorNotice failure={failure} fallback="לא הצלחנו לטעון את הלידים." onRetry={() => void reload()} />
      ) : leads.length === 0 ? (
        <NoticeCard>{search ? "לא נמצאו לידים תואמים לחיפוש." : "אין לידים בשלב הזה."}</NoticeCard>
      ) : (
        <>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-3">
              <span className="text-sm font-semibold text-ink">{selected.size.toLocaleString("he-IL")} נבחרו</span>
              <span className="text-xs text-muted">העבר ל־</span>
              {BULK_TARGETS.map((t) =>
                confirmTarget === t.status ? (
                  // Armed: the first click swapped the button for an explicit
                  // confirm + escape, so a bulk stage change is never one click.
                  <span key={t.status} className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void applyBulk(t.status)}
                      disabled={bulkBusy}
                      className={`${BTN_GHOST} text-xs ${t.status === "lost" ? "border-danger/40 text-danger-text" : "border-accent/40 text-accent-text"}`}
                    >
                      {`אישור: העבר ${selected.size.toLocaleString("he-IL")} ל״${t.label}״`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmTarget(null)}
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
                    onClick={() => setConfirmTarget(t.status)}
                    disabled={bulkBusy}
                    className={`${BTN_GHOST} text-xs`}
                  >
                    {t.label}
                  </button>
                ),
              )}
              {confirmTarget === "claim" ? (
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void applyBulk("claim")}
                    disabled={bulkBusy}
                    className={`${BTN_GHOST} border-accent/40 text-xs text-accent-text`}
                  >
                    {`אישור: שייך ${selected.size.toLocaleString("he-IL")} אליי (${repName})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(null)}
                    disabled={bulkBusy}
                    className={`${BTN_GHOST} text-xs`}
                  >
                    ביטול
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmTarget("claim")}
                  disabled={bulkBusy}
                  className={`${BTN_GHOST} text-xs`}
                >
                  שייך אליי
                </button>
              )}
              {bulkBusy && <span className="text-xs text-muted">מעדכן…</span>}
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setConfirmTarget(null);
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
              {undoEntries && (
                <button
                  type="button"
                  onClick={() => void applyUndo()}
                  disabled={bulkBusy}
                  className="ms-2 font-semibold text-accent-text underline underline-offset-2 disabled:opacity-50"
                >
                  ביטול — שחזור השלבים הקודמים
                </button>
              )}
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
                {shown.map((l, i) => (
                  // A focusable <tr> (roving tabindex) keeps row/cell semantics
                  // (the scope="col" headers stay associated) while giving the
                  // keyboard ↑/↓/Enter/Space triage above; the row onClick stays
                  // a pointer convenience. The real name-cell <button> remains a
                  // sibling control of the selection checkbox for AT users.
                  <tr
                    key={l.id}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    tabIndex={i === effActiveRow ? 0 : -1}
                    onFocus={(e) => {
                      if (e.target === e.currentTarget) setActiveRow(i);
                    }}
                    onKeyDown={(e) => onRowKeyDown(e, i, l)}
                    onClick={() => setSelectedId(l.id)}
                    className={`cursor-pointer border-b border-border/60 outline-none last:border-0 focus-visible:bg-accent/5 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5 ${
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
                    <td className="px-4 py-2">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <StatusPill status={l.status} />
                        {l.status === "new" && <LeadAgeChip createdAt={l.createdAt} nowMs={nowMs} slaHours={slaHours} />}
                      </span>
                    </td>
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
                  <span className="inline-flex flex-col items-end gap-1">
                    <StatusPill status={l.status} />
                    {l.status === "new" && <LeadAgeChip createdAt={l.createdAt} nowMs={nowMs} slaHours={slaHours} />}
                  </span>
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
        // key={selectedId} remounts the drawer per lead, preserving its
        // "leadId is fixed for this instance" load contract while prev/next
        // pages between the current view's leads.
        <CrmLeadDrawer
          key={selectedId}
          leadId={selectedId}
          prevId={prevLeadId}
          nextId={nextLeadId}
          onNavigate={(id) => setSelectedId(id)}
          onClose={() => setSelectedId(null)}
          onChanged={() => void reload()}
        />
      )}
    </div>
  );
}
