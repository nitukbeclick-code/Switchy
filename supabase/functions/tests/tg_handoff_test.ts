// Integration + unit tests for the Telegram customer→team HUMAN handoff (Cell B1)
// — the live human-takeover relay that mirrors the WhatsApp takeover, but for the
// PUBLIC Telegram bot (telegram-user-webhook) ↔ the team Telegram (notify-lead).
//
// Two halves, two drivers:
//   A) customer→team — telegram-user-webhook/index.ts. We capture the REAL
//      Deno.serve handler (see _capture_handler.ts) and drive it with synthetic,
//      secret_token-gated Telegram updates, stubbing every outbound fetch (Vault
//      RPC, PostgREST ai_sessions, Telegram). Verifies: a "connect me to a human"
//      message PAUSES the agent (bot_enabled=false + relay_team_chat_id=team) +
//      notifies the team; an inbound during an ACTIVE takeover is forwarded to the
//      team and the agent NEVER runs; STOP still wins BEFORE the handoff gate.
//   B) team→customer — notify-lead/callbacks.ts. We import the module directly and
//      drive handleCallback / handleTeamMessage against a routing fetch stub.
//      Verifies: a rep reply to the takeover card reaches the CUSTOMER's Telegram
//      chat via the USER bot; §30A suppression BLOCKS the relay; hand-back flips
//      the session back to the bot; fail-soft when the user bot is dark.
//
// No real network/keys — globalThis.fetch is stubbed in every test. Module
// top-level code reads env at import time, so env is set BEFORE the imports.
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import { captureServeHandler, jsonResponse, withFetchStub } from "./_capture_handler.ts";

// ── env: set BEFORE any capturing import ──────────────────────────────────────
const WEBHOOK_SECRET = "tg-handoff-test-secret";
Deno.env.set("LEAD_WEBHOOK_SECRET", WEBHOOK_SECRET);
Deno.env.set("SUPABASE_URL", "https://tg-handoff-test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
// The PUBLIC user bot's own token (REQUIRED — absent ⇒ the fn ships dark / 503).
Deno.env.set("TELEGRAM_USER_BOT_TOKEN", "user-bot-test-token");
// The TEAM bot token + chat — the handoff notifies + relays the customer here.
Deno.env.set("TELEGRAM_BOT_TOKEN", "team-bot-test-token");
Deno.env.set("TELEGRAM_CHAT_ID", "-100222");
// Keep AI keys empty so any accidental agent fan-out is a deterministic template,
// never a live LLM call (the handoff/opt-out paths return before fan-out anyway).
Deno.env.delete("GEMINI_API_KEY");
Deno.env.delete("GOOGLE_AI_KEY");
Deno.env.delete("GROQ_API_KEY");
Deno.env.delete("CEREBRAS_API_KEY");
Deno.env.delete("OPENROUTER_API_KEY");

// SHA-256 hex of the webhook secret — the x-telegram-bot-api-secret-token the user
// webhook verifies (matches _shared/config.ts tgWebhookToken).
async function tgWebhookToken(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const SECRET_TOKEN = await tgWebhookToken(WEBHOOK_SECRET);

const handler = await captureServeHandler("../telegram-user-webhook/index.ts");

// Build a minimal Telegram update with a plain text message from a private chat.
function tgUpdate(chatId: number, text: string, over: Record<string, unknown> = {}): unknown {
  return {
    update_id: 1,
    message: {
      message_id: 7,
      from: { id: chatId, first_name: "דנה", language_code: "he", ...(over.from as object ?? {}) },
      chat: { id: chatId, type: "private" },
      date: 1_700_000_000,
      text,
    },
  };
}

// POST a secret_token-gated update to the captured webhook handler.
async function postUpdate(body: unknown): Promise<Response> {
  return await Promise.resolve(
    handler(new Request("https://edge/telegram-user-webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": SECRET_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })),
  );
}

// Records what the webhook tried to send / write where.
type WebhookSink = {
  userBot: Array<{ chat_id: string; text: string }>; // customer-facing user-bot sends
  teamBot: Array<{ chat_id: string; text: string }>; // team-facing relay/card sends
  sessionUpserts: Array<Record<string, unknown>>; // ai_sessions POST bodies (upserts)
};

// Build the webhook's fetch routes. `relayRow` is the ai_sessions row the relay
// state read returns (vary bot_enabled / relay_team_chat_id per test). The two
// Telegram bots are told apart by the token segment in the URL.
function webhookRoutes(sink: WebhookSink, relayRow: Record<string, unknown> | null) {
  return [
    // Vault config RPC → {} so env TELEGRAM_* win (env fallback).
    { match: (u: string) => u.includes("/rest/v1/rpc/get_lead_notify_config"), respond: () => jsonResponse({}) },
    // Telegram API — split by which bot token sent it.
    {
      match: (u: string) => u.includes("api.telegram.org"),
      respond: (u: string, init?: RequestInit) => {
        const b = JSON.parse(String(init?.body ?? "{}"));
        const rec = { chat_id: String(b.chat_id ?? ""), text: String(b.text ?? "") };
        if (u.includes("/botuser-bot-test-token/")) sink.userBot.push(rec);
        else if (u.includes("/botteam-bot-test-token/")) sink.teamBot.push(rec);
        return jsonResponse({ ok: true, result: { message_id: 1 } });
      },
    },
    // ai_sessions relay-state read (GET with select of the relay columns).
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "GET" &&
        u.includes("relay_team_chat_id"),
      respond: () => jsonResponse(relayRow ? [relayRow] : []),
    },
    // ai_sessions session load (GET select=messages) → no prior memory.
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse([]),
    },
    // ai_sessions upsert (POST) — the takeover flip + the transcript save.
    {
      match: (u: string, init?: RequestInit) =>
        u.includes("/rest/v1/ai_sessions") && (init?.method ?? "GET") === "POST",
      respond: (_u: string, init?: RequestInit) => {
        sink.sessionUpserts.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse([], 201);
      },
    },
    // Everything else PostgREST (audit inserts, suppression writes, etc.) → benign.
    { match: (u: string) => u.includes("/rest/v1/"), respond: () => jsonResponse([], 200) },
  ];
}

