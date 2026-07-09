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
// aria-labels + visible focus rings, an honest button-group popover, reduced-motion safe.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  deletePost,
  editPost,
  fetchMyBookmarks,
  fetchMyLikes,
  fetchPostMedia,
  MAX_BODY,
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
import { trackEvent } from "@/lib/tracking";
import Link from "next/link";
import { matchProviders, providerBySlug } from "@/lib/providers.generated";
import MediaGallery from "./MediaGallery";
import MediaView from "./MediaView";
import ReactionBar from "./ReactionBar";
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

/** Split body into text + @mention (bold) + catalogue-provider (link) segments.
 *  Every segment is a plain string placed via JSX {} (React auto-escapes it) or a
 *  next/link whose children are plain text — raw HTML is never injected. */
function renderBody(body: string): React.ReactNode {
  type Span = { start: number; end: number; kind: "mention" | "provider"; slug?: string };
  const spans: Span[] = [];
  // @mentions (bold). matchAll on the shared /g regex — no lastIndex bookkeeping.
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    spans.push({ start, end: start + m[0].length, kind: "mention" });
  }
  // Catalogue-provider names (link) — never inside an @mention span.
  for (const p of matchProviders(body, spans)) {
    spans.push({ start: p.start, end: p.end, kind: "provider", slug: p.slug });
  }
  spans.sort((a, b) => a.start - b.start);

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const s of spans) {
    if (s.start < last) continue; // safety: drop any overlap
    if (s.start > last) nodes.push(body.slice(last, s.start));
    const text = body.slice(s.start, s.end);
    if (s.kind === "mention") {
      nodes.push(
        <span key={`s${key++}`} className="font-semibold text-accent-text">
          {text}
        </span>,
      );
    } else {
      nodes.push(
        <Link
          key={`s${key++}`}
          href={`/providers/${s.slug}`}
          className="font-medium text-accent-text underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {text}
        </Link>,
      );
    }
    last = s.end;
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
  onEdit,
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
  onEdit: () => void;
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
        aria-expanded={open}
        aria-label="פעולות נוספות"
        className="flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-full text-lg leading-none text-muted transition-colors hover:bg-accent/10 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open && (
        <div
          id={menuId}
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
            onClick={() => runAndClose(onReport)}
            className={itemClass}
          >
            דיווח על תוכן
          </button>
          {!isOwn && (
            <button
              type="button"
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
              onClick={() => runAndClose(onEdit)}
              className={itemClass}
            >
              עריכה
            </button>
          )}
          {isOwn && (
            <button
              type="button"
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

  // Body + edited marker, held locally so an inline edit updates the card in place.
  const [body, setBody] = useState(post.body);
  const [editedAt, setEditedAt] = useState(post.edited_at);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(post.body);

  const [showReplies, setShowReplies] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pinned, setPinnedLocal] = useState(post.is_pinned);
  const [pinning, setPinning] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);

  // Extra gallery images (beyond the primary media_url attachment).
  const [gallery, setGallery] = useState<Media[]>([]);

  const repliesId = useId();

  // Keep the visible like count in sync if the post prop is replaced (e.g. re-sort).
  useEffect(() => {
    setLikeCount(post.like_count);
  }, [post.like_count]);

  // Keep the visible body + edited marker in sync if the post prop is replaced.
  useEffect(() => {
    setBody(post.body);
    setDraft(post.body);
  }, [post.body]);

  useEffect(() => {
    setEditedAt(post.edited_at);
  }, [post.edited_at]);

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

  // Hydrate the extra gallery images for this post on mount.
  useEffect(() => {
    let active = true;
    void fetchPostMedia([post.id]).then((map) => {
      if (active) setGallery(map.get(post.id) ?? []);
    });
    return () => {
      active = false;
    };
  }, [post.id]);

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
    } else if (next) {
      // Fire only on the like-ADD transition (never on un-like).
      trackEvent("post_liked", { channel: post.channel });
    }
    setLikeBusy(false);
  }, [user, likeBusy, liked, post.id, post.channel, onRequireAuth]);

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

  // ── Edit (own) ───────────────────────────────────────────────────────────────
  const handleStartEdit = useCallback(() => {
    setDraft(body);
    setNotice(null);
    setNoticeError(false);
    setEditing(true);
  }, [body]);

  const handleCancelEdit = useCallback(() => {
    setDraft(body);
    setEditing(false);
  }, [body]);

  const handleSaveEdit = useCallback(async () => {
    if (saving) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === body.trim()) return;
    setSaving(true);
    const result = await editPost(post.id, trimmed);
    if (result) {
      setBody(result.body);
      setEditedAt(result.edited_at);
      setEditing(false);
      setNotice(null);
      setNoticeError(false);
    } else {
      setNotice("עריכת הפוסט נכשלה. נסו שוב.");
      setNoticeError(true);
    }
    setSaving(false);
  }, [saving, draft, body, post.id]);

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
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

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

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            <time dateTime={post.created_at} title={post.created_at}>
              {relativeTime(post.created_at)}
            </time>
            {editedAt && (
              <span
                aria-label="נערך"
                title={editedAt}
                className="text-muted"
              >
                · נערך
              </span>
            )}
            <span aria-hidden="true">·</span>
            <Link
              href={`/community/post/${post.id}`}
              className="text-muted underline underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label="קישור לפוסט"
            >
              קישור
            </Link>
          </div>
        </div>

        <OverflowMenu
          isOwn={isOwn}
          isAdmin={isAdmin}
          isPinned={pinned}
          onTogglePin={handleTogglePin}
          pinning={pinning}
          onReport={handleReport}
          onBlock={handleBlock}
          onEdit={handleStartEdit}
          onDelete={handleDelete}
          deleting={deleting}
        />
      </div>

      {/* Body — inline editor for the author, plain text otherwise */}
      {editing ? (
        <div className="mt-3">
          <textarea
            dir="rtl"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_BODY}
            rows={4}
            aria-label="עריכת הפוסט"
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving || !draft.trim() || draft.trim() === body.trim()}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        body && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
            {renderBody(body)}
          </p>
        )
      )}

      {/* Media — primary attachment + any extra gallery images.
          An image primary joins the gallery grid (primary first); a video/audio
          primary keeps its own player with the image grid below it. */}
      {media && media.type === "image" ? (
        <MediaGallery images={[media, ...gallery]} />
      ) : media ? (
        <>
          <MediaView media={media} />
          {gallery.length > 0 && <MediaGallery images={gallery} />}
        </>
      ) : (
        gallery.length > 0 && <MediaGallery images={gallery} />
      )}

      {/* Provider tag → catalogue page (when this post is about a known provider) */}
      {(() => {
        const prov = post.provider_slug ? providerBySlug(post.provider_slug) : undefined;
        if (!prov) return null;
        return (
          <Link
            href={`/providers/${prov.slug}`}
            className="press mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-accent-text transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`מעבר לעמוד הספק ${prov.name}`}
          >
            <span aria-hidden="true">🔗</span>
            על הספק: {prov.name}
          </Link>
        );
      })()}

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
          className={`mt-3 text-xs ${noticeError ? "text-danger-text" : "text-accent-text"}`}
        >
          {notice}
        </p>
      )}

      {/* Reactions (multi-emoji, on top of the binary like) */}
      <div className="mt-3">
        <ReactionBar
          target="post"
          targetId={post.id}
          userId={user?.id ?? null}
          onRequireAuth={onRequireAuth}
        />
      </div>

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
          <Replies
            postId={post.id}
            onRequireAuth={onRequireAuth}
            postAuthorId={post.user_id}
            initialAcceptedReplyId={post.accepted_reply_id}
          />
        </div>
      )}
    </article>
  );
}
