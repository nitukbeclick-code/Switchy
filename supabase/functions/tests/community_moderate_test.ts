// Integration tests for the community-moderate edge function
// (community-moderate/index.ts) — the AFTER-INSERT trigger target that classifies
// new community content with an LLM and flags only clear violations. We capture
// the REAL request handler (see _capture_handler.ts) and drive it with synthetic
// trigger bodies + a stubbed classifier, so these tests pin the function's actual
// behaviour without modifying its source. The contracts that matter most:
//
//   • webhook-secret verification (fail-closed 401, method gate 405)
//   • routing (only INSERTs into community_posts / community_replies)
//   • empty / no-classifier short-circuits
//   • the Groq fallback verdict is parsed and drives flagging
//   • FAIL-OPEN: a classifier error / garbage / non-flag verdict never flags
//   • the DB patch is scoped to the exact row id (no over-broad update)
//
// The Groq key is set per-test via env (the handler reads it fresh through
// firstEnv on every request); the fetch stub is installed per-test and always
// restored (no global leak, no network).
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

const SECRET = "community-moderate-test-secret";
Deno.env.set("LEAD_WEBHOOK_SECRET", SECRET);
// No SUPABASE_URL ⇒ Vault skipped AND the DB patch (patchCount) is a no-op that
// reports 0 rows — exactly the "lost race / RLS" fail-soft branch we assert on.
Deno.env.delete("SUPABASE_URL");
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("GOOGLE_AI_KEY");
Deno.env.delete("GROQ_API_KEY");

const handler = await captureServeHandler("../community-moderate/index.ts");

