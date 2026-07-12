// Tests for community-digest — the weekly re-engagement email (roadmap #5).
//
//   • Pure logic (lib.ts): unread grouping, the §30A consent/eligibility filter,
//     subject pluralization, per-kind lines, the email body (truth-only: omits the
//     community-activity line unless there's a real positive count; always carries
//     the unsubscribe link + sender identity), and the one-click unsubscribe HMAC
//     (round-trips, rejects a tampered signature / wrong user).
//   • The live handler: OPTIONS ok; the GET unsubscribe honours a VALID signature
//     (flips the flag) and refuses a bad one WITHOUT touching the DB; the POST cron
//     trigger FAILS CLOSED without the shared webhook secret.
//
// Pure tests need no server/DB. Handler tests capture the real Deno.serve handler
// (_capture_handler.ts) + stub fetch. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildDigestEmail,
  chunkIds,
  digestSubject,
  eligibleRecipients,
  fetchAllPaged,
  fetchUnreadChunked,
  groupUnread,
  kindLines,
  type NotifRow,
  signUnsub,
  UNREAD_CHUNK,
  verifyUnsub,
} from "../community-digest/lib.ts";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// ── groupUnread ──────────────────────────────────────────────────────────────

Deno.test("groupUnread tallies per user and per kind, skipping blank user_id", () => {
  const g = groupUnread([
    { user_id: "u1", kind: "reply" },
    { user_id: "u1", kind: "reply" },
    { user_id: "u1", kind: "like" },
    { user_id: "u2", kind: "mention" },
    { user_id: "", kind: "reply" }, // skipped
  ]);
  assertEquals(g.get("u1"), { total: 3, byKind: { reply: 2, like: 1 } });
  assertEquals(g.get("u2"), { total: 1, byKind: { mention: 1 } });
  assertEquals(g.has(""), false);
});

Deno.test("groupUnread is empty for null / [] (honest — no fabricated recipients)", () => {
  assertEquals(groupUnread(null).size, 0);
  assertEquals(groupUnread([]).size, 0);
});

// ── eligibleRecipients (consent gate) ────────────────────────────────────────

Deno.test("eligibleRecipients keeps only a real address AND not-globally-opted-out", () => {
  const rows = [
    { id: "a", name: "A", email: "a@x.com", community_notify_opt_out: false },
    { id: "b", name: "B", email: "b@x.com", community_notify_opt_out: true }, // opted out
    { id: "c", name: "C", email: null, community_notify_opt_out: false }, // no email
    { id: "d", name: "D", email: "not-an-email", community_notify_opt_out: false }, // bad
    { id: "e", name: "E", email: "e@x.com", community_notify_opt_out: null }, // ok
  ];
  const ids = eligibleRecipients(rows).map((r) => r.id);
  assertEquals(ids, ["a", "e"]);
});

Deno.test("eligibleRecipients is [] for null", () => {
  assertEquals(eligibleRecipients(null), []);
});

// ── subject + kind lines ─────────────────────────────────────────────────────

Deno.test("digestSubject is singular for 1, plural otherwise", () => {
  assertStringIncludes(digestSubject(1), "עדכון חדש אחד");
  assertStringIncludes(digestSubject(5), "5 עדכונים חדשים");
});

Deno.test("kindLines lists counts>0 in a stable order and buckets unknown kinds", () => {
  const lines = kindLines({ total: 6, byKind: { like: 2, reply: 3, weird: 1 } });
  // reply comes before like in KIND_ORDER; weird is bucketed as "עדכונים נוספים".
  assertEquals(lines[0], "3 תגובות חדשות");
  assertEquals(lines[1], "2 לייקים");
  assert(lines.some((l) => l.includes("עדכונים נוספים")));
});

// ── buildDigestEmail (truth-only content) ────────────────────────────────────

Deno.test("buildDigestEmail carries counts, links, sender identity + unsubscribe", () => {
  const html = buildDigestEmail({
    name: "דנה",
    summary: { total: 3, byKind: { reply: 3 } },
    communityUrl: "https://app.switchy-ai.com/community",
    unsubscribeUrl: "https://edge/community-digest?unsub=u1&sig=abc",
    weeklyNewPosts: 4,
  });
  assertStringIncludes(html, "שלום דנה,");
  assertStringIncludes(html, "3 תגובות חדשות");
  assertStringIncludes(html, "https://app.switchy-ai.com/community"); // CTA
  assertStringIncludes(html, "unsub=u1&amp;sig=abc"); // unsubscribe link (attr-escaped)
  assertStringIncludes(html, "הסרה מרשימת התפוצה"); // §30A opt-out control
  assertStringIncludes(html, "4 פוסטים חדשים"); // community-activity line (real count)
});

