// Wave 16 N2 — the native in-chat board CALLBACK + reply path (notify-lead/
// callbacks.ts) and the applyMeetingAct reuse it shares with console.ts. Three
// halves:
//
//   1. PURE marker detectors — isBoardZoomAskMarkup / isBoardRescheduleAskMarkup.
//      The board zoom/reschedule taps post a single-button marker prompt; a reply
//      to it must resolve the meeting id (and only for the mtg:<id>:… namespace,
//      never the meet:/lead: prompts).
//
//   2. handleCallback routing for the EXACT contract (board:today|pending|week ·
//      mtg:<id>:zoom|reschedule|confirm|cancel · leads:new|all) against a routing
//      fetch stub modelling PostgREST + the Telegram Bot API. Asserts: board:<tab>
//      edits the message via editMessageText; mtg:<id>:confirm|cancel go through
//      the SHARED applyMeetingAct write path then re-render; mtg:<id>:zoom|
//      reschedule post a reply-capture prompt; leads:* render the pipeline. The
//      allowlist + team-chat AUTH gate is enforced on every board callback.
//
//   3. The reply-capture half: a reply to a board zoom/reschedule prompt applies
//      via applyMeetingAct (sendlink / reschedule) — the SAME write path the Mini
//      App console uses.
//
// db.ts reads SUPABASE_URL / SERVICE_ROLE_KEY per call → set env BEFORE importing.
// These stub globalThis.fetch only; no real network/keys.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, TgCallbackQuery, TgMessage } from "../_shared/types.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");

const {
  handleCallback,
  handleTeamMessage,
  isBoardZoomAskMarkup,
  isBoardRescheduleAskMarkup,
} = await import("../notify-lead/callbacks.ts");

const realFetch = globalThis.fetch;
const MID = "11111111-2222-3333-4444-555555555555"; // a 36-char meeting id

// ── fixtures ─────────────────────────────────────────────────────────────────

const TEAM_CHAT = "-1009999";

function cfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "BOT:token", tgChat: TEAM_CHAT,
    resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "",
    webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "", googleSpreadsheetId: "",
    allowedUserIds: [7], src: {},
    ...over,
  };
}

function cb(data: string, over: Partial<TgCallbackQuery> = {}): TgCallbackQuery {
  return {
    id: "cbid",
    from: { id: 7, first_name: "דנה" } as TgCallbackQuery["from"],
    data,
    message: { message_id: 42, chat: { id: Number(TEAM_CHAT) } } as TgMessage,
    ...over,
  };
}

// ── 1. PURE marker detectors ──────────────────────────────────────────────────

Deno.test("isBoardZoomAskMarkup resolves the meeting id ONLY for the mtg:<id>:zoom marker", () => {
  assertEquals(isBoardZoomAskMarkup({ inline_keyboard: [[{ callback_data: `mtg:${MID}:zoom` }]] }), MID);
  // wrong act / namespace / multi-button → no match
  assertEquals(isBoardZoomAskMarkup({ inline_keyboard: [[{ callback_data: `mtg:${MID}:reschedule` }]] }), null);
  assertEquals(isBoardZoomAskMarkup({ inline_keyboard: [[{ callback_data: `meet:${MID}:linkask` }]] }), null);
  assertEquals(isBoardZoomAskMarkup({ inline_keyboard: [[{ callback_data: `mtg:${MID}:zoom` }, { callback_data: "x" }]] }), null);
  assertEquals(isBoardZoomAskMarkup(undefined), null);
});

Deno.test("isBoardRescheduleAskMarkup resolves the meeting id ONLY for the mtg:<id>:reschedule marker", () => {
  assertEquals(isBoardRescheduleAskMarkup({ inline_keyboard: [[{ callback_data: `mtg:${MID}:reschedule` }]] }), MID);
  assertEquals(isBoardRescheduleAskMarkup({ inline_keyboard: [[{ callback_data: `mtg:${MID}:zoom` }]] }), null);
  assertEquals(isBoardRescheduleAskMarkup({ inline_keyboard: [[{ callback_data: `meet:${MID}:reschedule` }]] }), null);
  assertEquals(isBoardRescheduleAskMarkup(undefined), null);
});

// ── routing fetch stub ────────────────────────────────────────────────────────

