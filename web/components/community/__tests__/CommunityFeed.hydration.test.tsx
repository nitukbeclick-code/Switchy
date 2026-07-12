// <CommunityFeed> — the page-level batching invariants (ONE round-trip per
// concern per page of posts — the 60→3 request win), the honest failure card
// (a failed load is NOT an empty feed) with its event-driven retry, and the
// block-list filter on search results. Children are stubbed: the invariants
// under test live in the feed orchestrator itself.

import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  fetchHighlights: vi.fn(),
  fetchMyBlocks: vi.fn(),
  fetchMyBookmarks: vi.fn(),
  fetchMyLikes: vi.fn(),
  fetchMyReactions: vi.fn(),
  fetchPostMedia: vi.fn(),
  fetchReactions: vi.fn(),
  searchPosts: vi.fn(),
}));

vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  fetchFeed: mocks.fetchFeed,
  fetchHighlights: mocks.fetchHighlights,
  fetchMyBlocks: mocks.fetchMyBlocks,
  fetchMyBookmarks: mocks.fetchMyBookmarks,
  fetchMyLikes: mocks.fetchMyLikes,
  fetchMyReactions: mocks.fetchMyReactions,
  fetchPostMedia: mocks.fetchPostMedia,
  fetchReactions: mocks.fetchReactions,
  searchPosts: mocks.searchPosts,
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/supabase-browser", () => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };
  return {
    SUPABASE_CONFIGURED: true,
    getBrowserSupabase: () => ({
      channel: () => channel,
      removeChannel: vi.fn().mockResolvedValue(undefined),
    }),
  };
});
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    ready: true,
    user: { id: "viewer-1" },
    profile: { name: "דנה" },
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  }),
}));
vi.mock("@/components/auth/AuthModal", () => ({
  default: () => null,
}));
vi.mock("@/components/community/PostComposer", () => ({
  default: () => <div data-testid="composer" />,
}));
vi.mock("@/components/community/PostCard", () => ({
  default: ({ post }: { post: { id: string; body: string } }) => (
    <article data-testid="post">{post.body}</article>
  ),
}));

import CommunityFeed from "@/components/community/CommunityFeed";
import type { CommunityPost } from "@/lib/community";

function post(id: string, userId = "author-1"): CommunityPost {
  return {
    id,
    user_id: userId,
    author: "דנה",
    avatar: null,
    channel: "סלולר",
    body: `body-${id}`,
    media_type: null,
    media_url: null,
    media_duration_ms: null,
    created_at: `2026-07-0${id.length}T00:00:00Z`,
    is_flagged: false,
    moderation_note: null,
    like_count: 0,
    reply_count: 0,
    is_pinned: false,
    edited_at: null,
    provider_slug: null,
    accepted_reply_id: null,
  };
}

beforeAll(() => {
  // jsdom has no IntersectionObserver (the infinite-scroll sentinel).
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem("switchy_community_intro_dismissed", "1");
  mocks.fetchFeed.mockResolvedValue({ rows: [], error: false });
  mocks.fetchHighlights.mockResolvedValue({ channels: [], active_posts: [] });
  mocks.fetchMyBlocks.mockResolvedValue([]);
  mocks.fetchMyBookmarks.mockResolvedValue(new Set());
  mocks.fetchMyLikes.mockResolvedValue(new Set());
  mocks.fetchMyReactions.mockResolvedValue(new Map());
  mocks.fetchPostMedia.mockResolvedValue(new Map());
  mocks.fetchReactions.mockResolvedValue(new Map());
  mocks.searchPosts.mockResolvedValue([]);
});

