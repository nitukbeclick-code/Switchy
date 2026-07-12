// Tests for community-admin — the moderation dashboard's server authority.
//
//   • planAction (pure): every action → the right RPC + args, p_admin always the
//     verified uid (never the body), table whitelist, missing-param + unknown 400s.
//   • queueUrls (pure): the queue reads are filtered (open reports / flagged only)
//     and bounded — pins the contract that a worked/clean row never re-appears.
//   • the live handler FAILS CLOSED: OPTIONS ok, but GET/POST with no bearer ⇒ 401.
//   • a verified admin: GET returns the three queues; POST dispatches to the RPC.
//
// Pure tests need no server/DB. The handler tests capture the real Deno.serve
// handler (_capture_handler.ts) and stub fetch — no port, no network, no source
// change. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import { planAction, QUEUE_LIMIT, queueUrls } from "../community-admin/actions.ts";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

const ADMIN = "admin-uid-1";

// ── planAction ───────────────────────────────────────────────────────────────

Deno.test("planAction approve/remove → admin_moderate_content with the verified admin", () => {
  const p = planAction(ADMIN, { action: "approve", table: "community_posts", id: "p1" });
  assertEquals(p, {
    kind: "rpc",
    rpc: "admin_moderate_content",
    args: { p_admin: ADMIN, p_table: "community_posts", p_id: "p1", p_action: "approve", p_note: null },
  });
  const rem = planAction(ADMIN, { action: "remove", table: "community_replies", id: "r1", note: "spam" });
  assertEquals(rem, {
    kind: "rpc",
    rpc: "admin_moderate_content",
    args: { p_admin: ADMIN, p_table: "community_replies", p_id: "r1", p_action: "remove", p_note: "spam" },
  });
});

Deno.test("planAction never trusts a p_admin smuggled in the body", () => {
  // A caller trying to escalate by passing their own p_admin gets ignored — the
  // plan's p_admin is always the requireAdmin-verified uid.
  const p = planAction(ADMIN, {
    action: "approve",
    table: "community_posts",
    id: "p1",
    // deno-lint-ignore no-explicit-any
    ...( { p_admin: "attacker", adminUid: "attacker" } as any ),
  });
  assert(p.kind === "rpc");
  assertEquals(p.args.p_admin, ADMIN);
});

Deno.test("planAction rejects a non-whitelisted table (defense-in-depth)", () => {
  assertEquals(planAction(ADMIN, { action: "remove", table: "profiles", id: "x" }), {
    kind: "error",
    status: 400,
    error: "bad table",
  });
  assertEquals(planAction(ADMIN, { action: "approve", table: "auth.users", id: "x" }), {
    kind: "error",
    status: 400,
    error: "bad table",
  });
});

Deno.test("planAction requires an id for moderate actions", () => {
  assertEquals(planAction(ADMIN, { action: "approve", table: "community_posts" }), {
    kind: "error",
    status: 400,
    error: "missing id",
  });
});

Deno.test("planAction ban/unban → admin_set_ban with the right boolean", () => {
  assertEquals(planAction(ADMIN, { action: "ban", userId: "u1" }), {
    kind: "rpc",
    rpc: "admin_set_ban",
    args: { p_admin: ADMIN, p_user: "u1", p_banned: true },
  });
  assertEquals(planAction(ADMIN, { action: "unban", userId: "u1" }), {
    kind: "rpc",
    rpc: "admin_set_ban",
    args: { p_admin: ADMIN, p_user: "u1", p_banned: false },
  });
  assertEquals(planAction(ADMIN, { action: "ban" }).kind, "error");
});

Deno.test("planAction resolve/dismiss → admin_resolve_report with the mapped status", () => {
  assertEquals(planAction(ADMIN, { action: "resolve", reportId: "rep1", resolution: "handled" }), {
    kind: "rpc",
    rpc: "admin_resolve_report",
    args: { p_admin: ADMIN, p_report: "rep1", p_status: "resolved", p_resolution: "handled" },
  });
  assertEquals(planAction(ADMIN, { action: "dismiss", reportId: "rep1" }), {
    kind: "rpc",
    rpc: "admin_resolve_report",
    args: { p_admin: ADMIN, p_report: "rep1", p_status: "dismissed", p_resolution: null },
  });
  assertEquals(planAction(ADMIN, { action: "resolve" }).kind, "error");
});

