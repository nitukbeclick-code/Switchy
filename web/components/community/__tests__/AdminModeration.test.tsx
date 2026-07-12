// <AdminModeration> — the two-step ARMED confirm for destructive actions (the
// shared ConfirmDanger in controlled mode), the queue enrichment display
// (reportCount / authorBanned), the refresh button, and the open-post link on
// post reports. All data flows through the mocked community-admin layer — this
// dashboard never touches Supabase directly.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetchModerationQueue: vi.fn(),
  moderateContent: vi.fn(),
  resolveReport: vi.fn(),
  setBan: vi.fn(),
}));

vi.mock("@/lib/community-admin", () => ({
  fetchModerationQueue: mocks.fetchModerationQueue,
  moderateContent: mocks.moderateContent,
  resolveReport: mocks.resolveReport,
  setBan: mocks.setBan,
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    ready: true,
    user: { id: "admin-1" },
    profile: { id: "admin-1", is_admin: true },
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  }),
}));

import AdminModeration from "@/components/community/AdminModeration";

const FLAGGED_POST = {
  id: "p1",
  user_id: "u2",
  author: "דנה",
  channel: "סלולר",
  body: "spammy body",
  moderation_note: "ספאם",
  created_at: "2026-07-01T00:00:00Z",
  reportCount: 3,
  authorBanned: true,
};

const OPEN_REPORT = {
  id: "rep1",
  target_type: "post" as const,
  target_id: "p9",
  reporter_user_id: "u5",
  body: "ספאם או פרסומת",
  created_at: "2026-07-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchModerationQueue.mockResolvedValue({
    reports: [OPEN_REPORT],
    flaggedPosts: [FLAGGED_POST],
    flaggedReplies: [],
  });
  mocks.moderateContent.mockResolvedValue(true);
  mocks.resolveReport.mockResolvedValue(true);
  mocks.setBan.mockResolvedValue(true);
});

describe("AdminModeration armed confirm", () => {
  it("first click ARMS (nothing removed), second click executes the removal", async () => {
    const user = userEvent.setup();
    render(<AdminModeration />);
    await screen.findByText("spammy body");

    await user.click(screen.getByRole("button", { name: "הסר את הפוסט לצמיתות" }));
    // Armed: confirm copy shown, no mutation yet.
    expect(screen.getByText("לאשר הסרה לצמיתות?")).toBeInTheDocument();
    expect(mocks.moderateContent).not.toHaveBeenCalled();

    await user.click(screen.getByText("לאשר הסרה לצמיתות?"));
    expect(mocks.moderateContent).toHaveBeenCalledWith("community_posts", "p1", "remove");
    await waitFor(() => expect(screen.queryByText("spammy body")).not.toBeInTheDocument());
    // Regex match — the live region appends an invisible nonce (ZWSP) so a
    // repeated identical message is still re-announced.
    expect(screen.getByText(/הפוסט הוסר\./)).toBeInTheDocument();
  });

  it("'חזרה' disarms without executing", async () => {
    const user = userEvent.setup();
    render(<AdminModeration />);
    await screen.findByText("spammy body");

    await user.click(screen.getByRole("button", { name: "הסר את הפוסט לצמיתות" }));
    await user.click(screen.getByRole("button", { name: "ביטול הפעולה" }));
    expect(screen.queryByText("לאשר הסרה לצמיתות?")).not.toBeInTheDocument();
    expect(mocks.moderateContent).not.toHaveBeenCalled();
    expect(screen.getByText("spammy body")).toBeInTheDocument();
  });

  it("arming BAN then confirming bans the author and clears their rows", async () => {
    const user = userEvent.setup();
    render(<AdminModeration />);
    await screen.findByText("spammy body");

    await user.click(screen.getByRole("button", { name: "חסום את מפרסם הפוסט" }));
    expect(mocks.setBan).not.toHaveBeenCalled();
    await user.click(screen.getByText("לאשר חסימה?"));
    expect(mocks.setBan).toHaveBeenCalledWith("u2", true);
    await waitFor(() => expect(screen.queryByText("spammy body")).not.toBeInTheDocument());
  });
});

describe("AdminModeration queue surface", () => {
  it("shows the server enrichment: open-report count + banned author chip", async () => {
    render(<AdminModeration />);
    await screen.findByText("spammy body");
    expect(screen.getByText("3 דיווחים פתוחים")).toBeInTheDocument();
    expect(screen.getByText("המשתמש חסום")).toBeInTheDocument();
  });

  it("offers an open-post link on POST reports (new tab, permalink)", async () => {
    render(<AdminModeration />);
    await screen.findByText("spammy body");
    const link = screen.getByRole("link", { name: "פתיחת הפוסט המדווח בלשונית חדשה" });
    expect(link).toHaveAttribute("href", "/community/post/p9");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("the refresh button re-fetches the queue", async () => {
    const user = userEvent.setup();
    render(<AdminModeration />);
    await screen.findByText("spammy body");
    expect(mocks.fetchModerationQueue).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "רענון תור המודרציה" }));
    await waitFor(() => expect(mocks.fetchModerationQueue).toHaveBeenCalledTimes(2));
  });
});
