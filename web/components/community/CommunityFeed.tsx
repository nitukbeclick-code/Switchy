"use client";

// ────────────────────────────────────────────────────────────────────────────
// <CommunityFeed> — the community orchestrator.
//
// Ties the whole social surface together: the <PostComposer> at the top, channel
// tabs ([הכל, ...CHANNELS]), a recent|popular sort, an infinite "load older"
// pager, and the list of <PostCard>s. It owns the single <AuthModal> that every
// gated child action opens through `onRequireAuth`, and it hydrates the viewer's
// block list so blocked authors never appear (in the initial page, in older
// pages, and in Realtime inserts).
//
// Realtime: a Supabase channel subscribes to INSERTs on `community_posts`. New
// rows are PREPENDED live — de-duped against what's already on screen and filtered
// against the viewer's block list. This is the ONLY place the feed touches
// getBrowserSupabase() directly (for the Realtime channel); every read/write still
// goes through the lib/community data layer.
//
// SECURITY: no user content is ever injected as markup here — posts render through
// <PostCard> (JSX, auto-escaped) and media through <MediaView> (URL only as src).
// The Realtime payload is treated as untrusted data and shaped into a typed
// CommunityPost before it ever reaches a child.
//
// DESIGN: premium-2026 tokens only, rounded-2xl cards, hairline borders + soft
// shadows, RTL-safe logical properties, dark-mode via tokens, real <button>s with
// aria-labels + visible focus rings, prefers-reduced-motion neutral (via the
// shared .reveal / .stagger utilities), loading skeletons + a friendly empty
// state.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALL_CHANNEL,
  CHANNELS,
  fetchFeed,
  fetchMyBlocks,
  type Channel,
  type CommunityPost,
} from "@/lib/community";
import { useAuth } from "@/lib/auth-context";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import AuthModal from "@/components/auth/AuthModal";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";

type SortMode = "recent" | "popular";
type Tab = typeof ALL_CHANNEL | Channel;

const PAGE_SIZE = 20;
const TABS: Tab[] = [ALL_CHANNEL, ...CHANNELS];

// ── Loading skeleton ───────────────────────────────────────────────────────────

function PostSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-2xl border border-border bg-surface p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-border/70" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-32 animate-pulse rounded bg-border/70" />
          <div className="h-2.5 w-20 animate-pulse rounded bg-border/60" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-border/60" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-border/60" />
      </div>
    </div>
  );
}

// ── Feed ───────────────────────────────────────────────────────────────────────

