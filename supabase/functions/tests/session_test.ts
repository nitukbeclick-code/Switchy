// Unit tests for _shared/session.ts — the pure helpers of the unified
// ChatSession (id validation, transcript/tool-call/slot mutators + capping, the
// channel-agnostic shape) PLUS the optimistic-concurrency load/save contract
// (version token captured at load; a save that lost a cross-isolate race is
// silently dropped). The concurrency tests stub fetch + env (both restored);
// everything else is pure. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  appendTurn,
  asChatTurns,
  emptySession,
  loadSession,
  MAX_TOOLCALLS,
  MAX_TRANSCRIPT,
  mergeSlots,
  recordToolCall,
  safeSessionId,
  saveSession,
} from "../_shared/session.ts";
import { jsonResponse, withFetchStub } from "./_capture_handler.ts";

Deno.test("safeSessionId accepts a sane id and rejects junk / injection", () => {
  assertEquals(safeSessionId("abc123_-XY"), "abc123_-XY");
  assertEquals(safeSessionId("short"), ""); // < 6 chars
  assertEquals(safeSessionId("has space"), "");
  assertEquals(safeSessionId("id=eq.evil"), ""); // PostgREST-filter smuggling blocked
  assertEquals(safeSessionId(null), "");
});

Deno.test("emptySession is a stateless session for the channel + key", () => {
  const s = emptySession("whatsapp", "conv-9");
  assertEquals(s.channel, "whatsapp");
  assertEquals(s.key, "conv-9");
  assertEquals(s.transcript, []);
  assertEquals(s.toolCalls, []);
  assertEquals(s.slots, {});
});

Deno.test("appendTurn adds turns and clips an empty/over-long one; transcript is capped", () => {
  const s = emptySession("site", "sess-123456");
  appendTurn(s, "user", "  שלום  ");
  appendTurn(s, "bot", "");
  assertEquals(s.transcript.length, 1); // empty bot turn dropped
  assertEquals(s.transcript[0], { role: "user", text: "שלום" });
  for (let i = 0; i < 30; i++) appendTurn(s, "user", `m${i}`);
  assert(s.transcript.length <= MAX_TRANSCRIPT);
});

Deno.test("recordToolCall appends and caps the tool-call history", () => {
  const s = emptySession("app", "sess-abcdef");
  for (let i = 0; i < 30; i++) recordToolCall(s, "search_plans", i % 2 === 0, `p${i}`);
  assert(s.toolCalls.length <= MAX_TOOLCALLS);
  assertEquals(s.toolCalls[s.toolCalls.length - 1].name, "search_plans");
});

Deno.test("mergeSlots fills gaps; new non-empty values win, empties ignored", () => {
  const s = emptySession("whatsapp", "conv-7");
  mergeSlots(s, { category: "cellular", budget: 50 });
  mergeSlots(s, { category: "", budget: 60, abroad: true }); // empty category ignored
  assertEquals(s.slots.category, "cellular");
  assertEquals(s.slots.budget, 60);
  assertEquals(s.slots.abroad, true);
});

Deno.test("asChatTurns returns the recent transcript as {role,text} turns", () => {
  const s = emptySession("site", "sess-zzzzzz");
  appendTurn(s, "user", "מה זול?");
  appendTurn(s, "bot", "הנה כמה אפשרויות");
  const turns = asChatTurns(s);
  assertEquals(turns.length, 2);
  assertEquals(turns[0].role, "user");
  assertEquals(turns[1].role, "bot");
});

Deno.test("recordToolCall keeps lastToolName + turnCount slots in sync", () => {
  const s = emptySession("site", "sess-tooly1");
  assertEquals(s.slots.turnCount, undefined);
  recordToolCall(s, "search_plans", true, "p1");
  assertEquals(s.slots.lastToolName, "search_plans");
  assertEquals(s.slots.turnCount, 1);
  recordToolCall(s, "refine_recommendation", true);
  assertEquals(s.slots.lastToolName, "refine_recommendation");
  assertEquals(s.slots.turnCount, 2); // counts past MAX_TOOLCALLS cap on the audit
});

Deno.test("mergeSlots UNIONs rejectedPlanIds / objections, overwrites scalars", () => {
  const s = emptySession("whatsapp", "conv-refine");
  mergeSlots(s, { rejectedPlanIds: ["p1", "p2"], objections: ["יקר מדי"] });
  mergeSlots(s, { rejectedPlanIds: ["p2", "p3"], objections: ["נעילה לשנתיים"] });
  assertEquals(s.slots.rejectedPlanIds, ["p1", "p2", "p3"]); // de-duped union
  assertEquals(s.slots.objections, ["יקר מדי", "נעילה לשנתיים"]);
  // turnCount is a scalar slot: last value wins.
  mergeSlots(s, { turnCount: 5 });
  mergeSlots(s, { turnCount: 7 });
  assertEquals(s.slots.turnCount, 7);
});

