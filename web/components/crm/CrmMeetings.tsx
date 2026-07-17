"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmMeetings> — the Zoom-booking pipeline as a filterable list. Reads crm-api
// `listMeetings` (service_role, access-gated), which returns a deliberately light,
// PII-safe shape (name, phone, provider, date/slot, status — no email/join_url/
// notes; those load one-at-a-time in the drawer). Filter by lifecycle status and
// search by name/phone — the search is CLIENT-side over the loaded window (the
// list action has no search param), so it's instant. Both are mirrored to the
// URL and survive refresh/tab-switch. Export the current view as CSV (id column;
// honest "-partial" filename when the 200-row window is full). Overlapping loads
// are sequence-guarded so a slow older response can't overwrite a newer filter.
// Each row opens the detail drawer (join link + status changer + timeline).
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { type CrmMeeting, fetchCrmMeetings, isMeetingStatus, MEETING_STATUSES, type MeetingStatus } from "@/lib/crm-admin";
import { buildCsv, csvFileName, downloadCsv } from "@/lib/csv";
import CrmMeetingDrawer from "./CrmMeetingDrawer";
import { BTN_GHOST, MEETING_STATUS_META, MeetingStatusPill, mirrorUrlParams, NoticeCard, when } from "./ui";

type Filter = MeetingStatus | "all";

// The booking's human time: prefer the exact timestamp, else the date + slot.
function meetingWhen(m: CrmMeeting): string {
  if (m.startsAt) return when(m.startsAt);
  return [m.meetingDate, m.slot].filter(Boolean).join(" ");
}

function MeetingsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}