type Capture = { method: string; url: string; body: Record<string, unknown> };
type Route = { match: (c: Capture) => boolean; respond: (c: Capture) => Response };

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
const tgOk = () => jsonRes({ ok: true, result: { message_id: 1 } });

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

const isTg = (c: Capture) => c.url.includes("api.telegram.org");
const tgMethod = (c: Capture, m: string) => c.url.includes(`/${m}`);
const isMeetingsRest = (c: Capture) => c.url.includes("/rest/v1/meetings");
const isLeadsRest = (c: Capture) => c.url.includes("/rest/v1/leads");
// patchCount uses Prefer: return=representation and counts the RETURNED ROW ARRAY
// (length ≥ 1 = a row changed). So an applied PATCH must echo a one-row array.
function patchOk(): Response {
  return jsonRes([{ id: MID }]);
}

// ── 2. handleCallback routing + AUTH ──────────────────────────────────────────

Deno.test("board callbacks enforce the allowlist (a non-allowed user is refused)", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb("board:today", { from: { id: 999, first_name: "זר" } as TgCallbackQuery["from"] }));
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "user not allowed");
    // it answered the callback but never touched the DB / edited the board
    assertFalse(calls.some((c) => c.url.includes("/rest/v1/")));
    assertFalse(calls.some((c) => isTg(c) && tgMethod(c, "editMessageText")));
  } finally {
    restore();
  }
});

Deno.test("board callbacks reject presses from a chat other than the team chat", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const wrongChat = cb("board:today", { message: { message_id: 1, chat: { id: 42424242 } } as TgMessage });
    const res = await handleCallback(cfg(), wrongChat);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "wrong chat");
    assertFalse(calls.some((c) => c.url.includes("/rest/v1/")));
  } finally {
    restore();
  }
});

Deno.test("board:<tab> re-fetches + edits the board message via editMessageText", async () => {
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const rows = [{ id: MID, name: "ליאת", provider: "HOT", status: "pending", meeting_date: todayYmd, slot: "16:00", starts_at: new Date(Date.now() + 2 * 3600_000).toISOString() }];
  const { calls, restore } = installRoutes([
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes(rows) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb("board:pending"));
    assertEquals(res, { ok: true, board: "pending" });
    const edit = calls.find((c) => isTg(c) && tgMethod(c, "editMessageText"));
    assert(edit, "expected an editMessageText call");
    assertEquals(edit!.body.message_id, 42);
    assertEquals(String(edit!.body.chat_id), TEAM_CHAT);
    assertStringIncludes(String(edit!.body.text), "ליאת"); // the re-rendered board
  } finally {
    restore();
  }
});

Deno.test("mtg:<id>:cancel goes through the SHARED applyMeetingAct then re-renders", async () => {
  const meetingRow = { id: MID, name: "דנה", phone: "0501234567", provider: "פרטנר", status: "pending", meeting_date: "2026-06-16", slot: "09:00", starts_at: "2026-06-16T06:00:00Z" };
  const { calls, restore } = installRoutes([
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes([meetingRow]) },
    { match: (c) => isMeetingsRest(c) && c.method === "PATCH", respond: patchOk },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`mtg:${MID}:cancel`));
    assertEquals(res.ok, true);
    assertEquals(res.meeting, MID);
    assertEquals(res.act, "cancel");
    // the shared write path patched the meeting status to cancelled
    const patch = calls.find((c) => isMeetingsRest(c) && c.method === "PATCH");
    assert(patch, "expected a meetings PATCH (applyMeetingAct)");
    assertEquals(patch!.body.status, "cancelled");
    // then re-rendered the board in place
    assert(calls.some((c) => isTg(c) && tgMethod(c, "editMessageText")));
  } finally {
    restore();
  }
});