describe("CommunityFeed hydration batching", () => {
  it("hydrates a whole page in ONE round-trip per concern (never per card)", async () => {
    const rows = [post("a"), post("bb"), post("ccc")];
    mocks.fetchFeed.mockResolvedValue({ rows, error: false });
    render(<CommunityFeed />);

    expect(await screen.findAllByTestId("post")).toHaveLength(3);
    const ids = ["a", "bb", "ccc"];
    await waitFor(() => expect(mocks.fetchMyLikes).toHaveBeenCalledTimes(1));
    // Every concern batched over the SAME full page of ids — the 60→3 win.
    expect(mocks.fetchMyLikes.mock.calls[0][0]).toEqual(expect.arrayContaining(ids));
    expect(mocks.fetchMyBookmarks).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPostMedia).toHaveBeenCalledTimes(1);
    expect(mocks.fetchReactions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchReactions.mock.calls[0][0]).toBe("post");
    expect(mocks.fetchReactions.mock.calls[0][1]).toEqual(expect.arrayContaining(ids));
    expect(mocks.fetchMyReactions).toHaveBeenCalledTimes(1);
  });

  it("does NOT re-hydrate already-hydrated ids when more posts arrive", async () => {
    const rows = [post("a"), post("bb")];
    mocks.fetchFeed.mockResolvedValue({ rows, error: false });
    const { rerender } = render(<CommunityFeed />);
    await screen.findAllByTestId("post");
    await waitFor(() => expect(mocks.fetchMyLikes).toHaveBeenCalledTimes(1));

    // A re-render with the same posts must not trigger another batch.
    rerender(<CommunityFeed />);
    await new Promise((r) => setTimeout(r, 20));
    expect(mocks.fetchMyLikes).toHaveBeenCalledTimes(1);
  });
});

describe("CommunityFeed failure honesty", () => {
  it("a FAILED first page shows the retry card — not the empty state", async () => {
    mocks.fetchFeed.mockResolvedValue({ rows: [], error: true });
    render(<CommunityFeed />);
    expect(await screen.findByText("לא הצלחנו לטעון את הפיד")).toBeInTheDocument();
    expect(screen.queryByText("עדיין אין פוסטים כאן")).not.toBeInTheDocument();
  });

  it("the retry button re-runs the load and recovers", async () => {
    const user = userEvent.setup();
    mocks.fetchFeed.mockResolvedValueOnce({ rows: [], error: true });
    render(<CommunityFeed />);
    await screen.findByText("לא הצלחנו לטעון את הפיד");

    mocks.fetchFeed.mockResolvedValueOnce({ rows: [post("a")], error: false });
    await user.click(screen.getByRole("button", { name: "ניסיון חוזר" }));
    expect(await screen.findByText("body-a")).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את הפיד")).not.toBeInTheDocument();
  });
});

describe("CommunityFeed load-older keyset dedup (Bug 3)", () => {
  it("surfaces a boundary-timestamp post once (inclusive cursor + id de-dupe), no duplicate", async () => {
    const user = userEvent.setup();
    const T = "2026-07-01T00:00:00Z";
    // A FULL first page (20) keeps the pager alive; its oldest row sits at T.
    const first = Array.from({ length: 20 }, (_, i) =>
      i === 19
        ? { ...post(`p${i}`), created_at: T }
        : { ...post(`p${i}`), created_at: `2026-07-02T00:00:${String(i).padStart(2, "0")}Z` },
    );
    mocks.fetchFeed.mockResolvedValueOnce({ rows: first, error: false });
    render(<CommunityFeed />);
    await screen.findByText("body-p0");

    // The older page (inclusive `.lte` cursor at T) returns the boundary post p19
    // AGAIN plus the previously-stranded tie post `cc` at the same timestamp T.
    mocks.fetchFeed.mockResolvedValueOnce({
      rows: [
        { ...post("p19"), created_at: T },
        { ...post("cc"), created_at: T },
      ],
      error: false,
    });
    await user.click(screen.getByRole("button", { name: "טעינת פוסטים ישנים יותר" }));

    // The tie post appears; the boundary post is de-duped (never doubled).
    expect(await screen.findByText("body-cc")).toBeInTheDocument();
    expect(screen.getAllByText("body-p19")).toHaveLength(1);
    // The older fetch used the (inclusive) boundary cursor.
    expect(mocks.fetchFeed.mock.calls.at(-1)?.[0]).toMatchObject({ before: T });
  });
});

describe("CommunityFeed search block-list", () => {
  it("filters blocked authors out of search results (same list as the live feed)", async () => {
    const user = userEvent.setup();
    mocks.fetchMyBlocks.mockResolvedValue(["blocked-1"]);
    mocks.searchPosts.mockResolvedValue([
      post("ok", "author-1"),
      post("bad", "blocked-1"),
    ]);
    render(<CommunityFeed />);
    await screen.findByLabelText("חיפוש בקהילה");

    await user.type(screen.getByLabelText("חיפוש בקהילה"), "מבצע");
    // Debounced 300ms — wait for the results list.
    expect(await screen.findByText("body-ok", undefined, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText("body-bad")).not.toBeInTheDocument();
  });
});
