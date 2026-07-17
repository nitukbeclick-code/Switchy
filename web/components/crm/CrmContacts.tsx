"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmContacts> — the WhatsApp-contact lifecycle board. Reads crm-api
// `listContacts` (service_role, access-gated, light allowlist DTO) and writes via
// `setContactStatus` (validated + audited). Filter by lifecycle status, search by
// name/phone (debounced) — both mirrored to the URL so they survive refresh/
// tab-switch — move a contact through its lifecycle with a per-row status picker,
// and export the current view as CSV (id column; honest "-partial" filename when
// the 200-row window is full). Presentation only; all authority is server-side.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CONTACT_STATUSES,
  type ContactStatus,
  type CrmContact,
  fetchCrmContacts,
  setCrmContactStatus,
} from "@/lib/crm-admin";
import { buildCsv, csvFileName, downloadCsv } from "@/lib/csv";
import { BTN_GHOST, CONTACT_STATUS_META, mirrorUrlParams, NoticeCard, when } from "./ui";

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
  // Filter + search initialize from the URL (mirrored below on every change).
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => {
    const v = params.get("contact_status");
    return v && (CONTACT_STATUSES as readonly string[]).includes(v) ? (v as ContactStatus) : "all";
  });
  const [searchInput, setSearchInput] = useState(() => params.get("contact_q") ?? "");
  const [search, setSearch] = useState(() => (params.get("contact_q") ?? "").trim());
  const [contacts, setContacts] = useState<CrmContact[] | null>(null);
  // The server's authoritative "there are more rows past this window" flag —
  // drives the honest "-partial" CSV suffix (NOT `contacts.length >= 200`).
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Write-failure notice for status changes (loads keep their own `error` state).
  const [notice, setNotice] = useState("");
  // Orders overlapping loads (rapid filter/search switches) so a slower, older
  // response can never overwrite a newer filter's rows.
  const loadSeq = useRef(0);

  // Debounce the search box; when the (trimmed) query actually changes, reset
  // the view here in the timeout callback — the load effect then refetches.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return; // unchanged query — no reload, same as before
      setLoading(true);
      setError(false);
      setSearch(next);
      mirrorUrlParams({ contact_q: next || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  // Fetch the current view. Loading/error resets are event-driven: the useState
  // initializers cover the mount load, and every later load starts from an
  // event (`changeFilter`, the search debounce above, `reload`) that resets
  // first — so the load effect never sets state synchronously
  // (react-hooks/set-state-in-effect): state only lands in the .then continuation.
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    return fetchCrmContacts({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
    }).then((res) => {
      if (seq !== loadSeq.current) return; // stale — a newer load owns the view
      if (res) {
        setContacts(res.contacts);
        setHasMore(res.hasMore);
      } else setError(true);
      setLoading(false);
    });
  }, [filter, search]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-fetch the current view from an event (retry / after a status change).
  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    await load();
  }, [load]);

  // Switch filters: reset the view in the click, then the effect refetches.
  const changeFilter = useCallback(
    (next: Filter) => {
      if (next === filter) return; // same chip — no reload, same as before
      setLoading(true);
      setError(false);
      setFilter(next);
      mirrorUrlParams({ contact_status: next === "all" ? null : next });
    },
    [filter],
  );

  // Export the CURRENT view as CSV (same in-browser builder as the leads export
  // — no new endpoint, formula-injection-guarded). id column + honest
  // "-partial" filename driven by the server's `hasMore` (real rows past the
  // window), so an exactly-200-row window with nothing beyond it is NOT partial.
  const exportCsv = useCallback(() => {
    if (!contacts || contacts.length === 0) return;
    const headers = ["id", "שם", "טלפון", "סטטוס", "ליד מקושר", "הודעה אחרונה"];
    const rows = contacts.map((c) => [
      c.id,
      c.name,
      c.phone,
      CONTACT_STATUS_META[c.status]?.label ?? c.status,
      c.leadId ?? "",
      c.lastMessageAt ?? "",
    ]);
    downloadCsv(csvFileName(`contacts-${filter}`, hasMore), buildCsv(headers, rows));
  }, [contacts, filter, hasMore]);

  const changeStatus = useCallback(
    async (contactId: string, status: ContactStatus) => {
      if (busyId) return;
      setBusyId(contactId);
      setNotice("");
      const ok = await setCrmContactStatus(contactId, status);
      setBusyId(null);
      if (ok) await reload();
      // On failure the controlled select re-renders back to c.status; surface
      // the failure instead of letting it snap back silently.
      else setNotice("עדכון הסטטוס נכשל. נסו שוב.");
    },
    [busyId, reload],
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
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="חיפוש שם / טלפון"
          aria-label="חיפוש אנשי קשר"
          className="w-48 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={exportCsv}
          disabled={!contacts || contacts.length === 0}
          className={`${BTN_GHOST} ms-auto text-xs disabled:cursor-not-allowed disabled:opacity-50`}
          title="ייצוא התצוגה הנוכחית כקובץ CSV"
        >
          ייצוא CSV
        </button>
      </div>

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
            <button type="button" onClick={() => void reload()} className={BTN_GHOST}>
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
          <p className="text-xs text-muted tabular-nums">
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