Deno.test("buildDigestEmail OMITS the community-activity line when the count is null/0", () => {
  const base = {
    name: null,
    summary: { total: 1, byKind: { mention: 1 } },
    communityUrl: "https://app.switchy-ai.com/community",
    unsubscribeUrl: "https://edge/u",
  };
  assert(!buildDigestEmail({ ...base, weeklyNewPosts: 0 }).includes("פוסטים חדשים"));
  assert(!buildDigestEmail({ ...base, weeklyNewPosts: null }).includes("פוסטים חדשים"));
  // A null name degrades to the generic greeting, never "null".
  assertStringIncludes(buildDigestEmail({ ...base }), "שלום,");
});

// ── unread-query chunking + recipient cursor (the silent under-send fixes) ────
// The old single unread query interpolated up to 2000 uuids into ONE in.(…)
// filter (a ~74KB URL a proxy can reject → the WHOLE run silently sent nothing),
// and the old recipient read hard-capped at 2000 rows (every member past the
// cap silently never got a digest). These pin the chunker + the id-cursor pager.

Deno.test("chunkIds splits in order at the chunk size (default 100-150 per request)", () => {
  assert(UNREAD_CHUNK >= 100 && UNREAD_CHUNK <= 150, "chunk size stays in the 100-150 uuid band");
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const chunks = chunkIds(ids, 120);
  assertEquals(chunks.map((c) => c.length), [120, 120, 10]);
  assertEquals(chunks.flat(), ids); // order-preserving, nothing dropped
  assertEquals(chunkIds([], 120), []);
  assertEquals(chunkIds(["a"], 120), [["a"]]);
});

Deno.test("fetchUnreadChunked issues one bounded request per chunk and concatenates", async () => {
  const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
  const seen: string[][] = [];
  const { rows, failedChunks } = await fetchUnreadChunked(
    ids,
    (chunk) => {
      seen.push(chunk);
      return Promise.resolve(chunk.map((id) => ({ user_id: id, kind: "reply" } as NotifRow)));
    },
    120,
  );
  assertEquals(seen.length, 3, "250 ids at 120/chunk → 3 requests");
  assert(seen.every((c) => c.length <= 120), "no request carries more than the chunk cap");
  assertEquals(rows.length, 250);
  assertEquals(failedChunks, 0);
  // The chunked result groups identically to one big read (nothing lost/dup'd).
  assertEquals(groupUnread(rows).size, 250);
});

Deno.test("fetchUnreadChunked is fail-soft PER CHUNK — one failed chunk never kills the run", async () => {
  const ids = Array.from({ length: 30 }, (_, i) => `u${i}`);
  let call = 0;
  const { rows, failedChunks } = await fetchUnreadChunked(
    ids,
    (chunk) => {
      call++;
      if (call === 2) return Promise.resolve(null); // the middle chunk's read fails
      return Promise.resolve(chunk.map((id) => ({ user_id: id, kind: "like" } as NotifRow)));
    },
    10,
  );
  assertEquals(failedChunks, 1);
  // The OTHER chunks' members still get their digest (under-send beats fabrication).
  assertEquals(rows.length, 20);
});

Deno.test("fetchAllPaged follows the id cursor past the first page and stops on a short page", async () => {
  const cursors: string[] = [];
  const page1 = Array.from({ length: 3 }, (_, i) => ({ id: `p1-${i}` }));
  const page2 = [{ id: "p2-0" }];
  const res = await fetchAllPaged<{ id: string }>(
    (cursorId) => {
      cursors.push(cursorId);
      return Promise.resolve(cursorId === "" ? page1 : page2);
    },
    3, // pageSize — page1 is full, page2 is short
    10,
  );
  assertEquals(cursors, ["", "p1-2"]); // the second request cursors past page1's last id
  assertEquals(res.rows.length, 4);
  assertEquals(res.pages, 2);
  assertEquals(res.failed, false);
  assertEquals(res.truncated, false);
});

Deno.test("fetchAllPaged: a failed LATER page degrades to the rows already fetched", async () => {
  const res = await fetchAllPaged<{ id: string }>(
    (cursorId) =>
      Promise.resolve(cursorId === "" ? Array.from({ length: 2 }, (_, i) => ({ id: `r${i}` })) : null),
    2,
    10,
  );
  assertEquals(res.failed, true);
  assertEquals(res.rows.length, 2, "partial recipients still get their digest");
  // …while a failed FIRST page yields nothing (the caller keeps its honest note).
  const first = await fetchAllPaged<{ id: string }>(() => Promise.resolve(null), 2, 10);
  assertEquals(first, { rows: [], pages: 0, failed: true, truncated: false });
});

