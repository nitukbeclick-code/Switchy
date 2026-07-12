"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CrmInbox> — the WhatsApp inbox: a conversation list (filter + debounced
// search, both mirrored to the URL so they survive refresh/tab-switch) beside a
// message thread with a reply box and bot takeover / hand-back. All through
// crm-api (access-gated, service_role, audited): sending a reply implicitly takes
// the conversation over from the bot; an explicit takeover is stamped with the
// signed-in rep's display name. Conversation rows and the thread header carry
// the linked lead's pipeline stage + the detected intent, and a "פרטי הליד"
// button opens the full lead drawer straight from the thread. Message bodies are
// text-only (never bytes/PII beyond the text). The thread autoscrolls on new
// messages ONLY while the rep is already near the bottom — scrolled-up reading
// is never yanked away. Two-pane on desktop; single-pane with a back affordance
// on mobile.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CONVERSATION_STATUSES,
  type ConversationStatus,
  type CrmConversation,
  type CrmFailure,
  type CrmMessage,
  type CrmThread,
  crmHandBack,
  crmTakeOver,
  fetchCrmConversations,
  fetchCrmThread,
  sendCrmReply,
} from "@/lib/crm-admin";
import { useAuth } from "@/lib/auth-context";
import { useCrmEvents } from "@/lib/use-crm-events";
import CrmLeadDrawer from "./CrmLeadDrawer";
import {
  BTN_GHOST,
  BTN_PRIMARY,
  CONVERSATION_STATUS_META,
  ConversationStatusPill,
  ErrorNotice,
  mirrorUrlParams,
  NoticeCard,
  StatusPill,
  when,
} from "./ui";

type Filter = ConversationStatus | "all";

