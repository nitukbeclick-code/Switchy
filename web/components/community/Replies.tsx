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
  fetchReplies,
  MAX_BODY,
  MENTION_RE,
  toReplyTree,
  type AuthorRef,
  type CommunityReply,
  type Media,
} from "@/lib/community";
import {
  startRecording,
  uploadMedia,
  validateMedia,
  type Recorder,
} from "@/lib/media-upload";
import { useAuth } from "@/lib/auth-context";
import { trackEvent } from "@/lib/tracking";
import MediaView from "./MediaView";
import MentionTextarea from "./MentionTextarea";
import ReactionBar from "./ReactionBar";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Relative Hebrew timestamp ("לפני 5 דקות"), no external dep. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const sec = Math.max(0, Math.round(diff / 1000));
  if (sec < 45) return "לפני רגע";
  const min = Math.round(sec / 60);
  if (min < 60) return min === 1 ? "לפני דקה" : `לפני ${min} דקות`;
  const hr = Math.round(min / 60);
  if (hr < 24) return hr === 1 ? "לפני שעה" : `לפני ${hr} שעות`;
  const day = Math.round(hr / 24);
  if (day < 7) return day === 1 ? "אתמול" : `לפני ${day} ימים`;
  const wk = Math.round(day / 7);
  if (wk < 5) return wk === 1 ? "לפני שבוע" : `לפני ${wk} שבועות`;
  const mo = Math.round(day / 30);
  if (mo < 12) return mo === 1 ? "לפני חודש" : `לפני ${mo} חודשים`;
  const yr = Math.round(day / 365);
  return yr === 1 ? "לפני שנה" : `לפני ${yr} שנים`;
}

/** First rendered char of a name, for the avatar fallback monogram. */
function initial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0].toUpperCase() : "מ";
}

/** Split body into text + @mention segments; mentions render as bold spans.
 *  All segments are plain strings placed via JSX {}, so React escapes them. */
function renderBody(body: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // MENTION_RE is a shared /g regex — reset lastIndex before each use.
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(body)) !== null) {
    if (m.index > last) nodes.push(body.slice(last, m.index));
    nodes.push(
      <span key={`m${key++}`} className="font-semibold text-accent-text">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return nodes;
}

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
}: {
  reply: CommunityReply;
  isOwn: boolean;
  userId: string | null;
  onRequireAuth: () => void;
  onDelete: (id: string) => void;
  /** Open an inline "reply to this reply" composer (threading). */
  onReply?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Local body/edited state so an inline edit updates in place without a refetch.
  const [body, setBody] = useState(reply.body);
  const [editedAt, setEditedAt] = useState<string | null>(reply.edited_at);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
    const ok = await deleteReply(reply.id);
    if (ok) {
      onDelete(reply.id);
    } else {
      setBusy(false);
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
    "rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

  return (
    <div className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-float">
      <Avatar src={reply.avatar} name={reply.author} />
      <div className="min-w-0 flex-1">
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
              <p role="alert" className="mt-1 text-xs text-accent-text">
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
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="מחיקת התגובה שלי"
              className={isOwn && !editing ? smallBtn : `ms-auto ${smallBtn}`}
            >
              {busy ? "מוחק…" : "מחיקה"}
            </button>
          )}
        </div>
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
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Local object-URL preview of a picked/recorded blob; revoked on change/unmount.
  useEffect(() => {
    if (!pendingBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingBlob]);

  // Stop a live mic recording if the composer unmounts mid-record — otherwise the
  // MediaRecorder + getUserMedia stream leak and the OS mic indicator stays lit.
  useEffect(() => {
    return () => {
      recorder?.cancel();
    };
  }, [recorder]);

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
    if (recorder) {
      try {
        const { blob, durationMs } = await recorder.stop();
        setMedia(null);
        setPendingDurationMs(durationMs);
        setPendingBlob(blob);
      } catch {
        setError("ההקלטה נכשלה. נסו שוב.");
      } finally {
        setRecorder(null);
      }
      return;
    }
    try {
      const r = await startRecording();
      setRecorder(r);
    } catch {
      setError("לא ניתן לגשת למיקרופון. בדקו הרשאות.");
    }
  }, [recorder]);

  const canSubmit = (body.trim().length > 0 || !!pendingBlob) && !busy && !recorder;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) {
        onRequireAuth();
        return;
      }
      if (busy || recorder) return;
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
      recorder,
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
        <p role="alert" className="mt-2 text-xs text-accent-text">
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
          disabled={busy || !!recorder}
          aria-label="צירוף תמונה או וידאו"
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <span aria-hidden="true">📎</span>
          מדיה
        </button>

        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy}
          aria-label={recorder ? "עצירת ההקלטה" : "הקלטת הודעה קולית"}
          aria-pressed={!!recorder}
          className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          <span aria-hidden="true">🎤</span>
          {recorder ? "עצירה" : "קול"}
        </button>

        {recorder && (
          <span className="text-xs text-accent-text" aria-live="polite">
            מקליט…
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
}: {
  postId: string;
  onRequireAuth: () => void;
}) {
  const { user } = useAuth();
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [loading, setLoading] = useState(true);
  // The reply id whose inline "reply-to-reply" composer is open (or null).
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  // Root reply ids whose extra (beyond the first 2) children are expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReplies(postId, user?.id)
      .then((rows) => {
        if (active) setReplies(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postId, user?.id]);

  const handleReplied = useCallback((reply: CommunityReply) => {
    setReplies((prev) => (prev.some((r) => r.id === reply.id) ? prev : [...prev, reply]));
    setReplyingTo(null); // close any open inline composer
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setReplies((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const uid = user?.id ?? null;
  const tree = toReplyTree(replies);
  const CHILD_PREVIEW = 2;

  return (
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
      ) : tree.length === 0 ? (
        <p className="px-1 text-sm text-muted">אין עדיין תגובות. היו הראשונים להגיב.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {tree.map((root) => {
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
  );
}
