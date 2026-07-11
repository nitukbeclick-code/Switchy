"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmContacts> — the WhatsApp-contact lifecycle board. Reads crm-api
// `listContacts` (service_role, admin-gated, light allowlist DTO) and writes via
// `setContactStatus` (validated + audited). Filter by lifecycle status, search by
// name/phone (debounced), and move a contact through its lifecycle with a per-row
// status picker. Presentation only; all authority is server-side.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTACT_STATUSES,
  type ContactStatus,
  type CrmContact,
  fetchCrmContacts,
  setCrmContactStatus,
} from "@/lib/crm-admin";
import { BTN_GHOST, CONTACT_STATUS_META, NoticeCard, when } from "./ui";

type Filter = ContactStatus | "all";

function ContactsSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}

// Per-row status picker — a compact native select over the lifecycle, so an admin
// can advance a contact without a drawer. Disabled while its own write is in flight.
function StatusSelect({
  value,
  busy,
  onChange,
}: {
  value: string;
  busy: boolean;
  onChange: (status: ContactStatus) => void;
}) {
  return (
    <select
      value={CONTACT_STATUSES.includes(value as ContactStatus) ? value : ""}
      disabled={busy}
      onChange={(e) => onChange(e.target.value as ContactStatus)}
      aria-label="שינוי סטטוס איש קשר"
      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
    >
      {!CONTACT_STATUSES.includes(value as ContactStatus) && <option value="">{value || "—"}</option>}
      {CONTACT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {CONTACT_STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}

export default function CrmContacts() {
  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<CrmContact[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Write-failure notice for status changes (loads keep their own `error` state).
  const [notice, setNotice] = useState("");
  // Orders overlapping loads (rapid filter/search switches) so a slower, older
  // response can never overwrite a newer filter's rows.
  const loadSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(false);
    const res = await fetchCrmContacts({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
    });
    if (seq !== loadSeq.current) return; // stale — a newer load owns the view
    if (res) setContacts(res.contacts);
    else setError(true);
    setLoading(false);
  }, [filter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = useCallback(
    async (contactId: string, status: ContactStatus) => {
      if (busyId) return;
      setBusyId(contactId);
      setNotice("");
      const ok = await setCrmContactStatus(contactId, status);
      setBusyId(null);
      if (ok) await load();
      // On failure the controlled select re-renders back to c.status; surface
      // the failure instead of letting it snap back silently.
      else setNotice("עדכון הסטטוס נכשל. נסו שוב.");
    },
    [busyId, load],
  );

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "הכול" },
    ...CONTACT_STATUSES.map((s) => ({ key: s as Filter, label: CONTACT_STATUS_META[s].label })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי סטטוס איש קשר">
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

      <input
        type="search"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="חיפוש שם / טלפון"
        aria-label="חיפוש אנשי קשר"
        className="w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />

      {/* Always-mounted polite live region (same pattern as the inbox reply
          notice) so a failed status change is announced, not swallowed. */}
      <p role="status" aria-live="polite" className="min-h-4 text-xs text-danger-text">
        {notice}
      </p>

      {loading ? (
        <ContactsSkeleton />
      ) : error || !contacts ? (
        <NoticeCard
          action={
            <button type="button" onClick={() => void load()} className={BTN_GHOST}>
              נסו שוב
            </button>
          }
        >
          לא הצלחנו לטעון את אנשי הקשר.
        </NoticeCard>
      ) : contacts.length === 0 ? (
        <NoticeCard>{search ? "לא נמצאו אנשי קשר תואמים." : "אין אנשי קשר בסטטוס הזה."}</NoticeCard>
      ) : (
        <>
          <p className="text-xs text-muted">
            {contacts.length.toLocaleString("he-IL")} אנשי קשר{contacts.length >= 200 ? " (מוצגים 200 האחרונים)" : ""}
          </p>

          {/* Desktop: a semantic table. */}
          <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft md:block">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th scope="col" className="px-4 py-2 font-medium">שם</th>
                  <th scope="col" className="px-4 py-2 font-medium">טלפון</th>
                  <th scope="col" className="px-4 py-2 font-medium">הודעה אחרונה</th>
                  <th scope="col" className="px-4 py-2 font-medium">ליד</th>
                  <th scope="col" className="px-4 py-2 font-medium">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium text-ink">{c.name || "—"}</td>
                    <td className="px-4 py-2 text-muted" dir="ltr">{c.phone || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{when(c.lastMessageAt) || "—"}</td>
                    <td className="px-4 py-2 text-muted">{c.leadId ? "✓" : "—"}</td>
                    <td className="px-4 py-2">
                      <StatusSelect value={c.status} busy={busyId === c.id} onChange={(s) => void changeStatus(c.id, s)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <ul className="space-y-2 md:hidden">
            {contacts.map((c) => (
              <li key={c.id} className="rounded-2xl border border-border bg-surface p-3 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{c.name || "—"}</p>
                    <p className="truncate text-xs text-muted" dir="ltr">{c.phone || "—"}</p>
                  </div>
                  <StatusSelect value={c.status} busy={busyId === c.id} onChange={(s) => void changeStatus(c.id, s)} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                  {c.lastMessageAt && <span>הודעה אחרונה: {when(c.lastMessageAt)}</span>}
                  {c.leadId && <span>מקושר לליד</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
