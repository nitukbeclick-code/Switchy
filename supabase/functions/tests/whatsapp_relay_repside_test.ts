// Unit tests for the WhatsApp live-relay (human takeover) — the rep→customer half
// owned by notify-lead (callbacks.ts) + the leadKeyboard relay buttons (leads.ts).
// (The customer→rep half lives in whatsapp_relay_test.ts and is NOT touched here.)
//
// We exercise the four required behaviours against a routing fetch stub that models
// PostgREST (Supabase), the Telegram Bot API, and the WhatsApp Graph API:
//   1. TAKE-OVER flips bot_enabled=false + relay_tg_chat_id = the pressing rep's chat.
//   2. A rep reply to a RELAY-ACTIVE lead card relays to the customer via sendText
//      (and stores the outbound + audits it), keeping bot_enabled=false.
//   3. A reply to a NON-relay card still notes / parses-savings (preserved).
//   4. HAND-BACK flips bot_enabled=true + relay_tg_chat_id=NULL.
//
// _shared/whatsapp.ts reads WHATSAPP_TOKEN at import time, and db.ts reads
// SUPABASE_URL / SERVICE_ROLE_KEY per call — set the env BEFORE importing. Run
// from supabase/functions/:  deno task test
//
// IMPORTANT: these tests stub globalThis.fetch only; no real network/keys.

import { assert, assertEquals, assertFalse } from "@std/assert";
import type { Cfg, TgCallbackQuery, TgMessage } from "../_shared/types.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");
Deno.env.set("WHATSAPP_TOKEN", "wa-token-stub");
Deno.env.set("WHATSAPP_PHONE_ID", "PHONE123");
Deno.env.set("GRAPH_API_VERSION", "v21.0");

const cb = await import("../notify-lead/callbacks.ts");
const { leadKeyboard, isWhatsappLead } = await import("../_shared/leads.ts");

const realFetch = globalThis.fetch;

// One captured outbound call: method, the full URL, and the parsed JSON body.
type Capture = { method: string; url: string; body: Record<string, unknown> };

// A route handler decides the response for a request (by url/method); first match
// wins. Each handler may push a side-effect into its own capture array.
type Route = { match: (c: Capture) => boolean; respond: (c: Capture) => Response };

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function tgOk(): Response {
  return jsonRes({ ok: true, result: {} });
}
function graphOkWamid(id = "wamid.RELAY"): Response {
  return jsonRes({ messages: [{ id }] });
}

function installRoutes(routes: Route[]): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = String(
      init?.method ?? (input instanceof Request ? input.method : "GET"),
    ).toUpperCase();
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const c: Capture = { method, url, body };
    calls.push(c);
    for (const r of routes) if (r.match(c)) return Promise.resolve(r.respond(c));
    // Default: empty PostgREST-style array (safe for an unmatched GET/PATCH).
    return Promise.resolve(jsonRes([]));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

const isGraphSend = (c: Capture) =>
  c.url.includes("graph.facebook.com") && c.url.endsWith("/messages") && c.method === "POST";
const isTg = (c: Capture) => c.url.includes("api.telegram.org");
const isRest = (path: string) => (c: Capture) => c.url.includes(`/rest/v1/${path}`);

// allowed() is fail-close: an EMPTY allowlist authorizes nobody. Tests need the
// pressing/relaying rep ids (42, 987654) on the allowlist so the action runs;
// the auth-reject test overrides allowedUserIds with a disjoint set.
function cfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "BOT:token",
    tgChat: "-1001",
    resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "",
    webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "", googleSpreadsheetId: "",
    allowedUserIds: [42, 987654],
    src: {},
    ...over,
  };
}

const LEAD_ID = "11111111-1111-1111-1111-111111111111";
const CONV_ID = "22222222-2222-2222-2222-222222222222";
const CONTACT_ID = "33333333-3333-3333-3333-333333333333";

// A reply_to a normal lead card (carries the lead id with a non-relay action).
function leadCardReply(): TgMessage {
  return {
    message_id: 9,
    reply_markup: { inline_keyboard: [[{ text: "x", callback_data: `lead:${LEAD_ID}:contacted` }]] },
  };
}

// ── leadKeyboard: WhatsApp-source leads get a take-over / hand-back row ─────────

