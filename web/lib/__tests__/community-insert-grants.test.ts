// ────────────────────────────────────────────────────────────────────────────
// community-insert-grants.test.ts — the column-level INSERT grants, pinned to
// the columns the composers actually send.
//
// WHY THIS FILE EXISTS. community-insert-hardening-2026-07.sql replaces a
// TABLE-WIDE `grant insert on community_posts to authenticated` with a
// column-level grant, because the table-wide one let any member insert
// `is_pinned = true`, author-controlled moderation columns, or a far-future
// `created_at` (every feed reads `order by created_at desc`, so a forged date is
// a permanent top slot).
//
// That fix creates a NEW failure mode, and it is the reason for this file: the
// grant list and the composers are two lists of column names in two languages
// with nothing connecting them. Add a column to the composer and forget the
// grant, and posting breaks — in production, for every member, at the first
// insert. Nothing in tsc, eslint or the Dart analyzer can see it.
//
// So these tests assert BOTH directions:
//   • every column a composer sends is granted   (or posting 403s)
//   • no moderation/ordering column is granted   (or the hole reopens)
// ────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const sql = read("supabase/community-insert-hardening-2026-07.sql");
const webCommunity = read("web/lib/community.ts");
const dartBackend = read("lib/services/backend/supabase_backend.dart");

/** The columns granted to `authenticated` for INSERT on a table. */
function grantedColumns(table: string): string[] {
  const re = new RegExp(
    `grant insert \\(([^)]*)\\) on public\\.${table} to authenticated;`,
    "m",
  );
  const m = re.exec(sql);
  expect(m, `no column-level INSERT grant found for ${table}`).toBeTruthy();
  return m![1]
    .split(",")
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean);
}

/**
 * The keys of the object literal passed to `.insert({...})` in the first insert
 * call following `marker` — i.e. what that client actually writes.
 * Spreads are resolved by name against `spreads`, since `...mediaFields(x)` is
 * opaque to a text scan and silently under-reports otherwise.
 */
