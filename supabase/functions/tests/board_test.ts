// Wave 16 N1 — the native in-chat meetings board + leads pipeline renderers
// (notify-lead/board.ts) and the /meetings + /leads commands that drive them
// (notify-lead/commands.ts). Two halves:
//
//   1. PURE renderers — renderMeetingsBoard / renderLeadsPipeline / renderLeadCard.
//      Assert the text lines (time · name · provider · status), the EXACT
//      callback-data contract (mtg:<id>:zoom|reschedule|confirm|cancel ·
//      board:today|pending|week · leads:new|all), the lead cards reuse the
//      EXISTING lead:<id>:… keyboard, the §7b compliance reminder, empty states,
//      and the optional fail-soft AI summary (present ⇒ shown, "" ⇒ omitted).
//
//   2. /meetings + /leads through handleCommand against a routing fetch stub that
//      models PostgREST (Supabase) + the Telegram Bot API. db.ts reads
//      SUPABASE_URL / SERVICE_ROLE_KEY per call → set env BEFORE importing.
//      No AI key on cfg ⇒ aiMeetingsSummary returns "" (no network) so the board
//      still renders. These stub globalThis.fetch only; no real network/keys.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, Lead } from "../_shared/types.ts";
import type { ConsoleBoard, ConsoleMeeting } from "../notify-lead/console.ts";
import { REP_COMPLIANCE_LINE } from "../_shared/leads.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");

const { renderMeetingsBoard, renderLeadsPipeline, renderLeadCard, pipelineCounts } = await import(
  "../notify-lead/board.ts"
);
const { handleCommand } = await import("../notify-lead/commands.ts");

const realFetch = globalThis.fetch;

// ── fixtures ─────────────────────────────────────────────────────────────────

function meeting(over: Partial<ConsoleMeeting> = {}): ConsoleMeeting {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    name: "דנה כהן",
    phone: "0501234567",
    provider: "פרטנר",
    meetingDate: "2026-06-16",
    slot: "14:30",
    startsAt: "2026-06-16T11:30:00Z",
    status: "pending",
    joinUrl: null,
    ...over,
  };
}

function board(over: Partial<ConsoleBoard> = {}): ConsoleBoard {
  const b: ConsoleBoard = {
    today: [meeting({ id: "a".repeat(8), name: "פגישת-היום", status: "confirmed" })],
    pending: [meeting({ id: "b".repeat(8), name: "ממתין", status: "pending" })],
    week: [meeting({ id: "c".repeat(8), name: "השבוע", status: "confirmed" })],
    stats: { today: 1, pending: 1, week: 1 },
    ...over,
  };
  return b;
}

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "99999999-8888-7777-6666-555555555555",
    name: "אבי לוי",
    phone: "0529876543",
    provider: "סלקום",
    status: "new",
    source: "form",
    created_at: "2026-06-15T08:00:00.000Z",
    ...over,
  };
}

// ── renderMeetingsBoard (pure) ───────────────────────────────────────────────

Deno.test("renderMeetingsBoard lists the today tab: time · name · provider · status", () => {
  const m = renderMeetingsBoard(board());
  assertStringIncludes(m.text, "14:30");          // time
  assertStringIncludes(m.text, "פגישת-היום");      // name
  assertStringIncludes(m.text, "פרטנר");           // provider
  assertStringIncludes(m.text, "מאושרת");          // status chip (confirmed)
});

Deno.test("renderMeetingsBoard emits the EXACT per-meeting action contract", () => {
  const m = renderMeetingsBoard(board());
  const flat = m.reply_markup.inline_keyboard.flat();
  const id = "a".repeat(8); // the today-tab meeting id
  assert(flat.some((b) => b.callback_data === `mtg:${id}:zoom` && b.text.includes("זום")));
  assert(flat.some((b) => b.callback_data === `mtg:${id}:reschedule` && b.text.includes("דחה")));
  assert(flat.some((b) => b.callback_data === `mtg:${id}:confirm` && b.text.includes("אישור")));
  assert(flat.some((b) => b.callback_data === `mtg:${id}:cancel` && b.text.includes("ביטול")));
});

Deno.test("renderMeetingsBoard emits the board:today|pending|week tab-switch row", () => {
  const m = renderMeetingsBoard(board());
  const flat = m.reply_markup.inline_keyboard.flat();
  for (const tab of ["today", "pending", "week"] as const) {
    assert(flat.some((b) => b.callback_data === `board:${tab}`), `missing board:${tab}`);
  }
});

