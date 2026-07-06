"use client";

// ────────────────────────────────────────────────────────────────────────────
// <PostComposer> — the "write a post" card at the top of the community feed.
//
// Signed-out: a friendly "התחברו כדי לפרסם" prompt whose button calls
// onRequireAuth() (the feed opens the <AuthModal>). Signed-in: a channel <select>
// (CHANNELS), a body <textarea> (capped at MAX_BODY), one optional attachment —
// either a picked image/video (file input, validated + uploaded via
// media-upload) OR a recorded voice note (startRecording → stop → blob) — a live
// <MediaView> preview, and a submit that uploads the media (when present) then
// createPost(authorRef, channel, {body, media}). On success it clears and calls
// onPosted(post) so the feed can prepend it optimistically.
//
// SECURITY: no user content is ever injected as markup — the body is a controlled
// value rendered through React (auto-escaped) and the preview renders through
// <MediaView>, which uses the media URL only as an element `src`. Media/avatar
// URLs are UNTRUSTED and never interpolated into raw HTML.
//
// DESIGN: premium-2026 tokens only, rounded-2xl surface, hairline border, RTL-safe
// (logical properties), dark-mode via tokens, real <button>s with aria-labels and
// visible focus rings, prefers-reduced-motion neutral.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from "react";
import {
  CHANNELS,
  MAX_BODY,
  createPost,
  type AuthorRef,
  type Channel,
  type CommunityPost,
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

export interface PostComposerProps {
  /** Called with the freshly-created post so the feed can prepend it. */
  onPosted: (post: CommunityPost) => void;
  /** Called when a signed-out visitor tries to post — opens the auth modal. */
  onRequireAuth: () => void;
}

/** Hard cap on a single voice note (ms) — auto-stops before the audio size
 *  budget is exceeded, so a long recording fails fast in-UI instead of only at
 *  upload with a generic error. */
const MAX_VOICE_MS = 5 * 60 * 1000;
/** How long before the cap to surface a subtle "approaching the limit" note. */
const VOICE_WARN_MS = 30 * 1000;

/** mm:ss from a live recording length (ms). */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Avatar bubble — a plain <img> when there's a URL (UNTRUSTED, used only as src),
 *  otherwise the first initial on a soft accent chip. */
function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  const initial = (name || "מ").trim().charAt(0) || "מ";
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent-text"
    >
      {initial}
    </span>
  );
}

