// Unit tests for the RICHER human-takeover relay (CELL B5) — notify-lead/callbacks.ts.
//
// Builds on the existing rep→customer relay (whatsapp_relay_repside_test.ts).
// Here we verify the three enrichments, all grounded in real DB rows (truth-only,
// nothing fabricated):
//   (a) MEDIA NOTE — when a customer sent a bill photo / voice note, the takeover
//       brief surfaces a short note (📷 / 🎤) + any stored caption/transcript. The
//       bytes are NEVER re-sent (whatsapp_messages.body is text/caption only).
//   (b) CONTEXT HEADER — the takeover brief carries the lead dossier (name +
//       desired category + provider/plan + notes context) and the customer's last
//       few messages, so the rep has the full picture in one message.
//   (c) DELIVERY FEEDBACK — a rep reply that Graph accepts gets a ✓ "נמסר ללקוח"
//       confirmation; a send miss is fail-soft (stored, "נסו שוב", never throws).
//
// All gates preserved: the secret/admin auth gate (allowed()) + team-chat gate +
// the existing relay wiring (bot_enabled / relay_tg_chat_id contract) are untouched.
//
// _shared/whatsapp.ts reads WHATSAPP_TOKEN at import time, and db.ts reads
// SUPABASE_URL / SERVICE_ROLE_KEY per call — set env BEFORE importing. We stub
// globalThis.fetch only; no real network, no keys. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, Lead, TgCallbackQuery, TgMessage } from "../_shared/types.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");
Deno.env.set("WHATSAPP_TOKEN", "wa-token-stub");
Deno.env.set("WHATSAPP_PHONE_ID", "PHONE123");
Deno.env.set("GRAPH_API_VERSION", "v21.0");

const cbMod = await import("../notify-lead/callbacks.ts");

const realFetch = globalThis.fetch;

