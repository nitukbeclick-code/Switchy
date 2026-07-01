// ────────────────────────────────────────────────────────────────────────────
// <PwaInstaller> — registers the SW (always) and surfaces the web-push opt-in
// (only when supported + configured + not already decided). We mock @/lib/push at
// the module boundary so we control support/subscription state, and assert the
// fail-soft contract: with push unsupported the prompt never appears; when
// supported + undecided it does; clicking "enable" subscribes; "dismiss" closes.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The opt-in is ENGAGEMENT-GATED: it never pops on first paint. It surfaces only
// after the FIRST of: the 2nd in-app navigation, >25s dwell (DWELL_MS in
// PwaInstaller), or a first meaningful interaction. Tests that expect the dialog
// flush the dwell timer (the deterministic signal under jsdom). We use fake
// timers ONLY to advance the dwell timer, then restore real timers before
// driving userEvent (which is brittle under fake timers). Keep this >= the
// component's DWELL_MS.
const DWELL_MS = 25_000;

// PwaInstaller counts client navigations via next/navigation's usePathname;
// there is no app-router context under jsdom, so mock a stable pathname.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

/** Render, then advance past the dwell window so the prompt may surface. */
async function renderAndSettle() {
  vi.useFakeTimers();
  try {
    render(<PwaInstaller />);
    // Let the async effect (SW register + subscription check) run, then fire the
    // dwell timer. advanceTimersByTimeAsync also drains awaited microtasks.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DWELL_MS + 50);
    });
  } finally {
    vi.useRealTimers();
  }
}

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

afterEach(() => {
  // Safety net: ensure no test leaks fake timers into the next one.
  vi.useRealTimers();
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
  it("shows the prompt when push is supported and undecided (after the dwell window)", async () => {
    isPushSupported.mockReturnValue(true);
    await renderAndSettle();

    expect(
      screen.getByRole("dialog", { name: "התראות על ירידות מחיר" }),
    ).toBeInTheDocument();
  });

  it("does NOT surface the prompt on first paint / before an engagement signal", async () => {
    isPushSupported.mockReturnValue(true);
    vi.useFakeTimers();
    try {
      render(<PwaInstaller />);
      // Let the async effect resolve, but stop well short of DWELL_MS and
      // produce no navigation/interaction — the prompt must stay hidden.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT re-prompt within 7 days of a dismissal", async () => {
    isPushSupported.mockReturnValue(true);
    // A structured first-dismissal 6 days ago: inside the 7-day cool-off, so the
    // prompt must stay hidden even after the dwell window elapses.
    localStorage.setItem(
      "chosech-push-prompt",
      JSON.stringify({
        state: "dismissed",
        count: 1,
        at: Date.now() - 6 * 24 * 60 * 60 * 1000,
      }),
    );
    await renderAndSettle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("DOES re-prompt after the cool-off window has elapsed", async () => {
    isPushSupported.mockReturnValue(true);
    // First dismissal 8 days ago > the 7-day cool-off for the first re-ask: the
    // context-aware policy may surface the prompt again.
    localStorage.setItem(
      "chosech-push-prompt",
      JSON.stringify({
        state: "dismissed",
        count: 1,
        at: Date.now() - 8 * 24 * 60 * 60 * 1000,
      }),
    );
    await renderAndSettle();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("stops nagging after the dismissal budget is spent", async () => {
    isPushSupported.mockReturnValue(true);
    // Dismissed the maximum number of times, long ago: terminal — never re-ask.
    localStorage.setItem(
      "chosech-push-prompt",
      JSON.stringify({
        state: "dismissed",
        count: 3,
        at: Date.now() - 365 * 24 * 60 * 60 * 1000,
      }),
    );
    await renderAndSettle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does NOT prompt when already subscribed (records it and stays silent)", async () => {
    isPushSupported.mockReturnValue(true);
    getExistingSubscription.mockResolvedValue({} as PushSubscription);
    render(<PwaInstaller />);

    await waitFor(() => expect(getExistingSubscription).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The decision is now stored as a structured record (state machine), not a
    // bare string, so the context-aware re-prompt policy can reason about it.
    expect(
      JSON.parse(localStorage.getItem("chosech-push-prompt") ?? "null"),
    ).toEqual({ state: "subscribed" });
  });

  it("treats a legacy bare 'dismissed' string as a prior dismissal (no prompt)", async () => {
    // Back-compat: the previous version persisted the bare strings. A stored
    // "dismissed" must keep suppressing the prompt under the new policy.
    isPushSupported.mockReturnValue(true);
    localStorage.setItem("chosech-push-prompt", "dismissed");
    await renderAndSettle();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("subscribes on 'enable' and closes the prompt", async () => {
    isPushSupported.mockReturnValue(true);
    subscribeToPush.mockResolvedValue({} as PushSubscription);

    await renderAndSettle();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "כן, עדכנו אותי" }));

    await waitFor(() => expect(subscribeToPush).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("chosech-push-prompt") ?? "null"),
    ).toEqual({ state: "subscribed" });
  });

  it("'dismiss' closes the prompt and records the refusal without subscribing", async () => {
    isPushSupported.mockReturnValue(true);

    await renderAndSettle();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "לא תודה" }));

    expect(subscribeToPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // A dismissal records a structured first-refusal (count: 1) so the escalating
    // cool-off can back off future prompts; it must NOT mark "subscribed".
    const rec = JSON.parse(
      localStorage.getItem("chosech-push-prompt") ?? "null",
    );
    expect(rec).toMatchObject({ state: "dismissed", count: 1 });
    expect(typeof rec.at).toBe("number");
  });
});