Deno.test("renderMeetingsBoard renders the chosen tab, defaulting to today", () => {
  const def = renderMeetingsBoard(board());
  assertStringIncludes(def.text, "פגישת-היום"); // today by default
  const pend = renderMeetingsBoard(board(), null, "pending");
  assertStringIncludes(pend.text, "ממתין");
  assertFalse(pend.text.includes("פגישת-היום"));
  const wk = renderMeetingsBoard(board(), null, "week");
  assertStringIncludes(wk.text, "השבוע");
});

Deno.test("renderMeetingsBoard shows the optional AI summary, omits it when blank", () => {
  const withSummary = renderMeetingsBoard(board(), "יש פגישה ממתינה דחופה ב-14:30");
  assertStringIncludes(withSummary.text, "יש פגישה ממתינה דחופה");
  assertStringIncludes(withSummary.text, "🤖");
  // fail-soft: "" / null / undefined ⇒ no robot summary line, board still renders
  for (const blank of ["", null, undefined]) {
    const r = renderMeetingsBoard(board(), blank as string | null | undefined);
    assertFalse(r.text.includes("🤖"), `blank=${String(blank)} should omit the summary`);
    assertStringIncludes(r.text, "פגישת-היום"); // still rendered
  }
});

Deno.test("renderMeetingsBoard shows an honest empty state per tab (no action rows)", () => {
  const empty = board({ today: [], pending: [], week: [], stats: { today: 0, pending: 0, week: 0 } });
  const m = renderMeetingsBoard(empty);
  assertStringIncludes(m.text, "אין פגישות היום");
  // only the tab-switch row remains; no mtg:* action rows
  const flat = m.reply_markup.inline_keyboard.flat();
  assertFalse(flat.some((b) => String(b.callback_data ?? "").startsWith("mtg:")));
  assert(flat.some((b) => b.callback_data === "board:today"));
});

Deno.test("renderMeetingsBoard escapes HTML in name/provider", () => {
  const evil = board({ today: [meeting({ id: "a".repeat(8), name: "<b>x</b>", provider: "<i>y</i>" })] });
  const m = renderMeetingsBoard(evil);
  assertFalse(m.text.includes("<b>x</b>"));
  assertStringIncludes(m.text, "&lt;b&gt;x&lt;/b&gt;");
});

// ── renderLeadsPipeline + renderLeadCard (pure) ──────────────────────────────

Deno.test("pipelineCounts buckets new / contacted / won (lost folded out)", () => {
  const counts = pipelineCounts([
    lead({ status: "new" }), lead({ status: "new" }),
    lead({ status: "contacted" }),
    lead({ status: "won" }),
    lead({ status: "lost" }),
  ]);
  assertEquals(counts, { new: 2, contacted: 1, won: 1 });
});

Deno.test("renderLeadsPipeline shows the counts header + leads:new|all switch", () => {
  const m = renderLeadsPipeline({ counts: { new: 3, contacted: 2, won: 5 }, recent: [lead()] });
  assertStringIncludes(m.text, "צינור הלידים");
  assertStringIncludes(m.text, "3"); // new count
  assertStringIncludes(m.text, "2"); // contacted count
  assertStringIncludes(m.text, "5"); // won count
  const flat = m.reply_markup.inline_keyboard.flat();
  assert(flat.some((b) => b.callback_data === "leads:new"));
  assert(flat.some((b) => b.callback_data === "leads:all"));
});

Deno.test("renderLeadsPipeline always carries the §7b/§30A compliance reminder", () => {
  const m = renderLeadsPipeline({ counts: { new: 1, contacted: 0, won: 0 }, recent: [lead()] });
  assertStringIncludes(m.text, REP_COMPLIANCE_LINE);
  assertStringIncludes(m.text, "§7b");
});

Deno.test("renderLeadsPipeline gives an honest empty state with zero recent leads", () => {
  const m = renderLeadsPipeline({ counts: { new: 0, contacted: 0, won: 0 }, recent: [] });
  assertStringIncludes(m.text, "אין לידים פתוחים");
});

Deno.test("renderLeadCard reuses the EXISTING lead:<id>:… keyboard contract", () => {
  const l = lead();
  const card = renderLeadCard(l);
  assertStringIncludes(card.text, "אבי לוי");
  assertStringIncludes(card.text, "0529876543");
  const flat = card.reply_markup.inline_keyboard.flat();
  // the live lead-card actions (claim / contacted / won) keyed by lead id
  assert(flat.some((b) => b.callback_data === `lead:${l.id}:claim`));
  assert(flat.some((b) => b.callback_data === `lead:${l.id}:contacted`));
  assert(flat.some((b) => b.callback_data === `lead:${l.id}:won`));
});