Deno.test("isWhatsappLead matches source='whatsapp' (case-insensitive) only", () => {
  assert(isWhatsappLead({ source: "whatsapp" }));
  assert(isWhatsappLead({ source: "WhatsApp" }));
  assertFalse(isWhatsappLead({ source: "form" }));
  assertFalse(isWhatsappLead({ source: "advisor" }));
  assertFalse(isWhatsappLead({ source: null }));
  assertFalse(isWhatsappLead({}));
});

Deno.test("leadKeyboard adds the relay row ONLY for a WhatsApp-source lead", () => {
  const waKb = JSON.stringify(leadKeyboard({ id: LEAD_ID, phone: "0501234567", source: "whatsapp" }));
  assert(waKb.includes(`lead:${LEAD_ID}:takeover`), "takeover button present");
  assert(waKb.includes(`lead:${LEAD_ID}:handback`), "handback button present");
  assert(waKb.includes("השתלט ושוחח כאן"));
  assert(waKb.includes("החזר לבוט"));

  const formKb = JSON.stringify(leadKeyboard({ id: LEAD_ID, phone: "0501234567", source: "form" }));
  assertFalse(formKb.includes(":takeover"), "no takeover on a non-WA lead");
  assertFalse(formKb.includes(":handback"), "no handback on a non-WA lead");
  // The non-WA card still keeps its core controls + the wa.me draft button.
  assert(formKb.includes(`lead:${LEAD_ID}:contacted`));
  assert(formKb.includes("וואטסאפ מוכן"));
});

// ── pure helpers ───────────────────────────────────────────────────────────────

Deno.test("leadPhoneToE164 normalizes national + intl forms, rejects short", () => {
  assertEquals(cb.leadPhoneToE164("0501234567"), "972501234567");
  assertEquals(cb.leadPhoneToE164("+972-50-123-4567"), "972501234567");
  assertEquals(cb.leadPhoneToE164("972501234567"), "972501234567");
  assertEquals(cb.leadPhoneToE164("12345"), ""); // too short
  assertEquals(cb.leadPhoneToE164(""), "");
});

Deno.test("isRelayActive requires BOTH bot_enabled=false AND a non-empty relay target", () => {
  assert(cb.isRelayActive({ id: CONV_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }));
  assertFalse(cb.isRelayActive({ id: CONV_ID, bot_enabled: true, relay_tg_chat_id: "-1009" }));
  assertFalse(cb.isRelayActive({ id: CONV_ID, bot_enabled: false, relay_tg_chat_id: null }));
  assertFalse(cb.isRelayActive({ id: CONV_ID, bot_enabled: false, relay_tg_chat_id: "  " }));
  assertFalse(cb.isRelayActive(null));
});

// ── 1) TAKE-OVER flips bot_enabled=false + relay_tg_chat_id = TEAM GROUP chat ───

Deno.test("take-over flips bot_enabled=false + relay_tg_chat_id to the team group chat (not the rep's personal id, which a bot cannot DM)", async () => {
  const REP_CHAT = 987654;
  const convoPatch: Capture[] = [];
  const crmEvents: Capture[] = [];
  const routes: Route[] = [
    { match: isRest("leads?id=eq."), respond: () => jsonRes([{ id: LEAD_ID, phone: "0501234567", name: "דנה" }]) },
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET", respond: () => jsonRes([{ id: CONTACT_ID }]) },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: true, relay_tg_chat_id: null }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH",
      respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); },
    },
    { match: (c) => isRest("crm_events")(c) && c.method === "POST", respond: (c) => { crmEvents.push(c); return jsonRes({}, 201); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbq1",
      from: { id: REP_CHAT, first_name: "נציג" },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -1001 } },
    };
    const res = await cb.handleCallback(cfg(), query);
    assertEquals(res.ok, true);
    assertEquals(convoPatch.length, 1, "exactly one conversation PATCH");
    assertEquals(convoPatch[0].body.bot_enabled, false);
    // Relay target is the TEAM GROUP (cfg.tgChat="-1001"), NOT the rep's personal
    // id (REP_CHAT) — a bot cannot message a user who never opened a chat with it.
    assertEquals(convoPatch[0].body.relay_tg_chat_id, "-1001");
    // crm_events PARITY: the console's activity feed sees a Telegram takeover
    // exactly like a CRM-app one (crm-api's vocabulary: actor 'rep', 'takeover').
    assertEquals(crmEvents.length, 1);
    assertEquals(crmEvents[0].body.event, "takeover");
    assertEquals(crmEvents[0].body.actor, "rep");
    assertEquals(crmEvents[0].body.conversation_id, CONV_ID);
    assertEquals(crmEvents[0].body.contact_id, CONTACT_ID);
  } finally {
    s.restore();
  }
});

