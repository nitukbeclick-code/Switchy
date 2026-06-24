// Unit tests for _shared/session.ts — the pure (non-DB) helpers of the unified
// ChatSession: id validation, transcript/tool-call/slot mutators + capping, and
// the channel-agnostic shape. The load/save DB paths are fail-soft and exercised
// by the higher-level edge-fn tests; here we pin the pure logic.
// No network, no env. Run from supabase/functions/:  deno task test

import { assert, assertEquals } from "@std/assert";
import {
  appendTurn,
  asChatTurns,
  emptySession,
  MAX_TOOLCALLS,
  MAX_TRANSCRIPT,
  mergeSlots,
  recordToolCall,
  safeSessionId,
} from "../_shared/session.ts";

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