Deno.test("renderLeadCard freezes a closed (won) lead — no re-fire of the won flow", () => {
  const card = renderLeadCard(lead({ status: "won", claimed_by: "מאיה" }));
  const flat = card.reply_markup.inline_keyboard.flat();
  assertFalse(flat.some((b) => b.callback_data?.endsWith(":contacted")));
  assert(flat.some((b) => b.callback_data?.endsWith(":undo")));
});

// ── /meetings + /leads through handleCommand (routing fetch stub) ─────────────

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
const isMeetingsRest = (c: Capture) => c.url.includes("/rest/v1/meetings");
const isLeadsRest = (c: Capture) => c.url.includes("/rest/v1/leads");

// cfg with NO ai key → aiMeetingsSummary short-circuits to "" (no AI network).
function cfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "BOT:token", tgChat: "-1001",
    resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "",
    webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "",
    allowedUserIds: [], src: {},
    ...over,
  };
}

// Telegram sendMessage bodies the command emitted, in order.
function tgSends(calls: Capture[]): Array<{ text: string; markup: Record<string, unknown> | undefined }> {
  return calls.filter(isTg).map((c) => ({
    text: String(c.body.text ?? ""),
    markup: c.body.reply_markup as Record<string, unknown> | undefined,
  }));
}
function flatKb(markup: Record<string, unknown> | undefined): Array<{ text?: string; callback_data?: string }> {
  const ik = (markup as { inline_keyboard?: Array<Array<{ text?: string; callback_data?: string }>> })?.inline_keyboard ?? [];
  return ik.flat();
}

