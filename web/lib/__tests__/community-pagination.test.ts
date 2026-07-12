// Pagination / visibility query contracts for lib/community.ts:
//
//  • fetchFeed's "load older" cursor is INCLUSIVE (`.lte`, not `.lt`) so posts
//    sharing the boundary created_at are never skipped at the page seam (Bug 3).
//  • fetchPostsByUser pushes the flagged filter INTO the PostgREST query so a page
//    of `limit` rows is `limit` VISIBLE rows — a client-only filter would shorten
//    the page for a non-owner and make the profile pager's `>= PROFILE_PAGE_SIZE`
//    hasMore test under-report, stranding older posts (Bug 2).
//
// getBrowserSupabase is stubbed with a thenable query chain that RECORDS every
// operator call — no network, no real client.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[],
  ops: [] as { op: string; args: unknown[] }[],
}));

vi.mock("@/lib/supabase-browser", () => {
  function makeQuery() {
    const q: Record<string, unknown> = {};
    const record =
      (op: string) =>
      (...args: unknown[]) => {
        state.ops.push({ op, args });
        return q;
      };
    for (const op of ["select", "eq", "in", "or", "not", "lt", "lte", "order", "limit"]) {
      q[op] = record(op);
    }
    q.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: state.rows, error: null }));
    return q;
  }
  return {
    SUPABASE_CONFIGURED: true,
    getBrowserSupabase: () => ({ from: () => makeQuery() }),
  };
});

import {
  fetchFeed,
  fetchPostsByUser,
  PROFILE_PAGE_SIZE,
  type CommunityPost,
} from "@/lib/community";

const VIEWER = "11111111-1111-1111-1111-111111111111"; // uuid-ish → passes UUIDISH

function makePost(id: string, userId: string, isFlagged = false): CommunityPost {
  return {
    id,
    user_id: userId,
    author: "דנה",
    avatar: null,
    channel: "סלולר",
    body: `body-${id}`,
    media_type: null,
    media_url: null,
    media_duration_ms: null,
    created_at: "2026-07-01T00:00:00Z",
    is_flagged: isFlagged,
    moderation_note: null,
    like_count: 0,
    reply_count: 0,
    is_pinned: false,
    edited_at: null,
    provider_slug: null,
    accepted_reply_id: null,
  };
}

beforeEach(() => {
  state.rows = [];
  state.ops.length = 0;
});

describe("fetchFeed — inclusive keyset cursor (Bug 3)", () => {
  it("uses `.lte` (NOT `.lt`) for the `before` cursor, so tie timestamps aren't skipped", async () => {
    await fetchFeed({ before: "2026-07-01T00:00:00Z" });
    const ops = state.ops.map((o) => o.op);
    expect(ops).toContain("lte");
    expect(ops).not.toContain("lt");
    const lte = state.ops.find((o) => o.op === "lte");
    expect(lte?.args).toEqual(["created_at", "2026-07-01T00:00:00Z"]);
  });

  it("omits the cursor entirely on a first page (no `before`)", async () => {
    await fetchFeed({});
    const ops = state.ops.map((o) => o.op);
    expect(ops).not.toContain("lte");
    expect(ops).not.toContain("lt");
  });
});

describe("fetchPostsByUser — server-side flagged filter (Bug 2)", () => {
  it("pushes `.or(is_flagged.eq.false,user_id.eq.<viewer>)` for a non-owner viewer, returning a FULL visible page", async () => {
    // A full page of VISIBLE (non-flagged) rows for someone else's profile.
    state.rows = Array.from({ length: PROFILE_PAGE_SIZE }, (_, i) =>
      makePost(`p${i}`, "owner-1"),
    );
    const list = await fetchPostsByUser("owner-1", VIEWER);

    const orOp = state.ops.find((o) => o.op === "or");
    expect(orOp?.args?.[0]).toBe(`is_flagged.eq.false,user_id.eq.${VIEWER}`);
    // The query itself returns PROFILE_PAGE_SIZE visible rows → the caller's
    // `list.length >= PROFILE_PAGE_SIZE` hasMore test is now accurate.
    expect(list).toHaveLength(PROFILE_PAGE_SIZE);
  });

  it("a signed-out viewer excludes flagged rows via `.eq('is_flagged', false)` (no `.or`)", async () => {
    await fetchPostsByUser("owner-1", null);
    expect(state.ops.find((o) => o.op === "or")).toBeUndefined();
    const eqFlag = state.ops.find((o) => o.op === "eq" && o.args?.[0] === "is_flagged");
    expect(eqFlag?.args).toEqual(["is_flagged", false]);
  });

  it("the owner viewing their OWN profile keeps their flagged posts via the `.or` (under-review)", async () => {
    // Owner is the viewer → user_id.eq.<owner> matches every row, so flagged own
    // posts survive both the query and the defense-in-depth local filter.
    state.rows = [makePost("f1", VIEWER, true), makePost("ok", VIEWER, false)];
    const list = await fetchPostsByUser(VIEWER, VIEWER);
    const orOp = state.ops.find((o) => o.op === "or");
    expect(orOp?.args?.[0]).toBe(`is_flagged.eq.false,user_id.eq.${VIEWER}`);
    expect(list.map((p) => p.id)).toEqual(["f1", "ok"]);
  });
});
