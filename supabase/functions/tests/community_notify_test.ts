// Integration tests for the community-notify edge function
// (community-notify/index.ts) — the Database-Webhook target that pings the team
// Telegram chat on new community activity. We capture the REAL request handler
// (see _capture_handler.ts) and drive it with synthetic webhook bodies, so these
// tests pin the function's actual behaviour without modifying its source:
//
//   • webhook-secret verification (fail-closed 401, method gate 405)
//   • table routing (only the three community tables produce a message)
//   • the formatted Hebrew message (channel mapping, stars, HTML escaping)
//
// Telegram + Vault calls are intercepted via a per-test fetch stub that is always
// restored afterwards (no global leak, no network, no port).
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// ── Test rig ──────────────────────────────────────────────────────────────────
// Config comes from env (no SUPABASE_URL ⇒ Vault is skipped, so the env secret
// wins). Set everything BEFORE the single import the handler capture performs.
const SECRET = "community-notify-test-secret";
Deno.env.set("LEAD_WEBHOOK_SECRET", SECRET);
Deno.env.set("TELEGRAM_BOT_TOKEN", "test-token");
Deno.env.set("TELEGRAM_CHAT_ID", "-1001234567890");
Deno.env.delete("SUPABASE_URL");
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

const handler = await captureServeHandler("../community-notify/index.ts");

function post(secret: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    handler(new Request("https://edge/community-notify", {
      method: "POST",
      headers: { "x-webhook-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
  );
}

// Telegram interceptor: records the text the function tries to send. Restored
// after every test via withFetchStub.
function telegramSink(sent: string[]) {
  return [{
    match: (u: string) => u.includes("api.telegram.org"),
    respond: (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      sent.push(String(body.text ?? ""));
      return jsonResponse({ ok: true, result: {} });
    },
  }];
}

// ── method + secret gate ───────────────────────────────────────────────────────

Deno.test("community-notify rejects non-POST with 405", async () => {
  await withFetchStub(telegramSink([]), async () => {
    const r = await Promise.resolve(handler(new Request("https://edge/community-notify", { method: "GET" })));
    assertEquals(r.status, 405);
  });
});

Deno.test("community-notify fails closed (401) on a missing/wrong webhook secret", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    assertEquals((await post("", { type: "INSERT", table: "community_posts", record: { author: "a", body: "b" } })).status, 401);
    assertEquals((await post("not-the-secret", { type: "INSERT", table: "community_posts", record: { author: "a", body: "b" } })).status, 401);
  });
  // An unauthenticated caller must never cause a Telegram send.
  assertEquals(sent.length, 0);
});

Deno.test("community-notify returns 400 on a malformed JSON body (authenticated)", async () => {
  await withFetchStub(telegramSink([]), async () => {
    const r = await Promise.resolve(handler(new Request("https://edge/community-notify", {
      method: "POST",
      headers: { "x-webhook-secret": SECRET },
      body: "{ not json",
    })));
    assertEquals(r.status, 400);
  });
});

// ── routing: only the community tables, only INSERTs ───────────────────────────

Deno.test("community-notify ignores non-INSERT events without sending", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    const r = await post(SECRET, { type: "UPDATE", table: "community_posts", record: { author: "a", body: "b" } });
    assertEquals(r.status, 200);
    assertStringIncludes(await r.text(), "not-insert");
  });
  assertEquals(sent.length, 0);
});

Deno.test("community-notify ignores tables it does not handle without sending", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    const r = await post(SECRET, { type: "INSERT", table: "leads", record: { author: "a", body: "b" } });
    assertEquals(r.status, 200);
    assertStringIncludes(await r.text(), "unhandled-table");
  });
  assertEquals(sent.length, 0);
});

// ── formatted messages ─────────────────────────────────────────────────────────

Deno.test("community-notify formats a new post with the Hebrew channel label", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    const r = await post(SECRET, {
      type: "INSERT",
      table: "community_posts",
      record: { author: "דנה", body: "שלום לכולם", channel: "switch" },
    });
    assertEquals(r.status, 200);
  });
  const text = sent[0] ?? "";
  assertStringIncludes(text, "פוסט חדש בקהילה");
  assertStringIncludes(text, "מעבר ספק"); // channel 'switch' → Hebrew
  assertStringIncludes(text, "דנה");
  assertStringIncludes(text, "שלום לכולם");
});