Deno.test("take-over refuses when there is no live WhatsApp conversation (no PATCH)", async () => {
  const convoPatch: Capture[] = [];
  const routes: Route[] = [
    { match: isRest("leads?id=eq."), respond: () => jsonRes([{ id: LEAD_ID, phone: "0501234567" }]) },
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET", respond: () => jsonRes([]) },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH",
      respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); },
    },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbq3",
      from: { id: 42 },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -1001 } },
    };
    const res = await cb.handleCallback(cfg(), query);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "no whatsapp conversation");
    assertEquals(convoPatch.length, 0, "no conversation flip when none exists");
  } finally {
    s.restore();
  }
});

// ── 2) Rep reply RELAYS to the customer when RELAY-ACTIVE ───────────────────────

Deno.test("a rep reply to a RELAY-ACTIVE card sends to the customer + stores out/rep + keeps bot off", async () => {
  const graphSends: Capture[] = [];
  const msgInserts: Capture[] = [];
  const auditInserts: Capture[] = [];
  const crmEvents: Capture[] = [];
  const convoPatch: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("crm_events")(c) && c.method === "POST", respond: (c) => { crmEvents.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone=ilike"),
      respond: () => jsonRes([{ id: CONTACT_ID }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }]),
    },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("id=eq."),
      respond: () => jsonRes([{ wa_phone: "972501234567", status: "active" }]),
    },
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid("wamid.OUT1"); } },
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "POST", respond: (c) => { msgInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: (c) => { auditInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 11,
      chat: { id: -1001 },
      from: { id: 42, first_name: "נציג" },
      text: "היי, אשמח לעזור — מתי נוח לדבר?",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, true);
    assertEquals(res.relayed, true);
    // sent to the customer's E.164 phone via the Graph API
    assertEquals(graphSends.length, 1);
    assertEquals(graphSends[0].body.to, "972501234567");
    assertEquals((graphSends[0].body.text as { body: string }).body, "היי, אשמח לעזור — מתי נוח לדבר?");
    // stored outbound: direction=out, actor=rep, with the wamid
    assertEquals(msgInserts.length, 1);
    assertEquals(msgInserts[0].body.direction, "out");
    assertEquals(msgInserts[0].body.actor, "rep");
    assertEquals(msgInserts[0].body.wa_message_id, "wamid.OUT1");
    assertEquals(msgInserts[0].body.conversation_id, CONV_ID);
    // audited (Reg.13)
    assertEquals(auditInserts.length, 1);
    assertEquals(auditInserts[0].body.event, "wa_relay_reply");
    // crm_events PARITY: the relayed reply shows on the console feed exactly
    // like a console-sent one (crm-api actSendReply's 'rep_reply', ≤80 preview).
    assertEquals(crmEvents.length, 1);
    assertEquals(crmEvents[0].body.event, "rep_reply");
    assertEquals(crmEvents[0].body.actor, "rep");
    assertEquals(crmEvents[0].body.conversation_id, CONV_ID);
    assertEquals(crmEvents[0].body.preview, "היי, אשמח לעזור — מתי נוח לדבר?");
    // keeps bot_enabled=false (human stays in the loop); relay target NOT cleared
    assertEquals(convoPatch.length, 1);
    assertEquals(convoPatch[0].body.bot_enabled, false);
    assertFalse("relay_tg_chat_id" in (convoPatch[0].body as Record<string, unknown>), "reply must not clear the relay target");
  } finally {
    s.restore();
  }
});