Deno.test("mtg:<id>:confirm with no Zoom configured prompts the rep to reply with a link", async () => {
  const meetingRow = { id: MID, name: "דנה", phone: "0501234567", status: "pending", meeting_date: "2026-06-16", slot: "09:00", starts_at: "2026-06-16T06:00:00Z" };
  const { calls, restore } = installRoutes([
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes([meetingRow]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    // cfg has no zoom S2S fields → applyMeetingAct returns needsLink
    const res = await handleCallback(cfg(), cb(`mtg:${MID}:confirm`));
    assertEquals(res.ok, true);
    assertEquals(res.pending, "manual link");
    // it posted the zoom reply-capture prompt (mtg:<id>:zoom marker)
    const prompt = calls.find((c) => isTg(c) && tgMethod(c, "sendMessage"));
    assert(prompt, "expected a sendMessage prompt");
    const kb = (prompt!.body.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> })?.inline_keyboard ?? [];
    assertEquals(kb.flat()[0]?.callback_data, `mtg:${MID}:zoom`);
    // it must NOT have flipped the meeting to confirmed yet (no link)
    assertFalse(calls.some((c) => isMeetingsRest(c) && c.method === "PATCH"));
  } finally {
    restore();
  }
});

Deno.test("mtg:<id>:zoom posts a reply-capture prompt (no DB write on the tap)", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb(`mtg:${MID}:zoom`));
    assertEquals(res.ok, true);
    assertEquals(res.pending, "zoom link");
    const prompt = calls.find((c) => isTg(c) && tgMethod(c, "sendMessage"));
    const kb = (prompt!.body.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> })?.inline_keyboard ?? [];
    assertEquals(kb.flat()[0]?.callback_data, `mtg:${MID}:zoom`);
    assertFalse(calls.some((c) => c.url.includes("/rest/v1/"))); // pure prompt, no write
  } finally {
    restore();
  }
});

Deno.test("mtg:<id>:reschedule posts a reply-capture prompt asking for a new time", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb(`mtg:${MID}:reschedule`));
    assertEquals(res.ok, true);
    assertEquals(res.pending, "reschedule");
    const prompt = calls.find((c) => isTg(c) && tgMethod(c, "sendMessage"));
    const kb = (prompt!.body.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> })?.inline_keyboard ?? [];
    assertEquals(kb.flat()[0]?.callback_data, `mtg:${MID}:reschedule`);
    assertStringIncludes(String(prompt!.body.text), "YYYY-MM-DD");
  } finally {
    restore();
  }
});

Deno.test("leads:new renders the pipeline header + only new (uncontacted) cards", async () => {
  const leads = [
    { id: "11111111-1111-1111-1111-111111111111", name: "אבי-לקוח", phone: "0501111111", status: "new", source: "form", created_at: "2026-06-15T10:00:00Z" },
    { id: "22222222-2222-2222-2222-222222222222", name: "רינת-לקוחה", phone: "0502222222", status: "contacted", source: "plan", created_at: "2026-06-15T09:00:00Z" },
  ];
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes(leads) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb("leads:new"));
    assertEquals(res.ok, true);
    assertEquals(res.leads, "new");
    const sends = calls.filter((c) => isTg(c) && tgMethod(c, "sendMessage"));
    // header + 1 card (only the new lead; the contacted one is filtered out of "new")
    assertEquals(sends.length, 2);
    assertStringIncludes(String(sends[0].body.text), "צינור הלידים");
    assertStringIncludes(String(sends[0].body.text), "§7b");
    // the lone card is the NEW lead; the contacted lead's NAME never appears as a card
    assertStringIncludes(String(sends[1].body.text), "אבי-לקוח");
    assertFalse(String(sends[1].body.text).includes("רינת-לקוחה"));
  } finally {
    restore();
  }
});

Deno.test("leads:all renders the pipeline + new and contacted cards", async () => {
  const leads = [
    { id: "11111111-1111-1111-1111-111111111111", name: "אבי-לקוח", phone: "0501111111", status: "new", source: "form", created_at: "2026-06-15T10:00:00Z" },
    { id: "22222222-2222-2222-2222-222222222222", name: "רינת-לקוחה", phone: "0502222222", status: "contacted", source: "plan", created_at: "2026-06-15T09:00:00Z" },
  ];
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes(leads) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb("leads:all"));
    assertEquals(res.ok, true);
    const sends = calls.filter((c) => isTg(c) && tgMethod(c, "sendMessage"));
    assertEquals(sends.length, 3); // header + 2 cards
    assert(sends.some((s) => String(s.body.text).includes("אבי-לקוח")));
    assert(sends.some((s) => String(s.body.text).includes("רינת-לקוחה")));
  } finally {
    restore();
  }
});

