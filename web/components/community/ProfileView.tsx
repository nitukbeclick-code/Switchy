"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ProfileView> — a public community profile: header + that user's posts.
//
// Loads the target user's public profile (avatar, display name, verified-customer
// badge) via fetchPublicProfile, then their posts via fetchPostsByUser. When the
// signed-in viewer IS the profile owner, the <ProfileEditor> is rendered above the
// feed so they can edit their identity in place; a successful save re-fetches the
// header + posts so the new name/photo shows immediately. Each post renders through
// the shared <PostCard>, which owns its own like/reply/bookmark/report/block/delete
// behaviour. Guests can still browse; the few gated PostCard actions open this
// view's own <AuthModal>.
//
// SECURITY: all user content (name, post bodies, media) is rendered through JSX {}
// (React auto-escapes) — we never inject raw HTML strings. The avatar URL reaches
// the DOM only as the `src` of a plain <img>; post media goes through <PostCard> →
// <MediaView>, which does the same.
//
// Design: premium-2026 tokens only (surface / ink / muted / accent / border),
// rounded-2xl cards, hairline border + soft shadow, RTL logical properties, dark
// mode via tokens, real <button>s with aria-labels + visible focus rings, and
// prefers-reduced-motion is handled by the shared .card/.reveal utilities.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  fetchMyBookmarkedPosts,
  fetchPostsByUser,
  fetchPublicProfile,
  type CommunityPost,
  type PublicProfile,
} from "@/lib/community";
import { useAuth } from "@/lib/auth-context";
import { initial } from "@/lib/community-render";
import AuthModal from "@/components/auth/AuthModal";
import PostCard from "./PostCard";
import ProfileEditor from "./ProfileEditor";

// ── Header avatar ──────────────────────────────────────────────────────────────

/**
 * "חבר/ה מאז <חודש> <שנה>" from a profile's created_at timestamp. Returns null
 * for a null / empty / unparseable value so the caller can omit the line entirely
 * rather than render an "Invalid Date".
 */
function memberSince(createdAt: string | null): string | null {
  if (!createdAt) return null;
  const when = new Date(createdAt);
  if (Number.isNaN(when.getTime())) return null;
  return `חבר/ה מאז ${when.toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  })}`;
}

function HeaderAvatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-16 w-16 shrink-0 rounded-full border border-border object-cover sm:h-20 sm:w-20"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-border bg-accent/15 text-2xl font-semibold text-accent-text sm:h-20 sm:w-20"
    >
      {initial(name)}
    </span>
  );
}

// ── View ─────────────────────────────────────────────────────────────────────

