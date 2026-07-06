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
  digestSubject,
  eligibleRecipients,
  groupUnread,
  kindLines,
  signUnsub,
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
