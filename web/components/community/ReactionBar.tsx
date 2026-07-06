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
// Data: hydrates its own summary + the viewer's own emoji on mount (per-target, the
// same pattern PostCard uses for fetchMyLikes) and writes through lib/community
// (browser JWT → RLS). No Supabase access here.
//
// Design: premium-2026 tokens only, RTL logical props, dark-mode via tokens, real
// <button>s with aria-labels + aria-pressed + visible focus rings, 44px targets,
// outside-click + Escape close, reduced-motion safe.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
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

  // Hydrate summary + the viewer's own reaction on mount / when the target changes.
  useEffect(() => {
    let active = true;
    void fetchReactions(target, [targetId]).then((m) => {
      if (active) setSummaries(m.get(targetId) ?? []);
    });
    if (userId) {
      void fetchMyReactions(target, [targetId]).then((m) => {
        if (active) setMine(m.get(targetId) ?? null);
      });
    } else {
      setMine(null);
    }
    return () => {
      active = false;
    };
  }, [target, targetId, userId]);

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
