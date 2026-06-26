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

// ── 5) HANDOFF keeps the bot ALIVE on a mere rep-request (the strand fix) ──────
// The live complaint: on a rep-request createHandoffLead used to PATCH
// whatsapp_conversations { bot_enabled: false } immediately, which made the bot go
// SILENT and stranded the customer (they kept messaging into the void while no
// human had actually taken over yet). The fix: a rep-REQUEST creates the lead
// (→ Telegram card) and marks the contact handed_off, but it must NOT silence the
// bot — the bot only goes quiet when the owner ACTUALLY takes over (notify-lead
// /callbacks.ts flips bot_enabled=false on "קבל שיחה"). This test drives the
// DETERMINISTIC text-handoff path (an inbound containing "נציג" classifies as
// intent="human" → handleHandoff → createHandoffLead) and asserts the conversation
// is NEVER patched with bot_enabled:false — the bot stays available meanwhile.

// Records every PostgREST write the handoff path makes, so we can pin both the
// (absence of a) bot_enabled flip and the (normalized) leads insert shape.
type Writes = {
  convPatch: Array<Record<string, unknown>>; // PATCH bodies to whatsapp_conversations
  contactPatch: Array<Record<string, unknown>>; // PATCH bodies to whatsapp_contacts
  leadsInsert: Array<Record<string, unknown>>; // POST bodies to leads
};

// Routes for the handoff path. bot_enabled=true ⇒ the bot is ACTIVE (NOT a
// takeover), so the inbound reaches the normal routing where "נציג" → handoff.
// `leadLands` toggles whether the leads POST returns a row (insert succeeds) or
// an empty array (insert blocked → the ops-signal branch).
function handoffRoutes(sink: Sink, writes: Writes, leadLands: boolean) {
  const convo = { id: "conv-ho", status: "bot", bot_enabled: true, ai_state: null, relay_tg_chat_id: null };
  return [
    { match: (u: string) => u.includes("/rest/v1/rpc/get_lead_notify_config"), respond: () => jsonResponse({}) },
    {
      match: (u: string) => u.includes("graph.facebook.com"),
      respond: (_u: string, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body ?? "{}"));
        if (b?.type === "text") sink.graph.push({ to: String(b.to ?? ""), body: String(b.text?.body ?? "") });
        return jsonResponse({ messages: [{ id: `wamid.out.${crypto.randomUUID()}` }] });
      },
    },
    {
      match: (u: string) => u.includes("api.telegram.org"),
      respond: (_u: string, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body ?? "{}"));
        sink.telegram.push({ chat_id: String(b.chat_id ?? ""), text: String(b.text ?? "") });
        return jsonResponse({ ok: true, result: { message_id: 1 } });
      },
    },
    // Conversation GET → the open conversation under test.
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_conversations") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([convo]),
    },
    // Conversation PATCH → record the body (this is the bot_enabled flip we assert).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_conversations") && init?.method === "PATCH",
      respond: (_u: string, init?: RequestInit) => {
        writes.convPatch.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 200);
      },
    },
    // NOT a first contact → make isFirstContact's GET on whatsapp_messages non-empty
    // so the inbound routes through classifyTextIntent (not the greeting branch).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([{ id: "prior-msg" }]),
    },
    // Contact PATCH → record the body (this is the status='handed_off' mark we assert).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/whatsapp_contacts") && init?.method === "PATCH",
      respond: (_u: string, init?: RequestInit) => {
        writes.contactPatch.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 200);
      },
    },
    { match: (u: string, init?: RequestInit) => u.includes("/rest/v1/whatsapp_contacts") && (init?.method ?? "GET") === "POST", respond: () => jsonResponse([CONTACT]) },
    { match: (u: string, init?: RequestInit) => u.includes("/rest/v1/whatsapp_messages") && (init?.method ?? "GET") === "POST", respond: () => jsonResponse([{ id: crypto.randomUUID() }]) },
    // Leads insert → record the body; return a row (lands) or a 400 (blocked, e.g.
    // the BEFORE-INSERT trigger raised). pgInsert returns null on a non-2xx, which
    // is the falsy `created` that drives the handoff_lead_insert_failed ops signal.
    {
      match: (u: string, init?: RequestInit) => u.includes("/rest/v1/leads") && (init?.method ?? "GET") === "POST",
      respond: (_u: string, init?: RequestInit) => {
        writes.leadsInsert.push(JSON.parse(String(init?.body ?? "{}")));
        return leadLands
          ? jsonResponse([{ id: "lead-1" }])
          : jsonResponse({ message: "invalid phone" }, 400);
      },
    },
    // Everything else PostgREST → benign 200.
    { match: (u: string) => u.includes("/rest/v1/"), respond: () => jsonResponse([], 200) },
  ];
}

