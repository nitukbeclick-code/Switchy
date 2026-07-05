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
  fetchReplies,
  MAX_BODY,
  MENTION_RE,
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
import MediaView from "./MediaView";

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
  onDelete,
}: {
  reply: CommunityReply;
  isOwn: boolean;
  onDelete: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

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

  return (
    <li className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-float">
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
        </div>

        {reply.body && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {renderBody(reply.body)}
          </p>
        )}

        {media && <MediaView media={media} />}

        {isOwn && reply.is_flagged && (
          <p className="mt-2 text-xs text-muted">בבדיקת מנהל</p>
        )}

        {isOwn && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              aria-label="מחיקת התגובה שלי"
              className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              {busy ? "מוחק…" : "מחיקה"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

function ReplyComposer({
  postId,
  onReplied,
  onRequireAuth,
}: {
  postId: string;
  onReplied: (reply: CommunityReply) => void;
  onRequireAuth: () => void;
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
        const created = await createReply(postId, authorRef, {
          body: body.trim(),
          media: attached,
        });
        if (!created) {
          setError("שליחת התגובה נכשלה. נסו שוב.");
          return;
        }
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

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-3">
      <label htmlFor={`reply-${postId}`} className="sr-only">
        כתיבת תגובה
      </label>
      <textarea
        id={`reply-${postId}`}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        maxLength={MAX_BODY}
        rows={2}
        dir="rtl"
        placeholder="כתבו תגובה…"
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
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setReplies((prev) => prev.filter((r) => r.id !== id));
  }, []);

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
      ) : replies.length === 0 ? (
        <p className="px-1 text-sm text-muted">אין עדיין תגובות. היו הראשונים להגיב.</p>
      ) : (
        <ul className="space-y-3" role="list">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.id}
              reply={reply}
              isOwn={!!user && user.id === reply.user_id}
              onDelete={handleDeleted}
            />
          ))}
        </ul>
      )}

      <ReplyComposer postId={postId} onReplied={handleReplied} onRequireAuth={onRequireAuth} />
    </section>
  );
}
