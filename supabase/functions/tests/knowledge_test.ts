// Unit tests for the truth-only knowledge / FAQ-learning layer (_shared/knowledge.ts):
//   • formatKnowledgeForPrompt — emits a bounded Hebrew "verified knowledge" block
//     that includes the topics, caps at ~1500 chars (truncates by priority order),
//     and returns "" for an empty list. PURE — no network.
//   • matchTopic — matches a customer question against a seeded question example
//     (and the topic label), and returns null on an irrelevant question. PURE.
//   • loadBotKnowledge / logCustomerQuestion — FAIL-SOFT: when the underlying
//     service-role fetch errors (or returns non-OK), the loader returns [] and the
//     logger swallows the error — neither throws into the agent path. We stub
//     globalThis.fetch so there's no real network; SUPABASE_* env is set so the
//     db.ts serviceFetch actually issues the (stubbed) request.
// No real network.  deno test --allow-env --allow-net --allow-read --allow-import

import { assert, assertEquals } from "@std/assert";
import {
  formatKnowledgeForPrompt,
  type KnowledgeEntry,
  loadBotKnowledge,
  logCustomerQuestion,
  matchTopic,
} from "../_shared/knowledge.ts";

const realFetch = globalThis.fetch;

const SEED: KnowledgeEntry[] = [
  {
    topic: "זה בחינם",
    question_examples: ["זה בחינם", "איך אתם מרוויחים", "כמה זה עולה לי"],
    answer: "כן, לחלוטין בחינם בשבילכם. אנחנו מקבלים עמלה מחברת התקשורת כשעוברים — המחיר שלכם זהה.",
    priority: 20,
  },
  {
    topic: "אילו חברות",
    question_examples: ["אילו חברות אתם משווים", "את מי אתם משווים"],
    answer: "את כולן — פלאפון, סלקום, פרטנר, הוט, גולן, 019, רמי לוי, בזק, yes ועוד.",
    priority: 40,
  },
];

// ── formatKnowledgeForPrompt ──────────────────────────────────────────────────

Deno.test("formatKnowledgeForPrompt includes the header + every topic", () => {
  const block = formatKnowledgeForPrompt(SEED);
  assert(block.includes("ידע מאומת"), "has the verified-knowledge header");
  assert(block.includes("זה בחינם"), "includes the first topic");
  assert(block.includes("אילו חברות"), "includes the second topic");
  assert(block.includes("עמלה"), "includes the answer text");
});

Deno.test("formatKnowledgeForPrompt returns '' for an empty list", () => {
  assertEquals(formatKnowledgeForPrompt([]), "");
});

Deno.test("formatKnowledgeForPrompt is bounded (~1500 chars) and truncates by priority", () => {
  // Build many entries; the high-priority (low number) ones must survive, and the
  // block must never exceed the cap.
  const many: KnowledgeEntry[] = [];
  for (let i = 0; i < 60; i++) {
    many.push({
      topic: `נושא_${i}`,
      question_examples: [`שאלה ${i}`],
      // A long answer so a handful of rows already approaches the cap.
      answer: "תשובה ארוכה ".repeat(15).trim(),
      priority: i, // already priority-ordered (lowest first)
    });
  }
  const block = formatKnowledgeForPrompt(many);
  assert(block.length <= 1500, `block is bounded, got ${block.length}`);
  assert(block.includes("נושא_0"), "the highest-priority entry survives truncation");
  assert(!block.includes("נושא_59"), "a low-priority entry is dropped past the cap");
});

// ── matchTopic ────────────────────────────────────────────────────────────────

Deno.test("matchTopic matches a seeded question example", () => {
  assertEquals(matchTopic("רגע, איך אתם מרוויחים בעצם?", SEED), "זה בחינם");
});

Deno.test("matchTopic matches via the topic label too", () => {
  assertEquals(matchTopic("אילו חברות יש לכם להשוות?", SEED), "אילו חברות");
});

Deno.test("matchTopic returns null on an irrelevant question", () => {
  assertEquals(matchTopic("מה השעה עכשיו בטוקיו?", SEED), null);
});

Deno.test("matchTopic returns null on empty input / empty entries", () => {
  assertEquals(matchTopic("", SEED), null);
  assertEquals(matchTopic("זה בחינם", []), null);
});

// ── loadBotKnowledge / logCustomerQuestion — fail-soft when fetch errors ──────

function withStubbedEnv(): void {
  // db.ts serviceFetch short-circuits to null without these; set them so the
  // stubbed fetch is actually exercised.
  Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-key");
}

Deno.test("loadBotKnowledge fail-soft → [] when the fetch throws", async () => {
  withStubbedEnv();
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof globalThis.fetch;
  try {
    const rows = await loadBotKnowledge();
    assertEquals(rows, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("loadBotKnowledge fail-soft → [] when the fetch returns non-OK", async () => {
  withStubbedEnv();
  globalThis.fetch = (() =>
    Promise.resolve(new Response("boom", { status: 500 }))) as typeof globalThis.fetch;
  try {
    const rows = await loadBotKnowledge();
    assertEquals(rows, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("loadBotKnowledge maps OK rows into KnowledgeEntry[]", async () => {
  withStubbedEnv();
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify([
          { topic: "זה בחינם", question_examples: ["איך אתם מרוויחים"], answer: "עמלה מהספק.", priority: 20 },
          // malformed (no answer) → defensively skipped
          { topic: "ריק", question_examples: [], answer: "", priority: 99 },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )) as typeof globalThis.fetch;
  try {
    const rows = await loadBotKnowledge();
    assertEquals(rows.length, 1);
    assertEquals(rows[0].topic, "זה בחינם");
    assertEquals(rows[0].priority, 20);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("logCustomerQuestion swallows fetch errors (never throws)", async () => {
  withStubbedEnv();
  globalThis.fetch = (() => Promise.reject(new Error("insert failed"))) as typeof globalThis.fetch;
  try {
    // Must resolve, not reject — a logging failure can never break the reply path.
    await logCustomerQuestion("whatsapp", "זה בחינם?", "זה בחינם");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("logCustomerQuestion no-ops on an empty question without a network call", async () => {
  withStubbedEnv();
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response("", { status: 201 }));
  }) as typeof globalThis.fetch;
  try {
    await logCustomerQuestion("whatsapp", "   ", null);
    assertEquals(called, false, "empty question short-circuits before any fetch");
  } finally {
    globalThis.fetch = realFetch;
  }
});
