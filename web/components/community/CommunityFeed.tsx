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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_CHANNEL,
  CHANNELS,
  fetchFeed,
  fetchHighlights,
  fetchMyBlocks,
  searchPosts,
  type Channel,
  type CommunityHighlights,
  type CommunityPost,
  type ComposerPrefill,
} from "@/lib/community";
import { providerBySlug } from "@/lib/providers.generated";
import { useAuth } from "@/lib/auth-context";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { trackEvent } from "@/lib/tracking";
import AuthModal from "@/components/auth/AuthModal";
import PostComposer from "./PostComposer";
import PostCard from "./PostCard";

const INTRO_DISMISSED_KEY = "switchy_community_intro_dismissed";

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
  // "Help answer these" view — only questions with no replies yet.
  const [unanswered, setUnanswered] = useState(false);

  // ── Catalogue deep-link ("דברו על זה בקהילה") → composer prefill ──────────────
  // /community?channel=<hebrew>&provider=<slug>&draft=<text>. Safe here because the
  // page wraps <CommunityFeed> in <Suspense>. Params are validated: an unknown
  // channel or unresolvable provider slug is simply ignored (never trusted blindly).
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const prefill = useMemo<ComposerPrefill | undefined>(() => {
    const params = new URLSearchParams(searchParamsKey);
    const rawChannel = params.get("channel");
    const rawProvider = params.get("provider");
    const rawDraft = params.get("draft");

    const next: ComposerPrefill = {};
    if (rawChannel && (CHANNELS as readonly string[]).includes(rawChannel)) {
      next.channel = rawChannel as Channel;
    }
    if (rawProvider) {
      const provider = providerBySlug(rawProvider);
      if (provider) {
        next.providerSlug = provider.slug;
        next.providerName = provider.name;
      }
    }
    if (rawDraft) next.draft = rawDraft;

    // No usable params → don't seed the composer at all.
    return next.channel === undefined &&
      next.providerSlug === undefined &&
      next.draft === undefined
      ? undefined
      : next;
  }, [searchParamsKey]);

  // Seed the active tab from the deep-link channel ONCE on mount, so a later manual
  // tab click is never fought by this. Runs a single time regardless of re-renders.
  const tabSeededRef = useRef(false);
  useEffect(() => {
    if (tabSeededRef.current) return;
    tabSeededRef.current = true;
    if (prefill?.channel) setTab(prefill.channel);
  }, [prefill]);

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

  // First-visit onboarding banner. Never read localStorage during render (SSR
  // hydration safety) — start hidden, then reveal in an effect if not dismissed.
  const [introVisible, setIntroVisible] = useState(false);

  // ── Community search ──────────────────────────────────────────────────────────
  // `results === null` means "not searching" → render the normal feed. A non-null
  // array (possibly empty) means "in search mode" → render the results list.
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CommunityPost[] | null>(null);
  const [searching, setSearching] = useState(false);

  // ── Truthful trending strip ("מה חם בקהילה") ──────────────────────────────────
  // Empty arrays when there's no real 7-day activity → the strip renders nothing.
  const [highlights, setHighlights] = useState<CommunityHighlights | null>(null);

  // Keep the current block list in a ref so the Realtime handler (bound once)
  // always sees the freshest value without re-subscribing.
  const blockedRef = useRef<string[]>([]);
  useEffect(() => {
    blockedRef.current = blocked;
  }, [blocked]);

  // Keep the freshest sort/tab in refs so the Realtime handler (subscribed ONCE)
  // reads the current filter/order without re-subscribing on every sort/tab change.
  const sortRef = useRef<SortMode>(sort);
  useEffect(() => {
    sortRef.current = sort;
  }, [sort]);
  const tabRef = useRef<Tab>(tab);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Coalesce a burst of live INSERTs into a single sr-only announcement.
  const liveAnnounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard "load older" against an infinite loop: remember the last cursor used so
  // a page that yields no NEW ids ends the pager instead of re-fetching forever.
  const lastOlderCursor = useRef<string | null>(null);

  // ── First-visit onboarding banner: reveal only if not previously dismissed ────
  // Read localStorage after mount (SSR-safe) and defer the reveal to a rAF so the
  // banner state settles outside the effect's synchronous body.
  useEffect(() => {
    let dismissed = true;
    try {
      dismissed = localStorage.getItem(INTRO_DISMISSED_KEY) === "1";
    } catch {
      /* localStorage may be unavailable (private mode) — keep the banner hidden */
    }
    if (dismissed) return;
    const raf = requestAnimationFrame(() => setIntroVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const dismissIntro = useCallback(() => {
    setIntroVisible(false);
    try {
      localStorage.setItem(INTRO_DISMISSED_KEY, "1");
    } catch {
      /* no-op — hiding for this session is enough */
    }
  }, []);

  // ── GA4: one "community_dau" event per browser session per calendar day ───────
  useEffect(() => {
    if (!ready) return;
    try {
      const today = new Date().toISOString().slice(0, 10); // yyyy-mm-dd (UTC)
      const key = "swc:dau:" + today;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      trackEvent("community_dau", { authed: !!user?.id });
    } catch {
      /* sessionStorage may be unavailable — skip; tracking is best-effort */
    }
  }, [ready, user?.id]);

  const sortPosts = useCallback(
    (rows: CommunityPost[], mode: SortMode): CommunityPost[] => {
      return [...rows].sort((a, b) => {
        // Admin-pinned posts (welcome / announcements) always sit on top, in both
        // the recent and popular views.
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        if (mode === "popular" && b.like_count !== a.like_count) {
          // Most-liked first, newest as the tiebreaker.
          return b.like_count - a.like_count;
        }
        // recent (and popular tiebreaker) — newest first.
        return b.created_at.localeCompare(a.created_at);
      });
    },
    [],
  );

  // ── Load the viewer's block list (or clear it when signed out) ────────────────
  useEffect(() => {
    if (!ready) return;
    const uid = user?.id ?? null;
    if (!uid) {
      setBlocked([]);
      setBlocksReady(true);
      return;
    }
    let active = true;
    setBlocksReady(false);
    void fetchMyBlocks(uid).then((ids) => {
      if (active) {
        setBlocked(ids);
        setBlocksReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [ready, user?.id]);

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
      unansweredOnly: unanswered,
    }).then((rows) => {
      if (!active) return;
      setPosts(sortPosts(rows, sort));
      setReachedEnd(rows.length < PAGE_SIZE);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ready, blocksReady, tab, sort, unanswered, user?.id, blocked, sortPosts]);

  // ── Debounced community search (on `search` + `tab`) ──────────────────────────
  // An empty query restores the feed (results = null). A non-empty query runs
  // searchPosts scoped to the active channel; the guard drops out-of-order or
  // post-unmount responses so a fast typist never sees stale results.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchPosts(search, tab).then((rows) => {
        if (!active) return;
        setResults(rows);
        setSearching(false);
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, tab]);

  // ── Truthful trending: fetch 7-day highlights once, fail-soft ─────────────────
  useEffect(() => {
    let active = true;
    void fetchHighlights().then((h) => {
      if (active) setHighlights(h);
    });
    return () => {
      active = false;
    };
  }, []);

  // ── Realtime: prepend live INSERTs + prune late-flagged posts ─────────────────
  // Subscribed ONCE (deps are [ready] only). The handlers read the freshest
  // sort/tab/blocks from refs, so a sort or tab change never churns the channel.
  useEffect(() => {
    if (!ready) return;
    const sb = getBrowserSupabase();
    const viewerId = user?.id ?? null;
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
          // Respect the active channel filter (read from the ref, not closure).
          const activeTab = tabRef.current;
          if (activeTab !== ALL_CHANNEL && (row.channel ?? "") !== activeTab)
            return;

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
            edited_at: row.edited_at ?? null,
            is_flagged: false,
            moderation_note: row.moderation_note ?? null,
            like_count: row.like_count ?? 0,
            reply_count: row.reply_count ?? 0,
            is_pinned: row.is_pinned ?? false,
            provider_slug: row.provider_slug ?? null,
          };

          let added = false;
          setPosts((prev) => {
            // Skip if already present (e.g. our own optimistic prepend).
            if (prev.some((p) => p.id === post.id)) return prev;
            // Fresh inserts belong at the top; re-apply the current sort so the
            // popular view stays ordered.
            added = true;
            return sortPosts([post, ...prev], sortRef.current);
          });

          // Announce to screen readers only when a live post was actually added,
          // coalescing a burst so it announces once (not once per insert).
          if (added) {
            if (liveAnnounceTimer.current) clearTimeout(liveAnnounceTimer.current);
            liveAnnounceTimer.current = setTimeout(() => {
              setStatusMsg("פוסט חדש התווסף לראש הפיד");
            }, 300);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "community_posts" },
        (payload) => {
          const row = payload.new as Partial<CommunityPost> | null;
          if (!row || !row.id) return;
          const isOwnRow = !!viewerId && row.user_id === viewerId;

          // A row can be flagged shortly AFTER insert (moderation runs async), so a
          // soon-to-be-flagged post may already be on screen for everyone. When
          // is_flagged flips to true, remove it for others (the author keeps it,
          // shown "under review").
          if (row.is_flagged === true && !isOwnRow) {
            setPosts((prev) => prev.filter((p) => p.id !== row.id));
            return;
          }

          // Otherwise merge a live edit / pin / un-flag into the on-screen post (if
          // present). Only raw community_posts columns come through Realtime, so the
          // view-only aggregates (like_count / reply_count) are preserved as-is.
          setPosts((prev) => {
            const idx = prev.findIndex((p) => p.id === row.id);
            if (idx === -1) return prev; // never resurrect a post that isn't shown
            const cur = prev[idx];
            const next: CommunityPost = {
              ...cur,
              body: row.body ?? cur.body,
              edited_at: row.edited_at ?? cur.edited_at,
              moderation_note: row.moderation_note ?? cur.moderation_note,
              is_flagged: row.is_flagged ?? cur.is_flagged,
              is_pinned: row.is_pinned ?? cur.is_pinned,
            };
            const copy = [...prev];
            copy[idx] = next;
            // Re-sort in case is_pinned changed (pinned-first ordering).
            return sortPosts(copy, sortRef.current);
          });
        },
      )
      .subscribe();

    return () => {
      if (liveAnnounceTimer.current) {
        clearTimeout(liveAnnounceTimer.current);
        liveAnnounceTimer.current = null;
      }
      void sb.removeChannel(channel);
    };
  }, [ready, user?.id, sortPosts]);

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
      // Strip the catalogue deep-link params so a refresh doesn't re-seed the
      // composer with the (now-published) draft. Only touch the URL if it actually
      // carries one of them.
      const params = new URLSearchParams(searchParamsKey);
      if (params.has("channel") || params.has("provider") || params.has("draft")) {
        router.replace("/community", { scroll: false });
      }
    },
    [tab, sort, sortPosts, router, searchParamsKey],
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
    // fetchFeed's `before` is a strict `.lt(created_at)` (time-only API), so posts
    // sharing the exact oldest timestamp would be skipped. We pass the same oldest
    // cursor and rely on the id de-dupe below rather than dropping tie posts; the
    // lastOlderCursor guard breaks the loop if a page brings back no NEW ids.
    const older = await fetchFeed({
      channel: tab,
      before: oldest,
      viewerId: user?.id ?? null,
      blocked,
      limit: PAGE_SIZE,
      unansweredOnly: unanswered,
    });
    let addedCount = 0;
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const fresh = older.filter((p) => !seen.has(p.id));
      addedCount = fresh.length;
      const merged = [...prev, ...fresh];
      return sortPosts(merged, sort);
    });
    // End the pager when the page is short OR yields no new ids — and also if the
    // cursor didn't move from last time (a same-timestamp cluster fully de-duped),
    // so we never re-fetch the same boundary forever.
    if (
      older.length < PAGE_SIZE ||
      addedCount === 0 ||
      lastOlderCursor.current === oldest
    ) {
      setReachedEnd(true);
    }
    lastOlderCursor.current = oldest;
    setLoadingMore(false);
  }, [loadingMore, reachedEnd, posts, tab, user?.id, blocked, sort, unanswered, sortPosts]);

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

  // In search mode we show the results list instead of the feed; the trending
  // strip is hidden so search stays the focus.
  const searchMode = results !== null;
  const hasHighlights =
    !!highlights &&
    (highlights.channels.length > 0 || highlights.active_posts.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      {/* First-visit onboarding banner (client-only, dismissible, no DB) */}
      {introVisible && (
        <section
          role="region"
          aria-label="ברוכים הבאים לקהילת חוסך"
          className="bento motion-safe:reveal relative p-5 sm:p-6"
        >
          <h2 className="text-base font-semibold text-ink">
            ברוכים הבאים לקהילת חוסך
          </h2>
          <ul className="mt-3 flex list-none flex-col gap-2 p-0 text-sm text-muted">
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 text-accent-text">•</span>
              <span>שיתוף חוויות מעבר אמיתיות בין ספקים</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 text-accent-text">•</span>
              <span>שאלות לקהילה וקבלת תשובות מחברים אחרים</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 text-accent-text">•</span>
              <span>המלצה על ספקים שנתנו לכם שירות טוב</span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/community-guidelines"
              className="text-sm font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              כללי הקהילה
            </Link>
            <button
              type="button"
              onClick={dismissIntro}
              aria-label="הבנתי, הסתירו את הודעת הפתיחה"
              className="interactive press ms-auto inline-flex items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              הבנתי
            </button>
          </div>
        </section>
      )}

      {/* Composer */}
      <PostComposer
        onPosted={prepend}
        onRequireAuth={onRequireAuth}
        prefill={prefill}
      />

      {/* Community search */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-muted"
        >
          🔍
        </span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="חיפוש בקהילה"
          placeholder="חיפוש בקהילה…"
          className="min-h-[44px] w-full rounded-xl border border-border bg-surface ps-10 pe-10 py-2.5 text-sm text-foreground placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40"
        />
        {search.length > 0 && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="ניקוי החיפוש"
            className="interactive press absolute inset-y-0 end-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>

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

      {/* Filter + sort controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* "Help answer these" filter — surfaces questions with no replies yet. */}
        <button
          type="button"
          onClick={() => setUnanswered((v) => !v)}
          aria-pressed={unanswered}
          className={`${sortBtn} ${
            unanswered ? "bg-accent/10 text-accent-text" : "text-muted hover:text-ink"
          }`}
        >
          ללא מענה
        </button>
        <div className="flex items-center gap-1" role="group" aria-label="מיון הפוסטים">
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
      </div>

      {/* Trending — truthful 7-day highlights. Real counts only; renders nothing
          when there's no activity, and hides while searching. */}
      {!searchMode && hasHighlights && highlights && (
        <section
          aria-label="מה חם בקהילה"
          className="bento flex flex-col gap-3 p-4"
        >
          <h2 className="text-sm font-semibold text-ink">מה חם בקהילה</h2>

          {highlights.channels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {highlights.channels.map((c) => (
                <button
                  key={c.channel}
                  type="button"
                  onClick={() => setTab(c.channel as Tab)}
                  aria-label={`עבור לערוץ ${c.channel} · ${c.posts} פוסטים`}
                  className="interactive press inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-muted [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 [@media(hover:hover)_and_(pointer:fine)]:hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span>{c.channel}</span>
                  <span aria-hidden="true" className="text-muted">·</span>
                  <span className="tabular-nums text-muted">{c.posts}</span>
                </button>
              ))}
            </div>
          )}

          {highlights.active_posts.length > 0 && (
            <ul className="flex list-none flex-col gap-2 p-0">
              {highlights.active_posts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {p.body}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                    <span className="tabular-nums">{p.reply_count}</span> תגובות
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* A small polite live region announces feed changes — the list itself is
          NOT a live region (that re-announces every post on each insert). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMsg}
      </p>

      {/* Search results — same <PostCard> list as the feed, shown instead of it
          while a query is active. */}
      {searchMode && results && (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold text-ink">תוצאות חיפוש</h2>
            <span className="text-xs text-muted">
              <span className="tabular-nums">{results.length}</span>
            </span>
          </div>
          {searching ? (
            <div className="flex flex-col gap-4">
              <PostSkeleton />
              <PostSkeleton />
            </div>
          ) : results.length === 0 ? (
            <p className="bento p-8 text-center text-sm text-muted">
              לא נמצאו תוצאות לחיפוש.
            </p>
          ) : (
            <ul className="stagger flex list-none flex-col gap-4 p-0">
              {results.map((post) => (
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
        </div>
      )}

      {/* Feed */}
      {!searchMode && (
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
              {unanswered ? "אין כרגע שאלות ללא מענה" : "עדיין אין פוסטים כאן"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {unanswered
                ? "כל השאלות פה כבר קיבלו תגובה 🙌 אפשר לכבות את הסינון ולראות הכול."
                : tab === ALL_CHANNEL
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
      )}
    </div>
  );
}