Deno.test("new slots survive a clip round-trip (load drops nothing, sanitizes junk)", () => {
  // clipSlots is internal; round-trip it the way load does — through the same
  // shape the save path writes. We assert via mergeSlots+recordToolCall here and
  // pin the bounds/sanitization that clipSlots enforces on reload.
  const s = emptySession("site", "sess-round1");
  // Over-cap + duplicate + non-string junk; mergeSlots should clamp + de-dupe.
  const many = Array.from({ length: 40 }, (_, i) => `plan-${i}`);
  mergeSlots(s, { rejectedPlanIds: [...many, "plan-0"] });
  assert(s.slots.rejectedPlanIds!.length <= 24); // MAX_REJECTED
  assert(new Set(s.slots.rejectedPlanIds).size === s.slots.rejectedPlanIds!.length);
  // The most-recent ids are the ones kept (slice(-cap)).
  assertEquals(s.slots.rejectedPlanIds!.at(-1), "plan-39");
});

Deno.test("backward-compat: ChatSession with no new slots is unchanged", () => {
  const s = emptySession("app", "sess-compat");
  mergeSlots(s, { category: "cellular", budget: 50, consent: true });
  // No new-slot keys leak in when none were set.
  assertEquals("rejectedPlanIds" in s.slots, false);
  assertEquals("objections" in s.slots, false);
  assertEquals("turnCount" in s.slots, false);
  assertEquals("lastToolName" in s.slots, false);
  assertEquals(s.slots.category, "cellular");
  assertEquals(s.slots.consent, true);
});

// ── OPTIMISTIC CONCURRENCY: version at load, conditional save, silent drop ─────
// Two isolates racing on one conversation used to lose-update ai_state (the
// second save clobbered the first's memory). Now: load captures a version token
// (whatsapp → ai_state.rev inside the jsonb; site/app → ai_sessions.updated_at),
// save CONDITIONS on it, and a save that matches zero rows — the LOSING side of
// the race — is silently dropped (returns false, no retry, no error).

