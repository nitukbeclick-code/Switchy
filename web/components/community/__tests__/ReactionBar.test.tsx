// <ReactionBar> — the optimistic apply/revert cycle and the TRI-STATE hydration
// contract (no provider → self-fetch; provider without entry → wait, never
// fetch; provider entry → apply). This is the contract that keeps the feed at
// ~3 requests per page instead of 2 per bar — regressions here reintroduce the
// N+1.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetchReactions: vi.fn(),
  fetchMyReactions: vi.fn(),
  setReaction: vi.fn(),
}));

vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  fetchReactions: mocks.fetchReactions,
  fetchMyReactions: mocks.fetchMyReactions,
  setReaction: mocks.setReaction,
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

import ReactionBar, {
  ReactionHydrationContext,
  ReplyReactionHydrationContext,
  type ReactionHydration,
} from "@/components/community/ReactionBar";

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchReactions.mockResolvedValue(new Map());
  mocks.fetchMyReactions.mockResolvedValue(new Map());
  mocks.setReaction.mockResolvedValue(true);
});

function entry(summaries: ReactionHydration["summaries"], mine: ReactionHydration["mine"] = null) {
  return new Map<string, ReactionHydration>([["t1", { summaries, mine }]]);
}

describe("ReactionBar hydration tri-state", () => {
  it("standalone (no provider) self-fetches summaries + own reaction", async () => {
    mocks.fetchReactions.mockResolvedValue(
      new Map([["t1", [{ emoji: "👍", count: 2 }]]]),
    );
    mocks.fetchMyReactions.mockResolvedValue(new Map([["t1", "👍"]]));
    render(<ReactionBar target="post" targetId="t1" userId="u1" onRequireAuth={noop} />);
    const chip = await screen.findByRole("button", { name: /תגובה 👍: 2/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(mocks.fetchReactions).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMyReactions).toHaveBeenCalledTimes(1);
  });

  it("with a provider but NO entry yet (batch in flight) it waits — never self-fetches", async () => {
    render(
      <ReactionHydrationContext.Provider value={new Map()}>
        <ReactionBar target="post" targetId="t1" userId="u1" onRequireAuth={noop} />
      </ReactionHydrationContext.Provider>,
    );
    // Give any (wrong) fetch a chance to fire.
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.fetchReactions).not.toHaveBeenCalled();
    expect(mocks.fetchMyReactions).not.toHaveBeenCalled();
  });

  it("applies a provided batched entry without fetching", async () => {
    render(
      <ReactionHydrationContext.Provider value={entry([{ emoji: "❤️", count: 3 }], "❤️")}>
        <ReactionBar target="post" targetId="t1" userId="u1" onRequireAuth={noop} />
      </ReactionHydrationContext.Provider>,
    );
    const chip = await screen.findByRole("button", { name: /תגובה ❤️: 3/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(mocks.fetchReactions).not.toHaveBeenCalled();
  });

  it("a REPLY bar reads the reply-scope context (post batches never leak in)", async () => {
    render(
      <ReplyReactionHydrationContext.Provider value={entry([{ emoji: "😮", count: 1 }])}>
        <ReactionBar target="reply" targetId="t1" userId="u1" onRequireAuth={noop} />
      </ReplyReactionHydrationContext.Provider>,
    );
    await screen.findByRole("button", { name: /תגובה 😮: 1/ });
    expect(mocks.fetchReactions).not.toHaveBeenCalled();
  });
});

describe("ReactionBar optimistic apply + revert", () => {
  it("applies the delta immediately and keeps it when the write succeeds", async () => {
    const user = userEvent.setup();
    let resolveWrite: (ok: boolean) => void = () => {};
    mocks.setReaction.mockImplementation(
      () => new Promise<boolean>((r) => (resolveWrite = r)),
    );
    render(
      <ReactionHydrationContext.Provider value={entry([{ emoji: "👍", count: 2 }])}>
        <ReactionBar target="post" targetId="t1" userId="u1" onRequireAuth={noop} />
      </ReactionHydrationContext.Provider>,
    );
    await user.click(await screen.findByRole("button", { name: /תגובה 👍: 2/ }));
    // Optimistic: count bumped before the write resolves.
    expect(screen.getByRole("button", { name: /תגובה 👍: 3/ })).toBeInTheDocument();
    resolveWrite(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /תגובה 👍: 3/ })).toBeInTheDocument(),
    );
    expect(mocks.setReaction).toHaveBeenCalledWith("post", "t1", "u1", "👍");
  });

  it("REVERTS the optimistic delta when the write fails", async () => {
    const user = userEvent.setup();
    mocks.setReaction.mockResolvedValue(false);
    render(
      <ReactionHydrationContext.Provider value={entry([{ emoji: "👍", count: 2 }])}>
        <ReactionBar target="post" targetId="t1" userId="u1" onRequireAuth={noop} />
      </ReactionHydrationContext.Provider>,
    );
    await user.click(await screen.findByRole("button", { name: /תגובה 👍: 2/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /תגובה 👍: 2/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /תגובה 👍: 3/ })).not.toBeInTheDocument();
  });

  it("a guest tapping the picker trigger is routed to onRequireAuth", async () => {
    const user = userEvent.setup();
    const onRequireAuth = vi.fn();
    render(
      <ReactionBar target="post" targetId="t1" userId={null} onRequireAuth={onRequireAuth} />,
    );
    await user.click(screen.getByRole("button", { name: "הוספת תגובה" }));
    expect(onRequireAuth).toHaveBeenCalledTimes(1);
    expect(mocks.setReaction).not.toHaveBeenCalled();
  });
});
