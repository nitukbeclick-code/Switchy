"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmLeadDrawer> — a slide-in panel with one lead's full CRM detail + activity
// timeline, and the pipeline-stage changer. Reads crm-api `getLeadDetail` and
// writes via `setLeadStatus` (both access-gated, service_role, audited). Every
// field is a real crm-api value; nothing is fabricated. Closes on overlay click
// or Escape. As an aria-modal dialog it owns focus while open: focus moves to the
// close button on open, Tab is trapped inside, and focus returns to the opener.
// When the parent list passes prev/next ids, the header pages between leads —
// the parent remounts the drawer per lead (key={selectedId}), so `leadId` stays
// fixed for each instance's lifetime.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  addCrmNote,
  claimCrmLead,
  type CrmFailure,
  type CrmLeadDetail,
  type CrmLeadEvent,
  fetchCrmLeadDetail,
  fetchCrmSla,
  isLeadPriority,
  LEAD_STATUSES,
  type LeadPriority,
  type LeadStatus,
  recordCrmSaving,
  setCrmLeadNote,
  setCrmLeadStatus,
  setCrmLeadWorkflow,
} from "@/lib/crm-admin";
import CrmCallBrief from "./CrmCallBrief";
import { BTN_GHOST, BTN_PRIMARY, eventTint, FollowUpChip, LEAD_PRIORITY_META, LEAD_STATUS_META, LeadAgeChip, PriorityPill, relTime, StatusPill, when } from "./ui";

const he = (n: number) => n.toLocaleString("he-IL");

const EVENT_LABEL: Record<string, string> = {
  status_change: "שינוי סטטוס",
  claim: "שיוך לנציג",
  note: "הערה",
  note_edit: "עריכת הערה",
  undo: "ביטול פעולה",
  saving: "חיסכון נרשם",
  workflow_update: "תכנית טיפול עודכנה",
};

const LOST_REASON_SUGGESTIONS = [
  "המחיר לא התאים",
  "לא מעוניין כרגע",
  "לא הצלחנו ליצור קשר",
  "בחר בספק אחר",
  "התזמון לא מתאים",
];