Deno.test("planAction rejects an unknown / empty / null action", () => {
  assertEquals(planAction(ADMIN, { action: "nuke" }).kind, "error");
  assertEquals(planAction(ADMIN, {}).kind, "error");
  assertEquals(planAction(ADMIN, null).kind, "error");
});

// ── queueUrls ────────────────────────────────────────────────────────────────

Deno.test("queueUrls reads only OPEN reports and only FLAGGED content, bounded", () => {
  const u = queueUrls();
  assert(u.reports.includes("status=eq.open"));
  assert(u.posts.includes("is_flagged=eq.true"));
  assert(u.replies.includes("is_flagged=eq.true"));
  for (const url of [u.reports, u.posts, u.replies]) {
    assert(url.includes(`limit=${QUEUE_LIMIT}`), `bounded: ${url}`);
    assert(url.includes("order=created_at.desc"));
  }
});

// ── live handler: fail-closed auth gate ───────────────────────────────────────

const handler = await captureServeHandler("../community-admin/index.ts");

Deno.test("community-admin OPTIONS preflight is allowed", async () => {
  const r = await handler(new Request("https://edge/community-admin", { method: "OPTIONS" }));
  assertEquals(r.status, 200);
});

Deno.test("community-admin fails closed (401) on GET/POST with no bearer token", async () => {
  const get = await handler(new Request("https://edge/community-admin", { method: "GET" }));
  assertEquals(get.status, 401);
  const post = await handler(
    new Request("https://edge/community-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ban", userId: "u1" }),
    }),
  );
  assertEquals(post.status, 401);
});

// ── live handler: a verified admin drives the queue + an action ────────────────

// Stub GoTrue + profiles so requireAdmin resolves a real admin, plus the queue
// reads and the RPC. Env is set INSIDE the test (another test file deletes
// SUPABASE_URL at import) and restored after.
function adminRoutes(opts: { rpcOk?: boolean } = {}) {
  const rpcStatus = opts.rpcOk === false ? 500 : 200;
  return [
    { match: (u: string) => u.includes("/auth/v1/user"), respond: () => jsonResponse({ id: ADMIN }) },
    {
      match: (u: string) => u.includes("/rest/v1/profiles") && u.includes("is_admin"),
      respond: () => jsonResponse([{ is_admin: true }]),
    },
    { match: (u: string) => u.includes("/rest/v1/community_reports"), respond: () => jsonResponse([{ id: "rep1", target_type: "post", target_id: "p1", reporter_user_id: "u9", body: "spam", created_at: "2026-07-01T00:00:00Z" }]) },
    { match: (u: string) => u.includes("/rest/v1/community_posts"), respond: () => jsonResponse([{ id: "p1", user_id: "u2", author: "דנה", channel: "cellular", body: "buy followers", moderation_note: "ספאם", created_at: "2026-07-01T00:00:00Z" }]) },
    { match: (u: string) => u.includes("/rest/v1/community_replies"), respond: () => jsonResponse([]) },
    { match: (u: string) => u.includes("/rest/v1/rpc/"), respond: () => new Response("", { status: rpcStatus }) },
  ];
}

function withAdminEnv<T>(fn: () => Promise<T>): Promise<T> {
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  return fn().finally(() => {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  });
}

