// ────────────────────────────────────────────────────────────────────────────
// <CommunityFeed> — how a QUIET community presents itself. A low-traffic feed
// must not look abandoned, and the fix is never to invent activity: it is to
// stop the UI from volunteering "there is nothing here" claims it was never
// asked to make.
//
// Pinned here:
//   • "הגעתם לסוף הפיד." only after the reader actually paged (a first page that
//     merely came back short is not an end anyone arrived at),
//   • no "{n} שיחות נטענו" client-page-size figure masquerading as feed size,
//   • the all-channels empty state offers a real door to the composer,
//   • "מה חם בקהילה" never calls a channel with ONE post a trend,
//   • counts meet their nouns with Hebrew agreement ("תגובה אחת", not "1 תגובות").
//
// Children are stubbed — the behaviour under test lives in the orchestrator.
// ────────────────────────────────────────────────────────────────────────────

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
vi.mock("@/components/auth/AuthModal", () => ({ default: () => null }));
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

function post(id: string, createdAt = `2026-07-02T00:00:00Z`): CommunityPost {
  return {
    id,
    user_id: "author-1",
    author: "דנה",
    avatar: null,
    channel: "סלולר",
    body: `body-${id}`,
    media_type: null,
    media_url: null,
    media_duration_ms: null,
    created_at: createdAt,
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

const END_OF_FEED = "הגעתם לסוף הפיד.";

beforeAll(() => {
  (
    globalThis as unknown as { IntersectionObserver: unknown }
  ).IntersectionObserver = class {
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

describe("CommunityFeed — end-of-feed honesty", () => {
  it("does NOT announce the end of the feed on a short FIRST page", async () => {
    mocks.fetchFeed.mockResolvedValue({
      rows: [post("a"), post("b")],
      error: false,
    });
    render(<CommunityFeed />);
    await screen.findByText("body-a");
    // Three posts and a farewell was the whole "nobody is here" experience.
    expect(screen.queryByText(END_OF_FEED)).not.toBeInTheDocument();
    // A short page still ends the pager — we hide the epitaph, not the logic.
    expect(
      screen.queryByRole("button", { name: "טעינת פוסטים ישנים יותר" }),
    ).not.toBeInTheDocument();
  });

  it("announces the end only after the reader really paged", async () => {
    const user = userEvent.setup();
    // A FULL first page (PAGE_SIZE = 20) keeps the pager alive.
    const first = Array.from({ length: 20 }, (_, i) =>
      post(`p${i}`, `2026-07-02T00:00:${String(i).padStart(2, "0")}Z`),
    );
    mocks.fetchFeed.mockResolvedValueOnce({ rows: first, error: false });
    render(<CommunityFeed />);
    await screen.findByText("body-p0");
    expect(screen.queryByText(END_OF_FEED)).not.toBeInTheDocument();

    mocks.fetchFeed.mockResolvedValueOnce({
      rows: [post("old", "2026-07-01T00:00:00Z")],
      error: false,
    });
    await user.click(
      screen.getByRole("button", { name: "טעינת פוסטים ישנים יותר" }),
    );
    expect(await screen.findByText("body-old")).toBeInTheDocument();
    expect(await screen.findByText(END_OF_FEED)).toBeInTheDocument();
  });
});

describe("CommunityFeed — no client-page-size figure", () => {
  it("never publishes '{n} שיחות נטענו' beside the feed title", async () => {
    mocks.fetchFeed.mockResolvedValue({
      rows: [post("a"), post("b"), post("c")],
      error: false,
    });
    render(<CommunityFeed />);
    await screen.findByText("body-a");
    expect(screen.queryByText(/שיחות נטענו/)).not.toBeInTheDocument();
  });
});

describe("CommunityFeed — the empty state has a door", () => {
  it("offers the composer CTA on the all-channels empty state", async () => {
    render(<CommunityFeed />);
    expect(await screen.findByText("עדיין אין פוסטים כאן")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "פתיחת שיחה חדשה" });
    expect(cta).toHaveAttribute("href", "#community-composer");
  });
});

describe("CommunityFeed — 'מה חם בקהילה' is a trend, not a single post", () => {
  it("renders no chip for a channel with exactly one post", async () => {
    mocks.fetchHighlights.mockResolvedValue({
      channels: [{ channel: "סלולר", posts: 1 }],
      active_posts: [],
    });
    render(<CommunityFeed />);
    await screen.findByText("עדיין אין פוסטים כאן");
    // Nothing qualifies → the whole trending section stays away.
    await waitFor(() => expect(mocks.fetchHighlights).toHaveBeenCalled());
    expect(
      screen.queryByRole("region", { name: "מה חם בקהילה" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /עבור לערוץ/ })).toBeNull();
  });

  it("renders the chip once a channel has two or more (real counts only)", async () => {
    mocks.fetchHighlights.mockResolvedValue({
      channels: [
        { channel: "סלולר", posts: 2 },
        { channel: "אינטרנט", posts: 1 },
      ],
      active_posts: [],
    });
    render(<CommunityFeed />);
    expect(
      await screen.findByRole("button", { name: "עבור לערוץ סלולר · שני פוסטים" }),
    ).toBeInTheDocument();
    // The single-post channel gets no chip. (Scoped to the trending chips'
    // "עבור לערוץ …" label — plain "אינטרנט" is also a channel TAB button.)
    expect(
      screen.queryByRole("button", { name: /עבור לערוץ אינטרנט/ }),
    ).toBeNull();
  });

  it("agrees the reply count on an active post ('תגובה אחת', never '1 תגובות')", async () => {
    mocks.fetchHighlights.mockResolvedValue({
      channels: [],
      active_posts: [
        { id: "p1", channel: "סלולר", body: "שאלה", reply_count: 1 },
      ],
    });
    render(<CommunityFeed />);
    expect(await screen.findByText("תגובה אחת")).toBeInTheDocument();
    expect(screen.queryByText(/^1 תגובות$/)).toBeNull();
  });
});
