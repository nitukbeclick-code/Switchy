// <UnansweredThreads> — the "waiting for an answer" view on /community/admin.
//
// The properties worth pinning:
//   • it queries with unansweredOnly (argument-level, not "was called"), because
//     without that flag it silently becomes "the whole feed";
//   • a FAILED read and an EMPTY list render DIFFERENTLY — a broken query must
//     never read as "כל השרשורים נענו";
//   • it survives the community-admin outage that collapses <AdminModeration>,
//     which is the entire reason it is a sibling component and not a section;
//   • the keyboard flow actually moves the listbox selection and opens a row;
//   • a non-admin renders nothing at all.
//
// next/link renders a plain <a> under jsdom — no mocking needed.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  isAdmin: true,
}));

vi.mock("@/lib/community", () => ({ fetchFeed: mocks.fetchFeed }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    ready: true,
    user: { id: "admin-1" },
    profile: { id: "admin-1", is_admin: mocks.isAdmin },
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  }),
}));

import UnansweredThreads, { daysWaiting, waitingLabel } from "@/components/community/UnansweredThreads";

const NOW = Date.parse("2026-07-30T12:00:00Z");

function post(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p1",
    user_id: "u1",
    author: "דנה",
    avatar: null,
    channel: "סלולר",
    body: "רגע לפני חידוש — מי עבר לאחרונה מסלול סלולר ומרוצה?",
    media_type: null,
    media_url: null,
    media_duration_ms: null,
    created_at: "2026-07-13T12:00:00Z",
    is_flagged: false,
    moderation_note: null,
    like_count: 0,
    reply_count: 0,
    is_pinned: false,
    edited_at: null,
    provider_slug: null,
    accepted_reply_id: null,
    ...over,
  };
}

beforeEach(() => {
  mocks.isAdmin = true;
  mocks.fetchFeed.mockReset();
});
afterEach(() => vi.restoreAllMocks());

// ── the pure helpers ─────────────────────────────────────────────────────────

describe("daysWaiting / waitingLabel", () => {
  it("counts whole days from the post timestamp", () => {
    expect(daysWaiting("2026-07-13T12:00:00Z", NOW)).toBe(17);
    expect(waitingLabel("2026-07-13T12:00:00Z", NOW)).toBe("ממתין 17 ימים");
  });

  it("uses singular and same-day wording", () => {
    expect(waitingLabel("2026-07-29T12:00:00Z", NOW)).toBe("ממתין יום");
    expect(waitingLabel("2026-07-30T09:00:00Z", NOW)).toBe("ממתין מהיום");
  });

  it("returns null for an unusable timestamp rather than a fabricated 0", () => {
    // A silent 0 would render as "ממתין מהיום" — i.e. a broken date would look
    // like a brand-new post, which is the opposite of the truth.
    expect(daysWaiting("", NOW)).toBeNull();
    expect(daysWaiting("not-a-date", NOW)).toBeNull();
    expect(waitingLabel("not-a-date", NOW)).toBe("");
  });

  it("never goes negative on a future timestamp", () => {
    expect(daysWaiting("2026-08-05T12:00:00Z", NOW)).toBe(0);
  });
});

// ── the query ────────────────────────────────────────────────────────────────

