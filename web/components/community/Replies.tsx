"use client";

// ────────────────────────────────────────────────────────────────────────────
// <Replies> — the reply thread + composer under a single community post.
//
// Loads replies with fetchReplies(postId, viewerId) on mount, renders each with
// author + avatar + body + <MediaView>, and offers a composer (text + optional
// image / voice note) that calls createReply. Posting is gated on a real session:
// a guest tapping "send" triggers onRequireAuth() instead. The author can delete
// their own reply (deleteReply). Own flagged replies show an "under review" note.
//
// SECURITY: every piece of user content is rendered through JSX {} (React auto-
// escapes) — never dangerouslySetInnerHTML. Media URLs reach the DOM only as the
// `src` of the plain elements inside <MediaView>.
//
// Design: premium-2026 tokens only, RTL logical properties, dark-mode via tokens,
// real <button>s with aria-labels + visible focus rings, reduced-motion safe.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createReply,
  deleteReply,
  editReply,
  fetchMyReactions,
  fetchReactions,
  fetchReplies,
  MAX_BODY,
  orderByAccepted,
  setAcceptedReply,
  toReplyTree,
  type AuthorRef,
  type CommunityReply,
  type Media,
} from "@/lib/community";
import { uploadMedia, validateMedia } from "@/lib/media-upload";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/tracking";
// Shared render helpers. renderBody here stays mentions-only (no linkProviders):
// reply bodies bold @mentions but deliberately don't linkify provider names.
import { initial, relativeTime, renderBody } from "@/lib/community-render";
import ConfirmDanger from "./ConfirmDanger";
import MediaView from "./MediaView";
import MentionTextarea from "./MentionTextarea";
import ReactionBar, {
  ReplyReactionHydrationContext,
  type ReactionHydration,
} from "./ReactionBar";
// The SHARED voice-recording hook + cap — parity with the post composer, so a
// reply voice note obeys the same MAX_VOICE_MS auto-stop and shows a timer.
import {
  formatElapsed,
  MAX_VOICE_MS,
  useVoiceRecorder,
  VOICE_WARN_MS,
} from "./PostComposer";

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-9 w-9 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-accent/15 text-sm font-semibold text-accent-text"
    >
      {initial(name)}
    </span>
  );
}

// ── Single reply ─────────────────────────────────────────────────────────────

