"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ReactionBar> — multi-emoji reactions for a post or a reply.
//
// Used by both <PostCard> (target="post") and <Replies>/ReplyItem (target="reply").
// Renders the current reaction summary chips (only emoji with count>0 — truthful, a
// zero-count emoji is never shown) plus a "+" trigger that opens a small accessible
// picker of the 4 emoji. One reaction per user per target: picking a new emoji
// switches; picking your current emoji removes it. Optimistic, with revert on
// failure. Guests are routed to onRequireAuth().
//
// Data: batched at the list level when available — <CommunityFeed> / <ProfileView>
// hydrate the summaries + the viewer's own emoji for a whole PAGE of posts in one
// fetchReactions + fetchMyReactions round-trip and provide the entries via
// ReactionHydrationContext, and <Replies> does the same for a whole THREAD of
// replies via ReplyReactionHydrationContext (contexts, not props, so they reach
// this bar without threading through <PostCard>/<ReplyItem>). A bar with no
// provider in its target's scope — standalone contexts — keeps the original
// self-hydration on mount. Writes go through lib/community (browser JWT → RLS).
// No Supabase access here.
//
// Design: premium-2026 tokens only, RTL logical props, dark-mode via tokens, real
// <button>s with aria-labels + aria-pressed + visible focus rings, 44px targets,
// outside-click + Escape close, reduced-motion safe.
// ────────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  REACTION_EMOJI,
  fetchMyReactions,
  fetchReactions,
  setReaction,
  type ReactionEmoji,
  type ReactionSummary,
  type ReactionTarget,
} from "@/lib/community";
import { trackEvent } from "@/lib/tracking";

/** Batched reaction state for one target — the outputs of fetchReactions +
 *  fetchMyReactions for that id, paired (mine is null for guests / no reaction). */
export interface ReactionHydration {
  summaries: ReactionSummary[];
  mine: ReactionEmoji | null;
}

/** POST-reaction hydration a LIST provides for a whole page of ids in one
 *  fetchReactions + fetchMyReactions round-trip (<CommunityFeed> / <ProfileView>),
 *  instead of two requests per bar (the old N+1). A context rather than a prop
 *  because the bar sits inside <PostCard>, which doesn't (and shouldn't) know
 *  about reactions. Per-bar semantics (consulted by target="post" bars only):
 *    no provider          → standalone → self-fetch on mount (fallback preserved)
 *    provider, id missing → the page batch is still in flight → wait, don't fetch
 *    provider, entry set  → apply the batched entry. */
export const ReactionHydrationContext =
  createContext<Map<string, ReactionHydration> | null>(null);

/** REPLY-reaction hydration a THREAD provides for all its reply ids in one
 *  fetchReactions + fetchMyReactions round-trip (<Replies>), instead of two
 *  requests per reply bar. A separate context from the post one so a reply bar
 *  nested under a post-providing list never mistakes the post batch for its own.
 *  Same tri-state semantics, consulted by target="reply" bars only. */
export const ReplyReactionHydrationContext =
  createContext<Map<string, ReactionHydration> | null>(null);

export interface ReactionBarProps {
  target: ReactionTarget;
  targetId: string;
  userId: string | null;
  onRequireAuth: () => void;
}

/** Immutable helper: bump/lower a single emoji's count in the summary list, keeping
 *  the canonical emoji order and dropping entries that fall to zero. */
function applyDelta(
  summaries: ReactionSummary[],
  emoji: ReactionEmoji,
  delta: 1 | -1,
): ReactionSummary[] {
  const counts = new Map<ReactionEmoji, number>();
  for (const s of summaries) counts.set(s.emoji, s.count);
  counts.set(emoji, Math.max(0, (counts.get(emoji) ?? 0) + delta));
  return REACTION_EMOJI.filter((e) => (counts.get(e) ?? 0) > 0).map((e) => ({
    emoji: e,
    count: counts.get(e)!,
  }));
}

