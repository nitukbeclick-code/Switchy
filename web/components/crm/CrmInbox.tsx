"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmInbox> — the WhatsApp inbox: a conversation list (filter + search) beside a
// message thread with a reply box and bot takeover / hand-back. All through
// crm-api (admin-gated, service_role, audited): sending a reply implicitly takes
// the conversation off the bot. Message bodies are text-only (never bytes/PII
// beyond the text). Two-pane on desktop; single-pane with a back affordance on
// mobile.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONVERSATION_STATUSES,
  type ConversationStatus,
  type CrmConversation,
  type CrmMessage,
  type CrmThread,
  crmHandBack,
  crmTakeOver,
  fetchCrmConversations,
  fetchCrmThread,
  sendCrmReply,
} from "@/lib/crm-admin";
import { useCrmEvents } from "@/lib/use-crm-events";
import { BTN_GHOST, BTN_PRIMARY, CONVERSATION_STATUS_META, ConversationStatusPill, NoticeCard, when } from "./ui";

type Filter = ConversationStatus | "all";

function chip(active: boolean): string {
  return `interactive rounded-full border px-3 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active
      ? "border-accent bg-accent/10 text-accent-text"
      : "border-border text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/5"
  }`;
}

function MessageBubble({ m }: { m: CrmMessage }) {
  const isRep = m.actor === "rep";
  const isBot = m.actor === "bot";
  const mine = isRep || isBot || m.direction === "out";
  const label = isRep ? "נציג" : isBot ? "בוט" : "לקוח";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          isRep
            ? "bg-accent text-accent-contrast"
            : isBot
              ? "bg-accent/10 text-foreground"
              : "border border-border bg-surface text-foreground"
        }`}
      >
        <p className="mb-0.5 text-[10px] font-semibold opacity-70">{label}</p>
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {m.createdAt && <p className="mt-1 text-[10px] opacity-60">{when(m.createdAt)}</p>}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1.5" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl border border-border bg-surface" />
      ))}
    </div>
  );
}

export default function CrmInbox() {
  const [filter, setFilter] = useState<Filter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [convs, setConvs] = useState<CrmConversation[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<CrmThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  // Stale-response guards. `listSeq` orders overlapping list loads (rapid
  // filter/search switches) so a slower, older response can't overwrite the
  // newer filter's rows. `selectedIdRef` mirrors the live selection so a
  // thread response for a conversation the rep already left is dropped —
  // otherwise thread A could render (name, phone, messages) while selectedId
  // — and therefore the reply box — already targets conversation B.
  const listSeq = useRef(0);
  const selectedIdRef = useRef<string | null>(null);

  // Single entry point for changing the selection: the ref updates
  // synchronously, before any in-flight fetch can resolve.
  const selectConversation = useCallback((id: string | null) => {
    selectedIdRef.current = id;
    setSelectedId(id);
  }, []);

  // `silent` refreshes (from the Realtime feed) skip the skeletons + keep the
  // current view on failure, so a live update never flashes the list or thread.
  const loadList = useCallback(async (silent = false) => {
    const seq = ++listSeq.current;
    if (!silent) setListLoading(true);
    setListError(false);
    const res = await fetchCrmConversations({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
    });
    if (seq !== listSeq.current) return; // stale — a newer load owns the list
    if (res) {
      setConvs(res.conversations);
      setListLoading(false);
    } else if (!silent) {
      setListError(true);
      setListLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadThread = useCallback(async (id: string, silent = false) => {
    // Never load (or show a skeleton for) a conversation that isn't the
    // current selection — e.g. a post-mutation refresh whose closure captured
    // an older selection.
    if (id !== selectedIdRef.current) return;
    if (!silent) {
      setThreadLoading(true);
      setThread(null);
    }
    setThreadError(false);
    const t = await fetchCrmThread(id);
    // The rep may have switched conversations while this fetch was in flight;
    // only the latest-selected conversation's response is allowed to land.
    if (id !== selectedIdRef.current) return;
    if (t) setThread(t);
    else if (!silent) setThreadError(true);
    if (!silent) setThreadLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  // Live-refresh the list + the open thread whenever a crm_events row lands (an
  // inbound message, rep reply, takeover). Silent so it never flashes; fail-soft.
  useCrmEvents(() => {
    void loadList(true);
    if (selectedId) void loadThread(selectedId, true);
  });

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  const afterMutation = useCallback(async () => {
    if (selectedId) await loadThread(selectedId);
    void loadList();
  }, [selectedId, loadThread, loadList]);

  const onSend = useCallback(async () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    setNotice("");
    const ok = await sendCrmReply(selectedId, body);
    setSending(false);
    if (ok) {
      setReply("");
      await afterMutation();
    } else {
      setNotice("שליחת ההודעה נכשלה. נסו שוב.");
    }
  }, [reply, selectedId, sending, afterMutation]);

  const onTakeOver = useCallback(async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setNotice("");
    const ok = await crmTakeOver(selectedId);
    setBusy(false);
    if (ok) await afterMutation();
    else setNotice("המעבר לטיפול אנושי נכשל.");
  }, [selectedId, busy, afterMutation]);

  const onHandBack = useCallback(async () => {
    if (!selectedId || busy) return;
    setBusy(true);
    setNotice("");
    const ok = await crmHandBack(selectedId);
    setBusy(false);
    if (ok) await afterMutation();
    else setNotice("ההחזרה לבוט נכשלה.");
  }, [selectedId, busy, afterMutation]);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "הכול" },
    ...CONVERSATION_STATUSES.map((st) => ({ key: st as Filter, label: CONVERSATION_STATUS_META[st].label })),
  ];

  const selectedConv = convs?.find((c) => c.conversationId === selectedId) ?? null;
  const isHuman = selectedConv?.status === "human";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="סינון שיחות">
          {filters.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={chip(filter === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <form
          className="ms-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="חיפוש שם / טלפון"
            className="w-40 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <button type="submit" className={`${BTN_GHOST} min-h-9 px-3`}>
            חפש
          </button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <div className={selectedId ? "hidden md:block" : ""}>
          {listLoading ? (
            <ListSkeleton />
          ) : listError || !convs ? (
            <NoticeCard action={<button type="button" onClick={() => void loadList()} className={BTN_GHOST}>נסו שוב</button>}>
              לא הצלחנו לטעון שיחות.
            </NoticeCard>
          ) : convs.length === 0 ? (
            <NoticeCard>אין שיחות תואמות.</NoticeCard>
          ) : (
            <ul className="space-y-1.5 md:max-h-[70vh] md:overflow-y-auto">
              {convs.map((c) => {
                const active = c.conversationId === selectedId;
                return (
                  <li key={c.conversationId}>
                    <button
                      type="button"
                      onClick={() => selectConversation(c.conversationId)}
                      aria-current={active}
                      className={`w-full rounded-2xl border p-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                        active
                          ? "border-accent bg-accent/5"
                          : "border-border bg-surface [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{c.name || "ללא שם"}</span>
                        <ConversationStatusPill status={c.status} />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-foreground">{c.lastSnippet || "—"}</span>
                        {c.lastAt && <span className="shrink-0 text-[10px] text-muted">{when(c.lastAt)}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Thread */}
        <div className={selectedId ? "" : "hidden md:block"}>
          {!selectedId ? (
            <div className="hidden h-full items-center justify-center rounded-2xl border border-border bg-surface p-8 text-center md:flex">
              <p className="text-sm text-muted">בחרו שיחה כדי לצפות בהודעות ולהשיב.</p>
            </div>
          ) : (
            <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-background">
              <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" onClick={() => selectConversation(null)} className="text-sm text-accent-text md:hidden" aria-label="חזרה לרשימת השיחות">
                    →
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{thread?.contact.name || "שיחה"}</p>
                    {thread?.contact.phone && (
                      <p className="truncate text-xs text-muted" dir="ltr">
                        {thread.contact.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedConv && <ConversationStatusPill status={selectedConv.status} />}
                  {isHuman ? (
                    <button type="button" disabled={busy} onClick={() => void onHandBack()} className={`${BTN_GHOST} min-h-9 px-3`}>
                      החזר לבוט
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void onTakeOver()} className={`${BTN_GHOST} min-h-9 px-3`}>
                      השתלט
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {threadLoading ? (
                  <p className="text-sm text-muted">טוען…</p>
                ) : threadError || !thread ? (
                  <div className="text-center">
                    <p className="text-sm text-muted">לא הצלחנו לטעון את השיחה.</p>
                    <button type="button" onClick={() => selectedId && void loadThread(selectedId)} className={`${BTN_GHOST} mt-3`}>
                      נסו שוב
                    </button>
                  </div>
                ) : thread.messages.length === 0 ? (
                  <p className="text-center text-sm text-muted">אין הודעות בשיחה הזו.</p>
                ) : (
                  <>
                    {thread.messages.map((m) => (
                      <MessageBubble key={m.id} m={m} />
                    ))}
                    <div ref={threadEndRef} />
                  </>
                )}
              </div>

              <div className="border-t border-border bg-surface p-2">
                <p role="status" aria-live="polite" className="mb-1 min-h-4 px-1 text-xs text-danger-text">
                  {notice}
                </p>
                <div className="flex items-end gap-2">
                  <label htmlFor="crm-reply" className="sr-only">
                    הודעת תשובה
                  </label>
                  <textarea
                    id="crm-reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void onSend();
                      }
                    }}
                    rows={2}
                    placeholder="כתבו תשובה… (שליחה משתלטת על השיחה מהבוט)"
                    className="max-h-32 flex-1 resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                  <button type="button" disabled={sending || !reply.trim()} onClick={() => void onSend()} className={BTN_PRIMARY}>
                    {sending ? "שולח…" : "שלח"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