function ReplyItem({
  reply,
  isOwn,
  userId,
  onRequireAuth,
  onDelete,
  onReply,
  isAccepted = false,
  canAccept = false,
  onSetAccepted,
}: {
  reply: CommunityReply;
  isOwn: boolean;
  userId: string | null;
  onRequireAuth: () => void;
  onDelete: (id: string) => void;
  /** Open an inline "reply to this reply" composer (threading). */
  onReply?: () => void;
  /** This reply is the post author's chosen "best answer". */
  isAccepted?: boolean;
  /** The viewer is the post author, so the "mark as answer" control is offered. */
  canAccept?: boolean;
  /** Toggle this reply as the accepted answer (null clears it). */
  onSetAccepted?: (replyId: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  // Local body/edited state so an inline edit updates in place without a refetch.
  const [body, setBody] = useState(reply.body);
  const [editedAt, setEditedAt] = useState<string | null>(reply.edited_at);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  // A failed delete must be VISIBLE (it used to fail silently — the row just
  // stayed put with no explanation).
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const media: Media | null = reply.media_url
    ? {
        type: reply.media_type ?? "image",
        url: reply.media_url,
        durationMs: reply.media_duration_ms,
      }
    : null;

  const handleDelete = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setDeleteError(null);
    const ok = await deleteReply(reply.id);
    if (ok) {
      onDelete(reply.id);
    } else {
      setBusy(false);
      setDeleteError("מחיקת התגובה נכשלה. נסו שוב.");
    }
  }, [busy, reply.id, onDelete]);

  const startEditing = useCallback(() => {
    setDraft(body);
    setEditError(null);
    setEditing(true);
  }, [body]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditError(null);
  }, []);

  const trimmedDraft = draft.trim();
  const canSaveEdit =
    !saving && trimmedDraft.length > 0 && trimmedDraft !== body;

  const handleSaveEdit = useCallback(async () => {
    if (saving) return;
    const next = draft.trim();
    if (!next || next === body) return;
    setSaving(true);
    setEditError(null);
    const res = await editReply(reply.id, next);
    if (res) {
      setBody(res.body);
      setEditedAt(res.edited_at);
      setEditing(false);
    } else {
      setEditError("עריכת התגובה נכשלה. נסו שוב.");
    }
    setSaving(false);
  }, [saving, draft, body, reply.id]);

  const smallBtn =
    "inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
  const smallDangerBtn =
    "inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs font-medium text-danger-text transition-colors hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

  return (
    <div
      className={`flex gap-3 rounded-2xl border p-3 shadow-float ${
        isAccepted ? "border-accent/50 bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <Avatar src={reply.avatar} name={reply.author} />
      <div className="min-w-0 flex-1">
        {isAccepted && (
          <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[0.7rem] font-semibold text-accent-text">
            <span aria-hidden="true">✓</span>
            התשובה שנבחרה
          </p>
        )}
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-ink">{reply.author}</span>
          <time
            dateTime={reply.created_at}
            className="shrink-0 text-xs text-muted"
            title={reply.created_at}
          >
            {relativeTime(reply.created_at)}
          </time>
          {editedAt && (
            <span className="shrink-0 text-xs text-muted">נערך</span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <label htmlFor={`edit-reply-${reply.id}`} className="sr-only">
              עריכת התגובה
            </label>
            <textarea
              id={`edit-reply-${reply.id}`}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
              maxLength={MAX_BODY}
              rows={3}
              dir="rtl"
              className="block w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-start text-sm text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
            {editError && (
              <p role="alert" className="mt-1 text-xs text-danger-text">
                {editError}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={!canSaveEdit}
                aria-label="שמירת העריכה"
                className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {saving ? "שומר…" : "שמירה"}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                disabled={saving}
                aria-label="ביטול העריכה"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          body && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {renderBody(body)}
            </p>
          )
        )}

        {media && <MediaView media={media} />}

        {isOwn && reply.is_flagged && (
          <p className="mt-2 text-xs text-muted">בבדיקת מנהל</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ReactionBar
            target="reply"
            targetId={reply.id}
            userId={userId}
            onRequireAuth={onRequireAuth}
          />
          {onReply && (
            <button type="button" onClick={onReply} className={smallBtn} aria-label="תגובה לתגובה זו">
              השב
            </button>
          )}
          {canAccept && onSetAccepted && (
            <button
              type="button"
              onClick={() => onSetAccepted(isAccepted ? null : reply.id)}
              className={
                isAccepted
                  ? smallBtn
                  : "inline-flex min-h-11 items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold text-accent-text transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              }
              aria-pressed={isAccepted}
              aria-label={isAccepted ? "ביטול בחירת התשובה" : "בחירת התגובה כתשובה הטובה ביותר"}
            >
              {isAccepted ? "ביטול הבחירה" : "בחר כתשובה"}
            </button>
          )}
          {isOwn && !editing && (
            <button
              type="button"
              onClick={startEditing}
              aria-label="עריכת התגובה שלי"
              className={`ms-auto ${smallBtn}`}
            >
              עריכה
            </button>
          )}
          {isOwn && (
            <ConfirmDanger
              label={busy ? "מוחק…" : "מחיקה"}
              confirmLabel="לאשר מחיקה?"
              ariaLabel="מחיקת התגובה שלי"
              disabled={busy}
              onConfirm={() => void handleDelete()}
              dismissLabel="ביטול"
              dangerClassName={`${!editing ? "" : "ms-auto "}${smallDangerBtn}`}
              confirmClassName={`${!editing ? "" : "ms-auto "}${smallDangerBtn} bg-danger/10`}
              dismissClassName={smallBtn}
            />
          )}
        </div>

        {deleteError && (
          <p role="alert" className="mt-1 text-xs text-danger-text">
            {deleteError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

function ReplyComposer({
  postId,
  onReplied,
  onRequireAuth,
  parentReplyId = null,
  replyingToName,
  onCancel,
  autoFocus = false,
}: {
  postId: string;
  onReplied: (reply: CommunityReply) => void;
  onRequireAuth: () => void;
  /** When set, this is a reply-to-reply; the DB caps depth to the top-level ancestor. */
  parentReplyId?: string | null;
  replyingToName?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { user, profile } = useAuth();

  const [body, setBody] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDurationMs, setPendingDurationMs] = useState<number | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice recording — the SHARED hook (same MAX_VOICE_MS auto-stop + timer as the
  // post composer; unmount releases the mic). The finished blob stays PENDING and
  // uploads on submit, matching this composer's picked-file behaviour.
  const {
    recording,
    elapsed,
    start: startVoiceRec,
    stop: stopVoiceRec,
  } = useVoiceRecorder({
    onFinish: (blob, durationMs) => {
      setMedia(null);
      setPendingDurationMs(durationMs);
      setPendingBlob(blob);
    },
    onError: (message) => setError(message),
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Clearing the preview when the pending blob is removed is adjusted during
  // render (guarded) — the effect below only manages the object-URL lifecycle.
  const [prevPendingBlob, setPrevPendingBlob] = useState<Blob | null>(pendingBlob);
  if (pendingBlob !== prevPendingBlob) {
    setPrevPendingBlob(pendingBlob);
    if (!pendingBlob) setPreviewUrl(null);
  }

  // Local object-URL preview of a picked/recorded blob; revoked on change/unmount.
  // The URL is created in the effect (external system) and the state lands via
  // rAF, so the effect body itself never sets state synchronously.
  useEffect(() => {
    if (!pendingBlob) return;
    const url = URL.createObjectURL(pendingBlob);
    const raf = requestAnimationFrame(() => setPreviewUrl(url));
    return () => {
      cancelAnimationFrame(raf);
      URL.revokeObjectURL(url);
    };
  }, [pendingBlob]);

  const previewMedia: Media | null =
    previewUrl && pendingBlob
      ? {
          type:
            pendingBlob.type.startsWith("video/")
              ? "video"
              : pendingBlob.type.startsWith("audio/")
                ? "audio"
                : "image",
          url: previewUrl,
          durationMs: pendingDurationMs ?? null,
        }
      : media;

  const clearAttachment = useCallback(() => {
    setPendingBlob(null);
    setPendingDurationMs(undefined);
    setMedia(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateMedia({ type: file.type, size: file.size });
    if (!v.ok) {
      setError(v.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setMedia(null);
    setPendingDurationMs(undefined);
    setPendingBlob(file);
  }, []);

  const toggleRecording = useCallback(async () => {
    setError(null);
    if (recording) {
      await stopVoiceRec();
      return;
    }
    await startVoiceRec();
  }, [recording, startVoiceRec, stopVoiceRec]);

  const canSubmit = (body.trim().length > 0 || !!pendingBlob) && !busy && !recording;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) {
        onRequireAuth();
        return;
      }
      if (busy || recording) return;
      if (!body.trim() && !pendingBlob) return;

      setBusy(true);
      setError(null);
      try {
        let attached: Media | null = media;
        if (pendingBlob) {
          attached = await uploadMedia(user.id, pendingBlob, pendingDurationMs);
        }
        const authorRef: AuthorRef = {
          user_id: user.id,
          author: profile?.name || "משתמש",
          avatar: profile?.avatar_url ?? null,
        };
        const created = await createReply(
          postId,
          authorRef,
          { body: body.trim(), media: attached },
          { parentReplyId },
        );
        if (!created) {
          setError("שליחת התגובה נכשלה. נסו שוב.");
          return;
        }
        trackEvent("reply_created", { has_media: created.media_type != null });
        onReplied(created);
        setBody("");
        clearAttachment();
      } catch (err) {
        setError(err instanceof Error ? err.message : "אירעה שגיאה. נסו שוב.");
      } finally {
        setBusy(false);
      }
    },
    [
      user,
      busy,
      recording,
      body,
      pendingBlob,
      pendingDurationMs,
      media,
      profile,
      postId,
      parentReplyId,
      onReplied,
      onRequireAuth,
      clearAttachment,
    ],
  );

  // Guests see a prompt, not the full composer.
  if (!user) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-3 text-center">
        <p className="text-sm text-muted">התחברו כדי להגיב</p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          התחברות
        </button>
      </div>
    );
  }

  const remaining = MAX_BODY - body.length;

  const fieldId = `reply-${postId}-${parentReplyId ?? "root"}`;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-3">
      {parentReplyId && replyingToName && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span>
            בתגובה ל<span className="font-medium text-ink">{replyingToName}</span>
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="ms-auto rounded-lg px-2 py-0.5 font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="ביטול התגובה"
            >
              ביטול
            </button>
          )}
        </div>
      )}
      <label htmlFor={fieldId} className="sr-only">
        כתיבת תגובה
      </label>
      <MentionTextarea
        id={fieldId}
        autoFocus={autoFocus}
        value={body}
        onChange={(v) => setBody(v.slice(0, MAX_BODY))}
        maxLength={MAX_BODY}
        rows={2}
        dir="rtl"
        placeholder="כתבו תגובה… (השתמשו ב-@ לאזכור)"
        className="block w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-start text-sm text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

      {previewMedia && (
        <div className="mt-2">
          <MediaView media={previewMedia} />
          <button
            type="button"
            onClick={clearAttachment}
            aria-label="הסרת הקובץ המצורף"
            className="mt-1 rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            הסרה
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger-text">
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          onChange={onPickFile}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || recording}
          aria-label="צירוף תמונה או וידאו"
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <span aria-hidden="true">📎</span>
          מדיה
        </button>

        <button
          type="button"
          onClick={() => void toggleRecording()}
          disabled={busy}
          aria-label={recording ? "עצירת ההקלטה" : "הקלטת הודעה קולית"}
          aria-pressed={recording}
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <span aria-hidden="true">🎤</span>
          {recording ? "עצירה" : "קול"}
        </button>

        {recording && (
          <span className="inline-flex items-center gap-1.5 text-xs">
            {/* Only the static state is a live region; the ticking timer is
                hidden from AT so it is not re-announced every 250ms. */}
            <span className="text-accent-text" role="status" aria-live="polite">
              מקליט…
            </span>
            <span className="tabular-nums text-muted" dir="ltr" aria-hidden="true">
              {formatElapsed(elapsed)}
            </span>
            {elapsed >= MAX_VOICE_MS - VOICE_WARN_MS && (
              <span className="text-muted">מתקרב למגבלת ההקלטה</span>
            )}
          </span>
        )}

        <span
          className={`ms-auto text-xs ${remaining < 100 ? "text-accent-text" : "text-muted"}`}
          aria-hidden="true"
        >
          {remaining}
        </span>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {busy ? "שולח…" : "שליחה"}
        </button>
      </div>
    </form>
  );
}

// ── Thread ───────────────────────────────────────────────────────────────────

export default function Replies({
  postId,
  onRequireAuth,
  postAuthorId,
  initialAcceptedReplyId = null,
  onReplyCountChange,
}: {
  postId: string;
  onRequireAuth: () => void;
  /** The post's author — only they may mark a "best answer". */
  postAuthorId?: string | null;
  /** The reply already marked as the accepted answer (from the feed row). */
  initialAcceptedReplyId?: string | null;
  /** Live reply-count delta (+1 on a new reply, -1 on delete) so the parent card's
   *  💬 counter stays truthful without a refetch. */
  onReplyCountChange?: (delta: number) => void;
}) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [loading, setLoading] = useState(true);
  // The reply id whose inline "reply-to-reply" composer is open (or null).
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  // Root reply ids whose extra (beyond the first 2) children are expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // The post author's chosen "best answer" (optimistic; seeded from the feed row).
  const [acceptedReplyId, setAcceptedReplyId] = useState<string | null>(initialAcceptedReplyId);
  // Batched reply-reaction hydration for the WHOLE thread — one fetchReactions +
  // fetchMyReactions round-trip instead of two per reply bar (the old N+1).
  // Provided to the bars via ReplyReactionHydrationContext.
  const [replyReactions, setReplyReactions] = useState<Map<string, ReactionHydration>>(
    () => new Map(),
  );

  // Re-seed if the post identity / its stored accepted answer changes — adjusted
  // during render (guarded prev-value pattern), never via a setState-in-effect.
  const acceptedSeed = `${postId} ${initialAcceptedReplyId ?? ""}`;
  const [prevAcceptedSeed, setPrevAcceptedSeed] = useState(acceptedSeed);
  if (acceptedSeed !== prevAcceptedSeed) {
    setPrevAcceptedSeed(acceptedSeed);
    setAcceptedReplyId(initialAcceptedReplyId);
  }

  // The reload skeleton for a NEW thread/viewer is adjusted during render off the
  // same key the fetch effect uses; the effect only starts the fetch (state lands
  // in the continuations).
  const threadKey = `${postId} ${user?.id ?? ""}`;
  const [prevThreadKey, setPrevThreadKey] = useState(threadKey);
  if (threadKey !== prevThreadKey) {
    setPrevThreadKey(threadKey);
    setLoading(true);
  }

  useEffect(() => {
    let active = true;
    fetchReplies(postId, user?.id)
      .then((rows) => {
        if (!active) return;
        setReplies(rows);
        // Hydrate the thread's reply reactions in ONE batch per concern.
        const ids = rows.map((r) => r.id);
        void Promise.all([
          fetchReactions("reply", ids),
          fetchMyReactions("reply", ids),
        ]).then(([summaries, mine]) => {
          if (!active) return;
          setReplyReactions(() => {
            const next = new Map<string, ReactionHydration>();
            for (const id of ids) {
              next.set(id, {
                summaries: summaries.get(id) ?? [],
                mine: mine.get(id) ?? null,
              });
            }
            return next;
          });
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId, user?.id]);

  const handleReplied = useCallback(
    (reply: CommunityReply) => {
      setReplies((prev) => (prev.some((r) => r.id === reply.id) ? prev : [...prev, reply]));
      // A brand-new reply has no reactions yet — seed an empty batched entry so
      // its bar renders immediately instead of waiting on the thread batch.
      setReplyReactions((prev) => {
        if (prev.has(reply.id)) return prev;
        const next = new Map(prev);
        next.set(reply.id, { summaries: [], mine: null });
        return next;
      });
      setReplyingTo(null); // close any open inline composer
      onReplyCountChange?.(1);
    },
    [onReplyCountChange],
  );

  const handleDeleted = useCallback(
    (id: string) => {
      setReplies((prev) => prev.filter((r) => r.id !== id));
      // If the deleted reply was the accepted answer, clear it locally (the DB FK
      // ON DELETE SET NULL already cleared it server-side).
      setAcceptedReplyId((cur) => (cur === id ? null : cur));
      onReplyCountChange?.(-1);
    },
    [onReplyCountChange],
  );

  const uid = user?.id ?? null;
  const isPostAuthor = !!uid && !!postAuthorId && uid === postAuthorId;

  // Toggle a reply as the accepted answer. Optimistic; reverts on failure.
  const handleSetAccepted = useCallback(
    async (replyId: string | null) => {
      const prev = acceptedReplyId;
      setAcceptedReplyId(replyId);
      const ok = await setAcceptedReply(postId, replyId);
      if (!ok) setAcceptedReplyId(prev);
    },
    [acceptedReplyId, postId],
  );

  // Float the accepted root reply to the top of the thread (shared helper).
  const tree = toReplyTree(replies);
  const sortedTree = orderByAccepted(tree, acceptedReplyId).ordered;
  const CHILD_PREVIEW = 2;

  return (
    // Provider (no DOM) for the thread-batched reply reactions — reaches every
    // <ReactionBar target="reply"> below without threading through <ReplyItem>.
    <ReplyReactionHydrationContext.Provider value={replyReactions}>
    <section aria-label="תגובות לפוסט" className="mt-3 space-y-3">
      {loading ? (
        <ul className="space-y-3" aria-hidden="true">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="flex gap-3 rounded-2xl border border-border bg-surface p-3"
            >
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted/20" />
              <div className="flex-1 space-y-2 py-1">
                <span className="block h-3 w-24 animate-pulse rounded bg-muted/20" />
                <span className="block h-3 w-3/4 animate-pulse rounded bg-muted/20" />
              </div>
            </li>
          ))}
        </ul>
      ) : sortedTree.length === 0 ? (
        <p className="px-1 text-sm text-muted">אין עדיין תגובות. היו הראשונים להגיב.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {sortedTree.map((root) => {
            const kids = root.children;
            const shownKids = expanded.has(root.id) ? kids : kids.slice(0, CHILD_PREVIEW);
            const hidden = kids.length - shownKids.length;
            return (
              <li key={root.id} className="space-y-2">
                <ReplyItem
                  reply={root}
                  isOwn={!!uid && uid === root.user_id}
                  userId={uid}
                  onRequireAuth={onRequireAuth}
                  onDelete={handleDeleted}
                  onReply={() => setReplyingTo(root.id)}
                  isAccepted={root.id === acceptedReplyId}
                  canAccept={isPostAuthor}
                  onSetAccepted={handleSetAccepted}
                />

                {(kids.length > 0 || replyingTo === root.id) && (
                  <ul className="space-y-2 border-s-2 border-border ps-3 ms-4" role="list">
                    {shownKids.map((child) => (
                      <li key={child.id} className="space-y-2">
                        <ReplyItem
                          reply={child}
                          isOwn={!!uid && uid === child.user_id}
                          userId={uid}
                          onRequireAuth={onRequireAuth}
                          onDelete={handleDeleted}
                          onReply={() => setReplyingTo(child.id)}
                        />
                        {replyingTo === child.id && (
                          <ReplyComposer
                            postId={postId}
                            onReplied={handleReplied}
                            onRequireAuth={onRequireAuth}
                            parentReplyId={child.id}
                            replyingToName={child.author}
                            onCancel={() => setReplyingTo(null)}
                            autoFocus
                          />
                        )}
                      </li>
                    ))}

                    {hidden > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => new Set(prev).add(root.id))}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-accent-text transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          הצגת {hidden.toLocaleString("he-IL")} תגובות נוספות
                        </button>
                      </li>
                    )}

                    {replyingTo === root.id && (
                      <li>
                        <ReplyComposer
                          postId={postId}
                          onReplied={handleReplied}
                          onRequireAuth={onRequireAuth}
                          parentReplyId={root.id}
                          replyingToName={root.author}
                          onCancel={() => setReplyingTo(null)}
                          autoFocus
                        />
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ReplyComposer postId={postId} onReplied={handleReplied} onRequireAuth={onRequireAuth} />
    </section>
    </ReplyReactionHydrationContext.Provider>
  );
}