Deno.test("fetchAllPaged: the maxPages misfire bound reports truncation (never silent)", async () => {
  const res = await fetchAllPaged<{ id: string }>(
    (cursorId) => {
      const base = cursorId === "" ? 0 : Number(cursorId.slice(1)) + 1;
      return Promise.resolve([{ id: `i${base}` }, { id: `i${base + 1}` }]); // always a full page
    },
    2,
    3,
  );
  assertEquals(res.truncated, true);
  assertEquals(res.pages, 3);
  assertEquals(res.rows.length, 6);
});

// ── one-click unsubscribe HMAC ───────────────────────────────────────────────

Deno.test("signUnsub / verifyUnsub round-trip; a tampered sig or wrong uid is rejected", async () => {
  const key = "service-role-secret";
  const sig = await signUnsub("user-1", key);
  assert(sig.length > 0);
  assertEquals(await verifyUnsub("user-1", sig, key), true);
  assertEquals(await verifyUnsub("user-1", sig + "x", key), false); // tampered
  assertEquals(await verifyUnsub("user-2", sig, key), false); // signature bound to user-1
  assertEquals(await verifyUnsub("user-1", sig, "other-key"), false); // wrong key
});

Deno.test("signUnsub returns '' without a key (caller falls back to mailto opt-out)", async () => {
  assertEquals(await signUnsub("u1", ""), "");
  assertEquals(await verifyUnsub("u1", "anything", ""), false);
});

// ── live handler ─────────────────────────────────────────────────────────────

const handler = await captureServeHandler("../community-digest/index.ts");

Deno.test("community-digest OPTIONS preflight is allowed", async () => {
  const r = await handler(new Request("https://edge/community-digest", { method: "OPTIONS" }));
  assertEquals(r.status, 200);
});

function withEnv<T>(env: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  return fn().finally(() => {
    for (const k of Object.keys(env)) Deno.env.delete(k);
  });
}

Deno.test("GET unsubscribe with a VALID signature flips the flag and confirms", async () => {
  const KEY = "svc-key-for-unsub";
  await withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: KEY }, async () => {
    const sig = await signUnsub("user-9", KEY);
    await withFetchStub(
      [{ match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => jsonResponse([{ id: "user-9" }]) }],
      async (calls) => {
        const r = await handler(new Request(`https://edge/community-digest?unsub=user-9&sig=${encodeURIComponent(sig)}`, { method: "GET" }));
        assertEquals(r.status, 200);
        assertStringIncludes(await r.text(), "הוסרת");
        assert(calls.some((u) => u.includes("/rest/v1/profiles")), "issued the opt-out PATCH");
      },
    );
  });
});

Deno.test("GET unsubscribe does NOT claim success when the opt-out PATCH fails (§30A)", async () => {
  const KEY = "svc-key-for-unsub";
  await withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: KEY }, async () => {
    const sig = await signUnsub("user-9", KEY);
    await withFetchStub(
      [{ match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => new Response("boom", { status: 500 }) }],
      async () => {
        const r = await handler(new Request(`https://edge/community-digest?unsub=user-9&sig=${encodeURIComponent(sig)}`, { method: "GET" }));
        assertEquals(r.status, 503);
        const text = await r.text();
        assert(!text.includes("הוסרת"), "must not falsely confirm removal on a failed PATCH");
      },
    );
  });
});

Deno.test("GET unsubscribe with a BAD signature is refused and never touches the DB", async () => {
  await withEnv({ SUPABASE_URL: "https://test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-key-for-unsub" }, async () => {
    await withFetchStub(
      [{ match: (u: string) => u.includes("/rest/v1/profiles"), respond: () => jsonResponse([{ id: "user-9" }]) }],
      async (calls) => {
        const r = await handler(new Request("https://edge/community-digest?unsub=user-9&sig=forged", { method: "GET" }));
        assertEquals(r.status, 400);
        assertEquals(calls.filter((u) => u.includes("/rest/v1/profiles")).length, 0);
      },
    );
  });
});

Deno.test("community-digest POST fails closed without the shared webhook secret", async () => {
  const r = await handler(
    new Request("https://edge/community-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": "" },
      body: "{}",
    }),
  );
  // 401 (secret configured, mismatch) or 503 (no secret configured) — both fail-closed.
  assert(r.status === 401 || r.status === 503, `expected fail-closed, got ${r.status}`);
});