// How close to the bottom (px) still counts as "following the conversation" —
// within this, a thread refresh autoscrolls; further up it never yanks the view.
const NEAR_BOTTOM_PX = 120;

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
  // Filter + search initialize from the URL (mirrored below on every change).
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => {
    const v = params.get("conv_status");
    return v && (CONVERSATION_STATUSES as readonly string[]).includes(v) ? (v as ConversationStatus) : "all";
  });
  const [searchInput, setSearchInput] = useState(() => params.get("conv_q") ?? "");
  const [search, setSearch] = useState(() => (params.get("conv_q") ?? "").trim());
  const [convs, setConvs] = useState<CrmConversation[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [listFailure, setListFailure] = useState<CrmFailure | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<CrmThread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState(false);
  const [threadFailure, setThreadFailure] = useState<CrmFailure | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // The lead whose full drawer is open (entered from the thread header).
  const [leadDrawerId, setLeadDrawerId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  // The scrollable message pane + whether the rep is near its bottom. The flag
  // updates on scroll (an event), and the thread effect reads it to decide
  // whether an update may autoscroll. Starts true: a fresh thread opens pinned
  // to its newest message.
  const threadPaneRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  // Stale-response guards. `listSeq` orders overlapping list loads (rapid
  // filter/search switches) so a slower, older response can't overwrite the
  // newer filter's rows. `selectedIdRef` mirrors the live selection so a
  // thread response for a conversation the rep already left is dropped —
  // otherwise thread A could render (name, phone, messages) while selectedId
  // — and therefore the reply box — already targets conversation B.
  const listSeq = useRef(0);
  const selectedIdRef = useRef<string | null>(null);

  const { profile } = useAuth();
  const repName = (profile?.name ?? "").trim() || "מנהל";

  // Single entry point for changing the selection: the ref updates
  // synchronously, before any in-flight fetch can resolve. Selecting a NEW
  // conversation also resets the thread pane here, in the click — so the
  // thread-load effect below never sets state synchronously.
  const selectConversation = useCallback((id: string | null) => {
    if (id === selectedIdRef.current) return; // re-click on the same row — no-op, same as before
    selectedIdRef.current = id;
    nearBottomRef.current = true; // a fresh thread opens pinned to its newest message
    setSelectedId(id);
    if (id) {
      setThreadLoading(true);
      setThread(null);
      setThreadError(false);
      setThreadFailure(null);
    }
  }, []);

  // `silent` refreshes (from the Realtime feed) skip the skeletons + keep the
  // current view on failure, so a live update never flashes the list or thread.
  // Loading/error resets are event-driven: the useState initializers cover the
  // mount load, and every later load starts from an event (`changeFilter`, the
  // search debounce, retry, `afterMutation`, the Realtime callback) that resets
  // first — so the load effects never set state synchronously
  // (react-hooks/set-state-in-effect): state only lands in the .then continuations.
  const loadList = useCallback((silent = false) => {
    const seq = ++listSeq.current;
    return fetchCrmConversations({
      status: filter === "all" ? undefined : filter,
      search: search || undefined,
    }).then((res) => {
      if (seq !== listSeq.current) return; // stale — a newer load owns the list
      if (res.data) {
        setConvs(res.data.conversations);
        setListLoading(false);
      } else if (!silent) {
        setListFailure(res.failure);
        setListError(true);
        setListLoading(false);
      }
    });
  }, [filter, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Retry the list from the error notice.
  const reloadList = useCallback(() => {
    setListLoading(true);
    setListError(false);
    setListFailure(null);
    void loadList();
  }, [loadList]);

  // Switch filters: reset the list in the click, then the effect refetches.
  const changeFilter = useCallback(
    (next: Filter) => {
      if (next === filter) return; // same chip — no reload, same as before
      setListLoading(true);
      setListError(false);
      setListFailure(null);
      setFilter(next);
      mirrorUrlParams({ conv_status: next === "all" ? null : next });
    },
    [filter],
  );

  // Debounce the search box so we don't fire a request per keystroke; when the
  // (trimmed) query actually changes, reset the view here in the timeout
  // callback — the load effect then refetches.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next === search) return; // unchanged query — no reload, same as before
      setListLoading(true);
      setListError(false);
      setListFailure(null);
      setSearch(next);
      mirrorUrlParams({ conv_q: next || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const loadThread = useCallback((id: string, silent = false): Promise<void> => {
    // Never load (or show a skeleton for) a conversation that isn't the
    // current selection — e.g. a post-mutation refresh whose closure captured
    // an older selection.
    if (id !== selectedIdRef.current) return Promise.resolve();
    return fetchCrmThread(id).then((t) => {
      // The rep may have switched conversations while this fetch was in flight;
      // only the latest-selected conversation's response is allowed to land.
      if (id !== selectedIdRef.current) return;
      if (t.data) setThread(t.data);
      else if (!silent) {
        setThreadFailure(t.failure);
        setThreadError(true);
      }
      if (!silent) setThreadLoading(false);
    });
  }, []);

  useEffect(() => {
    if (selectedId) void loadThread(selectedId);
  }, [selectedId, loadThread]);

  // Retry the open thread from the error notice.
  const retryThread = useCallback(() => {
    if (!selectedId) return;
    setThreadLoading(true);
    setThread(null);
    setThreadError(false);
    setThreadFailure(null);
    void loadThread(selectedId);
  }, [selectedId, loadThread]);

  // Live-refresh the list on EVERY crm_events burst (an inbound message, rep
  // reply, takeover — anywhere in the inbox). Silent so it never flashes; fail-soft.
  // The open THREAD, however, is only re-fetched when the burst actually touched
  // THIS conversation: crm-api's getThread writes a `crm_thread_view` audit row on
  // every call, so reloading the open thread on unrelated background events (the
  // bot answering OTHER customers) would mint a spurious audit row per event. The
  // burst's conversationIds tell us whether the open conversation moved; if it
  // did, the reload respects the near-bottom autoscroll guard as before.
  useCrmEvents((batch) => {
    setListError(false); // a silent refresh starts by clearing any stale error
    setListFailure(null);
    void loadList(true);
    if (selectedId && batch.conversationIds.has(selectedId)) {
      setThreadError(false);
      setThreadFailure(null);
      void loadThread(selectedId, true);
    }
  });

  // Track whether the rep is following the newest messages; updated on scroll
  // (an event), read by the autoscroll effect below.
  const onThreadScroll = useCallback(() => {
    const el = threadPaneRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  useEffect(() => {
    // Autoscroll only while pinned near the bottom — a rep reading history two
    // screens up keeps their place when a Realtime refresh lands new messages.
    if (nearBottomRef.current) threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  const afterMutation = useCallback(async () => {
    if (selectedId) {
      setThreadLoading(true);
      setThread(null);
      setThreadError(false);
      setThreadFailure(null);
      await loadThread(selectedId);
    }
    setListLoading(true);
    setListError(false);
    setListFailure(null);
    void loadList();
  }, [selectedId, loadThread, loadList]);

  const onSend = useCallback(async () => {
    const body = reply.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    setNotice("");
    nearBottomRef.current = true; // sending pins the view to the new message
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
    // The takeover is stamped with the rep's display name so the customer-side
    // trail and the console both show WHO took the conversation.
    const ok = await crmTakeOver(selectedId, repName);
    setBusy(false);
    if (ok) await afterMutation();
    else setNotice("המעבר לטיפול אנושי נכשל.");
  }, [selectedId, busy, repName, afterMutation]);

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
  const threadLeadId = thread?.contact.leadId ?? null;
  const threadLeadStatus = thread?.contact.leadStatus ?? selectedConv?.leadStatus ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="סינון שיחות">
          {filters.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => changeFilter(f.key)} className={chip(filter === f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="חיפוש שם / טלפון"
          aria-label="חיפוש שיחות"
          className="ms-auto w-40 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-[20rem_1fr]">
        {/* Conversation list */}
        <div className={selectedId ? "hidden md:block" : ""}>
          {listLoading ? (
            <ListSkeleton />
          ) : listError || !convs ? (
            <ErrorNotice failure={listFailure} fallback="לא הצלחנו לטעון שיחות." onRetry={reloadList} />
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
                      {(c.leadStatus || c.intent) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {c.leadStatus && <StatusPill status={c.leadStatus} />}
                          {c.intent && <span className="truncate text-[10px] font-medium text-muted">{c.intent}</span>}
                        </div>
                      )}
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
                  {threadLeadStatus && <StatusPill status={threadLeadStatus} />}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedConv && <ConversationStatusPill status={selectedConv.status} />}
                  {threadLeadId && (
                    <button
                      type="button"
                      onClick={() => setLeadDrawerId(threadLeadId)}
                      className={`${BTN_GHOST} min-h-9 px-3`}
                    >
                      פרטי הליד
                    </button>
                  )}
                  {isHuman ? (
                    <button type="button" disabled={busy} onClick={() => void onHandBack()} className={`${BTN_GHOST} min-h-9 px-3`}>
                      החזר לבוט
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onTakeOver()}
                      title={`השיחה תסומן כמטופלת על ידי ${repName}`}
                      className={`${BTN_GHOST} min-h-9 px-3`}
                    >
                      השתלט ({repName})
                    </button>
                  )}
                </div>
              </div>

              <div ref={threadPaneRef} onScroll={onThreadScroll} className="flex-1 space-y-2 overflow-y-auto p-3">
                {threadLoading ? (
                  <p className="text-sm text-muted">טוען…</p>
                ) : threadError || !thread ? (
                  <div className="text-center">
                    <p className="text-sm font-medium text-danger-text">{threadFailure?.message || "לא הצלחנו לטעון את השיחה."}</p>
                    {(threadFailure ? threadFailure.retryable : true) && (
                      <button type="button" onClick={retryThread} className={`${BTN_GHOST} mt-3`}>
                        נסו שוב
                      </button>
                    )}
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

      {leadDrawerId && (
        <CrmLeadDrawer
          key={leadDrawerId}
          leadId={leadDrawerId}
          onClose={() => setLeadDrawerId(null)}
          onChanged={() => {
            // A status/claim change from the drawer may move the linked lead's
            // pill on the list/thread — refresh both silently.
            void loadList(true);
            if (selectedId) void loadThread(selectedId, true);
          }}
        />
      )}
    </div>
  );
}
