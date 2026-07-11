"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmMeetings> — the Zoom-booking pipeline as a filterable list. Reads crm-api
// `listMeetings` (service_role, admin-gated), which returns a deliberately light,
// PII-safe shape (name, phone, provider, date/slot, status — no email/join_url/
// notes; those load one-at-a-time in the drawer). Filter by lifecycle status;
// each row opens the detail drawer (join link + status changer + timeline).
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { type CrmMeeting, fetchCrmMeetings, MEETING_STATUSES, type MeetingStatus } from "@/lib/crm-admin";
import CrmMeetingDrawer from "./CrmMeetingDrawer";
import { BTN_GHOST, MEETING_STATUS_META, MeetingStatusPill, NoticeCard, when } from "./ui";

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
  const [filter, setFilter] = useState<Filter>("all");
  const [meetings, setMeetings] = useState<CrmMeeting[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const res = await fetchCrmMeetings({ status: filter === "all" ? undefined : filter });
    if (res) setMeetings(res.meetings);
    else setError(true);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

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

      {loading ? (
        <MeetingsSkeleton />
      ) : error || !meetings ? (
        <NoticeCard
          action={
            <button type="button" onClick={() => void load()} className={BTN_GHOST}>
              נסו שוב
            </button>
          }
        >
          לא הצלחנו לטעון את הפגישות.
        </NoticeCard>
      ) : meetings.length === 0 ? (
        <NoticeCard>אין פגישות בסטטוס הזה.</NoticeCard>
      ) : (
        <>
          <p className="text-xs text-muted">
            {meetings.length.toLocaleString("he-IL")} פגישות{meetings.length >= 200 ? " (מוצגות 200 האחרונות)" : ""}
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
                {meetings.map((m) => (
                  // A plain <tr> keeps row/cell semantics (the scope="col" headers
                  // stay associated); the row onClick is a pointer-only convenience.
                  // Keyboard/AT access lives on the real name-cell <button> below
                  // (same pattern as CrmLeads).
                  <tr
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className="cursor-pointer border-b border-border/60 last:border-0 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
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
            {meetings.map((m) => (
              // Plain <li>: the card onClick is a pointer-only convenience;
              // keyboard/AT access lives on the real name <button> (same
              // pattern as CrmLeads — no role="button" on the container).
              <li
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className="cursor-pointer rounded-2xl border border-border bg-surface p-3 shadow-soft [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
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
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
