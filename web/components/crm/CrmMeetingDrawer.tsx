"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmMeetingDrawer> — a slide-in panel with one Zoom booking's full detail +
// status timeline, plus the lifecycle-status changer and a join link. Reads
// crm-api `getMeeting` and writes via `setMeetingStatus` (both admin-gated,
// service_role, audited). Every field is a real crm-api value; nothing invented.
// Closes on overlay click or Escape. Mirrors <CrmLeadDrawer>, including its
// aria-modal focus contract: focus moves to the close button on open, Tab is
// trapped inside the dialog, and focus returns to the opener on close.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  type CrmMeetingDetail,
  type CrmMeetingEvent,
  fetchCrmMeetingDetail,
  type MeetingStatus,
  setCrmMeetingStatus,
} from "@/lib/crm-admin";
import { BTN_GHOST, BTN_PRIMARY, eventTint, MEETING_STATUS_META, MeetingStatusPill, relTime, when } from "./ui";

// The lifecycle transitions a rep actually performs by hand. `pending`/`expired`
// are system states, so they're not offered as buttons (the server still accepts
// any valid value — this is just the curated UI set).
const MANUAL_STATUSES: MeetingStatus[] = ["confirmed", "completed", "no_rep", "cancelled"];

const EVENT_LABEL: Record<string, string> = {
  status_change: "שינוי סטטוס",
  created: "נקבעה פגישה",
  claim: "שיוך לנציג",
  note: "הערה",
  reminder: "תזכורת",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function statusLabel(st: string | null): string {
  if (!st) return "";
  return MEETING_STATUS_META[st]?.label ?? st;
}

export default function CrmMeetingDrawer({
  meetingId,
  onClose,
  onChanged,
}: {
  meetingId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<{ meeting: CrmMeetingDetail; events: CrmMeetingEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingStatus, setSavingStatus] = useState<MeetingStatus | null>(null);
  // Action feedback: `ok:false` renders in the danger token so a failed write
  // can never be skimmed past as a success message.
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  // Clock for the timeline's relative ages — sampled when a load lands (in the
  // .then continuation), never during render (react-hooks/purity).
  const [nowMs, setNowMs] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Fetch the meeting detail. Loading/error resets are event-driven: the
  // useState initializers cover the mount load (meetingId is fixed for this
  // instance — the list mounts a fresh drawer per meeting) and every later load
  // starts from an event (retry / changeStatus) via `reload` — so the mount
  // effect never sets state synchronously (react-hooks/set-state-in-effect):
  // state only lands in the .then continuation.
  const load = useCallback(
    () =>
      fetchCrmMeetingDetail(meetingId).then((d) => {
        if (d) {
          setData(d);
          setNowMs(Date.now()); // fresh clock for the fresh timeline
        } else setError(true);
        setLoading(false);
      }),
    [meetingId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    await load();
  }, [load]);

  // aria-modal focus contract (shared useFocusTrap hook, same as CrmLeadDrawer):
  // focus the close button on open, clamp Tab, Escape closes, restore to opener.
  useFocusTrap(rootRef, { onEscape: onClose, initialFocusRef: closeBtnRef });

  const changeStatus = useCallback(
    async (status: MeetingStatus) => {
      if (!data || status === data.meeting.status || savingStatus) return;
      setSavingStatus(status);
      setNotice(null);
      const ok = await setCrmMeetingStatus(meetingId, status);
      setSavingStatus(null);
      if (ok) {
        setNotice({ text: "הסטטוס עודכן.", ok: true });
        await reload();
        onChanged?.();
      } else {
        setNotice({ text: "עדכון הסטטוס נכשל. נסו שוב.", ok: false });
      }
    },
    [data, savingStatus, meetingId, reload, onChanged],
  );

  const meeting = data?.meeting;
  const meetingTime = meeting?.startsAt ? when(meeting.startsAt) : [meeting?.meetingDate, meeting?.slot].filter(Boolean).join(" ");

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="פרטי פגישה">
      <button type="button" aria-label="סגירת הפרטים" onClick={onClose} className="crm-overlay-btn flex-1 bg-ink/40 backdrop-blur-[1px]" />
      <div className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto border-s border-border bg-background shadow-float">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-ink">{meeting?.name || "פרטי פגישה"}</h2>
            {meeting?.phone && (
              <p className="truncate text-xs text-muted" dir="ltr">
                {meeting.phone}
              </p>
            )}
          </div>
          <button ref={closeBtnRef} type="button" onClick={onClose} className={`${BTN_GHOST} min-h-9 px-3`}>
            סגור
          </button>
        </header>

        <div className="flex-1 space-y-5 p-4">
          {loading ? (
            <p className="text-sm text-muted">טוען…</p>
          ) : error || !meeting ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-center shadow-soft">
              <p className="text-sm font-medium text-danger-text">לא הצלחנו לטעון את הפגישה.</p>
              <button type="button" onClick={() => void reload()} className={`${BTN_GHOST} mt-3`}>
                נסו שוב
              </button>
            </div>
          ) : (
            <>
              {meeting.joinUrl && (
                <a
                  href={meeting.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${BTN_PRIMARY} w-full`}
                >
                  הצטרף לפגישת Zoom
                </a>
              )}

              <section>
                <p className="mb-2 text-xs font-medium text-muted">סטטוס הפגישה</p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_STATUSES.map((st) => {
                    const active = meeting.status === st;
                    const busy = savingStatus === st;
                    return (
                      <button
                        key={st}
                        type="button"
                        disabled={busy || active || !!savingStatus}
                        aria-pressed={active}
                        onClick={() => void changeStatus(st)}
                        className={`interactive rounded-full border px-3 py-1.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default ${
                          active
                            ? "border-accent bg-accent/10 text-accent-text"
                            : "border-border text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5 disabled:opacity-60"
                        }`}
                      >
                        {busy ? "…" : MEETING_STATUS_META[st].label}
                      </button>
                    );
                  })}
                </div>
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-2 min-h-4 text-xs ${notice && !notice.ok ? "text-danger-text" : "text-accent-text"}`}
                >
                  {notice?.text ?? ""}
                </p>
              </section>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {meetingTime && <Field label="מועד">{meetingTime}</Field>}
                <Field label="סטטוס נוכחי">{statusLabel(meeting.status)}</Field>
                <Field label="טלפון">
                  <a href={`tel:${meeting.phone}`} dir="ltr" className="text-accent-text underline">
                    {meeting.phone}
                  </a>
                </Field>
                {meeting.email && (
                  <Field label="אימייל">
                    <a href={`mailto:${meeting.email}`} dir="ltr" className="break-all text-accent-text underline">
                      {meeting.email}
                    </a>
                  </Field>
                )}
                {meeting.provider && <Field label="ספק נוכחי">{meeting.provider}</Field>}
                {meeting.source && <Field label="מקור">{meeting.source}</Field>}
                {meeting.claimedBy && (
                  <Field label="נציג">
                    {meeting.claimedBy}
                    {meeting.claimedAt ? ` · ${when(meeting.claimedAt)}` : ""}
                  </Field>
                )}
                {meeting.confirmedAt && <Field label="אושרה">{when(meeting.confirmedAt)}</Field>}
                {meeting.createdAt && <Field label="נקבעה">{when(meeting.createdAt)}</Field>}
              </dl>

              {meeting.notes && (
                <section>
                  <p className="mb-1 text-xs font-medium text-muted">הערות</p>
                  <p className="whitespace-pre-wrap rounded-xl border border-border bg-surface p-3 text-sm text-foreground">
                    {meeting.notes}
                  </p>
                </section>
              )}

              <section>
                <p className="mb-2 text-xs font-medium text-muted">היסטוריית פעילות</p>
                {data && data.events.length === 0 ? (
                  <p className="text-xs text-muted">אין עדיין פעילות רשומה.</p>
                ) : (
                  <ul className="space-y-2">
                    {data?.events.map((e) => (
                      <li key={e.id} className={`rounded-xl border p-2.5 text-xs ${eventTint(e.event)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">{EVENT_LABEL[e.event] ?? e.event}</span>
                          <span className="text-muted" title={when(e.createdAt)}>
                            {relTime(e.createdAt, nowMs) || when(e.createdAt)}
                          </span>
                        </div>
                        {(e.oldStatus || e.newStatus) && (
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-muted">
                            {e.oldStatus && <MeetingStatusPill status={e.oldStatus} />}
                            {e.oldStatus && e.newStatus && <span aria-hidden="true">←</span>}
                            {e.newStatus && <MeetingStatusPill status={e.newStatus} />}
                          </p>
                        )}
                        {e.note && <p className="mt-0.5 whitespace-pre-wrap text-foreground">{e.note}</p>}
                        {e.actorName && <p className="mt-0.5 text-muted">— {e.actorName}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