export default function PostComposer({ onPosted, onRequireAuth }: PostComposerProps) {
  const { user, profile } = useAuth();

  const [channel, setChannel] = useState<Channel>(CHANNELS[0]);
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<Media | null>(null);

  const [busy, setBusy] = useState(false); // uploading media OR submitting
  const [uploading, setUploading] = useState(false); // media upload in flight
  const [error, setError] = useState<string | null>(null);

  // Voice recording state.
  const recorderRef = useRef<Recorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recStartRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const bodyId = useId();
  const channelId = useId();

  const remaining = MAX_BODY - body.length;
  const canSubmit =
    !!user && !busy && !recording && (body.trim().length > 0 || media !== null);

  // Cleanup any in-flight recording / timer on unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        recorderRef.current?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ── Signed-out prompt ──────────────────────────────────────────────────────
  if (!user) {
    return (
      <section
        aria-label="פרסום בקהילה"
        className="bento p-6 text-center"
      >
        <p className="text-sm text-foreground">
          רוצים לשתף חוויה, לשאול שאלה או להמליץ על ספק?
        </p>
        <p className="mt-1 text-xs text-muted">
          התחברו כדי לפרסם בקהילה — זה חינם ולוקח רגע.
        </p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="interactive press mt-4 inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast shadow-soft ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          התחברו כדי לפרסם
        </button>
      </section>
    );
  }

  const authorName = profile?.name || "משתמש";
  const authorAvatar = profile?.avatar_url ?? null;

  // ── Media: pick a file (image / video) ───────────────────────────────────────
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the SAME file still fires onChange.
    e.target.value = "";
    if (!file || !user) return;
    setError(null);

    const v = validateMedia({ type: file.type, size: file.size });
    if (!v.ok) {
      setError(v.error);
      return;
    }

    setBusy(true);
    setUploading(true);
    try {
      const uploaded = await uploadMedia(user.id, file);
      setMedia(uploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת המדיה נכשלה. נסו שוב.");
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  // ── Media: voice recording ───────────────────────────────────────────────────
  async function startVoice() {
    if (!user || recording || busy) return;
    setError(null);
    try {
      const rec = await startRecording();
      recorderRef.current = rec;
      recStartRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      tickRef.current = setInterval(() => {
        const next = Date.now() - recStartRef.current;
        setElapsed(next);
        // Auto-stop at the cap so a recording never exceeds the size budget.
        if (next >= MAX_VOICE_MS) {
          void stopVoice();
        }
      }, 250);
    } catch {
      setError("לא ניתן לגשת למיקרופון. בדקו את ההרשאות ונסו שוב.");
    }
  }

  function stopTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function stopVoice() {
    const rec = recorderRef.current;
    if (!rec || !user) return;
    stopTick();
    setRecording(false);
    setBusy(true);
    setUploading(true);
    try {
      const { blob, durationMs } = await rec.stop();
      recorderRef.current = null;
      const uploaded = await uploadMedia(user.id, blob, durationMs);
      setMedia(uploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "העלאת ההקלטה נכשלה. נסו שוב.");
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  function cancelVoice() {
    stopTick();
    setRecording(false);
    try {
      recorderRef.current?.cancel();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    setElapsed(0);
  }

  function removeMedia() {
    setMedia(null);
    setError(null);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const author: AuthorRef = {
        user_id: user.id,
        author: authorName,
        avatar: authorAvatar,
      };
      const post = await createPost(author, channel, {
        body: body.trim(),
        media,
      });
      if (!post) {
        setError("הפרסום נכשל. נסו שוב בעוד רגע.");
        return;
      }
      // Clear the composer and hand the new post up to the feed.
      setBody("");
      setMedia(null);
      setChannel(CHANNELS[0]);
      // Success signal — non-PII channel + whether media was attached.
      trackEvent("post_created", {
        channel: post.channel,
        has_media: post.media_type != null,
      });
      onPosted(post);
    } catch {
      setError("אירעה שגיאה בפרסום. נסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="פרסום בקהילה" className="bento p-4 sm:p-6">
      <form onSubmit={onSubmit} noValidate>
        <div className="flex items-start gap-3">
          <Avatar name={authorName} url={authorAvatar} />

          <div className="min-w-0 flex-1">
            {/* Channel */}
            <div className="mb-3">
              <label
                htmlFor={channelId}
                className="mb-1 block text-xs font-medium text-muted"
              >
                ערוץ
              </label>
              <select
                id={channelId}
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                disabled={busy || recording}
                className="interactive w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Body */}
            <label htmlFor={bodyId} className="sr-only">
              תוכן הפוסט
            </label>
            <textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
              maxLength={MAX_BODY}
              rows={3}
              dir="rtl"
              placeholder="שתפו חוויה, שאלו שאלה או המליצו על ספק…"
              disabled={busy || recording}
              aria-describedby={`${bodyId}-count`}
              className="interactive min-h-[5rem] w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
            />
            <p
              id={`${bodyId}-count`}
              className="mt-1 text-start text-xs text-muted"
            >
              נותרו {remaining.toLocaleString("he-IL")} תווים
            </p>

            {/* Media preview */}
            {media && (
              <div className="mt-1">
                <MediaView media={media} />
                <button
                  type="button"
                  onClick={removeMedia}
                  disabled={busy}
                  className="interactive press mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                  aria-label="הסרת המדיה שצורפה"
                >
                  <span aria-hidden="true">✕</span>
                  הסרת המדיה
                </button>
              </div>
            )}

            {/* Recording bar */}
            {recording && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger motion-safe:animate-pulse"
                />
                {/* Only the static state is a live region; the ticking timer is
                    hidden from AT so it is not re-announced on every update. */}
                <span className="text-sm text-foreground" role="status" aria-live="polite">
                  מקליט…
                </span>
                <span className="text-xs text-muted" dir="ltr" aria-hidden="true">
                  {formatElapsed(elapsed)}
                </span>
                {elapsed >= MAX_VOICE_MS - VOICE_WARN_MS && (
                  <span className="text-xs text-muted">מתקרב למגבלת ההקלטה</span>
                )}
                <div className="ms-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelVoice}
                    className="interactive press rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={stopVoice}
                    className="interactive press rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-contrast ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    סיום הקלטה
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <p role="alert" className="mt-3 text-sm text-danger-text">
                {error}
              </p>
            )}

            {/* Action row */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {/* Attach image / video */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={onPickFile}
                disabled={busy || recording || media !== null}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || recording || media !== null}
                className="interactive press inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="צירוף תמונה או וידאו"
              >
                <span aria-hidden="true">🖼️</span>
                <span>תמונה / וידאו</span>
              </button>

              {/* Record voice */}
              {!recording && (
                <button
                  type="button"
                  onClick={startVoice}
                  disabled={busy || media !== null}
                  className="interactive press inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-border/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="הקלטת הודעה קולית"
                >
                  <span aria-hidden="true">🎤</span>
                  <span>הקלטה קולית</span>
                </button>
              )}

              {uploading && (
                <span className="text-xs text-muted" role="status" aria-live="polite">
                  מעלה מדיה…
                </span>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit}
                aria-disabled={!canSubmit}
                className="interactive press ms-auto inline-flex items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-contrast shadow-soft ease-[var(--ease-out)] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-accent-hover [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {busy && !uploading ? "מפרסם…" : "פרסום"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
