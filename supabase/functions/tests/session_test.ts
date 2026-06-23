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