// ── A1) handoff START: a "connect me to a human" message pauses + notifies ─────

Deno.test("A: human-request PAUSES the agent (bot_enabled=false + team relay) and notifies the team", async () => {
  const sink: WebhookSink = { userBot: [], teamBot: [], sessionUpserts: [] };
  // No relay row yet (fresh chat) → not currently relaying.
  await withFetchStub(webhookRoutes(sink, null), async () => {
    const r = await postUpdate(tgUpdate(900001, "אני רוצה לדבר עם נציג אנושי"));
    assertEquals(r.status, 200);
  });
  // The agent was paused for THIS chat: an ai_sessions upsert set bot_enabled=false
  // + relay_team_chat_id = the team chat (env TELEGRAM_CHAT_ID).
  const flip = sink.sessionUpserts.find((b) => b.bot_enabled === false);
  assert(flip, "a takeover flip upsert was written");
  assertEquals(flip!.bot_enabled, false);
  assertEquals(flip!.relay_team_chat_id, "-100222");
  assertEquals(flip!.session_id, "tg-u-900001");
  // The team was notified with the takeover card.
  assertEquals(sink.teamBot.length, 1);
  assertEquals(sink.teamBot[0].chat_id, "-100222");
  assertStringIncludes(sink.teamBot[0].text, "בקשה לנציג");
  assertStringIncludes(sink.teamBot[0].text, "tg:900001");
  // The customer got the single connecting ack (via the USER bot).
  assertEquals(sink.userBot.length, 1);
  assertEquals(sink.userBot[0].chat_id, "900001");
  assertStringIncludes(sink.userBot[0].text, "מחבר");
});

Deno.test("A: an ordinary question does NOT trigger a handoff (no team card, no pause)", async () => {
  const sink: WebhookSink = { userBot: [], teamBot: [], sessionUpserts: [] };
  await withFetchStub(webhookRoutes(sink, null), async () => {
    // Mentions נציג but isn't a request — must route to the agent, not a handoff.
    await postUpdate(tgUpdate(900009, "כמה זמן לוקח לנציג לחזור אליי בדרך כלל?"));
  });
  // No takeover flip, no team card.
  assertFalse(sink.sessionUpserts.some((b) => b.bot_enabled === false), "no pause flip");
  assertEquals(sink.teamBot.length, 0, "no team takeover card");
});

// ── A2) RELAY-ACTIVE: an inbound during takeover forwards to the team, NO agent ─

Deno.test("A: inbound during an ACTIVE takeover forwards to the team chat, agent never runs", async () => {
  const sink: WebhookSink = { userBot: [], teamBot: [], sessionUpserts: [] };
  // Already relaying: bot_enabled=false + a team relay target set.
  const relayRow = { bot_enabled: false, relay_team_chat_id: "-100222" };
  await withFetchStub(webhookRoutes(sink, relayRow), async () => {
    const r = await postUpdate(tgUpdate(900002, "אוקיי, מתי הנציג יחזור?"));
    assertEquals(r.status, 200);
  });
  // The customer's message was forwarded to the TEAM chat with the 📩 marker.
  assertEquals(sink.teamBot.length, 1);
  assertEquals(sink.teamBot[0].chat_id, "-100222");
  assertStringIncludes(sink.teamBot[0].text, "📩");
  assertStringIncludes(sink.teamBot[0].text, "מתי הנציג יחזור?");
  // The bot sent NOTHING back to the customer (the human is in the loop).
  assertEquals(sink.userBot.length, 0);
});