function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default function CrmLeadDrawer({
  leadId,
  onClose,
  onChanged,
  prevId,
  nextId,
  onNavigate,
}: {
  leadId: string;
  onClose: () => void;
  onChanged?: () => void;
  /** The previous/next lead in the parent list's current view (null at an edge). */
  prevId?: string | null;
  nextId?: string | null;
  /** Page to another lead — the parent swaps selectedId and remounts the drawer. */
  onNavigate?: (id: string) => void;
}) {
  const [data, setData] = useState<{ lead: CrmLeadDetail; events: CrmLeadEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // The typed reason of the last failed load (server message + retryability).
  const [failure, setFailure] = useState<CrmFailure | null>(null);
  const [savingStatus, setSavingStatus] = useState<LeadStatus | null>(null);
  // Action feedback: `ok:false` renders in the danger token so a failed write
  // can never be skimmed past as a success message.
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const { profile } = useAuth();
  const [note, setNote] = useState("");
  const [mainNote, setMainNote] = useState("");
  const [savingInput, setSavingInput] = useState("");
  const [priority, setPriority] = useState<LeadPriority>("normal");
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [showBrief, setShowBrief] = useState(false);
  // Clock for the timeline's relative ages — sampled when a load lands (in the
  // .then continuation), never during render (react-hooks/purity).
  const [nowMs, setNowMs] = useState(0);
  // The server's SLA window (hours), for the age chip — same best-effort fetch
  // as CrmLeads' list view, so a "new" lead shows the identical breach cue here
  // that it showed in the row the rep just clicked.
  const [slaHours, setSlaHours] = useState<number | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // The last server value of the lead's main note (undefined = nothing loaded
  // yet). Lets `load` re-seed the editable field only when the SERVER value
  // changed, so an unrelated refresh never clobbers an unsaved draft.
  const lastNotesRef = useRef<string | null | undefined>(undefined);

  // Fetch the lead detail. Loading/error resets are event-driven: the useState
  // initializers cover the mount load (leadId is fixed for this instance — the
  // list mounts a fresh drawer per lead) and every later load starts from an
  // event (retry / changeStatus / runAction) via `reload` — so the mount effect
  // never sets state synchronously (react-hooks/set-state-in-effect): state
  // only lands in the .then continuation.
  const load = useCallback(
    () =>
      fetchCrmLeadDetail(leadId).then((d) => {
        if (d.data) {
          setData(d.data);
          setNowMs(Date.now()); // fresh clock for the fresh timeline
          // Keep the editable main-note field in sync with the loaded/saved value.
          if (d.data.lead.notes !== lastNotesRef.current) {
            lastNotesRef.current = d.data.lead.notes;
            setMainNote(d.data.lead.notes ?? "");
          }
          setPriority(isLeadPriority(d.data.lead.priority) ? d.data.lead.priority : "normal");
          setFollowUpAt(toLocalDateTime(d.data.lead.followUpAt));
          setFollowUpNote(d.data.lead.followUpNote ?? "");
          setLostReason(d.data.lead.lostReason ?? "");
        } else {
          setFailure(d.failure);
          setError(true);
        }
        setLoading(false);
      }),
    [leadId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchCrmSla().then((r) => {
      if (r.data) setSlaHours(r.data.sla.slaHours);
    });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    setFailure(null);
    await load();
  }, [load]);

  // aria-modal focus contract (shared useFocusTrap hook): focus the close button
  // on open, clamp Tab to the dialog, Escape closes, restore focus to the opener.
  useFocusTrap(rootRef, { onEscape: onClose, initialFocusRef: closeBtnRef });

  const changeStatus = useCallback(
    async (status: LeadStatus) => {
      if (!data || status === data.lead.status || savingStatus) return;
      if (status === "lost" && !lostReason.trim()) {
        setNotice({ text: "כדי לסגור כליד אבוד, יש לתעד קודם סיבת סגירה.", ok: false });
        return;
      }
      setSavingStatus(status);
      setNotice(null);
      const ok = await setCrmLeadStatus(
        leadId,
        status,
        status === "lost" ? lostReason.trim() : undefined,
      );
      setSavingStatus(null);
      if (ok) {
        setNotice({ text: "הסטטוס עודכן.", ok: true });
        await reload();
        onChanged?.();
      } else {
        setNotice({ text: "עדכון הסטטוס נכשל. נסו שוב.", ok: false });
      }
    },
    [data, savingStatus, leadId, lostReason, reload, onChanged],
  );

  // Run a write action, then refresh the detail + notify the parent list. Returns
  // whether it succeeded so callers can clear their input only on success.
  const runAction = useCallback(
    async (fn: () => Promise<boolean>, okMsg: string): Promise<boolean> => {
      if (actionBusy) return false;
      setActionBusy(true);
      setNotice(null);
      const ok = await fn();
      setActionBusy(false);
      if (ok) {
        setNotice({ text: okMsg, ok: true });
        await reload();
        onChanged?.();
      } else {
        setNotice({ text: "הפעולה נכשלה. נסו שוב.", ok: false });
      }
      return ok;
    },
    [actionBusy, reload, onChanged],
  );

  const repName = (profile?.name ?? "").trim() || "מנהל";

  const onAddNote = useCallback(async () => {
    const t = note.trim();
    if (!t) return;
    const ok = await runAction(() => addCrmNote(leadId, t), "ההערה נוספה.");
    if (ok) setNote("");
  }, [note, leadId, runAction]);

  const onRecordSaving = useCallback(async () => {
    const n = Number(savingInput);
    if (!Number.isFinite(n) || n <= 0) {
      setNotice({ text: "הזינו סכום חיסכון שנתי תקין.", ok: false });
      return;
    }
    const ok = await runAction(() => recordCrmSaving(leadId, n), "החיסכון נרשם והליד נסגר בהצלחה.");
    if (ok) setSavingInput("");
  }, [savingInput, leadId, runAction]);

  const onClaim = useCallback(() => {
    void runAction(() => claimCrmLead(leadId, repName), `הליד שויך ל${repName}.`);
  }, [leadId, repName, runAction]);

  const onSaveWorkflow = useCallback(async () => {
    let followUpIso: string | null = null;
    if (followUpAt) {
      const parsed = new Date(followUpAt);
      if (Number.isNaN(parsed.getTime())) {
        setNotice({ text: "מועד המעקב אינו תקין.", ok: false });
        return;
      }
      followUpIso = parsed.toISOString();
    }
    await runAction(
      () =>
        setCrmLeadWorkflow(leadId, {
          priority,
          followUpAt: followUpIso,
          followUpNote,
          lostReason,
        }),
      "תכנית הטיפול נשמרה.",
    );
  }, [followUpAt, followUpNote, leadId, lostReason, priority, runAction]);

  const lead = data?.lead;

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="פרטי ליד">
      <button type="button" aria-label="סגירת הפרטים" onClick={onClose} className="crm-overlay-btn flex-1 bg-ink/40 backdrop-blur-[1px]" />
      <div className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto border-s border-border bg-background shadow-float">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate font-display text-lg font-bold text-ink">{lead?.name || "פרטי ליד"}</h2>
              {lead?.status === "new" && <LeadAgeChip createdAt={lead.createdAt} nowMs={nowMs} slaHours={slaHours} />}
            </div>
            {lead?.phone && (
              <p className="truncate text-xs text-muted" dir="ltr">
                {lead.phone}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {onNavigate && (prevId != null || nextId != null) && (
              // prev/next paging over the parent's current view. RTL: the
              // previous lead sits visually to the right, next to the left.
              <>
                <button
                  type="button"
                  disabled={!prevId}
                  onClick={() => prevId && onNavigate(prevId)}
                  aria-label="הליד הקודם"
                  className={`${BTN_GHOST} min-h-9 px-2.5`}
                >
                  ‹
                </button>
                <button
                  type="button"
                  disabled={!nextId}
                  onClick={() => nextId && onNavigate(nextId)}
                  aria-label="הליד הבא"
                  className={`${BTN_GHOST} min-h-9 px-2.5`}
                >
                  ›
                </button>
              </>
            )}
            <button ref={closeBtnRef} type="button" onClick={onClose} className={`${BTN_GHOST} min-h-9 px-3`}>
              סגור
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 p-4">
          {loading ? (
            <p className="text-sm text-muted">טוען…</p>
          ) : error || !lead ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/5 p-4 text-center shadow-soft">
              <p className="text-sm font-medium text-danger-text">{failure?.message || "לא הצלחנו לטעון את הליד."}</p>
              {(failure ? failure.retryable : true) && (
                <button type="button" onClick={() => void reload()} className={`${BTN_GHOST} mt-3`}>
                  נסו שוב
                </button>
              )}
            </div>
          ) : (
            <>
              <section>
                <p className="mb-2 text-xs font-medium text-muted">שלב בצנרת</p>
                <div className="flex flex-wrap gap-2">
                  {LEAD_STATUSES.map((st) => {
                    const active = lead.status === st;
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
                        {busy ? "…" : LEAD_STATUS_META[st].label}
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

              <section className="space-y-3 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-display text-sm font-bold text-ink">תכנית טיפול</p>
                    <p className="mt-0.5 text-xs text-muted">מגדירים מי דורש תשומת לב ומה הפעולה הבאה.</p>
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    <PriorityPill priority={priority} />
                    <FollowUpChip followUpAt={lead.followUpAt} nowMs={nowMs} />
                  </span>
                </div>

                <label className="block text-xs text-muted">
                  עדיפות
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as LeadPriority)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  >
                    {(Object.keys(LEAD_PRIORITY_META) as LeadPriority[]).map((value) => (
                      <option key={value} value={value}>{LEAD_PRIORITY_META[value].label}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs text-muted">
                  מועד פעולה הבאה
                  <input
                    type="datetime-local"
                    value={followUpAt}
                    onChange={(event) => setFollowUpAt(event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </label>

                <label className="block text-xs text-muted">
                  מה עושים במעקב
                  <textarea
                    value={followUpNote}
                    onChange={(event) => setFollowUpNote(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="לדוגמה: לחזור עם הצעת סיבים אחרי 17:00"
                    className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </label>

                <label className="block text-xs text-muted">
                  סיבת סגירה כאבוד
                  <input
                    list="crm-lost-reasons"
                    value={lostReason}
                    onChange={(event) => setLostReason(event.target.value)}
                    maxLength={240}
                    placeholder="נדרש לפני מעבר ל׳אבוד׳"
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <datalist id="crm-lost-reasons">
                    {LOST_REASON_SUGGESTIONS.map((reason) => <option key={reason} value={reason} />)}
                  </datalist>
                </label>

                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void onSaveWorkflow()}
                  className={`${BTN_PRIMARY} w-full`}
                >
                  שמירת תכנית טיפול
                </button>
              </section>

              <section className="rounded-2xl border border-border bg-surface p-3">
                <button
                  type="button"
                  onClick={() => setShowBrief((v) => !v)}
                  aria-expanded={showBrief}
                  className={`${BTN_GHOST} w-full`}
                >
                  {showBrief ? "הסתר תדריך שיחה" : "הכן שיחה (תדריך לנציג)"}
                </button>
                {showBrief && (
                  <div className="mt-3 border-t border-border pt-3">
                    <CrmCallBrief leadId={leadId} />
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-2xl border border-border bg-surface p-3">
                <p className="text-xs font-medium text-muted">פעולות</p>

                {!lead.claimedBy && (
                  <button type="button" disabled={actionBusy} onClick={onClaim} className={`${BTN_GHOST} w-full`}>
                    שייך אליי ({repName})
                  </button>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="crm-note" className="text-xs text-muted">
                    הוספת הערה לתיעוד
                  </label>
                  <textarea
                    id="crm-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="הערה…"
                    className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <button type="button" disabled={actionBusy || !note.trim()} onClick={() => void onAddNote()} className={`${BTN_GHOST} w-full`}>
                    הוסף הערה
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="crm-saving" className="text-xs text-muted">
                    רישום חיסכון שנתי (סוגר את הליד כ״נסגר בהצלחה״)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="crm-saving"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={savingInput}
                      onChange={(e) => setSavingInput(e.target.value)}
                      placeholder="₪ לשנה"
                      className="w-32 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                    />
                    <button type="button" disabled={actionBusy || !savingInput.trim()} onClick={() => void onRecordSaving()} className={BTN_PRIMARY}>
                      רשום וסגור
                    </button>
                  </div>
                </div>
              </section>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="טלפון">
                  <a href={`tel:${lead.phone}`} dir="ltr" className="text-accent-text underline">
                    {lead.phone}
                  </a>
                </Field>
                {lead.email && (
                  <Field label="אימייל">
                    <a href={`mailto:${lead.email}`} dir="ltr" className="break-all text-accent-text underline">
                      {lead.email}
                    </a>
                  </Field>
                )}
                {lead.provider && <Field label="ספק נוכחי">{lead.provider}</Field>}
                {lead.source && <Field label="מקור הליד">{lead.source}</Field>}
                {lead.city && <Field label="עיר">{lead.city}</Field>}
                {lead.callbackTime && <Field label="זמן חזרה מועדף">{lead.callbackTime}</Field>}
                {lead.createdAt && <Field label="נוצר">{when(lead.createdAt)}</Field>}
                {lead.claimedBy && (
                  <Field label="משויך ל">
                    {lead.claimedBy}
                    {lead.claimedAt ? ` · ${when(lead.claimedAt)}` : ""}
                  </Field>
                )}
                {lead.contactedAt && <Field label="נוצר קשר">{when(lead.contactedAt)}</Field>}
                {lead.actualSaving != null && <Field label="חיסכון שנרשם">₪{he(lead.actualSaving)} לשנה</Field>}
                {lead.followUpAt && <Field label="מעקב הבא">{when(lead.followUpAt)}</Field>}
                {lead.followUpNote && <Field label="הערת מעקב">{lead.followUpNote}</Field>}
                {lead.lostReason && <Field label="סיבת סגירה">{lead.lostReason}</Field>}
                {lead.referrerCode && <Field label="קוד הפניה">{lead.referrerCode}</Field>}
              </dl>

              <section className="space-y-1.5 rounded-2xl border border-border bg-surface p-3">
                <label htmlFor="crm-main-note" className="text-xs font-medium text-muted">
                  הערה ראשית
                </label>
                <textarea
                  id="crm-main-note"
                  value={mainNote}
                  onChange={(e) => setMainNote(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="הערה ראשית על הליד…"
                  className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  disabled={actionBusy || mainNote === (lead.notes ?? "")}
                  onClick={() => void runAction(() => setCrmLeadNote(leadId, mainNote), "ההערה נשמרה.")}
                  className={`${BTN_GHOST} w-full`}
                >
                  שמור הערה ראשית
                </button>
              </section>

              <section>
                <p className="mb-2 text-xs font-medium text-muted">הסכמות שיווק (§30A)</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(
                    [
                      ["SMS", lead.consent.sms],
                      ["אימייל", lead.consent.email],
                      ["וואטסאפ", lead.consent.whatsapp],
                    ] as const
                  ).map(([k, on]) => (
                    <span
                      key={k}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${
                        on ? "border-value/40 bg-value/10 text-value-text" : "border-border text-muted"
                      }`}
                    >
                      {on ? "✓" : "✗"} {k}
                    </span>
                  ))}
                </div>
              </section>

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
                            {e.oldStatus && <StatusPill status={e.oldStatus} />}
                            {e.oldStatus && e.newStatus && <span aria-hidden="true">←</span>}
                            {e.newStatus && <StatusPill status={e.newStatus} />}
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