describe("<UnansweredThreads>", () => {
  it("queries with unansweredOnly — without it this is just the feed", async () => {
    mocks.fetchFeed.mockResolvedValue({ rows: [post()], error: false });
    render(<UnansweredThreads />);
    await waitFor(() => expect(mocks.fetchFeed).toHaveBeenCalled());
    expect(mocks.fetchFeed).toHaveBeenCalledWith(
      expect.objectContaining({ unansweredOnly: true, viewerId: "admin-1" }),
    );
  });

  it("renders each waiting thread with its channel and how long it has waited", async () => {
    mocks.fetchFeed.mockResolvedValue({ rows: [post()], error: false });
    render(<UnansweredThreads />);
    expect(await screen.findByText(/רגע לפני חידוש/)).toBeInTheDocument();
    expect(screen.getByText("סלולר")).toBeInTheDocument();
    expect(screen.getByText(/^ממתין \d+ ימים$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /פתחו והשיבו/ })).toHaveAttribute(
      "href",
      "/community/post/p1",
    );
  });

  // THE honesty property of this component.
  it("distinguishes a FAILED read from an empty list", async () => {
    mocks.fetchFeed.mockResolvedValue({ rows: [], error: true });
    render(<UnansweredThreads />);
    expect(await screen.findByText("לא הצלחנו לטעון את השרשורים.")).toBeInTheDocument();
    expect(screen.queryByText(/כל השרשורים נענו/)).not.toBeInTheDocument();
  });

  it("shows the all-answered state only when the query really returned nothing", async () => {
    mocks.fetchFeed.mockResolvedValue({ rows: [], error: false });
    render(<UnansweredThreads />);
    expect(await screen.findByText(/כל השרשורים נענו/)).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את השרשורים.")).not.toBeInTheDocument();
  });

  it("retry re-runs the query after a failure", async () => {
    const user = userEvent.setup();
    mocks.fetchFeed.mockResolvedValueOnce({ rows: [], error: true });
    render(<UnansweredThreads />);
    await screen.findByText("לא הצלחנו לטעון את השרשורים.");
    mocks.fetchFeed.mockResolvedValueOnce({ rows: [post()], error: false });
    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(await screen.findByText(/רגע לפני חידוש/)).toBeInTheDocument();
  });

  // ── keyboard ──────────────────────────────────────────────────────────────

  it("j/k and arrows move the listbox selection", async () => {
    const user = userEvent.setup();
    mocks.fetchFeed.mockResolvedValue({
      rows: [post({ id: "p1" }), post({ id: "p2", body: "שאלה שנייה" })],
      error: false,
    });
    render(<UnansweredThreads />);
    const list = await screen.findByRole("listbox", { name: "שרשורים ללא מענה" });
    expect(list).toHaveAttribute("aria-activedescendant", "unanswered-p1");

    list.focus();
    await user.keyboard("j");
    expect(list).toHaveAttribute("aria-activedescendant", "unanswered-p2");
    await user.keyboard("k");
    expect(list).toHaveAttribute("aria-activedescendant", "unanswered-p1");
    await user.keyboard("{ArrowDown}");
    expect(list).toHaveAttribute("aria-activedescendant", "unanswered-p2");
  });

  it("selection is clamped at both ends", async () => {
    const user = userEvent.setup();
    mocks.fetchFeed.mockResolvedValue({
      rows: [post({ id: "p1" }), post({ id: "p2" })],
      error: false,
    });
    render(<UnansweredThreads />);
    const list = await screen.findByRole("listbox", { name: "שרשורים ללא מענה" });
    list.focus();
    await user.keyboard("kkk");
    expect(list).toHaveAttribute("aria-activedescendant", "unanswered-p1");
    await user.keyboard("jjjjj");
    expect(list).toHaveAttribute("aria-activedescendant", "unanswered-p2");
  });

  it("Enter opens the SELECTED row, not the first one", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mocks.fetchFeed.mockResolvedValue({
      rows: [post({ id: "p1" }), post({ id: "p2" })],
      error: false,
    });
    render(<UnansweredThreads />);
    const list = await screen.findByRole("listbox", { name: "שרשורים ללא מענה" });
    list.focus();
    await user.keyboard("j");       // select the second row
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledTimes(1);
    // the clicked anchor is the second row's, i.e. selection really drives it
    const clicked = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(clicked.getAttribute("href")).toBe("/community/post/p2");
  });

  // ── gating ────────────────────────────────────────────────────────────────

  it("renders nothing for a non-admin, and never queries", async () => {
    mocks.isAdmin = false;
    mocks.fetchFeed.mockResolvedValue({ rows: [post()], error: false });
    const { container } = render(<UnansweredThreads />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });
});