// ── A3) §30A STOP wins BEFORE the handoff gate ─────────────────────────────────

Deno.test("A: STOP wins over an active takeover — opt-out confirm to customer, no team relay", async () => {
  const sink: WebhookSink = { userBot: [], teamBot: [], sessionUpserts: [] };
  // Relay IS active, but the inbound is a bare STOP — the §30A gate runs FIRST.
  const relayRow = { bot_enabled: false, relay_team_chat_id: "-100222" };
  await withFetchStub(webhookRoutes(sink, relayRow), async () => {
    const r = await postUpdate(tgUpdate(900003, "הסר"));
    assertEquals(r.status, 200);
  });
  // The opt-out confirmation went to the CUSTOMER (user bot); nothing relayed.
  assertEquals(sink.userBot.length, 1);
  assertEquals(sink.userBot[0].chat_id, "900003");
  assertStringIncludes(sink.userBot[0].text, "הוסרתם");
  assertEquals(sink.teamBot.length, 0, "STOP is not part of the live thread");
});

// ── B) team→customer: import the callbacks module directly ─────────────────────

import type { Cfg, TgCallbackQuery, TgMessage } from "../_shared/types.ts";
const cb = await import("../notify-lead/callbacks.ts");

const realFetch = globalThis.fetch;
type Capture = { method: string; url: string; body: Record<string, unknown> };
type Route = { match: (c: Capture) => boolean; respond: (c: Capture) => Response };

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function installRoutes(routes: Route[]): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: Record<string, unknown> = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch { body = {}; }
    const c: Capture = { method, url, body };
    calls.push(c);
    for (const r of routes) if (r.match(c)) return Promise.resolve(r.respond(c));
    return Promise.resolve(jsonRes([])); // default: empty PostgREST array
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}
const isUserBot = (c: Capture) => c.url.includes("api.telegram.org/botuser-bot-test-token/");
const isTeamBot = (c: Capture) => c.url.includes("api.telegram.org/botteam-bot-test-token/");
const isRest = (path: string) => (c: Capture) => c.url.includes(`/rest/v1/${path}`);

// allowed() is fail-close: an EMPTY allowlist authorizes nobody. The rep id (42)
// is on the allowlist; the team chat is "-100222" (matches the cfg below).
function cfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "team-bot-test-token", tgChat: "-100222",
    resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "", webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "", googleSpreadsheetId: "",
    allowedUserIds: [42], src: {}, ...over,
  };
}

const CUST_CHAT = "900100";
// A reply_to the takeover card / a forwarded customer line (carries the tgu marker).
function tguCardReply(chatId = CUST_CHAT): TgMessage {
  return {
    message_id: 9,
    reply_markup: {
      inline_keyboard: [[
        { text: "reply", callback_data: `tgu:${chatId}:relay` },
        { text: "handback", callback_data: `tgu:${chatId}:handback` },
      ]],
    },
  };
}

// ── tguChatIdFromMarkup (pure) ─────────────────────────────────────────────────

Deno.test("B: tguChatIdFromMarkup extracts the customer chat id (incl. negative), null otherwise", () => {
  assertEquals(cb.tguChatIdFromMarkup(tguCardReply("900100").reply_markup), "900100");
  assertEquals(
    cb.tguChatIdFromMarkup({ inline_keyboard: [[{ callback_data: "tgu:-100123:handback" }]] }),
    "-100123",
  );
  assertEquals(cb.tguChatIdFromMarkup({ inline_keyboard: [[{ callback_data: "lead:abc:contacted" }]] }), null);
  assertEquals(cb.tguChatIdFromMarkup(undefined), null);
});

// ── B1) a rep reply reaches the customer's Telegram chat via the USER bot ───────

Deno.test("B: a rep reply to the takeover card relays to the customer via the USER bot + audits", async () => {
  const userSends: Capture[] = [];
  const audits: Capture[] = [];
  const routes: Route[] = [
    // No suppression row for this customer → relay allowed.
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: (c) => { audits.push(c); return jsonRes({}, 201); } },
    { match: (c) => isUserBot(c), respond: (c) => { userSends.push(c); return jsonRes({ ok: true, result: {} }); } },
    { match: (c) => isTeamBot(c), respond: () => jsonRes({ ok: true, result: {} }) },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 11,
      chat: { id: -100222 },
      from: { id: 42, first_name: "נציג" },
      text: "היי דנה, אני כאן — מתי נוח לדבר?",
      reply_to_message: tguCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, true);
    assertEquals(res.relayed, true);
    assertEquals(res.channel, "telegram");
    // The reply reached the CUSTOMER's chat via the user bot.
    assertEquals(userSends.length, 1);
    assertEquals(userSends[0].body.chat_id, CUST_CHAT);
    assertStringIncludes(String(userSends[0].body.text), "מתי נוח לדבר");
    // Reg.13 audit row written.
    assertEquals(audits.length, 1);
    assertEquals(audits[0].body.event, "tg_relay_reply");
  } finally {
    s.restore();
  }
});