function authed(method: string, body?: unknown): Request {
  return new Request("https://edge/community-admin", {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin.jwt.token" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

Deno.test("community-admin GET returns the three queues for a verified admin", async () => {
  await withAdminEnv(() =>
    withFetchStub(adminRoutes(), async () => {
      const r = await handler(authed("GET"));
      assertEquals(r.status, 200);
      const j = await r.json();
      assertEquals(j.reports.length, 1);
      assertEquals(j.flaggedPosts.length, 1);
      assertEquals(j.flaggedReplies.length, 0);
    })
  );
});

Deno.test("community-admin POST dispatches a valid action to its RPC (200 ok)", async () => {
  await withAdminEnv(() =>
    withFetchStub(adminRoutes(), async (calls) => {
      const r = await handler(authed("POST", { action: "resolve", reportId: "rep1" }));
      assertEquals(r.status, 200);
      assertEquals((await r.json()).ok, true);
      assert(calls.some((u) => u.includes("/rest/v1/rpc/admin_resolve_report")), "called the resolve RPC");
    })
  );
});

Deno.test("community-admin POST surfaces a bad action as 400 without calling any RPC", async () => {
  await withAdminEnv(() =>
    withFetchStub(adminRoutes(), async (calls) => {
      const r = await handler(authed("POST", { action: "remove", table: "profiles", id: "x" }));
      assertEquals(r.status, 400);
      assertEquals((await r.json()).error, "bad table");
      assertEquals(calls.filter((u) => u.includes("/rest/v1/rpc/")).length, 0);
    })
  );
});

Deno.test("community-admin POST returns 500 when the RPC fails", async () => {
  await withAdminEnv(() =>
    withFetchStub(adminRoutes({ rpcOk: false }), async () => {
      const r = await handler(authed("POST", { action: "ban", userId: "u2" }));
      assertEquals(r.status, 500);
      assertEquals((await r.json()).error, "action failed");
    })
  );
});

// ── live handler: GET queue enrichment (reportCount / authorBanned) ────────────
// Two extra BOUNDED service-role reads per queue load: open-report counts for the
// flagged items + the authors' ban flags. Additive + fail-soft.

const POST_ID = "11111111-1111-1111-1111-111111111111";
const AUTHOR_ID = "22222222-2222-2222-2222-222222222222";

function enrichedRoutes(opts: { enrichFail?: boolean } = {}) {
  const enrichStatus = opts.enrichFail ? 500 : 200;
  return [
    { match: (u: string) => u.includes("/auth/v1/user"), respond: () => jsonResponse({ id: ADMIN }) },
    {
      // requireAdmin's profile gate — distinct from the enrichment profiles read.
      match: (u: string) => u.includes("/rest/v1/profiles") && u.includes("select=is_admin"),
      respond: () => jsonResponse([{ is_admin: true }]),
    },
    {
      // Enrichment read #2: ban flags for the flagged authors.
      match: (u: string) => u.includes("/rest/v1/profiles") && u.includes("select=id,is_banned"),
      respond: () =>
        opts.enrichFail
          ? new Response("boom", { status: enrichStatus })
          : jsonResponse([{ id: AUTHOR_ID, is_banned: true }]),
    },
    {
      // Enrichment read #1: open reports pointing at the flagged content.
      match: (u: string) => u.includes("/rest/v1/community_reports") && u.includes("select=target_id"),
      respond: () =>
        opts.enrichFail
          ? new Response("boom", { status: enrichStatus })
          : jsonResponse([{ target_id: POST_ID }, { target_id: POST_ID }]),
    },
    {
      // Queue read: open reports (id-shaped select).
      match: (u: string) => u.includes("/rest/v1/community_reports"),
      respond: () => jsonResponse([]),
    },
    {
      match: (u: string) => u.includes("/rest/v1/community_posts"),
      respond: () =>
        jsonResponse([{
          id: POST_ID,
          user_id: AUTHOR_ID,
          author: "דנה",
          channel: "סלולר",
          body: "buy followers",
          moderation_note: "ספאם",
          created_at: "2026-07-01T00:00:00Z",
        }]),
    },
    { match: (u: string) => u.includes("/rest/v1/community_replies"), respond: () => jsonResponse([]) },
  ];
}

Deno.test("community-admin GET enriches flagged rows with reportCount + authorBanned via two bounded reads", async () => {
  await withAdminEnv(() =>
    withFetchStub(enrichedRoutes(), async (calls) => {
      const r = await handler(authed("GET"));
      assertEquals(r.status, 200);
      const j = await r.json();
      assertEquals(j.flaggedPosts.length, 1);
      assertEquals(j.flaggedPosts[0].reportCount, 2);
      assertEquals(j.flaggedPosts[0].authorBanned, true);
      // Exactly TWO enrichment reads, both bounded + filtered to the flagged ids.
      const reportReads = calls.filter((u) => u.includes("select=target_id"));
      const banReads = calls.filter((u) => u.includes("select=id,is_banned"));
      assertEquals(reportReads.length, 1);
      assertEquals(banReads.length, 1);
      assert(reportReads[0].includes("status=eq.open"), "counts only OPEN reports");
      assert(reportReads[0].includes(`target_id=in.(${POST_ID})`), "scoped to the flagged ids");
      assert(reportReads[0].includes("limit="), "bounded");
      assert(banReads[0].includes(`id=in.(${AUTHOR_ID})`), "scoped to the flagged authors");
      assert(banReads[0].includes("limit="), "bounded");
    })
  );
});

Deno.test("community-admin GET enrichment is fail-soft: failed reads leave the fields ABSENT (never a fake 0/false)", async () => {
  await withAdminEnv(() =>
    withFetchStub(enrichedRoutes({ enrichFail: true }), async () => {
      const r = await handler(authed("GET"));
      assertEquals(r.status, 200); // the queue itself still loads
      const j = await r.json();
      assertEquals(j.flaggedPosts.length, 1);
      assertEquals("reportCount" in j.flaggedPosts[0], false);
      assertEquals("authorBanned" in j.flaggedPosts[0], false);
    })
  );
});

Deno.test("community-admin GET enrichment leaves rows PAST the 200-id cap UNANNOTATED (never a fabricated 0/false beyond the capped lookup)", async () => {
  const CAP = 200;
  const N = CAP + 1; // one flagged row beyond the enrichment id cap
  // Distinct uuid-ish id + user_id per row so the cap (on UNIQUE ids) bites at N-1.
  const posts = Array.from({ length: N }, (_, i) => ({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-" + i.toString(16).padStart(12, "0"),
    user_id: "bbbbbbbb-bbbb-bbbb-bbbb-" + i.toString(16).padStart(12, "0"),
    author: "u" + i,
    channel: "סלולר",
    body: "spam",
    created_at: "2026-07-01T00:00:00Z",
  }));
  const firstId = posts[0].id;
  const firstAuthor = posts[0].user_id;
  const pastCapId = posts[N - 1].id;
  const routes = [
    { match: (u: string) => u.includes("/auth/v1/user"), respond: () => jsonResponse({ id: ADMIN }) },
    { match: (u: string) => u.includes("/rest/v1/profiles") && u.includes("select=is_admin"), respond: () => jsonResponse([{ is_admin: true }]) },
    // Enrichment: the first (in-cap) post has 2 open reports and a banned author.
    { match: (u: string) => u.includes("/rest/v1/profiles") && u.includes("select=id,is_banned"), respond: () => jsonResponse([{ id: firstAuthor, is_banned: true }]) },
    { match: (u: string) => u.includes("/rest/v1/community_reports") && u.includes("select=target_id"), respond: () => jsonResponse([{ target_id: firstId }, { target_id: firstId }]) },
    { match: (u: string) => u.includes("/rest/v1/community_reports"), respond: () => jsonResponse([]) },
    { match: (u: string) => u.includes("/rest/v1/community_posts"), respond: () => jsonResponse(posts) },
    { match: (u: string) => u.includes("/rest/v1/community_replies"), respond: () => jsonResponse([]) },
  ];
  await withAdminEnv(() =>
    withFetchStub(routes, async (calls) => {
      const r = await handler(authed("GET"));
      assertEquals(r.status, 200);
      const j = await r.json();
      assertEquals(j.flaggedPosts.length, N);
      // In-cap row #0 WAS queried → real annotations.
      assertEquals(j.flaggedPosts[0].reportCount, 2);
      assertEquals(j.flaggedPosts[0].authorBanned, true);
      // In-cap row #1 was queried but has no reports / isn't banned → REAL 0 / false.
      assertEquals(j.flaggedPosts[1].reportCount, 0);
      assertEquals(j.flaggedPosts[1].authorBanned, false);
      // The bug: the row PAST the cap was never looked up, so its fields must be
      // ABSENT ("unknown" to the web client) — NOT a fabricated 0 / false.
      const last = j.flaggedPosts[N - 1];
      assertEquals("reportCount" in last, false);
      assertEquals("authorBanned" in last, false);
      // Prove the lookup itself was capped: the past-cap id never reached the query.
      const reportReads = calls.filter((u) => u.includes("select=target_id"));
      assertEquals(reportReads.length, 1);
      assertFalse(reportReads[0].includes(pastCapId), "the past-cap id is never queried");
    })
  );
});