Deno.test("community-notify formats a reply and HTML-escapes user content", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    const r = await post(SECRET, {
      type: "INSERT",
      table: "community_replies",
      record: { author: "<b>spoof</b>", body: "tag <script>" },
    });
    assertEquals(r.status, 200);
  });
  const text = sent[0] ?? "";
  assertStringIncludes(text, "תגובה חדשה בקהילה");
  // Author/body are escaped so they can't inject Telegram HTML markup.
  assertStringIncludes(text, "&lt;b&gt;spoof&lt;/b&gt;");
  assert(!text.includes("<script>"));
});

Deno.test("community-notify renders provider review stars from the overall score", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    const r = await post(SECRET, {
      type: "INSERT",
      table: "provider_reviews",
      record: { provider: "HOT", overall: 4, body: "שירות מצוין" },
    });
    assertEquals(r.status, 200);
  });
  const text = sent[0] ?? "";
  assertStringIncludes(text, "ביקורת חדשה");
  assertStringIncludes(text, "HOT");
  assertStringIncludes(text, "⭐⭐⭐⭐"); // 4 stars
  assertStringIncludes(text, "(4/5)");
});

Deno.test("community-notify clamps an out-of-range review score into 1..5 stars", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    // overall=9 must not render 9 stars — the function clamps to 5.
    const r = await post(SECRET, {
      type: "INSERT",
      table: "provider_reviews",
      record: { provider: "Cellcom", overall: 9, body: "" },
    });
    assertEquals(r.status, 200);
  });
  const text = sent[0] ?? "";
  assertStringIncludes(text, "⭐⭐⭐⭐⭐");
  assert(!text.includes("⭐⭐⭐⭐⭐⭐")); // never 6+
});

Deno.test("community-notify tolerates a missing/non-numeric review score", async () => {
  const sent: string[] = [];
  await withFetchStub(telegramSink(sent), async () => {
    const r = await post(SECRET, {
      type: "INSERT",
      table: "provider_reviews",
      record: { provider: "Pelephone", body: "ok" },
    });
    assertEquals(r.status, 200);
  });
  // No crash; the score placeholder is rendered.
  assertStringIncludes(sent[0] ?? "", "(?/5)");
});

// ── @mention fan-out ────────────────────────────────────────────────────────────
// With SUPABASE_URL set, the function calls the resolve_community_mentions RPC via
// the service role. We intercept that POST to assert the parsed names + context the
// edge function sends, and stub the Vault RPC (get_lead_notify_config) so config
// resolution never hits the network. The RPC returns a count, which surfaces in the
// response as `mentioned`.

// Records the resolve_community_mentions payload; returns the configured count.
function mentionRoutes(captured: Array<Record<string, unknown>>, notified = 0) {
  return [
    { match: (u: string) => u.includes("api.telegram.org"), respond: () => jsonResponse({ ok: true, result: {} }) },
    // Vault config RPC — return {} so the env secret/token win (no network secret).
    { match: (u: string) => u.includes("/rpc/get_lead_notify_config"), respond: () => jsonResponse({}) },
    {
      match: (u: string) => u.includes("/rpc/resolve_community_mentions"),
      respond: (_u: string, init?: RequestInit) => {
        captured.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([{ notified }]);
      },
    },
  ];
}

