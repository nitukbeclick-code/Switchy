"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmLeadDrawer> — a slide-in panel with one lead's full CRM detail + activity
// timeline, and the pipeline-stage changer. Reads crm-api `getLeadDetail` and
// writes via `setLeadStatus` (both admin-gated, service_role, audited). Every
// field is a real crm-api value; nothing is fabricated. Closes on overlay click
// or Escape. As an aria-modal dialog it owns focus while open: focus moves to the
// close button on open, Tab is trapped inside, and focus returns to the opener.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  addCrmNote,
  claimCrmLead,
  type CrmLeadDetail,
  type CrmLeadEvent,
  fetchCrmLeadDetail,
  LEAD_STATUSES,
  type LeadStatus,
  recordCrmSaving,
  setCrmLeadNote,
  setCrmLeadStatus,
} from "@/lib/crm-admin";
import CrmCallBrief from "./CrmCallBrief";
import { BTN_GHOST, BTN_PRIMARY, LEAD_STATUS_META, when } from "./ui";

const he = (n: number) => n.toLocaleString("he-IL");

const EVENT_LABEL: Record<string, string> = {
  status_change: "שינוי סטטוס",
  claim: "שיוך לנציג",
  note: "הערה",
  note_edit: "עריכת הערה",
  undo: "ביטול פעולה",
  saving: "חיסכון נרשם",
};

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
}: {
  leadId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<{ lead: CrmLeadDetail; events: CrmLeadEvent[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingStatus, setSavingStatus] = useState<LeadStatus | null>(null);
  const [notice, setNotice] = useState("");
  const { profile } = useAuth();
  const [note, setNote] = useState("");
  const [mainNote, setMainNote] = useState("");
  const [savingInput, setSavingInput] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const d = await fetchCrmLeadDetail(leadId);
    if (d) setData(d);
    else setError(true);
    setLoading(false);
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the editable main-note field in sync with the loaded/saved value.
  useEffect(() => {
    setMainNote(data?.lead.notes ?? "");
  }, [data?.lead.notes]);

  // aria-modal focus contract (shared useFocusTrap hook): focus the close button
  // on open, clamp Tab to the dialog, Escape closes, restore focus to the opener.
  useFocusTrap(rootRef, { onEscape: onClose, initialFocusRef: closeBtnRef });

  const changeStatus = useCallback(
    async (status: LeadStatus) => {
      if (!data || status === data.lead.status || savingStatus) return;
      setSavingStatus(status);
      setNotice("");
      const ok = await setCrmLeadStatus(leadId, status);
      setSavingStatus(null);
      if (ok) {
        setNotice("הסטטוס עודכן.");
        await load();
        onChanged?.();
      } else {
        setNotice("עדכון הסטטוס נכשל. נסו שוב.");
      }
    },
    [data, savingStatus, leadId, load, onChanged],
  );

  // Run a write action, then refresh the detail + notify the parent list. Returns
  // whether it succeeded so callers can clear their input only on success.
  const runAction = useCallback(
    async (fn: () => Promise<boolean>, okMsg: string): Promise<boolean> => {
      if (actionBusy) return false;
      setActionBusy(true);
      setNotice("");
      const ok = await fn();
      setActionBusy(false);
      if (ok) {
        setNotice(okMsg);
        await load();
        onChanged?.();
      } else {
        setNotice("הפעולה נכשלה. נסו שוב.");
      }
      return ok;
    },
    [actionBusy, load, onChanged],
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
      setNotice("הזינו סכום חיסכון שנתי תקין.");
      return;
    }
    const ok = await runAction(() => recordCrmSaving(leadId, n), "החיסכון נרשם והליד נסגר בהצלחה.");
    if (ok) setSavingInput("");
  }, [savingInput, leadId, runAction]);

  const onClaim = useCallback(() => {
    void runAction(() => claimCrmLead(leadId, repName), `הליד שויך ל${repName}.`);
  }, [leadId, repName, runAction]);

  const lead = data?.lead;

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="פרטי ליד">
      <button type="button" aria-label="סגירת הפרטים" onClick={onClose} className="flex-1 bg-ink/40 backdrop-blur-[1px]" />
      <div className="ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto border-s border-border bg-background shadow-float">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-ink">{lead?.name || "פרטי ליד"}</h2>
            {lead?.phone && (
              <p className="truncate text-xs text-muted" dir="ltr">
                {lead.phone}
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
          ) : error || !lead ? (
            <div className="rounded-2xl border border-border bg-surface p-4 text-center shadow-soft">
              <p className="text-sm text-muted">לא הצלחנו לטעון את הליד.</p>
              <button type="button" onClick={() => void load()} className={`${BTN_GHOST} mt-3`}>
                נסו שוב
              </button>
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
                <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs text-accent-text">
                  {notice}
                </p>
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
                {lead.referrerCode && <Field label="קוד הפניה">{lead.referrerCode}</Field>}
              </dl>

              <section className="space-y-1.5">
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
                      <li key={e.id} className="rounded-xl border border-border bg-surface p-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">{EVENT_LABEL[e.event] ?? e.event}</span>
                          <span className="text-muted">{when(e.createdAt)}</span>
                        </div>
                        {(e.oldStatus || e.newStatus) && (
                          <p className="mt-0.5 text-muted">
                            {e.oldStatus ? `${LEAD_STATUS_META[e.oldStatus as LeadStatus]?.label ?? e.oldStatus} → ` : ""}
                            {e.newStatus ? LEAD_STATUS_META[e.newStatus as LeadStatus]?.label ?? e.newStatus : ""}
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
