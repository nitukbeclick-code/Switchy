"use client";

// ────────────────────────────────────────────────────────────────────────────
// <PostCard> — a single community post in the feed.
//
// Renders the author (avatar + name, verified-customer badge when the row carries
// it), the channel chip, a relative Hebrew timestamp, the body (with @mentions
// bolded), and any attached media via <MediaView>. The action row offers like
// (optimistic, own like-state hydrated via fetchMyLikes on mount), a reply toggle
// that expands the <Replies> thread, bookmark, and a "⋯" overflow menu with report
// / block / (own only) delete. Every gated action falls back to onRequireAuth()
// for guests. The author's own flagged post shows an "under review" note.
//
// SECURITY: all user content is rendered through JSX {} (React auto-escapes) —
// never dangerouslySetInnerHTML. The media URL reaches the DOM only as the `src`
// of the plain element inside <MediaView>.
//
// Design: premium-2026 tokens only, rounded-2xl card, hairline border + soft
// shadow, RTL logical properties, dark-mode via tokens, real <button>s with
// aria-labels + visible focus rings, a proper role="menu", reduced-motion safe.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  deletePost,
  fetchMyBookmarks,
  fetchMyLikes,
  MENTION_RE,
  reportContent,
  setBlock,
  setBookmark,
  setLike,
  setPinned,
  type CommunityPost,
  type Media,
} from "@/lib/community";
import { useAuth } from "@/lib/auth-context";
import MediaView from "./MediaView";
import Replies from "./Replies";

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
        className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-accent/15 text-sm font-semibold text-accent-text"
    >
      {initial(name)}
    </span>
  );
}

// ── Overflow (⋯) menu ──────────────────────────────────────────────────────────