// ── B2) §30A: a suppressed customer blocks the relay (no user-bot send) ─────────

Deno.test("B: a STOP/suppressed customer BLOCKS the relay — §30A wins, no user-bot send", async () => {
  const userSends: Capture[] = [];
  const routes: Route[] = [
    // Suppression row present → blocked.
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([{ id: "s-1" }]) },
    { match: (c) => isUserBot(c), respond: (c) => { userSends.push(c); return jsonRes({ ok: true, result: {} }); } },
    { match: (c) => isTeamBot(c), respond: () => jsonRes({ ok: true, result: {} }) },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 12,
      chat: { id: -100222 },
      from: { id: 42 },
      text: "עוד הצעה?",
      reply_to_message: tguCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "customer suppressed");
    assertEquals(userSends.length, 0, "never message a customer who asked to STOP");
  } finally {
    s.restore();
  }
});

// ── B3) hand-back flips the session back to the bot ────────────────────────────

Deno.test("B: hand-back flips bot_enabled=true + relay_team_chat_id=NULL and notifies the customer", async () => {
  const sessionPatch: Capture[] = [];
  const userSends: Capture[] = [];
  const routes: Route[] = [
    {
      match: (c) => isRest("ai_sessions")(c) && c.method === "PATCH",
      respond: (c) => { sessionPatch.push(c); return jsonRes([{ session_id: "tg-u-900100" }]); },
    },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: () => jsonRes({}, 201) },
    { match: (c) => isUserBot(c), respond: (c) => { userSends.push(c); return jsonRes({ ok: true, result: {} }); } },
    { match: (c) => isTeamBot(c), respond: () => jsonRes({ ok: true, result: {} }) },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbq-hb",
      from: { id: 42, first_name: "נציג" },
      data: `tgu:${CUST_CHAT}:handback`,
      message: { message_id: 5, chat: { id: -100222 } },
    };
    const res = await cb.handleCallback(cfg(), query);
    assertEquals(res.ok, true);
    assertEquals(sessionPatch.length, 1, "exactly one ai_sessions PATCH");
    assertEquals(sessionPatch[0].body.bot_enabled, true);
    assertEquals(sessionPatch[0].body.relay_team_chat_id, null);
    assertStringIncludes(sessionPatch[0].url, "session_id=eq.tg-u-900100");
    // The customer was told the human chat ended (via the user bot).
    assertEquals(userSends.length, 1);
    assertEquals(userSends[0].body.chat_id, CUST_CHAT);
  } finally {
    s.restore();
  }
});

// ── B4) fail-soft: the user bot dark → reply not sent, rep told, no throw ───────

Deno.test("B: fail-soft when the USER bot is dark — relay refused, rep notified, never throws", async () => {
  const prev = Deno.env.get("TELEGRAM_USER_BOT_TOKEN");
  Deno.env.delete("TELEGRAM_USER_BOT_TOKEN");
  const teamSends: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: (c) => isTeamBot(c), respond: (c) => { teamSends.push(c); return jsonRes({ ok: true, result: {} }); } },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 13,
      chat: { id: -100222 },
      from: { id: 42 },
      text: "הודעה ללקוח",
      reply_to_message: tguCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "user bot token not set");
    // The rep is told (a team-bot message), and nothing crashed.
    assert(teamSends.length >= 1, "the rep is notified the user bot is dark");
  } finally {
    s.restore();
    if (prev) Deno.env.set("TELEGRAM_USER_BOT_TOKEN", prev);
  }
});

// ── B5) auth: a non-allowlisted rep cannot drive the relay ─────────────────────

Deno.test("B: a non-allowlisted user cannot relay (auth gate preserved)", async () => {
  const userSends: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isUserBot(c), respond: (c) => { userSends.push(c); return jsonRes({ ok: true, result: {} }); } },
    { match: (c) => isTeamBot(c), respond: () => jsonRes({ ok: true, result: {} }) },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 14,
      chat: { id: -100222 },
      from: { id: 99999 }, // NOT on the allowlist [42]
      text: "ניסיון לא מורשה",
      reply_to_message: tguCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "user not allowed");
    assertEquals(userSends.length, 0, "no relay for an unauthorized user");
  } finally {
    s.restore();
  }
});