Deno.test("/meetings sends ONE board message via buildBoard→renderMeetingsBoard (mtg:/board: contract)", async () => {
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const rows = [{
    id, name: "ליאת", provider: "HOT", status: "pending",
    meeting_date: todayYmd, slot: "16:00",
    starts_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
  }];
  const { calls, restore } = installRoutes([
    { match: isMeetingsRest, respond: () => jsonRes(rows) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/meetings", "");
    assertEquals(res, { ok: true, command: "/meetings", failures: 0 });
    const sends = tgSends(calls);
    assertEquals(sends.length, 1); // a single board message, not a card per meeting
    assertStringIncludes(sends[0].text, "ליאת");
    assertStringIncludes(sends[0].text, "16:00");
    const flat = flatKb(sends[0].markup);
    assert(flat.some((b) => b.callback_data === `mtg:${id}:confirm`));
    assert(flat.some((b) => b.callback_data === `mtg:${id}:cancel`));
    assert(flat.some((b) => b.callback_data === "board:pending"));
  } finally {
    restore();
  }
});

Deno.test("/meetings with no open meetings still sends the honest empty board", async () => {
  const { calls, restore } = installRoutes([
    { match: isMeetingsRest, respond: () => jsonRes([]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/meetings", "");
    assertEquals(res, { ok: true, command: "/meetings", failures: 0 });
    const sends = tgSends(calls);
    assertEquals(sends.length, 1);
    assertStringIncludes(sends[0].text, "אין פגישות היום");
    // no AI summary (no key) and no fabricated content
    assertFalse(sends[0].text.includes("🤖"));
  } finally {
    restore();
  }
});

Deno.test("/meetings does NOT call any AI endpoint when no key is configured", async () => {
  const { calls, restore } = installRoutes([
    { match: isMeetingsRest, respond: () => jsonRes([{ id: "x", name: "א", status: "pending", meeting_date: "2026-06-16", slot: "09:00", starts_at: "2026-06-16T06:00:00Z" }]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    await handleCommand(cfg(), "/meetings", "");
    assertFalse(calls.some((c) => c.url.includes("openai.com") || c.url.includes("anthropic.com")));
  } finally {
    restore();
  }
});

// A single pending meeting on Israel-today, so it lands in the default board
// tab (today) AND counts toward stats.pending (the soonest-pending the summary
// prompt is grounded in).
function todayPendingRow(name = "נועה") {
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  return [{
    id: "x", name, status: "pending", provider: "HOT",
    meeting_date: todayYmd, slot: "09:00",
    starts_at: new Date(Date.now() + 3600_000).toISOString(),
  }];
}

Deno.test("/meetings folds in the fail-soft AI summary, grounded in the REAL board", async () => {
  let aiPrompt = "";
  const { calls, restore } = installRoutes([
    { match: isMeetingsRest, respond: () => jsonRes(todayPendingRow()) },
    {
      match: (c) => c.url.includes("openai.com"),
      respond: (c) => {
        aiPrompt = JSON.stringify(c.body);
        return jsonRes({ choices: [{ message: { content: "מומלץ לאשר קודם את נועה ב-09:00" } }] });
      },
    },
    { match: isTg, respond: tgOk },
  ]);
  try {
    await handleCommand(cfg({ openai: "sk-stub" }), "/meetings", "");
    const sends = tgSends(calls);
    assertEquals(sends.length, 1);
    assertStringIncludes(sends[0].text, "🤖");
    assertStringIncludes(sends[0].text, "מומלץ לאשר קודם את נועה");
    // grounded: the prompt carries the REAL count + the soonest pending name
    assertStringIncludes(aiPrompt, "נועה");
    assertStringIncludes(aiPrompt, "ממתינות לאישור: 1");
  } finally {
    restore();
  }
});

Deno.test("/meetings still renders the board when the AI summary call fails (fail-soft)", async () => {
  const { calls, restore } = installRoutes([
    { match: isMeetingsRest, respond: () => jsonRes(todayPendingRow()) },
    { match: (c) => c.url.includes("openai.com"), respond: () => jsonRes({ error: "down" }, 500) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg({ openai: "sk-stub" }), "/meetings", "");
    assertEquals(res, { ok: true, command: "/meetings", failures: 0 });
    const sends = tgSends(calls);
    assertEquals(sends.length, 1);
    assertStringIncludes(sends[0].text, "נועה"); // board rendered
    assertFalse(sends[0].text.includes("🤖")); // summary omitted, not faked
  } finally {
    restore();
  }
});

Deno.test("/leads sends the pipeline header (leads:* + §7b) then one card per recent lead", async () => {
  const leads = [
    { id: "11111111-1111-1111-1111-111111111111", name: "ליד-חדש", phone: "0501111111", status: "new", source: "form", created_at: "2026-06-15T10:00:00Z" },
    { id: "22222222-2222-2222-2222-222222222222", name: "ליד-בטיפול", phone: "0502222222", status: "contacted", source: "plan", created_at: "2026-06-15T09:00:00Z" },
  ];
  const { calls, restore } = installRoutes([
    { match: isLeadsRest, respond: () => jsonRes(leads) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/leads", "");
    assertEquals(res, { ok: true, command: "/leads", failures: 0 });
    const sends = tgSends(calls);
    assertEquals(sends.length, 3); // 1 header + 2 lead cards
    // header: pipeline + leads:* switch + §7b reminder
    assertStringIncludes(sends[0].text, "צינור הלידים");
    assertStringIncludes(sends[0].text, "§7b");
    const headKb = flatKb(sends[0].markup);
    assert(headKb.some((b) => b.callback_data === "leads:new"));
    assert(headKb.some((b) => b.callback_data === "leads:all"));
    // cards: oldest-first so the newest lands closest to the input box
    assertStringIncludes(sends[1].text, "ליד-בטיפול");
    assertStringIncludes(sends[2].text, "ליד-חדש");
    assert(flatKb(sends[2].markup).some((b) => b.callback_data === "lead:11111111-1111-1111-1111-111111111111:claim"));
  } finally {
    restore();
  }
});

Deno.test("/leads with an empty funnel sends only the honest pipeline header (no cards)", async () => {
  const { calls, restore } = installRoutes([
    { match: isLeadsRest, respond: () => jsonRes([]) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/leads", "");
    assertEquals(res, { ok: true, command: "/leads" });
    const sends = tgSends(calls);
    assertEquals(sends.length, 1);
    assertStringIncludes(sends[0].text, "אין לידים פתוחים");
  } finally {
    restore();
  }
});

Deno.test("/leads reports a query failure honestly instead of 'no leads'", async () => {
  const { calls, restore } = installRoutes([
    { match: isLeadsRest, respond: () => jsonRes({ message: "boom" }, 500) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCommand(cfg(), "/leads", "");
    assertEquals(res.ok, false);
    assertEquals(res.command, "/leads");
    const sends = tgSends(calls);
    assertEquals(sends.length, 1);
    assertStringIncludes(sends[0].text, "השאילתה נכשלה");
  } finally {
    restore();
  }
});
