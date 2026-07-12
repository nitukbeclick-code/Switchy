// <PostCard> — the optimistic like cycle (bump → revert on failure), guest
// gating (onRequireAuth, never a write), the batched-hydration contract (a
// provided `hydration` prop means NO self-fetch), and the report-with-reason
// flow (Hebrew presets into the report body + the per-session double-report
// guard).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  setLike: vi.fn(),
  setBookmark: vi.fn(),
  fetchMyLikes: vi.fn(),
  fetchMyBookmarks: vi.fn(),
  fetchPostMedia: vi.fn(),
  reportContent: vi.fn(),
  fetchReactions: vi.fn(),
  fetchMyReactions: vi.fn(),
}));

vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  setLike: mocks.setLike,
  setBookmark: mocks.setBookmark,
  fetchMyLikes: mocks.fetchMyLikes,
  fetchMyBookmarks: mocks.fetchMyBookmarks,
  fetchPostMedia: mocks.fetchPostMedia,
  reportContent: mocks.reportContent,
  fetchReactions: mocks.fetchReactions,
  fetchMyReactions: mocks.fetchMyReactions,
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

// Switchable viewer: PostCard reads useAuth() — tests flip between guest and a
// signed-in member.
const auth = vi.hoisted(() => ({
  current: {
    ready: true,
    user: null as { id: string } | null,
    profile: null as { is_admin?: boolean } | null,
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  },
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth.current }));

import PostCard from "@/components/community/PostCard";
import type { CommunityPost } from "@/lib/community";

function post(overrides: Partial<CommunityPost> = {}): CommunityPost {
  return {
    id: "p1",
    user_id: "author-1",
    author: "דנה",
    avatar: null,
    channel: "סלולר",
    body: "פוסט לדוגמה",
    media_type: null,
    media_url: null,
    media_duration_ms: null,
    created_at: "2026-07-01T00:00:00Z",
    is_flagged: false,
    moderation_note: null,
    like_count: 3,
    reply_count: 0,
    is_pinned: false,
    edited_at: null,
    provider_slug: null,
    accepted_reply_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  auth.current.user = { id: "viewer-1" };
  mocks.setLike.mockResolvedValue(true);
  mocks.fetchMyLikes.mockResolvedValue(new Set());
  mocks.fetchMyBookmarks.mockResolvedValue(new Set());
  mocks.fetchPostMedia.mockResolvedValue(new Map());
  mocks.fetchReactions.mockResolvedValue(new Map());
  mocks.fetchMyReactions.mockResolvedValue(new Map());
  mocks.reportContent.mockResolvedValue(true);
});

