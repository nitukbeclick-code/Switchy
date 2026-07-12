// <Replies> — the accepted-answer flow (author-only control, optimistic float-
// to-top), the VISIBLE two-step delete with an honest failure message, the live
// reply-count callback, and the thread-level reaction batching (2 requests per
// THREAD, not per reply).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const AUTHOR = "author-1";

const mocks = vi.hoisted(() => ({
  fetchReplies: vi.fn(),
  setAcceptedReply: vi.fn(),
  deleteReply: vi.fn(),
  createReply: vi.fn(),
  fetchReactions: vi.fn(),
  fetchMyReactions: vi.fn(),
  searchMentionCandidates: vi.fn(),
}));

vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  fetchReplies: mocks.fetchReplies,
  setAcceptedReply: mocks.setAcceptedReply,
  deleteReply: mocks.deleteReply,
  createReply: mocks.createReply,
  fetchReactions: mocks.fetchReactions,
  fetchMyReactions: mocks.fetchMyReactions,
  searchMentionCandidates: mocks.searchMentionCandidates,
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/media-upload", () => ({
  uploadMedia: vi.fn(),
  validateMedia: () => ({ ok: true, kind: "image" }),
  startRecording: vi.fn(),
  downscaleImage: vi.fn(async (b: Blob) => b),
  AVATAR_MAX_DIM: 256,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    ready: true,
    user: { id: AUTHOR },
    profile: { name: "דנה", avatar_url: null },
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  }),
}));

import Replies from "@/components/community/Replies";

function reply(id: string, userId = "other-1", parent: string | null = null) {
  return {
    id,
    post_id: "p1",
    user_id: userId,
    author: userId === AUTHOR ? "דנה" : "יוסי",
    avatar: null,
    body: `body-${id}`,
    media_type: null,
    media_url: null,
    media_duration_ms: null,
    created_at: "2026-07-01T00:00:00Z",
    is_flagged: false,
    parent_reply_id: parent,
    edited_at: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchReplies.mockResolvedValue([reply("r1"), reply("r2")]);
  mocks.fetchReactions.mockResolvedValue(new Map());
  mocks.fetchMyReactions.mockResolvedValue(new Map());
  mocks.setAcceptedReply.mockResolvedValue(true);
  mocks.deleteReply.mockResolvedValue(true);
  mocks.searchMentionCandidates.mockResolvedValue([]);
});

describe("Replies accepted-answer flow", () => {
  it("lets the POST AUTHOR pick a best answer, floats it to the top, and persists it", async () => {
    const user = userEvent.setup();
    render(<Replies postId="p1" onRequireAuth={() => {}} postAuthorId={AUTHOR} />);
    await screen.findByText("body-r1");

    // Two accept controls (one per root reply) — pick the SECOND reply.
    const acceptButtons = screen.getAllByRole("button", {
      name: "בחירת התגובה כתשובה הטובה ביותר",
    });
    expect(acceptButtons).toHaveLength(2);
    await user.click(acceptButtons[1]);

    expect(mocks.setAcceptedReply).toHaveBeenCalledWith("p1", "r2");
    await screen.findByText("התשובה שנבחרה");

    // Optimistic float: r2 now renders BEFORE r1.
    const items = screen.getAllByRole("listitem");
    const orderedBodies = items
      .map((li) => within(li).queryByText(/^body-/)?.textContent)
      .filter(Boolean);
    expect(orderedBodies[0]).toBe("body-r2");
  });

  it("hides the accept control from a viewer who is NOT the post author", async () => {
    render(<Replies postId="p1" onRequireAuth={() => {}} postAuthorId="someone-else" />);
    await screen.findByText("body-r1");
    expect(
      screen.queryByRole("button", { name: "בחירת התגובה כתשובה הטובה ביותר" }),
    ).not.toBeInTheDocument();
  });

  it("batches the WHOLE thread's reply reactions in one round-trip per concern", async () => {
    render(<Replies postId="p1" onRequireAuth={() => {}} />);
    await screen.findByText("body-r1");
    await waitFor(() => expect(mocks.fetchReactions).toHaveBeenCalledTimes(1));
    expect(mocks.fetchReactions).toHaveBeenCalledWith("reply", ["r1", "r2"]);
    expect(mocks.fetchMyReactions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMyReactions).toHaveBeenCalledWith("reply", ["r1", "r2"]);
  });
});

describe("Replies delete (two-step + honest failure)", () => {
  it("arms on the first click, deletes on the second, and reports -1 to the parent", async () => {
    const user = userEvent.setup();
    const onCount = vi.fn();
    mocks.fetchReplies.mockResolvedValue([reply("mine", AUTHOR)]);
    render(<Replies postId="p1" onRequireAuth={() => {}} onReplyCountChange={onCount} />);
    await screen.findByText("body-mine");

    await user.click(screen.getByRole("button", { name: "מחיקת התגובה שלי" }));
    // Armed — nothing deleted yet.
    expect(mocks.deleteReply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "מחיקת התגובה שלי" })); // the confirm step
    expect(mocks.deleteReply).toHaveBeenCalledWith("mine");
    await waitFor(() => expect(screen.queryByText("body-mine")).not.toBeInTheDocument());
    expect(onCount).toHaveBeenCalledWith(-1);
  });

  it("shows a VISIBLE error when the delete fails (and keeps the reply + count)", async () => {
    const user = userEvent.setup();
    const onCount = vi.fn();
    mocks.fetchReplies.mockResolvedValue([reply("mine", AUTHOR)]);
    mocks.deleteReply.mockResolvedValue(false);
    render(<Replies postId="p1" onRequireAuth={() => {}} onReplyCountChange={onCount} />);
    await screen.findByText("body-mine");

    await user.click(screen.getByRole("button", { name: "מחיקת התגובה שלי" }));
    await user.click(screen.getByRole("button", { name: "מחיקת התגובה שלי" }));
    await screen.findByText("מחיקת התגובה נכשלה. נסו שוב.");
    expect(screen.getByText("body-mine")).toBeInTheDocument();
    expect(onCount).not.toHaveBeenCalled();
  });
});