Deno.test("handoff keeps the bot ALIVE — never flips bot_enabled=false (the strand fix)", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const writes: Writes = { convPatch: [], contactPatch: [], leadsInsert: [] };
  await withFetchStub(handoffRoutes(sink, writes, true), async () => {
    const r = await postSigned(metaTextBody("972501234567", "אני רוצה לדבר עם נציג אנושי"));
    assertEquals(r.status, 200);
  });
  // A mere rep-request must NOT silence the bot. The conversation is never patched
  // with bot_enabled:false — only an ACTUAL human takeover (notify-lead/callbacks)
  // does that, so the customer keeps getting answers while they wait for a rep.
  assertFalse(
    writes.convPatch.some((b) => b.bot_enabled === false),
    "createHandoffLead must NOT silence the bot on a mere rep-request",
  );
  // The deterministic handoff still fired the lead insert (lead creation intact)…
  assertEquals(writes.leadsInsert.length, 1, "the handoff still creates the lead");
  // …the contact was still marked handed_off…
  assert(
    writes.contactPatch.some((b) => b.status === "handed_off"),
    "the contact is still marked handed_off",
  );
  // …and the customer got the reassurance reply (handoff reply was sent).
  assert(sink.graph.length >= 1, "customer is reassured the handoff happened");
});

Deno.test("handoff normalizes the phone to satisfy the leads trigger shape", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const writes: Writes = { convPatch: [], contactPatch: [], leadsInsert: [] };
  await withFetchStub(handoffRoutes(sink, writes, true), async () => {
    await postSigned(metaTextBody("972501234567", "תן לי נציג בבקשה"));
  });
  assertEquals(writes.leadsInsert.length, 1);
  const phone = String(writes.leadsInsert[0].phone ?? "");
  // Normalized to the leads_rate_limit shape: ^[+0-9][0-9\-\s]{7,14}$
  assert(/^[+0-9][0-9\-\s]{7,14}$/.test(phone), `normalized phone "${phone}" matches the leads trigger regex`);
  assertEquals(phone, "+972501234567");
});

Deno.test("a blocked handoff insert emits the handoff_lead_insert_failed ops signal", async () => {
  const sink: Sink = { graph: [], telegram: [] };
  const writes: Writes = { convPatch: [], contactPatch: [], leadsInsert: [] };
  // leadLands=false ⇒ pgInsert returns [] (a blocked/failed insert). The fix emits
  // a persistent security_audit_log row so the failure is no longer invisible.
  const audits: Array<Record<string, unknown>> = [];
  const routes = handoffRoutes(sink, writes, false);
  // Splice a recorder for the security_audit_log insert BEFORE the catch-all.
  routes.splice(routes.length - 1, 0, {
    match: (u: string, init?: RequestInit) =>
      u.includes("/rest/v1/security_audit_log") && (init?.method ?? "GET") === "POST",
    respond: (_u: string, init?: RequestInit) => {
      audits.push(JSON.parse(String(init?.body ?? "{}")));
      return jsonResponse([], 200);
    },
  });
  await withFetchStub(routes, async () => {
    await postSigned(metaTextBody("972501234567", "אני רוצה נציג"));
  });
  assert(
    audits.some((a) => a.event === "handoff_lead_insert_failed"),
    "a failed handoff lead insert must emit the handoff_lead_insert_failed signal",
  );
  // Even when the insert is blocked, the bot stays ALIVE — a rep-request never
  // silences the assistant (only an actual human takeover does), so the customer
  // keeps getting answers instead of talking into the void.
  assertFalse(
    writes.convPatch.some((b) => b.bot_enabled === false),
    "bot stays alive even when the lead insert is blocked",
  );
});