type Capture = { method: string; url: string; body: Record<string, unknown> };
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
// A Graph send that FAILS at the API (4xx) → sendText returns null (no wamid).
function graphFail(): Response {
  return jsonRes({ error: { message: "bad" } }, 400);
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
    return Promise.resolve(jsonRes([]));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

const isGraphSend = (c: Capture) =>
  c.url.includes("graph.facebook.com") && c.url.endsWith("/messages") && c.method === "POST";
const isTg = (c: Capture) => c.url.includes("api.telegram.org");
const isTgSend = (c: Capture) => c.url.includes("api.telegram.org") && c.url.includes("/sendMessage");
const isRest = (path: string) => (c: Capture) => c.url.includes(`/rest/v1/${path}`);

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

function leadCardReply(): TgMessage {
  return {
    message_id: 9,
    reply_markup: { inline_keyboard: [[{ text: "x", callback_data: `lead:${LEAD_ID}:contacted` }]] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (a)+(b) PURE: mediaNoteFor + buildTakeoverContextHeader
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("mediaNoteFor maps image→bill-photo, audio/voice→voice-note, document→doc, text→''", () => {
  assertStringIncludes(cbMod.mediaNoteFor("image"), "📷");
  assertStringIncludes(cbMod.mediaNoteFor("image"), "צילום חשבון");
  assertStringIncludes(cbMod.mediaNoteFor("audio"), "🎤");
  assertStringIncludes(cbMod.mediaNoteFor("VOICE"), "קולית"); // case-insensitive
  assertStringIncludes(cbMod.mediaNoteFor("document"), "📄");
  assertEquals(cbMod.mediaNoteFor("text"), "");
  assertEquals(cbMod.mediaNoteFor("interactive"), "");
  assertEquals(cbMod.mediaNoteFor(null), "");
  assertEquals(cbMod.mediaNoteFor(undefined), "");
});

Deno.test("context header carries the lead dossier: name + desired category + provider/plan + notes", () => {
  const lead: Lead = {
    id: LEAD_ID,
    name: "דנה כהן",
    phone: "0501234567",
    provider: "סלקום",
    plan_id: "cellular-unlimited",
    notes: "שירות מבוקש: cellular | תקציב 50",
  };
  const header = cbMod.buildTakeoverContextHeader(lead, []);
  assertStringIncludes(header, "השתלטת על שיחת הוואטסאפ");
  assertStringIncludes(header, "דנה כהן");
  // desiredCategory maps the "שירות מבוקש: cellular" note → "סלולר".
  assertStringIncludes(header, "🎯");
  assertStringIncludes(header, "סלולר");
  assertStringIncludes(header, "סלקום");
  assertStringIncludes(header, "cellular-unlimited");
  assertStringIncludes(header, "תקציב 50");
  // Still carries the "what happens next" instruction line.
  assertStringIncludes(header, "כל הודעה שתשיבו");
});

Deno.test("context header surfaces a MEDIA NOTE for a bill photo + the customer's last messages (oldest→newest)", () => {
  const lead: Lead = { id: LEAD_ID, name: "יוסי", phone: "0501234567" };
  // PostgREST returns created_at.desc (newest first); the header reverses to read
  // oldest→newest. Mix an outbound (must be ignored) and an image (media note).
  const recent = [
    { direction: "in", actor: "customer", msg_type: "image", body: "החשבון שלי", created_at: "2026-06-25T10:03:00Z" },
    { direction: "out", actor: "bot", msg_type: "text", body: "תשובת הבוט", created_at: "2026-06-25T10:02:00Z" },
    { direction: "in", actor: "customer", msg_type: "text", body: "שלום, רוצה לחסוך", created_at: "2026-06-25T10:01:00Z" },
  ];
  const header = cbMod.buildTakeoverContextHeader(lead, recent);
  // Media note present, with the stored caption (no bytes).
  assertStringIncludes(header, "📷");
  assertStringIncludes(header, "החשבון שלי");
  // The earlier plain customer message is shown…
  assertStringIncludes(header, "שלום, רוצה לחסוך");
  // …and the BOT's outbound is NOT surfaced as a customer message.
  assertFalse(header.includes("תשובת הבוט"));
  // Oldest→newest: the plain "שלום" turn comes before the image caption line.
  assert(header.indexOf("שלום, רוצה לחסוך") < header.indexOf("החשבון שלי"));
});

Deno.test("context header surfaces a VOICE-NOTE note even when no transcript text was stored", () => {
  const lead: Lead = { id: LEAD_ID, name: "רות", phone: "0501234567" };
  const recent = [
    { direction: "in", actor: "customer", msg_type: "voice", body: "", created_at: "2026-06-25T10:01:00Z" },
  ];
  const header = cbMod.buildTakeoverContextHeader(lead, recent);
  assertStringIncludes(header, "🎤");
  assertStringIncludes(header, "הודעה קולית");
});

Deno.test("context header escapes HTML in customer-controlled name + body (parse_mode HTML safety)", () => {
  const lead: Lead = { id: LEAD_ID, name: "<b>hax</b>", phone: "0501234567" };
  const recent = [
    { direction: "in", actor: "customer", msg_type: "text", body: "5 < 10 & ok", created_at: "2026-06-25T10:01:00Z" },
  ];
  const header = cbMod.buildTakeoverContextHeader(lead, recent);
  assertStringIncludes(header, "&lt;b&gt;hax&lt;/b&gt;");
  assertStringIncludes(header, "5 &lt; 10 &amp; ok");
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) INTEGRATION: takeover sends the richer header to the team chat
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("takeover posts the RICHER context header (dossier + media note) to the team chat, gates preserved", async () => {
  const convoPatch: Capture[] = [];
  const tgSends: Capture[] = [];
  const routes: Route[] = [
    {
      match: isRest("leads?id=eq."),
      respond: () =>
        jsonRes([{
          id: LEAD_ID,
          phone: "0501234567",
          name: "דנה כהן",
          provider: "פרטנר",
          plan_id: "internet-100",
          notes: "שירות מבוקש: internet",
        }]),
    },
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET", respond: () => jsonRes([{ id: CONTACT_ID }]) },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: true, relay_tg_chat_id: null }]),
    },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH",
      respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); },
    },
    // Recent messages for the header: a bill photo + a plain text turn.
    {
      match: (c) => isRest("whatsapp_messages")(c) && c.method === "GET",
      respond: () =>
        jsonRes([
          { direction: "in", actor: "customer", msg_type: "image", body: "צילום החשבון", created_at: "2026-06-25T10:02:00Z" },
          { direction: "in", actor: "customer", msg_type: "text", body: "רוצה לעבור ספק", created_at: "2026-06-25T10:01:00Z" },
        ]),
    },
    { match: isTgSend, respond: (c) => { tgSends.push(c); return tgOk(); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbqR1",
      from: { id: 987654, first_name: "נציג" },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -1001 } },
    };
    const res = await cbMod.handleCallback(cfg(), query);
    assertEquals(res.ok, true);
    // Gate preserved: takeover still flipped bot off + pointed relay at the team group.
    assertEquals(convoPatch.length, 1);
    assertEquals(convoPatch[0].body.bot_enabled, false);
    assertEquals(convoPatch[0].body.relay_tg_chat_id, "-1001");
    // The richer header is among the team-chat sends.
    const blob = tgSends.map((c) => String(c.body.text ?? "")).join("\n---\n");
    assertStringIncludes(blob, "דנה כהן");
    assertStringIncludes(blob, "פרטנר");
    assertStringIncludes(blob, "internet-100");
    assertStringIncludes(blob, "📷"); // bill-photo media note
    assertStringIncludes(blob, "צילום החשבון"); // its stored caption
    assertStringIncludes(blob, "רוצה לעבור ספק"); // the plain customer message
  } finally {
    s.restore();
  }
});