export default function CrmMeetings() {
  // Filter + search initialize from the URL (mirrored below on every change).
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => {
    const v = params.get("meeting_status");
    return isMeetingStatus(v) ? v : "all";
  });
  const [searchInput, setSearchInput] = useState(() => params.get("meeting_q") ?? "");
  const [meetings, setMeetings] = useState<CrmMeeting[] | null>(null);
  // The server's authoritative "there are more rows past this window" flag —
  // drives the honest "-partial" CSV suffix (NOT `meetings.length >= 200`).
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Orders overlapping loads (rapid filter switches) so a slower, older
  // response can never overwrite a newer filter's rows.
  const loadSeq = useRef(0);

  // Fetch the current filter's meetings. Loading/error resets are event-driven:
  // the useState initializers cover the mount load, and every later load starts
  // from an event (`changeFilter`, `reload`) that resets first — so the load
  // effect never sets state synchronously (react-hooks/set-state-in-effect):
  // state only lands in the .then continuation.
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    return fetchCrmMeetings({ status: filter === "all" ? undefined : filter }).then((res) => {
      if (seq !== loadSeq.current) return; // stale — a newer load owns the view
      if (res) {
        setMeetings(res.meetings);
        setHasMore(res.hasMore);
      } else setError(true);
      setLoading(false);
    });
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch the current filter from an event (retry / drawer onChanged).
  const reload = useCallback(() => {
    setLoading(true);
    setError(false);
    void load();
  }, [load]);

  // Switch filters: reset the view in the click, then the effect refetches.
  const changeFilter = useCallback(
    (next: Filter) => {
      if (next === filter) return; // same chip — no reload, same as before
      setLoading(true);
      setError(false);
      setFilter(next);
      mirrorUrlParams({ meeting_status: next === "all" ? null : next });
    },
    [filter],
  );

  // Client-side search over the loaded window — instant, no round-trip. The
  // (trimmed) query is mirrored to the URL as it's typed.
  const changeSearch = useCallback((v: string) => {
    setSearchInput(v);
    mirrorUrlParams({ meeting_q: v.trim() || null });
  }, []);

  const shown = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return meetings ?? [];
    return (meetings ?? []).filter(
      (m) => (m.name || "").toLowerCase().includes(q) || (m.phone || "").includes(q),
    );
  }, [meetings, searchInput]);

  // Export the CURRENT view as CSV (same in-browser builder as the leads export
  // — no new endpoint, formula-injection-guarded). id column + honest
  // "-partial" filename driven by the server's `hasMore` (real rows past the
  // window), so an exactly-200-row window with nothing beyond it is NOT partial.
  const exportCsv = useCallback(() => {
    if (shown.length === 0) return;
    const headers = ["id", "שם", "טלפון", "מועד", "ספק", "סטטוס", "נציג", "מקור"];
    const rows = shown.map((m) => [
      m.id,
      m.name,
      m.phone,
      meetingWhen(m),
      m.provider ?? "",
      MEETING_STATUS_META[m.status]?.label ?? m.status,
      m.claimedBy ?? "",
      m.source ?? "",
    ]);
    downloadCsv(csvFileName(`meetings-${filter}`, hasMore), buildCsv(headers, rows));
  }, [shown, filter, hasMore]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "הכול" },
    ...MEETING_STATUSES.map((s) => ({ key: s as Filter, label: MEETING_STATUS_META[s].label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי סטטוס פגישה">
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
          type="search"
          value={searchInput}
          onChange={(e) => changeSearch(e.target.value)}
          placeholder="חיפוש שם / טלפון"
          aria-label="חיפוש פגישות"
          className="w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={exportCsv}
          disabled={shown.length === 0}
          className={`${BTN_GHOST} ms-auto text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          title="ייצוא התצוגה הנוכחית כקובץ CSV"
        >
          ייצוא CSV
        </button>
      </div>

      {loading ? (
        <MeetingsSkeleton />
      ) : error || !meetings ? (
        <NoticeCard
          action={
            <button type="button" onClick={reload} className={BTN_GHOST}>
              נסו שוב
            </button>
          }
        >
          לא הצלחנו לטעון את הפגישות.
        </NoticeCard>
      ) : meetings.length === 0 ? (
        <NoticeCard>אין פגישות בסטטוס הזה.</NoticeCard>
      ) : shown.length === 0 ? (
        <NoticeCard>לא נמצאו פגישות תואמות לחיפוש.</NoticeCard>
      ) : (
        <>
          <p className="text-xs text-muted">
            {shown.length.toLocaleString("he-IL")} פגישות{meetings.length >= 200 ? " (מוצגות 200 האחרונות)" : ""}
          </p>

          {/* Desktop: a semantic table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft md:block">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">שם</th>
                  <th scope="col" className="px-4 py-2 font-medium">טלפון</th>
                  <th scope="col" className="px-4 py-2 font-medium">מועד</th>
                  <th scope="col" className="px-4 py-2 font-medium">ספק</th>
                  <th scope="col" className="px-4 py-2 font-medium">סטטוס</th>
                  <th scope="col" className="px-4 py-2 font-medium">נציג</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  // A plain <tr> keeps row/cell semantics (the scope="col" headers
                  // stay associated); the row onClick is a pointer-only convenience.
                  // Keyboard/AT access lives on the real name-cell <button> below
                  // (same pattern as CrmLeads).
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="interactive cursor-pointer border-b border-border/60 last:border-0 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
                  >
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.id)}
                        aria-label={`פרטי הפגישה של ${m.name || m.phone}`}
                        className="font-medium text-ink underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
                      >
                        {m.name || "—"}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-muted" dir="ltr">{m.phone || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-foreground">{meetingWhen(m) || "—"}</td>
                    <td className="px-4 py-2 text-muted">{m.provider || "—"}</td>
                    <td className="px-4 py-2"><MeetingStatusPill status={m.status} /></td>
                    <td className="px-4 py-2 text-muted">{m.claimedBy || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <ul className="space-y-2 md:hidden">
            {shown.map((m) => (
              // Plain <li>: the card onClick is a pointer-only convenience;
              // keyboard/AT access lives on the real name <button> (same
              // pattern as CrmLeads — no role="button" on the container).
              <li
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className="interactive cursor-pointer rounded-2xl border border-border bg-surface p-3 shadow-soft [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-label={`פרטי הפגישה של ${m.name || m.phone}`}
                      className="block max-w-full truncate text-start text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {m.name || "—"}
                    </button>
                    <p className="truncate text-xs text-muted" dir="ltr">{m.phone || "—"}</p>
                  </div>
                  <MeetingStatusPill status={m.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {meetingWhen(m) && <span>{meetingWhen(m)}</span>}
                  {m.provider && <span>ספק: {m.provider}</span>}
                  {m.claimedBy && <span>נציג: {m.claimedBy}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {selectedId && (
        <CrmMeetingDrawer
          meetingId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