Deno.test("rep relay whose whatsapp_messages store FAILS writes NO crm_events rep_reply row (parity with actSendReply's err-before-log)", async () => {
  const graphSends: Capture[] = [];
  const msgInserts: Capture[] = [];
  const auditInserts: Capture[] = [];
  const crmEvents: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("crm_events")(c) && c.method === "POST", respond: (c) => { crmEvents.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone=ilike"),
      respond: () => jsonRes([{ id: CONTACT_ID }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }]),
    },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("id=eq."),
      respond: () => jsonRes([{ wa_phone: "972501234567", status: "active" }]),
    },
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid("wamid.OUT2"); } },
    // The authoritative DB write FAILS (non-2xx) → insertRow returns false.
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "POST", respond: (c) => { msgInserts.push(c); return jsonRes({ message: "boom" }, 500); } },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: (c) => { auditInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: () => jsonRes([{ id: CONV_ID }]) },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 13,
      chat: { id: -1001 },
      from: { id: 42, first_name: "נציג" },
      text: "היי, אשמח לעזור",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    // The store failed → the handler reports it, never claims a clean relay.
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "message store failed");
    assertEquals(msgInserts.length, 1, "the store WAS attempted");
    // The bug: a rep_reply crm_events row must NOT be written when the message
    // never persisted — the activity feed only shows a reply that really landed.
    assertEquals(crmEvents.length, 0, "no phantom rep_reply on the activity feed");
    // The Reg.13 audit trail is DELIBERATELY still written (it records the attempt,
    // with delivered:true off the wamid) — that divergence from crm_events is intended.
    assertEquals(auditInserts.length, 1, "the Reg.13 attempt-audit is still written");
    assertEquals(auditInserts[0].body.event, "wa_relay_reply");
  } finally {
    s.restore();
  }
});

Deno.test("rep relay is BLOCKED (no Graph send) when the customer has opted out — §30A wins", async () => {
  const graphSends: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone=ilike"),
      respond: () => jsonRes([{ id: CONTACT_ID }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }]),
    },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("id=eq."),
      respond: () => jsonRes([{ wa_phone: "972501234567", status: "opted_out" }]),
    },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 12,
      chat: { id: -1001 },
      from: { id: 42 },
      text: "עוד הצעה?",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "customer opted out");
    assertEquals(graphSends.length, 0, "no message ever sent to an opted-out customer");
  } finally {
    s.restore();
  }
});

Deno.test("rep relay is BLOCKED when the customer is on the marketing_suppression list", async () => {
  const graphSends: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone=ilike"),
      respond: () => jsonRes([{ id: CONTACT_ID }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }]),
    },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("id=eq."),
      respond: () => jsonRes([{ wa_phone: "972501234567", status: "active" }]),
    },
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([{ id: "supp-1" }]) },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 15,
      chat: { id: -1001 },
      from: { id: 42 },
      text: "הצעה מיוחדת",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "customer suppressed");
    assertEquals(graphSends.length, 0);
  } finally {
    s.restore();
  }
});

// ── 2b) PLAIN-TYPE relay during an active takeover (no reply-to needed) ──────────
// The owner just TYPES in the team chat. We resolve the recipient by the relay
// TARGET — every RELAY-ACTIVE conversation whose relay_tg_chat_id is this chat.

// A plain message (no reply_to_message) typed straight into the team chat.
function plainTyped(text: string): TgMessage {
  return {
    message_id: 21,
    chat: { id: -1001 },
    from: { id: 42, first_name: "בעל העסק" },
    text,
  };
}

