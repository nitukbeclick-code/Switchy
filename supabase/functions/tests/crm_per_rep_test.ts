// Cell B4 — per-rep CRM ownership + lost-reason disposition. Covers two surfaces
// in notify-lead/ (commands.ts + callbacks.ts):
//
//   1. /myleads — the rep's OWN open leads, filtered by the claimed_by_tg_id the
//      claim flow already stamps. Asserts: the PostgREST query is scoped to the
//      pressing rep's tg id (no leak of the whole funnel); the shared pipeline
//      renderer (header + one card per lead) is reused; an unknown rep id and an
//      empty result are both handled honestly; a query failure is reported, never
//      shown as "no leads".
//
//   2. lead:<id>:lost → grounded reason picker → lostreason:<id>:<key> persist.
//      Asserts: a lost tap raises the reason keyboard (no status write yet); a
//      reason tap flips status=lost AND appends a "סיבת סגירה: <reason>" note via
//      the EXISTING notes PATCH path; the AUTH gate (allowlist + team chat) is
//      enforced on the picker callbacks; an already-closed lead is not re-closed;
//      cancel writes nothing; a DB miss is fail-soft.
//
// db.ts reads SUPABASE_URL / SERVICE_ROLE_KEY per call → set env BEFORE importing.
// Stubs globalThis.fetch only; no real network/keys.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, TgCallbackQuery, TgMessage } from "../_shared/types.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");

const { handleCommand } = await import("../notify-lead/commands.ts");
const { handleCallback } = await import("../notify-lead/callbacks.ts");

const realFetch = globalThis.fetch;
const LID = "11111111-2222-3333-4444-555555555555"; // a 36-char lead id
const TEAM_CHAT = "-1009999";
const REP_ID = 7;

// ── fixtures ─────────────────────────────────────────────────────────────────

function cfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "BOT:token", tgChat: TEAM_CHAT,
    resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "",
    webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "", googleSpreadsheetId: "",
    allowedUserIds: [REP_ID], src: {},
    ...over,
  };
}

function cb(data: string, over: Partial<TgCallbackQuery> = {}): TgCallbackQuery {
  return {
    id: "cbid",
    from: { id: REP_ID, first_name: "דנה" } as TgCallbackQuery["from"],
    data,
    message: { message_id: 42, chat: { id: Number(TEAM_CHAT) } } as TgMessage,
    ...over,
  };
}

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
const isLeadsRest = (c: Capture) => c.url.includes("/rest/v1/leads");
const isLeadEvents = (c: Capture) => c.url.includes("/rest/v1/lead_events");
// patchCount uses Prefer: return=representation and counts the returned row array.
function patchOk(): Response {
  return jsonRes([{ id: LID }]);
}

// ── 1. /myleads ───────────────────────────────────────────────────────────────

Deno.test("/myleads scopes the query to the pressing rep's claimed_by_tg_id", async () => {
  const mine = [
    { id: LID, name: "שלי-לקוח", phone: "0501111111", status: "contacted", source: "form", claimed_by: "דנה", claimed_by_tg_id: REP_ID, created_at: "2026-06-15T10:00:00Z" },
  ];
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes(mine) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/myleads", "", REP_ID);
    assertEquals(res.ok, true);
    assertEquals(res.command, "/myleads");
    // the leads query MUST filter on this rep's tg id — never the open funnel
    const get = calls.find((c) => isLeadsRest(c) && c.method === "GET");
    assert(get, "expected a leads GET");
    assertStringIncludes(get!.url, `claimed_by_tg_id=eq.${REP_ID}`);
    // header + the one owned card were sent
    const sends = calls.filter((c) => isTg(c) && tgMethod(c, "sendMessage"));
    assertEquals(sends.length, 2);
    assertStringIncludes(String(sends[0].body.text), "הלידים שלי");
    assert(sends.some((s) => String(s.body.text).includes("שלי-לקוח")));
  } finally {
    restore();
  }
});

Deno.test("/myleads with no rep id refuses honestly instead of leaking the funnel", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const res = await handleCommand(cfg(), "/myleads", "" /* no fromId */);
    assertEquals(res.ok, true);
    // it never queried leads (can't honestly scope "mine" without an id)
    assertFalse(calls.some((c) => isLeadsRest(c)));
    const send = calls.find((c) => isTg(c) && tgMethod(c, "sendMessage"));
    assertStringIncludes(String(send!.body.text), "לא זוהה נציג");
  } finally {
    restore();
  }
});

Deno.test("/myleads shows an honest empty state when the rep owns nothing", async () => {
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes([]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/myleads", "", REP_ID);
    assertEquals(res.ok, true);
    const sends = calls.filter((c) => isTg(c) && tgMethod(c, "sendMessage"));
    assertEquals(sends.length, 1); // only the empty-state message, no cards
    assertStringIncludes(String(sends[0].body.text), "אין כרגע לידים פתוחים בטיפול");
  } finally {
    restore();
  }
});

Deno.test("/myleads reports a query failure honestly (not 'no leads')", async () => {
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes({ message: "boom" }, 500) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/myleads", "", REP_ID);
    assertEquals(res.ok, false);
    const send = calls.find((c) => isTg(c) && tgMethod(c, "sendMessage"));
    assertStringIncludes(String(send!.body.text), "השאילתה נכשלה");
  } finally {
    restore();
  }
});

// ── 2. lost-reason picker ──────────────────────────────────────────────────────

