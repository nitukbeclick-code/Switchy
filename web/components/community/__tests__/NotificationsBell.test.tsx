// <NotificationsBell> — the Hebrew relative-time copy, the unread badge, the
// panel's Tab focus trap, and "mark all read" as ONE data-layer call (the
// is('read_at', null) single update — never a round-trip per row).

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  fetchNotifications: mocks.fetchNotifications,
  markNotificationRead: mocks.markNotificationRead,
  markAllNotificationsRead: mocks.markAllNotificationsRead,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    ready: true,
    user: { id: "u1" },
    profile: null,
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  }),
}));

import NotificationsBell from "@/components/community/NotificationsBell";

function notif(
  id: number,
  kind: "reply" | "mention" | "flag" | "reaction" | "like" | "pinned",
  agoMs: number,
  read = false,
) {
  return {
    id,
    user_id: "u1",
    kind,
    post_id: kind === "flag" ? null : "p1",
    reply_id: null,
    actor: "יוסי",
    read_at: read ? new Date().toISOString() : null,
    created_at: new Date(Date.now() - agoMs).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchNotifications.mockResolvedValue([]);
  mocks.markNotificationRead.mockResolvedValue(undefined);
  mocks.markAllNotificationsRead.mockResolvedValue(true);
});

describe("NotificationsBell", () => {
  it("shows the unread count and Hebrew relative times ('ממש עכשיו' / hours)", async () => {
    const user = userEvent.setup();
    mocks.fetchNotifications.mockResolvedValue([
      notif(1, "reply", 5_000), // just now
      notif(2, "mention", 2 * 60 * 60 * 1000), // two hours ago
      notif(3, "like", 60_000, true), // read — not in the badge
    ]);
    render(<NotificationsBell />);

    const trigger = await screen.findByRole("button", { name: "התראות · 2 חדשות" });
    await user.click(trigger);

    expect(await screen.findByText("ממש עכשיו")).toBeInTheDocument();
    expect(screen.getByText("לפני 2 שעות")).toBeInTheDocument();
    expect(screen.getByText("הגיב/ה על הפוסט שלך")).toBeInTheDocument();
  });

  it("traps Tab inside the open panel (last → first wrap)", async () => {
    const user = userEvent.setup();
    mocks.fetchNotifications.mockResolvedValue([notif(1, "reply", 5_000)]);
    render(<NotificationsBell />);
    await user.click(await screen.findByRole("button", { name: /התראות/ }));

    const dialog = await screen.findByRole("dialog");
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>("button"));
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    // And Shift+Tab from the first wraps back to the last.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("'סמן הכל כנקרא' issues ONE markAllNotificationsRead call (no per-row writes)", async () => {
    const user = userEvent.setup();
    mocks.fetchNotifications.mockResolvedValue([
      notif(1, "reply", 5_000),
      notif(2, "mention", 6_000),
      notif(3, "reaction", 7_000),
    ]);
    render(<NotificationsBell />);
    await user.click(await screen.findByRole("button", { name: "התראות · 3 חדשות" }));
    await user.click(await screen.findByRole("button", { name: "סמן הכל כנקרא" }));

    await waitFor(() => expect(mocks.markAllNotificationsRead).toHaveBeenCalledTimes(1));
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
    // Optimistic: the badge clears (label drops the count).
    expect(screen.getByRole("button", { name: "התראות" })).toBeInTheDocument();
  });

  it("navigates to the post permalink for a target-carrying row, but never for 'flag'", async () => {
    const user = userEvent.setup();
    mocks.fetchNotifications.mockResolvedValue([
      notif(1, "reply", 5_000),
      notif(2, "flag", 5_000),
    ]);
    render(<NotificationsBell />);
    await user.click(await screen.findByRole("button", { name: /התראות/ }));

    await user.click(await screen.findByText("הגיב/ה על הפוסט שלך"));
    expect(mocks.push).toHaveBeenCalledWith("/community/post/p1");

    mocks.push.mockClear();
    // Re-open (navigation closed the panel).
    await user.click(screen.getByRole("button", { name: /התראות/ }));
    await user.click(await screen.findByText("התוכן שלך סומן לבדיקת מנהל"));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