Deno.test("plain-typed text with EXACTLY ONE active relay for this chat relays to that customer", async () => {
  const graphSends: Capture[] = [];
  const msgInserts: Capture[] = [];
  const auditInserts: Capture[] = [];
  const routes: Route[] = [
    {
      // The relay-target lookup: RELAY-ACTIVE convos whose relay_tg_chat_id = this chat.
      match: (c) =>
        isRest("whatsapp_conversations")(c) && c.method === "GET" &&
        c.url.includes("relay_tg_chat_id=eq.") && c.url.includes("bot_enabled=eq.false"),
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1001" }]),
    },
    {
      // leadIdForContact: contact → lead_id (for the audit trail).
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("select=lead_id"),
      respond: () => jsonRes([{ lead_id: LEAD_ID }]),
    },
    {
      // relayRepReplyToCustomer: contact → wa_phone + status.
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone"),
      respond: () => jsonRes([{ wa_phone: "972501234567", status: "active" }]),
    },
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid("wamid.PLAIN1"); } },
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "POST", respond: (c) => { msgInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: (c) => { auditInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: () => jsonRes([{ id: CONV_ID }]) },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const res = await cb.handleTeamMessage(cfg(), plainTyped("היי, חזרתי אליך — אפשר לדבר עכשיו?"));
    assertEquals(res.ok, true);
    assertEquals(res.relayed, true);
    // Sent to the customer over WhatsApp.
    assertEquals(graphSends.length, 1);
    assertEquals(graphSends[0].body.to, "972501234567");
    assertEquals((graphSends[0].body.text as { body: string }).body, "היי, חזרתי אליך — אפשר לדבר עכשיו?");
    // Stored as an outbound rep message with the wamid.
    assertEquals(msgInserts.length, 1);
    assertEquals(msgInserts[0].body.direction, "out");
    assertEquals(msgInserts[0].body.actor, "rep");
    assertEquals(msgInserts[0].body.wa_message_id, "wamid.PLAIN1");
    assertEquals(msgInserts[0].body.conversation_id, CONV_ID);
    // Audited (Reg.13), and the resolved lead id is stamped in the detail.
    assertEquals(auditInserts.length, 1);
    assertEquals(auditInserts[0].body.event, "wa_relay_reply");
    assertEquals((auditInserts[0].body.detail as { lead_id?: string }).lead_id, LEAD_ID);
  } finally {
    s.restore();
  }
});

Deno.test("plain-typed text still relays when the contact has NO lead (leadId guarded, no bad FK in audit)", async () => {
  const graphSends: Capture[] = [];
  const auditInserts: Capture[] = [];
  const routes: Route[] = [
    {
      match: (c) =>
        isRest("whatsapp_conversations")(c) && c.method === "GET" &&
        c.url.includes("relay_tg_chat_id=eq.") && c.url.includes("bot_enabled=eq.false"),
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1001" }]),
    },
    // No lead tied to the contact → leadIdForContact returns "".
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("select=lead_id"), respond: () => jsonRes([{ lead_id: null }]) },
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone"), respond: () => jsonRes([{ wa_phone: "972501234567", status: "active" }]) },
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid("wamid.PLAIN2"); } },
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "POST", respond: () => jsonRes({}, 201) },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: (c) => { auditInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: () => jsonRes([{ id: CONV_ID }]) },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const res = await cb.handleTeamMessage(cfg(), plainTyped("עדכון קצר"));
    assertEquals(res.ok, true);
    assertEquals(res.relayed, true);
    assertEquals(graphSends.length, 1, "still relays even without a lead");
    // The audit row is written but carries NO lead_id key (guarded — no empty/bad FK).
    assertEquals(auditInserts.length, 1);
    assertFalse("lead_id" in (auditInserts[0].body.detail as Record<string, unknown>), "no lead_id stamped when unresolved");
  } finally {
    s.restore();
  }
});

Deno.test("plain-typed text with TWO active relays does NOT send and asks the owner to use the card", async () => {
  const graphSends: Capture[] = [];
  const tgSends: Capture[] = [];
  const routes: Route[] = [
    {
      match: (c) =>
        isRest("whatsapp_conversations")(c) && c.method === "GET" &&
        c.url.includes("relay_tg_chat_id=eq.") && c.url.includes("bot_enabled=eq.false"),
      respond: () =>
        jsonRes([
          { id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1001" },
          { id: "44444444-4444-4444-4444-444444444444", contact_id: "55555555-5555-5555-5555-555555555555", bot_enabled: false, relay_tg_chat_id: "-1001" },
        ]),
    },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: isTg, respond: (c) => { tgSends.push(c); return tgOk(); } },
  ];
  const s = installRoutes(routes);
  try {
    const res = await cb.handleTeamMessage(cfg(), plainTyped("מי מקבל את זה?"));
    assertEquals(res.ok, true);
    assertEquals(res.skipped, "ambiguous relay");
    assertEquals(graphSends.length, 0, "ambiguous → never sends to a customer");
    // The owner is told to reply on the specific card.
    assert(tgSends.length >= 1);
    const sent = tgSends.map((c) => String(c.body.text ?? "")).join(" ");
    assert(sent.includes("כמה שיחות פעילות"), "disambiguation message shown");
  } finally {
    s.restore();
  }
});