Deno.test("takeover header is FAIL-SOFT when the recent-messages query errors (degrades to the dossier, still posts)", async () => {
  const tgSends: Capture[] = [];
  const routes: Route[] = [
    { match: isRest("leads?id=eq."), respond: () => jsonRes([{ id: LEAD_ID, phone: "0501234567", name: "אבי" }]) },
    { match: (c) => isRest("whatsapp_contacts")(c) && c.method === "GET", respond: () => jsonRes([{ id: CONTACT_ID }]) },
    {
      match: (c) => isRest("whatsapp_conversations")(c) && c.method === "GET",
      respond: () => jsonRes([{ id: CONV_ID, contact_id: CONTACT_ID, bot_enabled: true, relay_tg_chat_id: null }]),
    },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: () => jsonRes([{ id: CONV_ID }]) },
    // The recent-messages GET fails (500) → fetchRecentConvoMessages returns [].
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "GET", respond: () => jsonRes({ message: "boom" }, 500) },
    { match: isTgSend, respond: (c) => { tgSends.push(c); return tgOk(); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbqR2",
      from: { id: 42 },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -1001 } },
    };
    const res = await cbMod.handleCallback(cfg(), query);
    assertEquals(res.ok, true);
    const blob = tgSends.map((c) => String(c.body.text ?? "")).join("\n");
    assertStringIncludes(blob, "אבי"); // dossier still posted
    assertStringIncludes(blob, "השתלטת על שיחת הוואטסאפ");
  } finally {
    s.restore();
  }
});

Deno.test("takeover still rejected from the wrong chat — richer header changes do NOT weaken the gates", async () => {
  const convoPatch: Capture[] = [];
  const routes: Route[] = [
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: (c) => { convoPatch.push(c); return jsonRes([{ id: CONV_ID }]); } },
    { match: isTg, respond: tgOk },
  ];
  const s = installRoutes(routes);
  try {
    const query: TgCallbackQuery = {
      id: "cbqR3",
      from: { id: 42 },
      data: `lead:${LEAD_ID}:takeover`,
      message: { message_id: 5, chat: { id: -2002 } }, // not cfg.tgChat
    };
    const res = await cbMod.handleCallback(cfg(), query);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "wrong chat");
    assertEquals(convoPatch.length, 0);
  } finally {
    s.restore();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) DELIVERY FEEDBACK on a rep reply (relay rep→customer)
// ─────────────────────────────────────────────────────────────────────────────

// Shared routes for a RELAY-ACTIVE lead reply. `graphRoute` decides whether the
// Graph send succeeds (✓) or misses (fail-soft).
function relayReplyRoutes(graphRoute: Route, sinks: { tg: Capture[] }): Route[] {
  return [
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
    graphRoute,
    { match: (c) => isRest("whatsapp_messages")(c) && c.method === "POST", respond: () => jsonRes({}, 201) },
    { match: (c) => isRest("security_audit_log")(c) && c.method === "POST", respond: () => jsonRes({}, 201) },
    { match: (c) => isRest("whatsapp_conversations")(c) && c.method === "PATCH", respond: () => jsonRes([{ id: CONV_ID }]) },
    { match: isTgSend, respond: (c) => { sinks.tg.push(c); return tgOk(); } },
    { match: isTg, respond: tgOk },
  ];
}

Deno.test("delivery feedback: a successful relay shows ✓ נמסר ללקוח + an echo of what was sent", async () => {
  const tg: Capture[] = [];
  const routes = relayReplyRoutes(
    { match: isGraphSend, respond: () => graphOkWamid("wamid.OUT1") },
    { tg },
  );
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 11,
      chat: { id: -1001 },
      from: { id: 42, first_name: "נציג" },
      text: "היי, אשמח לעזור — מתי נוח לדבר?",
      reply_to_message: leadCardReply(),
    };
    const res = await cbMod.handleTeamMessage(cfg(), msg);
    assertEquals(res.ok, true);
    assertEquals(res.relayed, true);
    assertEquals(res.delivered, true);
    const blob = tg.map((c) => String(c.body.text ?? "")).join("\n");
    assertStringIncludes(blob, "✓");
    assertStringIncludes(blob, "נמסר ללקוח");
    // The echo shows the rep what reached the customer (two-way clarity).
    assertStringIncludes(blob, "מתי נוח לדבר");
  } finally {
    s.restore();
  }
});

Deno.test("delivery feedback is FAIL-SOFT on a send miss: stored, 'נסו שוב', delivered=false, never throws", async () => {
  const tg: Capture[] = [];
  const routes = relayReplyRoutes(
    { match: isGraphSend, respond: () => graphFail() }, // Graph 400 → wamid null
    { tg },
  );
  const s = installRoutes(routes);
  try {
    const msg: TgMessage = {
      message_id: 12,
      chat: { id: -1001 },
      from: { id: 42, first_name: "נציג" },
      text: "הצעה ללקוח",
      reply_to_message: leadCardReply(),
    };
    const res = await cbMod.handleTeamMessage(cfg(), msg);
    // The message was still STORED (the human stays in the loop) → ok:true.
    assertEquals(res.ok, true);
    assertEquals(res.relayed, true);
    assertEquals(res.delivered, false);
    const blob = tg.map((c) => String(c.body.text ?? "")).join("\n");
    // No false ✓ on a miss; the rep is told to retry.
    assertFalse(blob.includes("✓ <b>נמסר ללקוח</b>"));
    assertStringIncludes(blob, "נסו שוב");
  } finally {
    s.restore();
  }
});