export default function ProfileView({ userId }: { userId: string }) {
  const { user, ready } = useAuth();
  const isOwn = !!user && user.id === userId;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs. "posts" is always available; "saved" is owner-only. The owner's bookmarks
  // are private, so they load lazily on the first open of the "saved" tab.
  const [activeTab, setActiveTab] = useState<"posts" | "saved">("posts");
  const [saved, setSaved] = useState<CommunityPost[] | null>(null);
  const [savedLoading, setSavedLoading] = useState(false);

  // The view owns its own auth modal so a gated PostCard action (a guest liking /
  // replying to a post on someone's profile) can prompt sign-in without a parent.
  const [authOpen, setAuthOpen] = useState(false);
  const onRequireAuth = useCallback(() => setAuthOpen(true), []);

  // Load the header profile + the user's posts. Shared by the initial effect and
  // the post-save refresh; passes the real viewer id so the owner's own flagged
  // posts stay visible to them.
  const load = useCallback(async () => {
    setLoading(true);
    const [prof, list] = await Promise.all([
      fetchPublicProfile(userId),
      fetchPostsByUser(userId, user?.id),
    ]);
    setProfile(prof);
    setPosts(list);
    setLoading(false);
  }, [userId, user?.id]);

  useEffect(() => {
    // Wait for the initial auth check so we pass the real viewer id on first load.
    if (!ready) return;
    let active = true;
    setLoading(true);
    void Promise.all([
      fetchPublicProfile(userId),
      fetchPostsByUser(userId, user?.id),
    ]).then(([prof, list]) => {
      if (!active) return;
      setProfile(prof);
      setPosts(list);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [ready, userId, user?.id]);

  // Remove a post from both lists when its own card deletes it (a post can be shown
  // under "posts" and, if the owner bookmarked their own post, under "saved").
  const handleDeleted = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setSaved((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
  }, []);

  // Open a tab; lazily fetch the owner's private bookmarks the first time "saved"
  // is opened. Guarded by isOwn at the call site (only the owner sees the tab).
  const handleSelectSaved = useCallback(() => {
    setActiveTab("saved");
    if (saved !== null || savedLoading) return;
    setSavedLoading(true);
    void fetchMyBookmarkedPosts()
      .then((list) => setSaved(list))
      .finally(() => setSavedLoading(false));
  }, [saved, savedLoading]);

  // After the owner saves their profile, re-fetch header + posts to reflect the new
  // name / avatar on every card.
  const handleSaved = useCallback(() => {
    void load();
  }, [load]);

  const displayName = (profile?.name ?? "").trim() || "משתמש";
  const verified = !!profile?.is_verified_customer;
  const bio = (profile?.bio ?? "").trim();
  const memberSinceLine = memberSince(profile?.created_at ?? null);

  // Truthful stats derived only from the posts we actually loaded — no server
  // aggregate is fetched, so these never claim more than what is on screen.
  const postCount = posts.length;
  const likesReceived = posts.reduce((sum, p) => sum + p.like_count, 0);

  // A finished load with no profile means this id doesn't map to a real member
  // (bad / stale / deleted). Show an explicit not-found card rather than a generic
  // header with the "משתמש" fallback name, which reads as a real but empty member.
  if (ready && !loading && !profile) {
    return (
      <section className="mx-auto w-full max-w-2xl" aria-label="פרופיל קהילה">
        <div className="card p-8 text-center">
          <h1 className="font-display text-xl font-bold text-ink sm:text-2xl">
            הפרופיל לא נמצא
          </h1>
          <p className="mt-2 text-sm text-muted">
            ייתכן שהקישור שגוי או שהפרופיל כבר לא קיים.
          </p>
          <a
            href="/community"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast shadow-[var(--glow-accent)] transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            חזרה לקהילה
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl" aria-label="פרופיל קהילה">
      {/* Header */}
      <header className="card p-5 sm:p-6">
        {loading && !profile ? (
          <div className="flex items-center gap-4" aria-hidden="true">
            <span className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-border/60 sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1 space-y-2">
              <span className="block h-5 w-40 max-w-full animate-pulse rounded bg-border/60" />
              <span className="block h-3.5 w-24 animate-pulse rounded bg-border/50" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <HeaderAvatar src={profile?.avatar_url ?? null} name={displayName} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="truncate font-display text-xl font-bold text-ink sm:text-2xl">
                  {displayName}
                </h1>

                {verified && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent-text"
                    title="אימות על סמך פגישת ייעוץ שהתקיימה או מעבר ספק שהושלם"
                    aria-label="לקוח מאומת — אימות על סמך פגישת ייעוץ שהתקיימה או מעבר ספק שהושלם"
                  >
                    <span aria-hidden="true">✓</span> לקוח מאומת
                  </span>
                )}

                {isOwn && (
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.7rem] font-medium text-muted">
                    זה אני
                  </span>
                )}
              </div>

              {memberSinceLine && (
                <p className="mt-1 text-xs text-muted">{memberSinceLine}</p>
              )}

              {/* Truthful stats — reflect the posts loaded on this page only. */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">
                  <span className="tabular-nums">{postCount}</span>
                  <span className="ms-1">פוסטים</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">
                  <span className="tabular-nums">{likesReceived}</span>
                  <span className="ms-1">לייקים שהתקבלו</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Self-written bio (escaped via JSX, whitespace preserved). */}
        {!loading && bio && (
          <p
            aria-label="אודות"
            className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted"
          >
            {bio}
          </p>
        )}
      </header>

      {/* Owner: inline profile editor */}
      {isOwn && (
        <div className="mt-4">
          <ProfileEditor onSaved={handleSaved} />
        </div>
      )}

      {/* Tabs: "פוסטים" always; "שמורים" is owner-only (private bookmarks). */}
      <div
        role="tablist"
        aria-label="תצוגות פרופיל"
        className="mt-4 flex items-center gap-2 border-b border-border"
      >
        <button
          type="button"
          role="tab"
          id="profile-tab-posts"
          aria-controls="profile-panel-posts"
          aria-selected={activeTab === "posts"}
          onClick={() => setActiveTab("posts")}
          className={`-mb-px inline-flex min-h-[44px] items-center rounded-t-lg border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            activeTab === "posts"
              ? "border-accent text-ink"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          פוסטים
        </button>

        {isOwn && (
          <button
            type="button"
            role="tab"
            id="profile-tab-saved"
            aria-controls="profile-panel-saved"
            aria-selected={activeTab === "saved"}
            onClick={handleSelectSaved}
            className={`-mb-px inline-flex min-h-[44px] items-center rounded-t-lg border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              activeTab === "saved"
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            שמורים
          </button>
        )}
      </div>

      {/* Posts panel */}
      <div
        role="tabpanel"
        id="profile-panel-posts"
        aria-labelledby="profile-tab-posts"
        hidden={activeTab !== "posts"}
        className="mt-4"
      >
        {loading ? (
          <ul className="space-y-4" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="animate-pulse rounded-2xl border border-border bg-surface p-4 shadow-soft"
              >
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-full bg-border/60" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <span className="block h-3.5 w-32 rounded bg-border/60" />
                    <span className="block h-3 w-20 rounded bg-border/50" />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <span className="block h-3 w-full rounded bg-border/50" />
                  <span className="block h-3 w-4/5 rounded bg-border/50" />
                </div>
              </li>
            ))}
          </ul>
        ) : posts.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm font-medium text-ink">
              {isOwn ? "עוד לא פרסמתם כלום" : `${displayName} עוד לא פרסם/ה כלום`}
            </p>
            <p className="mt-1 text-sm text-muted">
              {isOwn
                ? "הפוסטים שתשתפו בקהילה יופיעו כאן."
                : "כשיהיו פוסטים הם יופיעו כאן."}
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {posts.map((post) => (
              <li key={post.id} className="reveal">
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

      {/* Saved panel — owner-only, lazily loaded private bookmarks. */}
      {isOwn && (
        <div
          role="tabpanel"
          id="profile-panel-saved"
          aria-labelledby="profile-tab-saved"
          hidden={activeTab !== "saved"}
          className="mt-4"
        >
          {savedLoading || saved === null ? (
            <ul className="space-y-4" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="animate-pulse rounded-2xl border border-border bg-surface p-4 shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <span className="h-10 w-10 shrink-0 rounded-full bg-border/60" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <span className="block h-3.5 w-32 rounded bg-border/60" />
                      <span className="block h-3 w-20 rounded bg-border/50" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <span className="block h-3 w-full rounded bg-border/50" />
                    <span className="block h-3 w-4/5 rounded bg-border/50" />
                  </div>
                </li>
              ))}
            </ul>
          ) : saved.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm font-medium text-ink">אין פוסטים שמורים</p>
              <p className="mt-1 text-sm text-muted">
                פוסטים שתשמרו בקהילה יופיעו כאן — רק אתם רואים אותם.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {saved.map((post) => (
                <li key={post.id} className="reveal">
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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </section>
  );
}