Deno.test("plain-typed text with ZERO active relays is the unchanged 'not a command' no-op", async () => {
  const graphSends: Capture[] = [];
  const routes: Route[] = [
    {
      match: (c) =>
        isRest("whatsapp_conversations")(c) && c.method === "GET" &&
        c.url.includes("relay_tg_chat_id=eq.") && c.url.includes("bot_enabled=eq.false"),
      respond: () => jsonRes([]),
    },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const res = await cb.handleTeamMessage(cfg(), plainTyped("סתם פטפוט בקבוצה"));
    assertEquals(res.ok, true);
    assertEquals(res.skipped, "not a command");
    assertEquals(graphSends.length, 0, "non-takeover chatter never sends WhatsApp");
  } finally {
    s.restore();
  }
});

Deno.test("a relay send rejected as the 24h customer-service window tells the rep exactly that", async () => {
  const msgInserts: Capture[] = [];
  const tgSends: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone=ilike"),
      respond: () => jsonRes([{ id: CONTACT_ID }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }]),
    },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("id=eq."),
      respond: () => jsonRes([{ wa_phone: "972501234567", status: "active" }]),
    },
    { match: (c) => isRest("marketing_suppression")(c) && c.method === "GET", respond: () => jsonRes([]) },
    // Graph rejects with the re-engagement / 24h-window error (code 131047).
    {
      match: isGraphSend,
      respond: () =>
        jsonRes(
          { error: { code: 131047, message: "Message failed to send because more than 24 hours have passed since the customer last replied." } },
          400,
        ),
    },
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "POST", respond: (c) => { msgInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: () => jsonRes({}, 201) },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: () => jsonRes([{ id: CONV_ID }]) },
    { match: isTg, respond: (c) => { tgSends.push(c); return tgOk(); } },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 19,
      chat: { id: -1001 },
      from: { id: 42, first_name: "נציג" },
      text: "תזכורת קצרה",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    // The message is still stored (human stays in the loop), but marked failed.
    assertEquals(res.relayed, true);
    assertEquals(res.delivered, false);
    assertEquals(msgInserts.length, 1);
    assertEquals(msgInserts[0].body.status, "failed");
    // The rep is told it's the 24h window, not a generic failure.
    const sent = tgSends.map((c) => String(c.body.text ?? "")).join(" ");
    assert(sent.includes("24 שעות"), "24h-window nudge shown to the rep");
  } finally {
    s.restore();
  }
});

// ── 3) NON-relay reply still notes / parses savings (preserved behaviour) ───────

Deno.test("a reply to a NON-relay open card is stored as a NOTE (no Graph send)", async () => {
  const graphSends: Capture[] = [];
  const noteEvents: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    {
      match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET" && c.url.includes("wa_phone=ilike"),
      respond: () => jsonRes([{ id: CONTACT_ID }]),
    },
    {
      // Conversation exists but the bot is still ON → NOT relay-active.
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: true, relay_tg_chat_id: null }]),
    },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: (c) => isRest("lead_events")(c) && c.method === "POST", respond: (c) => { noteEvents.push(c); return jsonRes({}, 201); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 13,
      chat: { id: -1001 },
      from: { id: 42, first_name: "נציג" },
      text: "התקשרתי, אין מענה",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, true);
    assertFalse("relayed" in res, "must not be a relay");
    assertEquals(graphSends.length, 0, "a note never sends WhatsApp");
    assertEquals(noteEvents.length, 1);
    assertEquals(noteEvents[0].body.event, "note");
  } finally {
    s.restore();
  }
});

Deno.test("a non-WhatsApp lead reply notes (no conversation, no Graph send)", async () => {
  const graphSends: Capture[] = [];
  const noteEvents: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ status: "new", phone: "0501234567" }]) },
    // No WhatsApp contact at all → resolveWaConvoByPhone returns null → note.
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: (c) => isRest("lead_events")(c) && c.method === "POST", respond: (c) => { noteEvents.push(c); return jsonRes({}, 201); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 16,
      chat: { id: -1001 },
      from: { id: 42 },
      text: "הערה כללית",
      reply_to_message: leadCardReply(),
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, true);
    assertEquals(graphSends.length, 0);
    assertEquals(noteEvents.length, 1);
    assertEquals(noteEvents[0].body.event, "note");
  } finally {
    s.restore();
  }
});

