// Unit tests for WhatsApp VOICE-NOTE support — the path that turns an inbound
// voice note into Hebrew text (Groq Whisper) and feeds it to the SAME grounded
// agent as a typed message.
//
// Two halves, matching the two pieces of the feature:
//   1) transcribeAudio (_shared/ai.ts) — the Whisper bridge. FAIL-SOFT by
//      contract (no key / non-2xx / network throw / empty body → "" + never
//      throws, so the lead/agent path is never blocked), and on a 200 it returns
//      the trimmed transcript via the documented multipart call.
//   2) the routing contract — a non-empty transcript is fed into runWhatsappAgent
//      AS THE MESSAGE, exactly as if the customer had typed it. We mirror the
//      existing whatsapp_agent_runner stub (inject runAgentFn) and assert the
//      transcript reaches runAgent unchanged.
// No real network, no DB. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { transcribeAudio } from "../_shared/ai.ts";
import { runWhatsappAgent } from "../whatsapp-webhook/agent_runner.ts";
import type { RunAgentInput, RunAgentResult } from "../_shared/agent.ts";
import { emptySession } from "../_shared/session.ts";
import type { ScorablePlan } from "../_shared/scoring.ts";

const realFetch = globalThis.fetch;
const AUDIO = { mimeType: "audio/ogg", bytes: new Uint8Array([1, 2, 3, 4]) };

const PLANS: ScorablePlan[] = [
  { id: "c1", cat: "cellular", provider: "סלקום", plan: "5G 100GB", price: 49, is5G: true },
];

// ── 1) transcribeAudio: fail-soft ─────────────────────────────────────────────

Deno.test("transcribeAudio returns '' (no fetch) when the Groq key is missing", async () => {
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response("nope", { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    assertEquals(await transcribeAudio("", AUDIO), "");
    assert(!called); // no key → we never hit the network
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("transcribeAudio returns '' (no fetch) when there are no audio bytes", async () => {
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response("nope", { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    assertEquals(await transcribeAudio("gk", { mimeType: "audio/ogg", bytes: new Uint8Array() }), "");
    assert(!called);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("transcribeAudio is fail-soft on a network throw → ''", async () => {
  globalThis.fetch = (() => Promise.reject(new TypeError("dns failure"))) as typeof globalThis.fetch;
  try {
    assertEquals(await transcribeAudio("gk", AUDIO), "");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("transcribeAudio is fail-soft on a non-2xx response → ''", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(new Response("rate limited", { status: 429 }))) as typeof globalThis.fetch;
  try {
    assertEquals(await transcribeAudio("gk", AUDIO), "");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("transcribeAudio returns '' when the transcript body is blank", async () => {
  globalThis.fetch = (() =>
    Promise.resolve(new Response("   \n  ", { status: 200 }))) as typeof globalThis.fetch;
  try {
    assertEquals(await transcribeAudio("gk", AUDIO), "");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── 1) transcribeAudio: happy path (the string fed onward to the agent) ───────

Deno.test("transcribeAudio returns the trimmed transcript on a 200 via the documented Whisper call", async () => {
  let seenUrl = "";
  let seenAuth = "";
  let form: FormData | null = null;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    seenUrl = String(input);
    seenAuth = String((init?.headers as Record<string, string>)?.["Authorization"] ?? "");
    form = init?.body as FormData;
    return Promise.resolve(new Response("כמה עולה מסלול סלולר?\n", { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    const out = await transcribeAudio("gk-123", AUDIO);
    assertEquals(out, "כמה עולה מסלול סלולר?"); // trimmed transcript, verbatim

    assertStringIncludes(seenUrl, "api.groq.com/openai/v1/audio/transcriptions");
    assertEquals(seenAuth, "Bearer gk-123");
    assert(form != null, "the request body is a FormData"); // its fields are asserted below
    const f = form as FormData;
    assertEquals(f.get("model"), "whisper-large-v3");
    assertEquals(f.get("language"), "he");
    assertEquals(f.get("response_format"), "text");
    assert(f.get("file") instanceof Blob); // the audio is attached as `file`
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── 2) routing: a voice transcript reaches the agent AS THE MESSAGE ───────────

Deno.test("a transcribed voice note routes into the agent as the customer message", async () => {
  // This mirrors what the webhook's audio branch does: transcribe → pass the
  // transcript to runWhatsappAgent({ message: transcript }). We inject runAgentFn
  // (the existing whatsapp test stub pattern) and assert the transcript is what
  // reaches runAgent — i.e. a spoken question is handled exactly like a typed one.
  const transcript = "תמליצו לי על מסלול סלולר עד 50 שקל";
  let captured: RunAgentInput | null = null;

  const r = await runWhatsappAgent({
    sessionKey: "conv-voice",
    message: transcript, // <- the Whisper transcript, fed in as the typed message
    plans: PLANS,
    keys: { groq: "gk" },
    deps: {
      conversationId: "conv-voice",
      contactId: "contact-1",
      logCrmEvent: () => {},
      logSecurityEvent: () => {},
      captureLead: () => Promise.resolve("incomplete"),
      escalate: () => false,
    },
    templateFallback: () => "fallback",
    loadSessionFn: () => Promise.resolve(emptySession("whatsapp", "conv-voice")),
    saveSessionFn: () => Promise.resolve(true),
    runAgentFn: (input) => {
      captured = input;
      return Promise.resolve<RunAgentResult>({
        reply: "סלקום 5G ב-49 ₪ מתאים לתקציב שלך",
        via: "tools",
        toolCalls: [{ name: "recommend_plans", ok: true, preview: "cellular×1" }],
        timedOut: false,
      });
    },
  });

  // The agent answered the spoken question, and the transcript reached it verbatim
  // on the whatsapp channel — proving voice and text share one agent path.
  assertEquals(r.reply, "סלקום 5G ב-49 ₪ מתאים לתקציב שלך");
  assert(captured);
  const inp = captured as RunAgentInput;
  assertEquals(inp.channel, "whatsapp");
  assertEquals(inp.message, transcript);
});