export default function CommunityFeed() {
  const { user, ready } = useAuth();

  const [authOpen, setAuthOpen] = useState(false);
  const onRequireAuth = useCallback(() => setAuthOpen(true), []);

  const [tab, setTab] = useState<Tab>(ALL_CHANNEL);
  const [sort, setSort] = useState<SortMode>("recent");

  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); // first page of the current tab
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  // The first page waits for the block list to settle so a signed-in viewer fetches
  // once (not twice). Announcements go to a small sr-only polite region, so the
  // whole post list is never a live region.
  const [blocksReady, setBlocksReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Keep the current block list in a ref so the Realtime handler (bound once)
  // always sees the freshest value without re-subscribing.
  const blockedRef = useRef<string[]>([]);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  const sortPosts = useCallback(
    (rows: CommunityPost[], mode: SortMode): CommunityPost[] => {
      if (mode === "popular") {
        // Stable-ish popular sort: most-liked first, newest as the tiebreaker.
        return [...rows].sort((a, b) => {
          if (b.like_count !== a.like_count) return b.like_count - a.like_count;
          return b.created_at.localeCompare(a.created_at);
        });
      }
      // recent — newest first (the feed query already returns this order).
      return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    [],
  );

  // ── Load the viewer's block list (or clear it when signed out) ────────────────
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setBlocked([]);
      setBlocksReady(true);
      return;
    }
    let active = true;
    setBlocksReady(false);
    void fetchMyBlocks(user.id).then((ids) => {
      if (active) {
        setBlocked(ids);
        setBlocksReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [ready, user]);

  // ── Load the first page whenever the tab, sort, viewer, or blocks change ──────
  useEffect(() => {
    if (!ready || !blocksReady) return;
    let active = true;
    setLoading(true);
    setReachedEnd(false);
    void fetchFeed({
      channel: tab,
      viewerId: user?.id ?? null,
      blocked,
      limit: PAGE_SIZE,
    }).then((rows) => {
      if (!active) return;
      setPosts(sortPosts(rows, sort));
      setReachedEnd(rows.length < PAGE_SIZE);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ready, blocksReady, tab, sort, user?.id, blocked, sortPosts]);

  // ── Realtime: prepend live INSERTs on community_posts ─────────────────────────
  useEffect(() => {
    if (!ready) return;
    const sb = getBrowserSupabase();
    const channel = sb
      .channel("community_posts_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "community_posts" },
        (payload) => {
          const row = payload.new as Partial<CommunityPost> | null;
          if (!row || !row.id || !row.user_id) return;

          // Never surface a blocked author's post.
          if (blockedRef.current.includes(row.user_id)) return;
          // Flagged rows are moderated out (moderation runs on insert); only the
          // author sees their own via the initial page load, never via Realtime.
          if (row.is_flagged) return;

          // Shape the untrusted payload into a typed post (data only — rendering
          // happens through <PostCard>/<MediaView>, which escape all of it).
          const post: CommunityPost = {
            id: row.id,
            user_id: row.user_id,
            author: row.author ?? "משתמש",
            avatar: row.avatar ?? null,
            channel: row.channel ?? "",
            body: row.body ?? "",
            media_type: row.media_type ?? null,
            media_url: row.media_url ?? null,
            media_duration_ms: row.media_duration_ms ?? null,
            created_at: row.created_at ?? new Date().toISOString(),
            is_flagged: false,
            moderation_note: row.moderation_note ?? null,
            like_count: row.like_count ?? 0,
            reply_count: row.reply_count ?? 0,
          };

          setPosts((prev) => {
            // Skip if already present (e.g. our own optimistic prepend).
            if (prev.some((p) => p.id === post.id)) return prev;
            // Respect the active channel filter.
            if (tab !== ALL_CHANNEL && post.channel !== tab) return prev;
            // Fresh inserts belong at the top; re-apply the current sort so the
            // popular view stays ordered.
            return sortPosts([post, ...prev], sort);
          });
        },
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [ready, tab, sort, sortPosts]);

  // ── Prepend a freshly-composed post (from <PostComposer>) ─────────────────────
  const prepend = useCallback(
    (post: CommunityPost) => {
      setPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        // Only show it in the current tab if it matches the active channel.
        if (tab !== ALL_CHANNEL && post.channel !== tab) return prev;
        return sortPosts([post, ...prev], sort);
      });
      setStatusMsg("הפוסט פורסם ונוסף לפיד.");
    },
    [tab, sort, sortPosts],
  );

  // ── Drop a deleted post (from <PostCard>) ─────────────────────────────────────
  const handleDeleted = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ── Load an older page (cursor = the oldest loaded created_at) ────────────────
  const loadOlder = useCallback(async () => {
    if (loadingMore || reachedEnd || posts.length === 0) return;
    // The cursor is the OLDEST post by time, regardless of the current sort.
    let oldest = posts[0].created_at;
    for (const p of posts) {
      if (p.created_at < oldest) oldest = p.created_at;
    }
    setLoadingMore(true);
    const older = await fetchFeed({
      channel: tab,
      before: oldest,
      viewerId: user?.id ?? null,
      blocked,
      limit: PAGE_SIZE,
    });
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const merged = [...prev, ...older.filter((p) => !seen.has(p.id))];
      return sortPosts(merged, sort);
    });
    setReachedEnd(older.length < PAGE_SIZE);
    setLoadingMore(false);
  }, [loadingMore, reachedEnd, posts, tab, user?.id, blocked, sort, sortPosts]);

  // ── Infinite scroll: observe a sentinel at the end of the list ────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlder();
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [loadOlder]);

  // ── Render ───────────────────────────────────────────────────────────────────

  const tabBtn =
    "interactive press whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const sortBtn =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="flex flex-col gap-4">
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      {/* Composer */}
      <PostComposer onPosted={prepend} onRequireAuth={onRequireAuth} />

      {/* Channel tabs */}
      <div
        role="group"
        aria-label="ערוצי הקהילה"
        className="flex gap-2 overflow-x-auto pb-1"
      >
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(t)}
              className={`${tabBtn} ${
                active
                  ? "border-accent bg-accent text-accent-contrast shadow-soft"
                  : "border-border bg-surface text-muted hover:text-ink [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* Sort control */}
      <div className="flex items-center justify-end gap-1" role="group" aria-label="מיון הפוסטים">
        <button
          type="button"
          onClick={() => setSort("recent")}
          aria-pressed={sort === "recent"}
          className={`${sortBtn} ${
            sort === "recent"
              ? "bg-accent/10 text-accent-text"
              : "text-muted hover:text-ink"
          }`}
        >
          החדשים ביותר
        </button>
        <button
          type="button"
          onClick={() => setSort("popular")}
          aria-pressed={sort === "popular"}
          className={`${sortBtn} ${
            sort === "popular"
              ? "bg-accent/10 text-accent-text"
              : "text-muted hover:text-ink"
          }`}
        >
          הפופולריים
        </button>
      </div>

      {/* A small polite live region announces feed changes — the list itself is
          NOT a live region (that re-announces every post on each insert). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMsg}
      </p>

      {/* Feed */}
      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="flex flex-col gap-4">
            <PostSkeleton />
            <PostSkeleton />
            <PostSkeleton />
          </div>
        ) : posts.length === 0 ? (
          <div className="bento p-8 text-center">
            <p className="text-base font-semibold text-ink">
              עדיין אין פוסטים כאן
            </p>
            <p className="mt-1 text-sm text-muted">
              {tab === ALL_CHANNEL
                ? "היו הראשונים לשתף חוויה, לשאול שאלה או להמליץ על ספק."
                : `אין עדיין פוסטים בערוץ "${tab}". פתחו את השיחה.`}
            </p>
          </div>
        ) : (
          <ul className="stagger flex list-none flex-col gap-4 p-0">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  onRequireAuth={onRequireAuth}
                  onDeleted={handleDeleted}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Pager: infinite-scroll sentinel + an explicit fallback button */}
        {!loading && posts.length > 0 && !reachedEnd && (
          <>
            <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingMore}
                className="interactive press inline-flex items-center justify-center rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {loadingMore ? "טוען…" : "טעינת פוסטים ישנים יותר"}
              </button>
            </div>
          </>
        )}

        {!loading && posts.length > 0 && reachedEnd && (
          <p className="py-2 text-center text-xs text-muted">
            הגעתם לסוף הפיד.
          </p>
        )}
      </div>
    </div>
  );
}