function OverflowMenu({
  isOwn,
  isAdmin,
  isPinned,
  onTogglePin,
  pinning,
  onReport,
  onBlock,
  onDelete,
  deleting,
}: {
  isOwn: boolean;
  isAdmin: boolean;
  isPinned: boolean;
  onTogglePin: () => void;
  pinning: boolean;
  onReport: () => void;
  onBlock: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAndClose = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const itemClass =
    "block w-full rounded-lg px-3 py-2 text-start text-sm text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="פעולות נוספות"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg leading-none text-muted transition-colors hover:bg-accent/10 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="פעולות על הפוסט"
          className="popover absolute end-0 top-full z-20 mt-1 min-w-44 rounded-2xl border border-border bg-surface p-1 shadow-float"
          style={{ ["--popover-origin" as string]: "top left" }}
        >
          {isAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAndClose(onTogglePin)}
              disabled={pinning}
              className={itemClass}
            >
              {pinning ? "מעדכן…" : isPinned ? "ביטול הצמדה" : "הצמדה לראש הפיד"}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onReport)}
            className={itemClass}
          >
            דיווח על תוכן
          </button>
          {!isOwn && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAndClose(onBlock)}
              className={itemClass}
            >
              חסימת המשתמש
            </button>
          )}
          {isOwn && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAndClose(onDelete)}
              disabled={deleting}
              className={`${itemClass} text-danger-text hover:bg-danger/10`}
            >
              {deleting ? "מוחק…" : "מחיקת הפוסט"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────

export default function PostCard({
  post,
  onRequireAuth,
  onDeleted,
}: {
  post: CommunityPost;
  onRequireAuth: () => void;
  onDeleted?: (id: string) => void;
}) {
  const { user, profile } = useAuth();
  const isOwn = !!user && user.id === post.user_id;
  const isAdmin = !!profile?.is_admin;

  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [bookmarked, setBookmarked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);

  const [showReplies, setShowReplies] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinned, setPinnedLocal] = useState(post.is_pinned);
  const [pinning, setPinning] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);

  const repliesId = useId();

  // Keep the visible like count in sync if the post prop is replaced (e.g. re-sort).
  useEffect(() => {
    setLikeCount(post.like_count);
  }, [post.like_count]);

  // Keep the pinned state in sync if the post prop is replaced.
  useEffect(() => {
    setPinnedLocal(post.is_pinned);
  }, [post.is_pinned]);

  // Hydrate the viewer's own like + bookmark state for this post on mount.
  useEffect(() => {
    if (!user) {
      setLiked(false);
      setBookmarked(false);
      return;
    }
    let active = true;
    void fetchMyLikes([post.id]).then((set) => {
      if (active) setLiked(set.has(post.id));
    });
    void fetchMyBookmarks([post.id]).then((set) => {
      if (active) setBookmarked(set.has(post.id));
    });
    return () => {
      active = false;
    };
  }, [user, post.id]);

  const media: Media | null = post.media_url
    ? {
        type: post.media_type ?? "image",
        url: post.media_url,
        durationMs: post.media_duration_ms,
      }
    : null;

  // ── Like (optimistic) ────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (likeBusy) return;
    const next = !liked;
    // Optimistic flip.
    setLiked(next);
    setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    setLikeBusy(true);
    const ok = await setLike(post.id, user.id, next);
    if (!ok) {
      // Revert on failure.
      setLiked(!next);
      setLikeCount((c) => Math.max(0, c + (next ? -1 : 1)));
    }
    setLikeBusy(false);
  }, [user, likeBusy, liked, post.id, onRequireAuth]);

  // ── Bookmark ─────────────────────────────────────────────────────────────────
  const handleBookmark = useCallback(async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (bookmarkBusy) return;
    const next = !bookmarked;
    setBookmarked(next);
    setBookmarkBusy(true);
    const ok = await setBookmark(post.id, user.id, next);
    if (!ok) setBookmarked(!next);
    setBookmarkBusy(false);
  }, [user, bookmarkBusy, bookmarked, post.id, onRequireAuth]);

  // ── Reply toggle ─────────────────────────────────────────────────────────────
  const handleToggleReplies = useCallback(() => {
    setShowReplies((v) => !v);
  }, []);

  // ── Report ───────────────────────────────────────────────────────────────────
  const handleReport = useCallback(async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    const ok = await reportContent("post", post.id, user.id, "");
    setNotice(ok ? "תודה, הדיווח התקבל וייבדק." : "הדיווח נכשל. נסו שוב.");
    setNoticeError(!ok);
  }, [user, post.id, onRequireAuth]);

  // ── Block ────────────────────────────────────────────────────────────────────
  const handleBlock = useCallback(async () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    const ok = await setBlock(user.id, post.user_id, true);
    if (ok) {
      setBlocked(true);
      setNotice("המשתמש נחסם. לא יוצגו לך עוד פוסטים ממנו.");
      setNoticeError(false);
    } else {
      setNotice("החסימה נכשלה. נסו שוב.");
      setNoticeError(true);
    }
  }, [user, post.user_id, onRequireAuth]);

  // ── Delete (own) ─────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!isOwn || deleting) return;
    setDeleting(true);
    const ok = await deletePost(post.id);
    if (ok) {
      onDeleted?.(post.id);
    } else {
      setDeleting(false);
      setNotice("מחיקת הפוסט נכשלה. נסו שוב.");
      setNoticeError(true);
    }
  }, [isOwn, deleting, post.id, onDeleted]);

  // ── Pin / unpin (admin) ──────────────────────────────────────────────────────
  const handleTogglePin = useCallback(async () => {
    if (!isAdmin || pinning) return;
    const next = !pinned;
    setPinning(true);
    setPinnedLocal(next); // optimistic
    const ok = await setPinned(post.id, next);
    if (!ok) {
      setPinnedLocal(!next); // revert (RLS rejected / network)
      setNotice("עדכון ההצמדה נכשל.");
      setNoticeError(true);
    }
    setPinning(false);
  }, [isAdmin, pinning, pinned, post.id]);

  // Once blocked, collapse the card to a small confirmation (the feed drops it on
  // its next load; hiding the content immediately makes the block feel instant).
  if (blocked) {
    return (
      <article className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted shadow-soft">
        {notice ?? "המשתמש נחסם."}
      </article>
    );
  }

  const actionBtn =
    "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      {/* Header: avatar + author + meta + overflow menu */}
      <div className="flex items-start gap-3">
        <Avatar src={post.avatar} name={post.author} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-ink">
              {post.author}
            </span>

            {pinned && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[0.7rem] font-semibold text-accent-text"
                aria-label="פוסט מוצמד"
              >
                <span aria-hidden="true">📌</span> מוצמד
              </span>
            )}

            {isOwn && (
              <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[0.7rem] font-medium text-accent-text">
                אני
              </span>
            )}

            <span
              className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.7rem] font-medium text-muted"
              title={`ערוץ ${post.channel}`}
            >
              {post.channel}
            </span>
          </div>

          <time
            dateTime={post.created_at}
            className="mt-0.5 block text-xs text-muted"
            title={post.created_at}
          >
            {relativeTime(post.created_at)}
          </time>
        </div>

        <OverflowMenu
          isOwn={isOwn}
          isAdmin={isAdmin}
          isPinned={pinned}
          onTogglePin={handleTogglePin}
          pinning={pinning}
          onReport={handleReport}
          onBlock={handleBlock}
          onDelete={handleDelete}
          deleting={deleting}
        />
      </div>

      {/* Body */}
      {post.body && (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
          {renderBody(post.body)}
        </p>
      )}

      {/* Media */}
      {media && <MediaView media={media} />}

      {/* Own flagged → under-review note */}
      {isOwn && post.is_flagged && (
        <p className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-xs text-muted">
          בבדיקת מנהל
        </p>
      )}

      {/* Action feedback (report / block / errors) */}
      {notice && (
        <p
          role={noticeError ? "alert" : "status"}
          className={`mt-3 text-xs ${noticeError ? "text-red-600 dark:text-red-400" : "text-accent-text"}`}
        >
          {notice}
        </p>
      )}

      {/* Action row */}
      <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
        <button
          type="button"
          onClick={handleLike}
          disabled={likeBusy}
          aria-pressed={liked}
          aria-label={liked ? "ביטול לייק" : "לייק"}
          className={`${actionBtn} ${liked ? "text-accent-text" : "text-muted hover:text-ink"}`}
        >
          <span aria-hidden="true">{liked ? "❤️" : "🤍"}</span>
          <span className="nums-tabular tabular-nums">{likeCount}</span>
        </button>

        <button
          type="button"
          onClick={handleToggleReplies}
          aria-expanded={showReplies}
          aria-controls={repliesId}
          aria-label={showReplies ? "הסתרת התגובות" : "הצגת התגובות"}
          className={`${actionBtn} text-muted hover:text-ink`}
        >
          <span aria-hidden="true">💬</span>
          <span className="nums-tabular tabular-nums">{post.reply_count}</span>
        </button>

        <button
          type="button"
          onClick={handleBookmark}
          disabled={bookmarkBusy}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "הסרת הסימנייה" : "שמירה בסימניות"}
          className={`${actionBtn} ms-auto ${bookmarked ? "text-accent-text" : "text-muted hover:text-ink"}`}
        >
          <span aria-hidden="true">{bookmarked ? "🔖" : "📑"}</span>
          <span>{bookmarked ? "נשמר" : "שמירה"}</span>
        </button>
      </div>

      {/* Replies thread */}
      {showReplies && (
        <div id={repliesId}>
          <Replies postId={post.id} onRequireAuth={onRequireAuth} />
        </div>
      )}
    </article>
  );
}