Deno.test("leads:* reports a query failure honestly instead of an empty pipeline", async () => {
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes({ message: "boom" }, 500) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb("leads:all"));
    assertEquals(res.ok, false);
    // it answered with a DB-error toast, never a "no leads" pipeline
    assertFalse(calls.some((c) => isTg(c) && tgMethod(c, "sendMessage")));
  } finally {
    restore();
  }
});

// ── 3. reply-capture → applyMeetingAct (the shared write path) ────────────────

function teamReply(text: string, markupData: string): TgMessage {
  return {
    message_id: 100,
    chat: { id: Number(TEAM_CHAT) },
    from: { id: 7, first_name: "דנה" } as TgMessage["from"],
    text,
    reply_to_message: {
      message_id: 99,
      reply_markup: { inline_keyboard: [[{ text: "x", callback_data: markupData }]] },
    } as TgMessage,
  } as TgMessage;
}

Deno.test("a reply to the board zoom prompt confirms via applyMeetingAct sendlink", async () => {
  const meetingRow = { id: MID, name: "דנה", phone: "0501234567", email: "", status: "pending", meeting_date: "2026-06-16", slot: "09:00", starts_at: "2026-06-16T06:00:00Z" };
  const { calls, restore } = installRoutes([
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes([meetingRow]) },
    { match: (c) => isMeetingsRest(c) && c.method === "PATCH", respond: patchOk },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleTeamMessage(cfg(), teamReply("https://zoom.us/j/123456789", `mtg:${MID}:zoom`));
    assertEquals(res.ok, true);
    assertEquals(res.act, "sendlink");
    const patch = calls.find((c) => isMeetingsRest(c) && c.method === "PATCH");
    assert(patch, "expected a meetings PATCH via applyMeetingAct");
    assertEquals(patch!.body.status, "confirmed");
    assertEquals(patch!.body.join_url, "https://zoom.us/j/123456789");
  } finally {
    restore();
  }
});

Deno.test("a reply with an invalid Zoom link is rejected by the shared validator (no write)", async () => {
  const meetingRow = { id: MID, name: "דנה", phone: "0501234567", status: "pending", meeting_date: "2026-06-16", slot: "09:00", starts_at: "2026-06-16T06:00:00Z" };
  const { calls, restore } = installRoutes([
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes([meetingRow]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleTeamMessage(cfg(), teamReply("https://evil.example.com/x", `mtg:${MID}:zoom`));
    assertEquals(res.ok, false);
    assertFalse(calls.some((c) => isMeetingsRest(c) && c.method === "PATCH"));
  } finally {
    restore();
  }
});

Deno.test("a reply to the board reschedule prompt moves the meeting via applyMeetingAct", async () => {
  const meetingRow = { id: MID, name: "דנה", phone: "0501234567", email: "", status: "confirmed", meeting_date: "2026-06-16", slot: "09:00", starts_at: "2026-06-16T06:00:00Z" };
  // A near-future slot the shared parser accepts: 14:30 is valid only Sun–Thu
  // (no Saturday, Fri ends 12:30), so step forward to the next Sun–Thu ≥ 2 days
  // out (Israel-day; computed in en-CA so it matches the parser's calendar).
  const ilDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
  let cand = new Date(Date.now() + 2 * 86400_000);
  // getUTCDay of the Israel-day's noon instant: 0=Sun … 6=Sat. Skip Fri(5)/Sat(6).
  for (let i = 0; i < 7; i++) {
    const dow = new Date(`${ilDay(cand)}T12:00:00Z`).getUTCDay();
    if (dow <= 4) break; // Sun–Thu only
    cand = new Date(cand.getTime() + 86400_000);
  }
  const ymd = ilDay(cand);
  const { calls, restore } = installRoutes([
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes([meetingRow]) },
    { match: (c) => isMeetingsRest(c) && c.method === "PATCH", respond: patchOk },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleTeamMessage(cfg(), teamReply(`${ymd} 14:30`, `mtg:${MID}:reschedule`));
    assertEquals(res.ok, true);
    assertEquals(res.act, "reschedule");
    const patch = calls.find((c) => isMeetingsRest(c) && c.method === "PATCH");
    assert(patch, "expected a meetings PATCH via applyMeetingAct");
    assertEquals(patch!.body.slot, "14:30");
    assertEquals(patch!.body.meeting_date, ymd);
  } finally {
    restore();
  }
});