function insertedKeys(src: string, marker: string, spreads: Record<string, string[]> = {}): string[] {
  // Anchor on the marker occurrence that is IMMEDIATELY followed by an insert.
  // Taking the first occurrence and then the next `.insert({` is wrong: both
  // tables are read before they are written, so `from("community_replies")`
  // first appears in a SELECT and the next insert found belongs to the POSTS
  // composer — which is how the first version of this test "discovered" that
  // addReply sends provider_slug. It does not.
  const WINDOW = 200;
  let insertAt = -1;
  for (let from = 0; ; ) {
    const at = src.indexOf(marker, from);
    if (at === -1) break;
    const cand = src.indexOf(".insert({", at);
    if (cand !== -1 && cand - at <= WINDOW) { insertAt = cand; break; }
    from = at + marker.length;
  }
  expect(insertAt, `no .insert({ within ${WINDOW} chars of ${marker}`).toBeGreaterThan(-1);
  // Walk braces so nested calls/objects do not truncate the block early.
  let depth = 0;
  let end = insertAt + ".insert(".length;
  for (let i = end; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const block = src.slice(insertAt, end);
  // Two property forms, and MISSING THE SECOND makes this whole file decorative:
  //   `user_id: author.user_id,`  → explicit
  //   `channel,`                  → ES shorthand, which the web composer uses for
  //                                 `channel` and `body`
  // A colon-only regex silently under-reports, so a shorthand column could go
  // ungranted and posting would break in production with every test green.
  // `...mediaFields(x)` starts with a dot and `author.user_id` contains one, so
  // neither is mistaken for a key.
  const keys = Array.from(
    block.matchAll(/^\s*'?"?([a-z_][a-z0-9_]*)'?"?\s*(?::|,\s*$)/gm),
  ).map((x) => x[1]);
  for (const [name, cols] of Object.entries(spreads)) {
    if (block.includes(`...${name}(`)) keys.push(...cols);
  }
  return [...new Set(keys)];
}

// media_type / media_url / media_duration_ms, spread into both web inserts.
const MEDIA = ["media_type", "media_url", "media_duration_ms"];

describe("community_posts INSERT grant covers every composer column", () => {
  const granted = grantedColumns("community_posts");

  it("covers the web composer", () => {
    const keys = insertedKeys(webCommunity, 'from("community_posts")', { mediaFields: MEDIA });
    expect(keys.length, "parsed no keys — the scan broke, not the code").toBeGreaterThan(3);
    for (const k of keys) {
      expect(granted, `web createPost sends "${k}" but it is not in the INSERT grant`).toContain(k);
    }
  });

  it("covers the Flutter composer", () => {
    const keys = insertedKeys(dartBackend, "from('community_posts')");
    expect(keys.length).toBeGreaterThan(3);
    for (const k of keys) {
      expect(granted, `Flutter createPost sends "${k}" but it is not in the INSERT grant`).toContain(k);
    }
  });
});

describe("community_replies INSERT grant covers every composer column", () => {
  const granted = grantedColumns("community_replies");

  it("covers the web reply composer", () => {
    const keys = insertedKeys(webCommunity, 'from("community_replies")', { mediaFields: MEDIA });
    expect(keys.length).toBeGreaterThan(3);
    for (const k of keys) {
      expect(granted, `web addReply sends "${k}" but it is not in the INSERT grant`).toContain(k);
    }
  });

  it("covers the Flutter reply composer", () => {
    const keys = insertedKeys(dartBackend, "from('community_replies')");
    expect(keys.length).toBeGreaterThan(3);
    for (const k of keys) {
      expect(granted, `Flutter addReply sends "${k}" but it is not in the INSERT grant`).toContain(k);
    }
  });
});

describe("the columns the grant exists to withhold stay withheld", () => {
  // Each of these is the hole. A future migration that "fixes posting" by adding
  // one of them back re-opens it, and this is where that gets caught.
  const FORBIDDEN = [
    "is_pinned", // self-pin above everyone's feed
    "is_flagged", // author-controlled moderation state
    "moderation_note",
    "flagged_at",
    "created_at", // feeds order by it — a forged date IS a pin
    "accepted_reply_id", // "this answer was accepted", set by the author later
    "edited_at",
  ];

  it.each(FORBIDDEN)("community_posts does not grant INSERT on %s", (col) => {
    expect(grantedColumns("community_posts")).not.toContain(col);
  });

  it.each(["is_flagged", "moderation_note", "flagged_at", "created_at", "edited_at"])(
    "community_replies does not grant INSERT on %s",
    (col) => {
      expect(grantedColumns("community_replies")).not.toContain(col);
    },
  );

  it("revokes the table-wide grant it is replacing", () => {
    // Without the REVOKE the column grant is decorative: the table-wide INSERT
    // from schema.sql:1472 still permits every column.
    expect(sql).toMatch(/revoke insert on public\.community_posts from authenticated;/);
    expect(sql).toMatch(/revoke insert on public\.community_replies from authenticated;/);
  });
});

describe("community_feed stops counting removed replies", () => {
  it("filters is_flagged in the reply-count lateral", () => {
    const view = /create or replace view public\.community_feed as([\s\S]*?);/.exec(sql);
    expect(view, "the community_feed redefinition was not found").toBeTruthy();
    const replyLateral = /from community_replies\s+where community_replies\.is_flagged = false/.exec(
      view![1],
    );
    expect(
      replyLateral,
      "the reply-count subquery must exclude is_flagged rows — otherwise a post " +
        "whose only reply was moderated away still reports 💬 1, drops out of " +
        "ללא מענה, and is published to the public Q&A hub as answered",
    ).toBeTruthy();
  });

  it("leaves the like lateral alone (post_likes has no moderation state)", () => {
    expect(sql).toMatch(/from post_likes group by post_likes\.post_id/);
  });

  it("re-applies security_invoker, which CREATE OR REPLACE VIEW resets", () => {
    // Forgetting this silently widens the view's effective permissions — the
    // schema comment calls it out, so the migration must honour it.
    const viewAt = sql.indexOf("create or replace view public.community_feed");
    const invokerAt = sql.indexOf("security_invoker = on", viewAt);
    expect(invokerAt, "security_invoker must be re-applied AFTER the view").toBeGreaterThan(viewAt);
  });
});