Deno.test("a won-ask reply with a single number still records the saving (preserved)", async () => {
  const graphSends: Capture[] = [];
  const savingPatch: Capture[] = [];
  const savingEvents: Capture[] = [];
  const routes: Route[] = [
    { match: isGraphSend, respond: (c) => { graphSends.push(c); return graphOkWamid(); } },
    { match: (c) => isRest("leads?id=eq.")(c) && c.method === "PATCH", respond: (c) => { savingPatch.push(c); return jsonRes([{ id: LEAD_ID }]); } },
    { match: (c) => isRest("lead_events")(c) && c.method === "POST", respond: (c) => { savingEvents.push(c); return jsonRes({}, 201); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 14,
      chat: { id: -1001 },
      from: { id: 42 },
      text: "1200",
      reply_to_message: {
        message_id: 9,
        // The won-ask markup carries the lead id with the :wonask action.
        reply_markup: { inline_keyboard: [[{ text: "💰", callback_data: `lead:${LEAD_ID}:wonask` }]] },
      },
    };
    const res = await cb.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, true);
    assertEquals(graphSends.length, 0, "won-ask never sends WhatsApp");
    assertEquals(savingPatch.length, 1);
    assertEquals(savingPatch[0].body.actual_saving, 1200);
    assertEquals(savingEvents.length, 1);
    assertEquals(savingEvents[0].body.event, "saving");
  } finally {
    s.restore();
  }
});

// ── 4) HAND-BACK flips bot_enabled=true + relay_tg_chat_id=NULL ──────────────────

Deno.test("hand-back flips bot_enabled=true + clears relay_tg_chat_id", async () => {
  const convoPatch: Capture[] = [];
  const auditInserts: Capture[] = [];
  const crmEvents: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("leads?id=eq.")(c), respond: () => jsonRes([{ id: LEAD_ID, phone: "0501234567", name: "דנה" }]) },
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET", respond: () => jsonRes([{ id: CONTACT_ID }]) },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: false, relay_tg_chat_id: "-1009" }]),
    },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); } },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: (c) => { auditInserts.push(c); return jsonRes({}, 201); } },
    { match: (c) => isRest("crm_events")(c) && c.method === "POST", respond: (c) => { crmEvents.push(c); return jsonRes({}, 201); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbq2",
      from: { id: 42 },
      data: `lead:${LEAD_ID}:handback`,
      message: { message_id: 5, chat: { id: -1001 } },
    };
    const res = await cb.handleCallback(cfg(), query);
    assertEquals(res.ok, true);
    assertEquals(convoPatch.length, 1);
    assertEquals(convoPatch[0].body.bot_enabled, true);
    assertEquals(convoPatch[0].body.relay_tg_chat_id, null);
    assertEquals(auditInserts.length, 1);
    assertEquals(auditInserts[0].body.event, "wa_relay_handback");
    // crm_events PARITY: the console feed sees the Telegram hand-back exactly
    // like a CRM-app one (crm-api actHandBack's actor 'rep' / event 'handback').
    assertEquals(crmEvents.length, 1);
    assertEquals(crmEvents[0].body.event, "handback");
    assertEquals(crmEvents[0].body.actor, "rep");
    assertEquals(crmEvents[0].body.conversation_id, CONV_ID);
  } finally {
    s.restore();
  }
});

// ── auth / chat gates still apply to the new relay actions ───────────────────────

Deno.test("relay callbacks are rejected from the wrong chat (no PATCH)", async () => {
  const convoPatch: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbq9",
      from: { id: 42 },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -2002 } }, // not cfg.tgChat (-1001)
    };
    const res = await cb.handleCallback(cfg(), query);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "wrong chat");
    assertEquals(convoPatch.length, 0);
  } finally {
    s.restore();
  }
});

Deno.test("relay callbacks are rejected for a user not in the allowlist (no PATCH)", async () => {
  const convoPatch: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    // allowlist set to a different id → the presser (42) is not allowed.
    const query: TgCallbackQuery = {
      id: "cbq10",
      from: { id: 42 },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -1001 } },
    };
    const res = await cb.handleCallback(cfg({ allowedUserIds: [999] }), query);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "user not allowed");
    assertEquals(convoPatch.length, 0);
  } finally {
    s.restore();
  }
});
