// ────────────────────────────────────────────────────────────────────────────
// <PwaInstaller> — registers the SW (always) and surfaces the web-push opt-in
// (only when supported + configured + not already decided). We mock @/lib/push at
// the module boundary so we control support/subscription state, and assert the
// fail-soft contract: with push unsupported the prompt never appears; when
// supported + undecided it does; clicking "enable" subscribes; "dismiss" closes.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mockable push module — each test sets the behaviour it needs.
const registerServiceWorker = vi.fn(async () => null);
const isPushSupported = vi.fn(() => false);
const getExistingSubscription = vi.fn(async () => null as PushSubscription | null);
const subscribeToPush = vi.fn(async () => null as PushSubscription | null);

vi.mock("@/lib/push", () => ({
  registerServiceWorker: () => registerServiceWorker(),
  isPushSupported: () => isPushSupported(),
  getExistingSubscription: () => getExistingSubscription(),
  subscribeToPush: () => subscribeToPush(),
}));

// Tracking is a no-op in tests.
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

import PwaInstaller from "@/components/PwaInstaller";

beforeEach(() => {
  localStorage.clear();
  registerServiceWorker.mockClear().mockResolvedValue(null);
  isPushSupported.mockReset().mockReturnValue(false);
  getExistingSubscription.mockReset().mockResolvedValue(null);
  subscribeToPush.mockReset().mockResolvedValue(null);
  // Notification.permission defaults to "default" (undecided).
  vi.stubGlobal("Notification", { permission: "default" });
});

describe("PwaInstaller — SW registration is unconditional", () => {
  it("registers the service worker on mount even when push is unsupported", async () => {
    render(<PwaInstaller />);
    await waitFor(() => expect(registerServiceWorker).toHaveBeenCalledTimes(1));
    // No prompt when unsupported.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("PwaInstaller — push opt-in prompt", () => {
  it("shows the prompt when push is supported and undecided", async () => {
    isPushSupported.mockReturnValue(true);
    render(<PwaInstaller />);

    expect(
      await screen.findByRole("dialog", { name: "התראות על ירידות מחיר" }),
    ).toBeInTheDocument();
  });

  it("does NOT prompt again once a choice is stored", async () => {
    isPushSupported.mockReturnValue(true);
    localStorage.setItem("chosech-push-prompt", "dismissed");
    render(<PwaInstaller />);

    // Give the effect a tick; the prompt must stay hidden.
    await waitFor(() => expect(registerServiceWorker).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does NOT prompt when already subscribed (records it and stays silent)", async () => {
    isPushSupported.mockReturnValue(true);
    getExistingSubscription.mockResolvedValue({} as PushSubscription);
    render(<PwaInstaller />);

    await waitFor(() => expect(getExistingSubscription).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("chosech-push-prompt")).toBe("subscribed");
  });

  it("subscribes on 'enable' and closes the prompt", async () => {
    isPushSupported.mockReturnValue(true);
    subscribeToPush.mockResolvedValue({} as PushSubscription);

    const user = userEvent.setup();
    render(<PwaInstaller />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "כן, עדכנו אותי" }));

    await waitFor(() => expect(subscribeToPush).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("chosech-push-prompt")).toBe("subscribed");
  });

  it("'dismiss' closes the prompt and records the refusal without subscribing", async () => {
    isPushSupported.mockReturnValue(true);

    const user = userEvent.setup();
    render(<PwaInstaller />);
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "לא תודה" }));

    expect(subscribeToPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("chosech-push-prompt")).toBe("dismissed");
  });
});
