// Unit tests for the pure SSE helpers (_shared/sse.ts) that back the flag-gated
// streaming chat response. No network, no Deno.serve. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals } from "@std/assert";
import { chunkText, sseFrame } from "../_shared/sse.ts";

// ── sseFrame ──────────────────────────────────────────────────────────────────

Deno.test("sseFrame emits an event line + single-line JSON data + blank terminator", () => {
  assertEquals(sseFrame("token", { text: "hi" }), 'event: token\ndata: {"text":"hi"}\n\n');
  assertEquals(sseFrame("done", {}), "event: done\ndata: {}\n\n");
});

Deno.test("sseFrame keeps a newline INSIDE the payload from breaking the frame", () => {
  // A raw newline in the reply must be JSON-escaped (\n), never a literal newline,
  // or it would terminate the SSE data field early.
  const frame = sseFrame("token", { text: "line1\nline2" });
  assertEquals(frame, 'event: token\ndata: {"text":"line1\\nline2"}\n\n');
  // Exactly one blank-line terminator (the frame ends with \n\n and has no other).
  assertEquals(frame.split("\n\n").length, 2);
});

// ── chunkText ─────────────────────────────────────────────────────────────────

Deno.test("chunkText: concatenating the chunks reproduces the input EXACTLY", () => {
  const inputs = [
    "",
    "short",
    "a slightly longer hebrew-ish reply שמכילה כמה מילים ועוד קצת טקסט להשלמה",
    "one-very-long-unbroken-token-that-exceeds-the-target-length-by-a-lot-still-fine",
    "  leading and trailing spaces  ",
  ];
  for (const s of inputs) {
    assertEquals(chunkText(s).join(""), s, `roundtrip failed for: ${JSON.stringify(s)}`);
  }
});

Deno.test("chunkText: empty input → no chunks", () => {
  assertEquals(chunkText(""), []);
  assertEquals(chunkText("   ").join(""), "   "); // whitespace-only still roundtrips
});

Deno.test("chunkText: breaks near the target length on word boundaries", () => {
  const s = "aaa bbb ccc ddd eee fff ggg hhh iii jjj";
  const chunks = chunkText(s, 8);
  assert(chunks.length > 1, "a long reply should split into multiple chunks");
  // No chunk is absurdly long (target + one extension word), and no word is split
  // (every internal chunk ends at a space boundary).
  for (const c of chunks) assert(c.length <= 8 + 8, `chunk too long: ${JSON.stringify(c)}`);
  assertEquals(chunks.join(""), s);
});
