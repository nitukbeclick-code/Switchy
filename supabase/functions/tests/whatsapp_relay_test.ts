// Integration tests for the whatsapp-webhook LIVE-RELAY branch
// (whatsapp-webhook/index.ts, step 2b — the human-takeover gate).
//
// When a rep has taken a conversation over the bot must NOT auto-reply
// (bot_enabled=false). The new behaviour: when the conversation is ALSO
// RELAY-ACTIVE (relay_tg_chat_id is set), each inbound customer message is
// FORWARDED to the rep's Telegram chat ("📩 <name>: <text>") so the rep follows
// the live conversation — instead of the old silent store-only. The bot still
// sends NOTHING back to the customer, and the §30A opt-out gate (step 2) still
// runs FIRST and wins: a STOP short-circuits to the opt-out confirmation BEFORE
// any relay.
//
// We capture the REAL Deno.serve handler (see _capture_handler.ts) and drive it
// with synthetic, HMAC-signed Meta webhook POSTs, stubbing every outbound fetch
// (Vault RPC, PostgREST, Graph API, Telegram). No source change, no network, no
// port. Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// ── env: set BEFORE the single capturing import ───────────────────────────────
// APP_SECRET drives the HMAC auth; the WhatsApp token lets sendText attempt a
// Graph call (which our stub intercepts). SUPABASE_URL/KEY must be set so the
// service-role PostgREST helpers run (we route them through the stub). The
// Telegram token comes from env — the Vault RPC is stubbed to {} so env wins.
const APP_SECRET = "wa-relay-test-app-secret";
Deno.env.set("WHATSAPP_APP_SECRET", APP_SECRET);
Deno.env.set("WHATSAPP_TOKEN", "wa-test-token");
Deno.env.set("WHATSAPP_PHONE_ID", "1202423646285095");
Deno.env.set("SUPABASE_URL", "https://relay-test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("TELEGRAM_BOT_TOKEN", "tg-test-token");
Deno.env.set("TELEGRAM_CHAT_ID", "-100999"); // team default — relay must NOT use this
// Keep the AI keys empty so any accidental fan-out would be a deterministic
// template, not a live LLM call (relay/opt-out paths return before fan-out anyway).
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("GOOGLE_AI_KEY");
Deno.env.delete("GROQ_API_KEY");
Deno.env.delete("OPENROUTER_API_KEY");

const handler = await captureServeHandler("../whatsapp-webhook/index.ts");

// HMAC-SHA256 of the raw body with the app secret → the x-hub-signature-256 the
// handler verifies (constant-time) before doing anything.
async function sign(raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256=${hex}`;
}

// A minimal Meta text-message envelope from `from`, with profile name `name`.
function metaTextBody(from: string, text: string, name = "דנה כהן"): unknown {
  return {
    entry: [{
      changes: [{
        value: {
          contacts: [{ profile: { name }, wa_id: from }],
          messages: [{
            from,
            id: `wamid.${crypto.randomUUID()}`,
            type: "text",
            text: { body: text },
          }],
        },
      }],
    }],
  };
}

async function postSigned(body: unknown): Promise<Response> {
  const raw = JSON.stringify(body);
  return await Promise.resolve(
    handler(new Request("https://edge/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await sign(raw), "Content-Type": "application/json" },
      body: raw,
    })),
  );
}

// Records what the handler tried to send where.
type Sink = {
  graph: Array<{ to: string; body: string }>; // customer-facing WhatsApp sends
  telegram: Array<{ chat_id: string; text: string }>; // rep-facing relay sends
};

// Builds the fetch routes. `convo` is the single conversation row PostgREST GET
// returns for getOrCreateConversation — vary bot_enabled / relay_tg_chat_id /
// contact status per test.
function routes(sink: Sink, convo: Record<string, unknown>, contact: Record<string, unknown>) {
  return [
    // Vault config RPC → {} so env TELEGRAM_BOT_TOKEN/CHAT_ID win (env fallback).
    {
      match: (u: string) => u.includes("/rest/v1/rpc/get_lead_notify_config"),
      respond: () => jsonResponse({}),
    },
    // Graph API (any messages/media endpoint): record customer-facing text sends.
    {
      match: (u: string) => u.includes("graph.facebook.com"),
      respond: (_u: string, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body ?? "{}"));
        if (b?.type === "text") sink.graph.push({ to: String(b.to ?? ""), body: String(b.text?.body ?? "") });
        return jsonResponse({ messages: [{ id: `wamid.out.${crypto.randomUUID()}` }] });
      },
    },
    // Telegram API: record relay sends (chat_id + text).
    {
      match: (u: string) => u.includes("api.telegram.org"),
      respond: (_u: string, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body ?? "{}"));
        sink.telegram.push({ chat_id: String(b.chat_id ?? ""), text: String(b.text ?? "") });
        return jsonResponse({ ok: true, result: { message_id: 1 } });
      },
    },
    // Conversation lookup (GET) → the row under test.
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([convo]),
    },
    // Contact upsert (POST return=representation) → the contact under test.
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_contacts") && (init?.method ?? "GET") === "POST",
      respond: () => jsonResponse([contact]),
    },
    // Inbound message insert (POST) → a fresh row (length 1 ⇒ NOT a dedup retry).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "POST",
      respond: () => jsonResponse([{ id: crypto.randomUUID() }]),
    },
    // Everything else PostgREST (PATCH timestamps, crm_events / audit inserts,
    // contact select fallback, etc.) → benign 200.
    {
      match: (u: string) => u.includes("/rest/v1/"),
      respond: () => jsonResponse([], 200),
    },
  ];
}

const CONTACT = { id: "c-1", wa_phone: "972501234567", wa_name: "דנה כהן", status: "active" };

// ── 1) RELAY-ACTIVE: inbound is forwarded to the rep's Telegram chat ──────────

Deno.test("relay-active inbound is forwarded to relay_tg_chat_id, with no customer reply", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const convo = { id: "conv-1", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: "55501" };
  await withFetchStub(routes(sink, convo, CONTACT), async () => {
    const r = await postSigned(metaTextBody("972501234567", "מתי הנציג חוזר אליי?"));
    assertEquals(r.status, 200);
  });
  // Exactly one Telegram relay, to the REP's chat (not the team default -100999).
  assertEquals(sink.telegram.length, 1);
  assertEquals(sink.telegram[0].chat_id, "55501");
  // Prefixed with the 📩 marker + the customer's name, carrying the inbound text.
  assertStringIncludes(sink.telegram[0].text, "📩");
  assertStringIncludes(sink.telegram[0].text, "דנה כהן");
  assertStringIncludes(sink.telegram[0].text, "מתי הנציג חוזר אליי?");
  // The bot sent NOTHING back to the customer (no auto-reply during takeover).
  assertEquals(sink.graph.length, 0);
});

Deno.test("relay forwards to the rep chat, never to the team-default TELEGRAM_CHAT_ID", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const convo = { id: "conv-2", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: "77707" };
  await withFetchStub(routes(sink, convo, CONTACT), async () => {
    await postSigned(metaTextBody("972501234567", "עדכון קטן"));
  });
  assertEquals(sink.telegram.length, 1);
  assertEquals(sink.telegram[0].chat_id, "77707");
  assertFalse(sink.telegram.some((t) => t.chat_id === "-100999"));
});

// ── 2) §30A OPT-OUT WINS: STOP short-circuits BEFORE any relay ────────────────

Deno.test("opt-out (STOP) wins over relay: confirmation to customer, NO Telegram relay", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  // Relay IS active, but the inbound is a STOP — the §30A gate (step 2) runs
  // FIRST and returns before the takeover/relay gate (step 2b) is reached.
  const convo = { id: "conv-3", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: "55501" };
  await withFetchStub(routes(sink, convo, CONTACT), async () => {
    const r = await postSigned(metaTextBody("972501234567", "הסר"));
    assertEquals(r.status, 200);
  });
  // The single confirmation goes to the CUSTOMER via WhatsApp…
  assertEquals(sink.graph.length, 1);
  assertEquals(sink.graph[0].to, "972501234567");
  assertStringIncludes(sink.graph[0].body, "הוסרת מרשימת הדיוור");
  // …and NOTHING is relayed to the rep (opt-out is not part of the live thread).
  assertEquals(sink.telegram.length, 0);
});

Deno.test("English STOP also wins over relay (no relay forward)", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const convo = { id: "conv-4", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: "55501" };
  await withFetchStub(routes(sink, convo, CONTACT), async () => {
    await postSigned(metaTextBody("972501234567", "STOP"));
  });
  assertEquals(sink.telegram.length, 0);
  assert(sink.graph.length === 1); // only the opt-out confirmation
});

// ── 3) NOT relay-active: takeover stays silent store-only (no relay) ──────────

Deno.test("takeover without a relay target stays silent: no relay, no customer reply", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  // bot_enabled=false but relay_tg_chat_id is NULL ⇒ NOT relay-active.
  const convo = { id: "conv-5", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: null };
  await withFetchStub(routes(sink, convo, CONTACT), async () => {
    const r = await postSigned(metaTextBody("972501234567", "שלום, יש עדכון?"));
    assertEquals(r.status, 200);
  });
  assertEquals(sink.telegram.length, 0); // no relay
  assertEquals(sink.graph.length, 0); // bot still silent during takeover
});

Deno.test("an empty-string relay target is treated as NOT relay-active", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const convo = { id: "conv-6", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: "   " };
  await withFetchStub(routes(sink, convo, CONTACT), async () => {
    await postSigned(metaTextBody("972501234567", "בדיקה"));
  });
  assertEquals(sink.telegram.length, 0);
  assertEquals(sink.graph.length, 0);
});

// ── 4) Relay uses the phone when no profile name is known ─────────────────────

Deno.test("relay label falls back to the phone when the contact has no name", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const convo = { id: "conv-7", status: "human", bot_enabled: false, ai_state: null, relay_tg_chat_id: "55501" };
  const noName = { id: "c-2", wa_phone: "972527654321", wa_name: "", status: "active" };
  await withFetchStub(routes(sink, convo, noName), async () => {
    // Send with an empty profile name too, so neither side supplies one.
    await postSigned(metaTextBody("972527654321", "אפשר לחזור אליי?", ""));
  });
  assertEquals(sink.telegram.length, 1);
  assertStringIncludes(sink.telegram[0].text, "972527654321");
});