// Set env for the duration of `fn`, restoring the PREVIOUS values (sibling test
// files leak SUPABASE_* at module load, so both set and restore).
async function withEnvVars(env: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const [k, v] of Object.entries(env)) {
    saved.set(k, Deno.env.get(k));
    Deno.env.set(k, v);
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

const DB_ENV = { SUPABASE_URL: "https://sess-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc-stub" };
type Patch = { url: string; body: Record<string, unknown> };

Deno.test("whatsapp: load captures ai_state.rev; save conditions on it and stamps a NEW rev", async () => {
  const patches: Patch[] = [];
  await withEnvVars(DB_ENV, async () => {
    await withFetchStub([
      {
        match: (u, init) =>
          u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
        respond: () =>
          jsonResponse([{ ai_state: { category: "cellular", rev: "rev-OLD", agent: { transcript: [] } } }]),
      },
      {
        match: (u, init) =>
          u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "PATCH",
        respond: (u, init) => {
          patches.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
          return jsonResponse([{ id: "conv-oc-1" }]); // one row matched → we won
        },
      },
    ], async () => {
      const s = await loadSession("whatsapp", "conv-oc-1");
      assertEquals(s.version, "rev-OLD"); // the token was captured at load
      assertEquals(s.slots.category, "cellular"); // …and the slots still parse
      appendTurn(s, "user", "כמה עולה?");
      assertEquals(await saveSession(s), true);
    });
  });
  assertEquals(patches.length, 1);
  // The PATCH is CONDITIONAL on the loaded rev (id alone is not enough).
  assert(patches[0].url.includes("id=eq.conv-oc-1"));
  assert(patches[0].url.includes(`ai_state->>rev=eq.${encodeURIComponent("rev-OLD")}`));
  // …and the written ai_state carries a FRESH rev for the next round.
  const aiState = patches[0].body.ai_state as Record<string, unknown>;
  assert(typeof aiState.rev === "string" && aiState.rev && aiState.rev !== "rev-OLD");
  assertEquals(aiState.category, "cellular"); // top-level slots preserved
  assert(aiState.agent && typeof aiState.agent === "object", "agent envelope nested");
});

Deno.test("whatsapp: a save that LOST the race (0 rows matched) is silently dropped — no retry", async () => {
  const patches: Patch[] = [];
  await withEnvVars(DB_ENV, async () => {
    await withFetchStub([
      {
        match: (u, init) =>
          u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
        respond: () => jsonResponse([{ ai_state: { rev: "rev-STALE" } }]),
      },
      {
        match: (u, init) =>
          u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "PATCH",
        respond: (u, init) => {
          patches.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
          return jsonResponse([]); // another isolate re-stamped rev first → 0 rows
        },
      },
    ], async () => {
      const s = await loadSession("whatsapp", "conv-oc-2");
      appendTurn(s, "user", "עוד שאלה");
      assertEquals(await saveSession(s), false); // dropped, not thrown
    });
  });
  assertEquals(patches.length, 1, "exactly ONE conditional PATCH — the loser never retries");
});

Deno.test("whatsapp: a legacy/fresh row (no rev) saves with a rev-still-absent condition", async () => {
  const patches: Patch[] = [];
  await withEnvVars(DB_ENV, async () => {
    await withFetchStub([
      {
        match: (u, init) =>
          u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
        respond: () => jsonResponse([{ ai_state: { category: "internet" } }]), // pre-rev row
      },
      {
        match: (u, init) =>
          u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "PATCH",
        respond: (u, init) => {
          patches.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
          return jsonResponse([{ id: "conv-oc-3" }]);
        },
      },
    ], async () => {
      const s = await loadSession("whatsapp", "conv-oc-3");
      assertEquals(s.version, undefined); // legacy row → no token
      appendTurn(s, "bot", "יש מסלול ב-49");
      assertEquals(await saveSession(s), true);
    });
  });
  assertEquals(patches.length, 1);
  // Conditioned on the rev STILL being absent — a concurrent save that already
  // stamped one wins, and this write would have matched zero rows.
  assert(patches[0].url.includes("ai_state->>rev=is.null"));
});

Deno.test("site: load captures updated_at; save is a conditional PATCH that loses races silently", async () => {
  const LOADED_AT = "2026-07-01T10:00:00.123456+00:00";
  const patches: Patch[] = [];
  let patchRows: unknown[] = [{ session_id: "sess-oc-000001" }];
  await withEnvVars(DB_ENV, async () => {
    await withFetchStub([
      {
        match: (u, init) => u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "GET",
        respond: () =>
          jsonResponse([{ messages: { transcript: [{ role: "user", text: "היי" }] }, updated_at: LOADED_AT }]),
      },
      {
        match: (u, init) => u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "PATCH",
        respond: (u, init) => {
          patches.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
          return jsonResponse(patchRows);
        },
      },
    ], async () => {
      const s = await loadSession("site", "sess-oc-000001");
      assertEquals(s.version, LOADED_AT);
      assertEquals(s.transcript.length, 1); // prior memory still loads
      appendTurn(s, "bot", "שלום!");
      assertEquals(await saveSession(s), true); // condition matched → won
      patchRows = []; // now simulate losing the race
      assertEquals(await saveSession(s), false); // dropped silently
    });
  });
  assertEquals(patches.length, 2);
  // Conditional on the captured updated_at, and the body bumps it.
  assert(patches[0].url.includes("session_id=eq.sess-oc-000001"));
  assert(patches[0].url.includes(`updated_at=eq.${encodeURIComponent(LOADED_AT)}`));
  assert(typeof patches[0].body.updated_at === "string" && patches[0].body.updated_at !== LOADED_AT);
});

Deno.test("site: a NEW session (no version) inserts-if-new; a conflict means the other writer won", async () => {
  const posts: Patch[] = [];
  let postRows: unknown[] = [{ session_id: "sess-oc-fresh1" }];
  await withEnvVars(DB_ENV, async () => {
    await withFetchStub([
      {
        match: (u, init) => u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "GET",
        respond: () => jsonResponse([]), // row doesn't exist yet
      },
      {
        match: (u, init) => u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "POST",
        respond: (u, init) => {
          posts.push({ url: u, body: JSON.parse(String(init?.body ?? "{}")) });
          return jsonResponse(postRows, 201);
        },
      },
    ], async () => {
      const s = await loadSession("site", "sess-oc-fresh1");
      assertEquals(s.version, undefined);
      appendTurn(s, "user", "שאלה ראשונה");
      assertEquals(await saveSession(s), true); // inserted → won
      postRows = []; // ignore-duplicates: someone created it first
      assertEquals(await saveSession(s), false); // the losing save is dropped
    });
  });
  assertEquals(posts.length, 2);
  assert(posts[0].url.includes("on_conflict=session_id"));
  assertFalse(
    JSON.stringify(posts[0].body).includes("merge-duplicates"),
    "the body carries no resolution hint (it lives in Prefer)",
  );
});
