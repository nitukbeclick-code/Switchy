// ────────────────────────────────────────────────────────────────────────────
// The two community composers vs. the FIRST PAINT.
//
// AuthProvider starts `{ ready: false, user: null }` and only resolves once the
// Supabase session check comes back. Both composers used to key their guest
// prompt off `user` alone, so every returning member was told "התחברו כדי
// לפרסם" / "התחברו כדי להגיב" for the whole first paint before their own
// composer swapped in — the app greeting its own members as strangers, on the
// one screen whose whole job is to make a quiet community feel inhabited.
//
// Contract pinned here: while `ready` is false NEITHER state is asserted — an
// aria-busy skeleton holds the space; the login prompt appears only once we
// actually know the visitor is signed out.
// ────────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  auth: {
    ready: false,
    user: null as { id: string } | null,
    profile: null as { name: string; avatar_url: string | null } | null,
    session: null,
    signOut: async () => {},
    refreshProfile: async () => {},
  },
  fetchReplies: vi.fn(),
  fetchReactions: vi.fn(),
  fetchMyReactions: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/media-upload", () => ({
  uploadMedia: vi.fn(),
  validateMedia: () => ({ ok: true, kind: "image" }),
  startRecording: vi.fn(),
  downscaleImage: vi.fn(async (b: Blob) => b),
  AVATAR_MAX_DIM: 256,
}));
vi.mock("@/lib/community", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/community")>()),
  fetchReplies: mocks.fetchReplies,
  fetchReactions: mocks.fetchReactions,
  fetchMyReactions: mocks.fetchMyReactions,
}));

import PostComposer from "@/components/community/PostComposer";
import Replies from "@/components/community/Replies";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.ready = false;
  mocks.auth.user = null;
  mocks.auth.profile = null;
  mocks.fetchReplies.mockResolvedValue([]);
  mocks.fetchReactions.mockResolvedValue(new Map());
  mocks.fetchMyReactions.mockResolvedValue(new Map());
});

describe("<PostComposer> — first paint before the session resolves", () => {
  it("shows a busy skeleton, NOT the login prompt", () => {
    render(<PostComposer onPosted={() => {}} onRequireAuth={() => {}} />);
    const section = screen.getByLabelText("פרסום בקהילה");
    expect(section).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("התחברו כדי לפרסם")).not.toBeInTheDocument();
  });

  it("shows the login prompt once we KNOW the visitor is signed out", () => {
    mocks.auth.ready = true;
    render(<PostComposer onPosted={() => {}} onRequireAuth={() => {}} />);
    expect(
      screen.getByRole("button", { name: "התחברו כדי לפרסם" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("פרסום בקהילה")).not.toHaveAttribute(
      "aria-busy",
    );
  });

  it("shows the real composer for a resolved member", () => {
    mocks.auth.ready = true;
    mocks.auth.user = { id: "u1" };
    mocks.auth.profile = { name: "דנה", avatar_url: null };
    render(<PostComposer onPosted={() => {}} onRequireAuth={() => {}} />);
    expect(screen.queryByText("התחברו כדי לפרסם")).not.toBeInTheDocument();
    expect(screen.getByLabelText("פרסום בקהילה")).not.toHaveAttribute(
      "aria-busy",
    );
  });
});

describe("<Replies> reply composer — first paint before the session resolves", () => {
  it("shows a busy skeleton, NOT the login prompt", async () => {
    render(<Replies postId="p1" onRequireAuth={() => {}} />);
    // The thread itself resolves independently of auth (let it settle), but the
    // composer below it must not assert a signed-out visitor while `ready` is
    // false.
    await waitFor(() =>
      expect(screen.getByText("אין עדיין תגובות. היו הראשונים להגיב.")).toBeInTheDocument(),
    );
    expect(screen.queryByText("התחברו כדי להגיב")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("shows the login prompt once we KNOW the visitor is signed out", async () => {
    mocks.auth.ready = true;
    render(<Replies postId="p1" onRequireAuth={() => {}} />);
    expect(await screen.findByText("התחברו כדי להגיב")).toBeInTheDocument();
  });
});