export default function ReactionBar({ target, targetId, userId, onRequireAuth }: ReactionBarProps) {
  const [summaries, setSummaries] = useState<ReactionSummary[]>([]);
  const [mine, setMine] = useState<ReactionEmoji | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const pickerId = useId();

  const postHydrationMap = useContext(ReactionHydrationContext);
  const replyHydrationMap = useContext(ReplyReactionHydrationContext);
  const hydrationMap = target === "post" ? postHydrationMap : replyHydrationMap;
  // `undefined` = standalone (no provider for THIS target scope) → self-fetch;
  // `null` = the parent's batch is still in flight → wait for it; an object =
  // the batched entry, applied below.
  const hydration = hydrationMap ? (hydrationMap.get(targetId) ?? null) : undefined;

  // Signed out (or the account changed to signed-out): the viewer has no "my
  // reaction". Adjusted during render (guarded — the endorsed React pattern) so
  // no effect ever calls setState synchronously.
  const [prevUserId, setPrevUserId] = useState(userId);
  if (userId !== prevUserId) {
    setPrevUserId(userId);
    if (!userId) setMine(null);
  }

  // Apply the parent's batched entry when it lands — adjusted during render,
  // once per entry identity. The feed keeps each entry referentially stable
  // across map merges, so this runs once per resolved entry and never clobbers
  // a later optimistic reaction flip.
  const [appliedHydration, setAppliedHydration] = useState<ReactionHydration | null>(null);
  if (hydration && hydration !== appliedHydration) {
    setAppliedHydration(hydration);
    setSummaries(hydration.summaries);
    setMine(hydration.mine);
  }

  // Hydrate summary + the viewer's own reaction on mount / when the target changes
  // — ONLY when standalone. Inside a providing list the batched entry supplies both
  // in one round-trip per PAGE instead of two per bar. State lands in the .then
  // continuations only.
  useEffect(() => {
    if (hydration !== undefined) return; // parent-owned (batched at the list level)
    let active = true;
    void fetchReactions(target, [targetId]).then((m) => {
      if (active) setSummaries(m.get(targetId) ?? []);
    });
    if (userId) {
      void fetchMyReactions(target, [targetId]).then((m) => {
        if (active) setMine(m.get(targetId) ?? null);
      });
    }
    return () => {
      active = false;
    };
  }, [target, targetId, userId, hydration]);

  // Close the picker on outside-click / Escape.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickerOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  // Toggle to `emoji` (or remove if it's already mine). Optimistic + revert.
  const react = useCallback(
    async (emoji: ReactionEmoji) => {
      if (!userId) {
        onRequireAuth();
        return;
      }
      if (busy) return;
      const prevMine = mine;
      const prevSummaries = summaries;
      const removing = prevMine === emoji;
      const nextMine: ReactionEmoji | null = removing ? null : emoji;

      // Optimistic: remove the old emoji's count (if any), add the new one's.
      let next = prevSummaries;
      if (prevMine) next = applyDelta(next, prevMine, -1);
      if (nextMine) next = applyDelta(next, nextMine, 1);
      setMine(nextMine);
      setSummaries(next);
      setBusy(true);
      setPickerOpen(false);

      const ok = await setReaction(target, targetId, userId, nextMine);
      if (!ok) {
        setMine(prevMine);
        setSummaries(prevSummaries);
      } else if (!removing) {
        trackEvent("reaction_added", { target, emoji });
      }
      setBusy(false);
    },
    [userId, busy, mine, summaries, target, targetId, onRequireAuth],
  );

  const chipBase =
    "inline-flex min-h-11 items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

  return (
    <div ref={wrapRef} className="relative flex flex-wrap items-center gap-1.5">
      {/* Existing reactions (only count>0) */}
      {summaries.map((s) => {
        const isMine = mine === s.emoji;
        return (
          <button
            key={s.emoji}
            type="button"
            onClick={() => void react(s.emoji)}
            disabled={busy}
            aria-pressed={isMine}
            aria-label={`תגובה ${s.emoji}: ${s.count}${isMine ? " — הרֵאקציה שלך" : ""}`}
            className={`${chipBase} ${
              isMine
                ? "border-accent bg-accent/10 text-accent-text"
                : "border-border bg-surface text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
            }`}
          >
            <span aria-hidden="true">{s.emoji}</span>
            <span className="tabular-nums">{s.count}</span>
          </button>
        );
      })}

      {/* Add / change reaction */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (userId ? setPickerOpen((v) => !v) : onRequireAuth())}
        disabled={busy}
        aria-haspopup="true"
        aria-expanded={pickerOpen}
        aria-controls={pickerOpen ? pickerId : undefined}
        aria-label="הוספת תגובה"
        className={`${chipBase} border-border bg-surface text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40`}
      >
        <span aria-hidden="true">🙂</span>
        <span className="text-xs">תגובה</span>
      </button>

      {pickerOpen && (
        <div
          id={pickerId}
          role="group"
          aria-label="בחירת תגובה"
          className="popover absolute bottom-full z-20 mb-1 flex gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-float"
          style={{ ["--popover-origin" as string]: "bottom center" }}
        >
          {REACTION_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => void react(e)}
              aria-pressed={mine === e}
              aria-label={`תגובה ${e}`}
              className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent/10 ${
                mine === e ? "bg-accent/10" : ""
              } motion-safe:[@media(hover:hover)_and_(pointer:fine)]:hover:scale-110`}
            >
              <span aria-hidden="true">{e}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