Deno.test("lead:<id>:lost raises the grounded reason picker (no status write yet)", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb(`lead:${LID}:lost`));
    assertEquals(res.ok, true);
    assertEquals(res.prompt, "lost reason");
    // it swapped the keyboard to the reason buttons — NOT a status PATCH
    assertFalse(calls.some((c) => isLeadsRest(c) && c.method === "PATCH"));
    const edit = calls.find((c) => isTg(c) && tgMethod(c, "editMessageReplyMarkup"));
    assert(edit, "expected an editMessageReplyMarkup with the reason keyboard");
    const kb = (edit!.body.reply_markup as { inline_keyboard?: Array<Array<{ callback_data?: string }>> })?.inline_keyboard ?? [];
    const datas = kb.flat().map((b) => String(b.callback_data));
    // grounded reasons present, all in the lostreason:<id>:<key> namespace
    assert(datas.includes(`lostreason:${LID}:price`));
    assert(datas.includes(`lostreason:${LID}:switched`));
    assert(datas.includes(`lostreason:${LID}:noanswer`));
    assert(datas.includes(`lostreason:${LID}:irrelevant`));
    assert(datas.includes(`lostreason:${LID}:other`));
    assert(datas.includes(`lostreason:${LID}:cancel`));
  } finally {
    restore();
  }
});

Deno.test("lostreason:<id>:price persists status=lost + the reason note via the existing PATCH path", async () => {
  const before = { id: LID, name: "לקוח", phone: "0501234567", status: "contacted", source: "form", notes: "התעניין במסלול", created_at: "2026-06-15T10:00:00Z" };
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes([before]) },
    { match: (c) => isLeadsRest(c) && c.method === "PATCH", respond: patchOk },
    { match: isLeadEvents, respond: () => jsonRes([{ id: "ev" }]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`lostreason:${LID}:price`));
    assertEquals(res.ok, true);
    assertEquals(res.status, "lost");
    assertEquals(res.reason, "price");
    // the SINGLE status PATCH carries status=lost AND the appended reason note
    const patch = calls.find((c) => isLeadsRest(c) && c.method === "PATCH");
    assert(patch, "expected a leads PATCH");
    assertEquals(patch!.body.status, "lost");
    assertStringIncludes(String(patch!.body.notes), "סיבת סגירה: מחיר גבוה");
    // prior notes preserved, not clobbered
    assertStringIncludes(String(patch!.body.notes), "התעניין במסלול");
    // it logged a status_change audit row to lost
    const ev = calls.find((c) => isLeadEvents(c) && String(c.body.new_status) === "lost");
    assert(ev, "expected a lead_events status_change to lost");
    // the card was frozen (a lost stamp keyboard), and the rep got a confirmation toast
    assert(calls.some((c) => isTg(c) && tgMethod(c, "editMessageReplyMarkup")));
    const toast = calls.find((c) => isTg(c) && tgMethod(c, "answerCallbackQuery") && String(c.body.text ?? "").includes("מחיר גבוה"));
    assert(toast, "expected a confirmation toast naming the reason");
  } finally {
    restore();
  }
});

Deno.test("lostreason picker enforces the allowlist (a non-allowed user is refused, no write)", async () => {
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes([{ id: LID, status: "new" }]) },
    { match: (c) => isLeadsRest(c) && c.method === "PATCH", respond: patchOk },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`lostreason:${LID}:price`, { from: { id: 999, first_name: "זר" } as TgCallbackQuery["from"] }));
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "user not allowed");
    // never read or wrote the lead
    assertFalse(calls.some((c) => isLeadsRest(c)));
  } finally {
    restore();
  }
});

Deno.test("lostreason picker rejects presses from a chat other than the team chat", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const wrongChat = cb(`lostreason:${LID}:price`, { message: { message_id: 1, chat: { id: 42424242 } } as TgMessage });
    const res = await handleCallback(cfg(), wrongChat);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "wrong chat");
    assertFalse(calls.some((c) => isLeadsRest(c)));
  } finally {
    restore();
  }
});

Deno.test("lostreason:<id>:cancel writes nothing and re-renders the live card", async () => {
  const live = { id: LID, name: "לקוח", phone: "0501234567", status: "contacted" };
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes([live]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`lostreason:${LID}:cancel`));
    assertEquals(res.ok, true);
    assertEquals(res.skipped, "lost reason cancelled");
    // no status PATCH, no audit event
    assertFalse(calls.some((c) => isLeadsRest(c) && c.method === "PATCH"));
    assertFalse(calls.some((c) => isLeadEvents(c)));
    // it re-rendered the live keyboard
    assert(calls.some((c) => isTg(c) && tgMethod(c, "editMessageReplyMarkup")));
  } finally {
    restore();
  }
});

Deno.test("lostreason on an already-closed lead does not re-close it", async () => {
  const won = { id: LID, name: "לקוח", phone: "0501234567", status: "won" };
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes([won]) },
    { match: (c) => isLeadsRest(c) && c.method === "PATCH", respond: patchOk },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`lostreason:${LID}:irrelevant`));
    assertEquals(res.ok, true);
    assertEquals(res.skipped, "lead already closed");
    // it must NOT have patched the won lead to lost
    assertFalse(calls.some((c) => isLeadsRest(c) && c.method === "PATCH"));
  } finally {
    restore();
  }
});

Deno.test("lostreason is fail-soft on a DB read miss (no write, honest toast)", async () => {
  const { calls, restore } = installRoutes([
    { match: (c) => isLeadsRest(c) && c.method === "GET", respond: () => jsonRes({ message: "boom" }, 500) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`lostreason:${LID}:price`));
    assertEquals(res.ok, false);
    assertFalse(calls.some((c) => isLeadsRest(c) && c.method === "PATCH"));
    const toast = calls.find((c) => isTg(c) && tgMethod(c, "answerCallbackQuery"));
    assertStringIncludes(String(toast!.body.text ?? ""), "שגיאת מסד נתונים");
  } finally {
    restore();
  }
});
