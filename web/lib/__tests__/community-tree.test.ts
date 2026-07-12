// toReplyTree (2-level shaping + ORPHAN PROMOTION — a reply must never vanish)
// and the fetchReactions client-side aggregation contract (canonical emoji
// order, zero counts dropped, unknown emoji ignored). fetchReactions talks to
// Supabase through getBrowserSupabase, which is stubbed with a minimal thenable
// query chain — no network, no real client.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as { target_id: string; emoji: string }[],
  calls: [] as { table: string; filters: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase-browser", () => {
  function makeQuery(table: string) {
    const filters: Record<string, unknown> = {};
    state.calls.push({ table, filters });
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return q;
      },
      in: (col: string, vals: unknown) => {
        filters[col] = vals;
        return q;
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: state.rows, error: null })),
    };
    return q;
  }
  return {
    SUPABASE_CONFIGURED: true,
    getBrowserSupabase: () => ({ from: (table: string) => makeQuery(table) }),
  };
});

import { fetchReactions, toReplyTree, type CommunityReply } from "@/lib/community";

function reply(id: string, parent: string | null = null): CommunityReply {
  return {
    id,
    post_id: "p1",
    user_id: "u1",
    author: "דנה",
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

describe("toReplyTree", () => {
  it("shapes a flat list into roots with their children, preserving order", () => {
    const tree = toReplyTree([
      reply("a"),
      reply("a1", "a"),
      reply("b"),
      reply("a2", "a"),
      reply("b1", "b"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
    expect(tree[0].children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(tree[1].children.map((c) => c.id)).toEqual(["b1"]);
  });

  it("PROMOTES an orphan (parent not in the list) to top level — no reply ever disappears", () => {
    const tree = toReplyTree([
      reply("a"),
      reply("orphan", "deleted-parent"),
      reply("a1", "a"),
    ]);
    expect(tree.map((n) => n.id)).toEqual(["a", "orphan"]);
    // The orphan is a real root node with an (empty) children list of its own.
    expect(tree[1].children).toEqual([]);
    // Total replies preserved: 2 roots + 1 child.
    expect(tree.reduce((n, r) => n + 1 + r.children.length, 0)).toBe(3);
  });

  it("returns [] for an empty list and treats null parents as roots", () => {
    expect(toReplyTree([])).toEqual([]);
    const tree = toReplyTree([reply("a"), reply("b")]);
    expect(tree.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("fetchReactions aggregation", () => {
  beforeEach(() => {
    state.rows = [];
    state.calls.length = 0;
  });

  it("returns an empty map for no ids WITHOUT touching the client", async () => {
    const out = await fetchReactions("post", []);
    expect(out.size).toBe(0);
    expect(state.calls.length).toBe(0);
  });

  it("aggregates rows per target in canonical emoji order, dropping zero-count and unknown emoji", async () => {
    state.rows = [
      { target_id: "t1", emoji: "❤️" },
      { target_id: "t1", emoji: "👍" },
      { target_id: "t1", emoji: "👍" },
      { target_id: "t1", emoji: "🔥" }, // not in REACTION_EMOJI — ignored
      { target_id: "t2", emoji: "😮" },
    ];
    const out = await fetchReactions("post", ["t1", "t2", "t3"]);
    // Canonical order (👍 before ❤️), truthful counts.
    expect(out.get("t1")).toEqual([
      { emoji: "👍", count: 2 },
      { emoji: "❤️", count: 1 },
    ]);
    expect(out.get("t2")).toEqual([{ emoji: "😮", count: 1 }]);
    // A target with no reactions has NO entry (never a fabricated empty list).
    expect(out.has("t3")).toBe(false);
  });

  it("scopes the query to the target type and the requested ids", async () => {
    await fetchReactions("reply", ["r1", "r2"]);
    expect(state.calls.length).toBe(1);
    expect(state.calls[0].table).toBe("content_reactions");
    expect(state.calls[0].filters.target_type).toBe("reply");
    expect(state.calls[0].filters.target_id).toEqual(["r1", "r2"]);
  });
});