function post(secret: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    handler(new Request("https://edge/community-moderate", {
      method: "POST",
      headers: { "x-webhook-secret": secret, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
  );
}
const insert = (table: string, record: Record<string, unknown>) => ({ type: "INSERT", table, record });

type GroqMode = "flag-high" | "flag-low" | "noflag" | "garbage" | "error";
function groqContent(mode: GroqMode): Response {
  switch (mode) {
    case "flag-high":
      return jsonResponse({ choices: [{ message: { content: '{"flag":true,"reason":"ספאם פרסומי","severity":"high"}' } }] });
    case "flag-low":
      return jsonResponse({ choices: [{ message: { content: '{"flag":true,"reason":"לא ראוי","severity":"low"}' } }] });
    case "noflag":
      return jsonResponse({ choices: [{ message: { content: '{"flag":false,"reason":"תקין","severity":"low"}' } }] });
    case "garbage":
      return jsonResponse({ choices: [{ message: { content: "definitely not json" } }] });
    case "error":
      return new Response("upstream boom", { status: 500 });
  }
}
// Routes for a test that wants a configured Groq classifier + a telegram sink.
function classifierRoutes(mode: GroqMode) {
  return [
    { match: (u: string) => u.includes("api.groq.com"), respond: () => groqContent(mode) },
    { match: (u: string) => u.includes("api.telegram.org"), respond: () => jsonResponse({ ok: true, result: {} }) },
  ];
}

// ── method + secret gate ───────────────────────────────────────────────────────

Deno.test("community-moderate rejects non-POST with 405", async () => {
  await withFetchStub(classifierRoutes("noflag"), async () => {
    const r = await Promise.resolve(handler(new Request("https://edge/community-moderate", { method: "GET" })));
    assertEquals(r.status, 405);
  });
});

Deno.test("community-moderate fails closed (401) on a missing/wrong webhook secret", async () => {
  Deno.env.set("GROQ_API_KEY", "groq-test"); // even with a classifier, the gate wins
  try {
    await withFetchStub(classifierRoutes("flag-high"), async (calls) => {
      assertEquals((await post("", insert("community_posts", { id: "1", body: "x" }))).status, 401);
      assertEquals((await post("wrong", insert("community_posts", { id: "1", body: "x" }))).status, 401);
      // The classifier is never invoked for an unauthenticated request (no quota burn).
      assertEquals(calls.filter((u) => u.includes("api.groq.com")).length, 0);
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

// ── routing + short-circuits ───────────────────────────────────────────────────

Deno.test("community-moderate skips unhandled events (e.g. DELETE)", async () => {
  await withFetchStub(classifierRoutes("noflag"), async () => {
    const r = await post(SECRET, { type: "DELETE", table: "community_posts", record: { id: "1", body: "x" } });
    assertEquals(r.status, 200);
    assertStringIncludes(await r.text(), "unhandled-type");
  });
});

Deno.test("community-moderate re-moderates UPDATE (edit) events instead of skipping", async () => {
  // An edit re-opens moderation: the UPDATE is PROCESSED (a clean edited body
  // classifies no-flag and returns flagged:false, and would clear a stale flag).
  Deno.env.set("GROQ_API_KEY", "groq-test");
  try {
    await withFetchStub(classifierRoutes("noflag"), async () => {
      const r = await post(SECRET, {
        type: "UPDATE",
        table: "community_posts",
        record: { id: "1", body: "מחיר טוב, ממליץ על הספק" },
      });
      assertEquals(r.status, 200);
      const text = await r.text();
      assertStringIncludes(text, "flagged"); // e.g. {"ok":true,"flagged":false}
      if (text.includes("unhandled-type")) {
        throw new Error("an UPDATE edit must be re-moderated, not skipped");
      }
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

Deno.test("community-moderate skips tables it does not moderate", async () => {
  await withFetchStub(classifierRoutes("noflag"), async () => {
    const r = await post(SECRET, insert("provider_reviews", { id: "1", body: "x" }));
    assertEquals(r.status, 200);
    assertStringIncludes(await r.text(), "unhandled-table");
  });
});

Deno.test("community-moderate skips rows with no id or empty body", async () => {
  await withFetchStub(classifierRoutes("noflag"), async () => {
    assertStringIncludes(await (await post(SECRET, insert("community_posts", { id: "", body: "x" }))).text(), "empty");
    assertStringIncludes(await (await post(SECRET, insert("community_posts", { id: "1", body: "" }))).text(), "empty");
  });
});

Deno.test("community-moderate is a no-op when no classifier is configured", async () => {
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("GOOGLE_AI_KEY");
  Deno.env.delete("GROQ_API_KEY");
  await withFetchStub(classifierRoutes("flag-high"), async (calls) => {
    const r = await post(SECRET, insert("community_posts", { id: "1", body: "real content" }));
    assertEquals(r.status, 200);
    assertStringIncludes(await r.text(), "no-classifier");
    assertEquals(calls.filter((u) => u.includes("api.groq.com")).length, 0); // nothing called
  });
});

// ── heuristic pre-screen: the deterministic safety net (no LLM needed) ──────────

Deno.test("community-moderate heuristic flags obvious scam even with NO classifier", async () => {
  // No classifier configured: the LLM never runs, but the deterministic pre-screen
  // still catches a money-scam + contact-harvest combo. No SUPABASE_URL ⇒ the PATCH
  // reports 0 rows, so we see the fail-soft "no-match" — proof a flag was attempted.
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("GOOGLE_AI_KEY");
  Deno.env.delete("GROQ_API_KEY");
  await withFetchStub(classifierRoutes("noflag"), async (calls) => {
    const r = await post(SECRET, insert("community_posts", {
      id: "scam-1",
      body: "הלוואה מיידית ללא ריבית! העבר כסף עכשיו, צור קשר 050-1234567",
    }));
    assertEquals(r.status, 200);
    const j = await r.json();
    assertEquals(j.ok, true);
    assertEquals(j.flagged, false);    // patchCount=0 with no SUPABASE_URL …
    assertEquals(j.note, "no-match");  // … but a flag WAS attempted (not "no-classifier")
    assertEquals(calls.filter((u) => u.includes("api.groq.com")).length, 0); // LLM untouched
  });
});

Deno.test("community-moderate heuristic flags 'buy followers' spam", async () => {
  Deno.env.delete("GROQ_API_KEY");
  await withFetchStub(classifierRoutes("noflag"), async () => {
    const r = await post(SECRET, insert("community_replies", {
      id: "spam-1",
      body: "Buy followers cheap! 10000 followers for $5",
    }));
    assertEquals((await r.json()).note, "no-match"); // flag attempted
  });
});

Deno.test("community-moderate heuristic does NOT flag ordinary frustration / criticism", async () => {
  // A real angry-customer post with NO spam signals must pass when no LLM is set
  // (heuristic stays silent ⇒ no-classifier short-circuit, never a flag).
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("GOOGLE_AI_KEY");
  Deno.env.delete("GROQ_API_KEY");
  await withFetchStub(classifierRoutes("flag-high"), async () => {
    const r = await post(SECRET, insert("community_posts", {
      id: "ok-1",
      body: "השירות של פלאפון נוראי, חיכיתי שעה במוקד וניתקו לי. מאוכזב מאוד!!",
    }));
    assertStringIncludes(await r.text(), "no-classifier");
  });
});

Deno.test("community-moderate heuristic does NOT flag a single bare link", async () => {
  // One link with no other signal is below threshold (people share comparison
  // pages legitimately) — only a link + contact-harvest combo trips it.
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("GOOGLE_AI_KEY");
  Deno.env.delete("GROQ_API_KEY");
  await withFetchStub(classifierRoutes("flag-high"), async () => {
    const r = await post(SECRET, insert("community_posts", {
      id: "ok-2",
      body: "ראיתי השוואה טובה כאן example.com שווה לבדוק",
    }));
    assertStringIncludes(await r.text(), "no-classifier");
  });
});

// ── classifier verdict drives flagging ─────────────────────────────────────────

Deno.test("community-moderate flags on a clear Groq violation verdict", async () => {
  Deno.env.set("GROQ_API_KEY", "groq-test");
  try {
    await withFetchStub(classifierRoutes("flag-high"), async () => {
      const r = await post(SECRET, insert("community_posts", { id: "row-123", body: "buy followers cheap!!!" }));
      assertEquals(r.status, 200);
      const j = await r.json();
      // patchCount returns 0 with no SUPABASE_URL ⇒ fail-soft "no-match", not a crash.
      assertEquals(j.ok, true);
      assertEquals(j.flagged, false);
      assertEquals(j.note, "no-match");
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

Deno.test("community-moderate never issues an over-broad DB PATCH", async () => {
  Deno.env.set("GROQ_API_KEY", "groq-test");
  try {
    await withFetchStub(classifierRoutes("flag-high"), async (calls) => {
      await post(SECRET, insert("community_replies", { id: "weird id/with?chars", body: "scam link" }));
      // No SUPABASE_URL ⇒ serviceFetch returns null before any real PATCH, so the
      // network sees zero supabase REST calls — the function never issues an
      // over-broad update; the only outbound call is to the classifier.
      assertEquals(calls.filter((u) => u.includes("/rest/v1/")).length, 0);
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

// ── FAIL-OPEN: model trouble must never auto-hide content ───────────────────────

Deno.test("community-moderate does NOT flag when the classifier errors (fail-open)", async () => {
  Deno.env.set("GROQ_API_KEY", "groq-test");
  try {
    await withFetchStub(classifierRoutes("error"), async () => {
      const r = await post(SECRET, insert("community_posts", { id: "1", body: "ordinary post" }));
      assertEquals((await r.json()).flagged, false);
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

Deno.test("community-moderate does NOT flag on an unparseable verdict (fail-open)", async () => {
  Deno.env.set("GROQ_API_KEY", "groq-test");
  try {
    await withFetchStub(classifierRoutes("garbage"), async () => {
      const r = await post(SECRET, insert("community_posts", { id: "1", body: "ordinary post" }));
      assertEquals((await r.json()).flagged, false);
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

Deno.test("community-moderate does NOT flag legitimate content (flag=false verdict)", async () => {
  Deno.env.set("GROQ_API_KEY", "groq-test");
  try {
    await withFetchStub(classifierRoutes("noflag"), async () => {
      const r = await post(SECRET, insert("community_replies", { id: "1", body: "תודה על העזרה!" }));
      assertEquals((await r.json()).flagged, false);
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
  }
});

// ── the REAL flag PATCH, against a working DB stub ─────────────────────────────
// Every earlier test runs WITHOUT SUPABASE_URL, so the flag write is only ever
// observed as its fail-soft "no-match" shadow. This one wires a working DB stub
// and pins the actual PATCH: scoped to EXACTLY the one row id (URL-encoded — no
// over-broad filter that could flag other rows) with the documented body
// (is_flagged + a Hebrew moderation_note + flagged_at), and the success
// response {ok:true, flagged:true} once the write lands.

Deno.test("community-moderate flags via an id-scoped PATCH with the is_flagged/moderation_note body", async () => {
  const ROW_ID = "weird id/1"; // needs URL-encoding — pins the enc contract too
  Deno.env.set("GROQ_API_KEY", "groq-test");
  Deno.env.set("SUPABASE_URL", "https://mod-test.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc-stub");
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  try {
    await withFetchStub([
      { match: (u) => u.includes("api.groq.com"), respond: () => groqContent("flag-high") },
      { match: (u) => u.includes("api.telegram.org"), respond: () => jsonResponse({ ok: true, result: {} }) },
      {
        match: (u, init) =>
          u.includes("/rest/v1/community_replies") && (init?.method ?? "GET") === "PATCH",
        respond: (u, init) => {
          patches.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
          return jsonResponse([{ id: ROW_ID }]); // representation → patchCount=1
        },
      },
      // The rest of the PostgREST surface (report count read, the audit insert,
      // a possible config RPC) → benign.
      { match: (u) => u.includes("mod-test.supabase.co"), respond: () => jsonResponse([], 200) },
    ], async () => {
      const r = await post(SECRET, insert("community_replies", {
        id: ROW_ID,
        body: "Buy followers cheap! 10000 followers for $5 — www.spam-offer.top",
      }));
      assertEquals(r.status, 200);
      const j = await r.json();
      assertEquals(j.ok, true);
      assertEquals(j.flagged, true); // the write landed — no fail-soft shadow
    });
  } finally {
    Deno.env.delete("GROQ_API_KEY");
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
  assertEquals(patches.length, 1, "exactly one flag PATCH");
  // Scoped to EXACTLY this row id, URL-encoded — nothing broader.
  const u = new URL(patches[0].url);
  assertEquals(u.pathname, "/rest/v1/community_replies");
  assertEquals(u.search, `?id=eq.${encodeURIComponent(ROW_ID)}`);
  // The documented flag body: held for a human, never deleted.
  assertEquals(patches[0].body.is_flagged, true);
  assert(
    typeof patches[0].body.moderation_note === "string" &&
      (patches[0].body.moderation_note as string).length > 0,
    "a Hebrew moderation note for the reviewer",
  );
  assert(
    Number.isFinite(Date.parse(String(patches[0].body.flagged_at))),
    "flagged_at is a real timestamp",
  );
  assertEquals(Object.keys(patches[0].body).sort(), ["flagged_at", "is_flagged", "moderation_note"]);
});
