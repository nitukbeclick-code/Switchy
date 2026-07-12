// Cross-boundary contracts, pinned as FIXTURE READS of the other side's source:
//
//  1. MENTION_RE web↔edge parity — the web's mention grammar (bolding +
//     autocomplete) must be source-identical to the community-notify edge
//     function's resolver grammar, or a name the web renders as a mention could
//     silently fail to notify (and vice versa).
//  2. FEED_COLS ↔ community_feed — every column the web selects must exist in
//     the CANONICAL view definition (supabase/community-accepted-answer-2026-07
//     .sql), and the view must not carry columns the web silently ignores.
//
// These read the repo files directly (node fs) so a drift on EITHER side fails
// a test instead of nulling out in production.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEED_COLS, MENTION_RE } from "@/lib/community";

const here = path.dirname(fileURLToPath(import.meta.url));
// web/lib/__tests__ → repo root is three levels up.
const repoRoot = path.resolve(here, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

describe("MENTION_RE web↔edge parity", () => {
  it("is source-identical to community-notify's MENTION_RE", () => {
    const edge = read("supabase/functions/community-notify/index.ts");
    const m = edge.match(/const MENTION_RE = (\/.*\/g);/);
    expect(m, "community-notify no longer defines MENTION_RE — update the parity test").not.toBeNull();
    expect(`/${MENTION_RE.source}/${MENTION_RE.flags}`).toBe(m![1]);
  });
});

describe("FEED_COLS ↔ community_feed view contract", () => {
  function viewColumns(): string[] {
    const sql = read("supabase/community-accepted-answer-2026-07.sql");
    const m = sql.match(
      /create or replace view public\.community_feed as\s*select([\s\S]*?)\n\s*from community_posts/i,
    );
    expect(m, "canonical community_feed definition not found in the fixture").not.toBeNull();
    // One column per line in the canonical definition — parse each line's output
    // name: the `as <alias>` when present, else the identifier after the dot.
    return m![1]
      .split("\n")
      .map((l) => l.trim().replace(/,$/, ""))
      .filter(Boolean)
      .map((line) => {
        const asMatch = line.match(/\bas\s+([a-z_]+)$/i);
        if (asMatch) return asMatch[1];
        const dotMatch = line.match(/\.([a-z_]+)$/);
        return dotMatch ? dotMatch[1] : line;
      });
  }

  it("selects exactly the columns the canonical view exposes", () => {
    const view = viewColumns();
    const feed = FEED_COLS.split(",");
    // Same column SET on both sides (order is the web's choice).
    expect([...view].sort()).toEqual([...feed].sort());
    // And no accidental dupes on either side.
    expect(new Set(view).size).toBe(view.length);
    expect(new Set(feed).size).toBe(feed.length);
  });

  it("keeps the aggregate + moderation columns the UI depends on", () => {
    for (const col of ["like_count", "reply_count", "is_flagged", "accepted_reply_id"]) {
      expect(FEED_COLS.split(",")).toContain(col);
    }
  });
});