describe("PostCard like", () => {
  it("a GUEST tapping like is routed to onRequireAuth — no write ever fires", async () => {
    const user = userEvent.setup();
    auth.current.user = null;
    const onRequireAuth = vi.fn();
    render(<PostCard post={post()} onRequireAuth={onRequireAuth} hydration={null} />);
    await user.click(screen.getByRole("button", { name: "לייק" }));
    expect(onRequireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.setLike).not.toHaveBeenCalled();
  });

  it("bumps the count optimistically and keeps it on success", async () => {
    const user = userEvent.setup();
    let resolveWrite: (ok: boolean) => void = () => {};
    mocks.setLike.mockImplementation(() => new Promise<boolean>((r) => (resolveWrite = r)));
    render(<PostCard post={post()} onRequireAuth={() => {}} hydration={null} />);

    await user.click(screen.getByRole("button", { name: "לייק" }));
    // Optimistic — before the write resolves.
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(mocks.setLike).toHaveBeenCalledWith("p1", "viewer-1", true);
    resolveWrite(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "ביטול לייק" })).toBeInTheDocument(),
    );
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("REVERTS the count and the pressed state when the write fails", async () => {
    const user = userEvent.setup();
    mocks.setLike.mockResolvedValue(false);
    render(<PostCard post={post()} onRequireAuth={() => {}} hydration={null} />);

    await user.click(screen.getByRole("button", { name: "לייק" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "לייק" })).toHaveAttribute(
        "aria-pressed",
        "false",
      ),
    );
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("PostCard hydration contract", () => {
  it("APPLIES a provided batched hydration and never self-fetches", async () => {
    render(
      <PostCard
        post={post()}
        onRequireAuth={() => {}}
        hydration={{ liked: true, bookmarked: true, gallery: [] }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "ביטול לייק" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(mocks.fetchMyLikes).not.toHaveBeenCalled();
    expect(mocks.fetchMyBookmarks).not.toHaveBeenCalled();
    expect(mocks.fetchPostMedia).not.toHaveBeenCalled();
  });

  it("standalone (no hydration prop) self-fetches its own state", async () => {
    render(<PostCard post={post()} onRequireAuth={() => {}} />);
    await waitFor(() => expect(mocks.fetchMyLikes).toHaveBeenCalledWith(["p1"]));
    expect(mocks.fetchMyBookmarks).toHaveBeenCalledWith(["p1"]);
    expect(mocks.fetchPostMedia).toHaveBeenCalledWith(["p1"]);
  });
});

describe("PostCard report-with-reason", () => {
  async function openReportForm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    await user.click(await screen.findByRole("button", { name: "דיווח על תוכן" }));
  }

  it("sends the chosen Hebrew preset + free text through the report body", async () => {
    const user = userEvent.setup();
    render(<PostCard post={post()} onRequireAuth={() => {}} hydration={null} />);
    await openReportForm(user);

    await user.click(screen.getByRole("radio", { name: "מידע שגוי או מטעה" }));
    await user.type(screen.getByLabelText("פרטים נוספים לדיווח"), "מחיר שגוי");
    await user.click(screen.getByRole("button", { name: "שליחת דיווח" }));

    await screen.findByText("תודה, הדיווח התקבל וייבדק.");
    expect(mocks.reportContent).toHaveBeenCalledWith(
      "post",
      "p1",
      "viewer-1",
      "מידע שגוי או מטעה — מחיר שגוי",
    );
  });

  it("blocks a SECOND report in the same session without another form", async () => {
    const user = userEvent.setup();
    // The real hasReportedThisSession reads this exact key (set by reportContent) —
    // now scoped to the reporting user's id so a sign-out/in doesn't inherit it.
    sessionStorage.setItem("swc:reported:viewer-1:post:p1", "1");
    render(<PostCard post={post()} onRequireAuth={() => {}} hydration={null} />);
    await openReportForm(user);

    expect(
      screen.getByText("כבר שלחתם דיווח על התוכן הזה — הוא ממתין לבדיקה."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "שליחת דיווח" })).not.toBeInTheDocument();
    expect(mocks.reportContent).not.toHaveBeenCalled();
  });

  it("does NOT block a DIFFERENT signed-in user who inherits the tab's session (key is per-reporter)", async () => {
    const user = userEvent.setup();
    // A previous account reported p1 in this tab; a different account signs in.
    sessionStorage.setItem("swc:reported:someone-else:post:p1", "1");
    render(<PostCard post={post()} onRequireAuth={() => {}} hydration={null} />);
    await openReportForm(user);

    // viewer-1 never reported p1 → the reason form opens, no false "already reported".
    expect(await screen.findByRole("button", { name: "שליחת דיווח" })).toBeInTheDocument();
    expect(
      screen.queryByText("כבר שלחתם דיווח על התוכן הזה — הוא ממתין לבדיקה."),
    ).not.toBeInTheDocument();
  });

  it("a guest is routed to onRequireAuth instead of the form", async () => {
    const user = userEvent.setup();
    auth.current.user = null;
    const onRequireAuth = vi.fn();
    render(<PostCard post={post()} onRequireAuth={onRequireAuth} hydration={null} />);
    await user.click(screen.getByRole("button", { name: "פעולות נוספות" }));
    await user.click(await screen.findByRole("button", { name: "דיווח על תוכן" }));
    expect(onRequireAuth).toHaveBeenCalled();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });
});