async function withSupabaseEnv(fn: () => Promise<void>) {
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");
  try {
    await fn();
  } finally {
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
}

Deno.test("community-notify fans out @mentions from a new post to the resolve RPC", async () => {
  const captured: Array<Record<string, unknown>> = [];
  await withSupabaseEnv(async () => {
    await withFetchStub(mentionRoutes(captured, 2), async () => {
      const r = await post(SECRET, {
        type: "INSERT",
        table: "community_posts",
        record: { id: "post-9", user_id: "author-uid", author: "רון", body: "מה דעתכם @דנה ו @Yossi_2024 ?" },
      });
      assertEquals(r.status, 200);
      assertEquals((await r.json()).mentioned, 2);
    });
  });
  assertEquals(captured.length, 1);
  const p = captured[0];
  assertEquals(p.p_post_id, "post-9");
  assertEquals(p.p_reply_id, null);          // a post has no reply id
  assertEquals(p.p_actor_id, "author-uid");
  assertEquals(p.p_actor, "רון");
  // Both Hebrew and Latin handles parsed, '@' stripped, deduped.
  const names = p.p_names as string[];
  assert(names.includes("דנה"));
  assert(names.includes("Yossi_2024"));
});

Deno.test("community-notify passes the reply id when a reply mentions someone", async () => {
  const captured: Array<Record<string, unknown>> = [];
  await withSupabaseEnv(async () => {
    await withFetchStub(mentionRoutes(captured, 1), async () => {
      const r = await post(SECRET, {
        type: "INSERT",
        table: "community_replies",
        record: { id: "reply-3", post_id: "post-1", user_id: "u2", author: "מאיה", body: "תודה @רון!" },
      });
      assertEquals(r.status, 200);
      assertEquals((await r.json()).mentioned, 1);
    });
  });
  const p = captured[0];
  assertEquals(p.p_post_id, "post-1");       // the parent post
  assertEquals(p.p_reply_id, "reply-3");     // and the reply it came from
  assertEquals((p.p_names as string[])[0], "רון");
});

Deno.test("community-notify does NOT call the resolve RPC when there are no @mentions", async () => {
  const captured: Array<Record<string, unknown>> = [];
  await withSupabaseEnv(async () => {
    await withFetchStub(mentionRoutes(captured, 0), async (calls) => {
      const r = await post(SECRET, {
        type: "INSERT",
        table: "community_posts",
        record: { id: "post-x", user_id: "u", author: "א", body: "שאלה כללית בלי תיוגים" },
      });
      assertEquals(r.status, 200);
      assertEquals((await r.json()).mentioned, 0);
      assertEquals(calls.filter((u) => u.includes("resolve_community_mentions")).length, 0);
    });
  });
  assertEquals(captured.length, 0);
});

Deno.test("community-notify does not fan out @mentions for provider reviews", async () => {
  const captured: Array<Record<string, unknown>> = [];
  await withSupabaseEnv(async () => {
    await withFetchStub(mentionRoutes(captured, 0), async (calls) => {
      const r = await post(SECRET, {
        type: "INSERT",
        table: "provider_reviews",
        record: { provider: "HOT", overall: 5, body: "תודה @דנה" },
      });
      assertEquals(r.status, 200);
      // Reviews are not a mention surface — the resolve RPC is never called.
      assertEquals(calls.filter((u) => u.includes("resolve_community_mentions")).length, 0);
    });
  });
  assertEquals(captured.length, 0);
});

Deno.test("community-notify still sends the team ping when the mention RPC fails", async () => {
  // The resolve RPC erroring (here: 500) must not drop the team Telegram ping —
  // the two are independent. mentioned falls back to 0, the ping still goes out.
  const sent: string[] = [];
  await withSupabaseEnv(async () => {
    await withFetchStub([
      { match: (u: string) => u.includes("api.telegram.org"), respond: (_u, init) => {
        sent.push(JSON.parse(String(init?.body ?? "{}")).text ?? "");
        return jsonResponse({ ok: true, result: {} });
      } },
      { match: (u: string) => u.includes("/rpc/get_lead_notify_config"), respond: () => jsonResponse({}) },
      { match: (u: string) => u.includes("/rpc/resolve_community_mentions"), respond: () => new Response("boom", { status: 500 }) },
    ], async () => {
      const r = await post(SECRET, {
        type: "INSERT",
        table: "community_posts",
        record: { id: "p1", user_id: "u", author: "ניר", body: "היי @דנה" },
      });
      assertEquals(r.status, 200);
      assertEquals((await r.json()).mentioned, 0); // fail-soft
    });
  });
  assertStringIncludes(sent[0] ?? "", "פוסט חדש בקהילה"); // team ping still sent
});
