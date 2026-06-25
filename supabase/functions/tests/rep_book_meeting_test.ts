// Cell B2 — the rep "book a meeting from Telegram" flow (cockpit parity with the
// customer wizard). Three halves:
//
//   1. PURE slot generation + free/busy overlay (commands.ts + google_calendar.ts):
//      generateBookSlots NEVER offers Saturday or a past slot and only emits slots
//      the SHARED parseReschedule accepts; applyBusyToSlots / slotIsBusy grey out
//      windows a calendar event overlaps, and a NULL free/busy (dark/unavailable)
//      leaves every slot offerable (fail-soft).
//
//   2. getFreeBusy is fail-soft: returns null when Calendar isn't configured (so
//      the caller offers all slots) and never throws.
//
//   3. handleCallback routing for book:<day>:<slot> against a fetch stub modelling
//      PostgREST (meetings INSERT → guard lands pending → fetch id → PATCH
//      confirmed) + Google Calendar (event create) + the Telegram Bot API. Asserts:
//      a booking inserts then CONFIRMS the row (the guard-respecting two-step) and
//      creates a real calendar event WHEN Google is configured; the same flow works
//      fail-soft when Google is DARK (no event call, booking still confirmed); and
//      the allowlist + team-chat AUTH gate is enforced (a refused press writes
//      nothing).
//
// db.ts reads SUPABASE_URL / SERVICE_ROLE_KEY per call → set env BEFORE importing.
// These stub globalThis.fetch only; no real network/keys.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, TgCallbackQuery, TgMessage } from "../_shared/types.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-stub");

const { handleCallback } = await import("../notify-lead/callbacks.ts");
const {
  generateBookSlots,
  applyBusyToSlots,
  bookSlotsKeyboard,
  buildBookPicker,
  applyBookSlot,
} = await import("../notify-lead/commands.ts");
const { getFreeBusy, slotIsBusy } = await import("../_shared/google_calendar.ts");

const realFetch = globalThis.fetch;
const TEAM_CHAT = "-1009999";
const NEW_MID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"; // the just-booked row id

// ── fixtures ─────────────────────────────────────────────────────────────────

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

// A REAL RSA private key so the PRODUCTION signJwt (crypto.subtle pkcs8 import +
// RS256 sign) actually succeeds and the stubbed OAuth-token route is reached — a
// fake "stub" key fails importKey, so getCalendarToken would return null and the
// calendar calls would never fire. Generated once at module load (deno test has
// real crypto). PKCS8 → base64 → PEM, exactly the envelope a Google SA key uses.
const _kp = (await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
)) as CryptoKeyPair;
const _pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", _kp.privateKey));
const _b64 = btoa(Array.from(_pkcs8, (b) => String.fromCharCode(b)).join(""));
const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----\n${_b64.replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;

function cfgWithGoogle(over: Partial<Cfg> = {}): Cfg {
  return cfg({
    googleServiceAccount: JSON.stringify({ client_email: "svc@x.iam", private_key: TEST_PRIVATE_KEY_PEM }),
    googleCalendarId: "primary",
    ...over,
  });
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

// Israel calendar day for an instant.
const ilDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
// getUTCDay of the Israel-day noon instant: 0=Sun … 6=Sat.
const ilDow = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay();

// Pick a near-future Sun–Thu Israel day (≥2 days out) the parser accepts, with a
// 14:00 weekday slot — deterministic input for the booking-callback tests.
function nextWeekdaySlot(): { day: string; slot: string } {
  let cand = new Date(Date.now() + 2 * 86_400_000);
  for (let i = 0; i < 7; i++) {
    if (ilDow(ilDay(cand)) <= 4) break; // Sun(0)–Thu(4)
    cand = new Date(cand.getTime() + 86_400_000);
  }
  return { day: ilDay(cand), slot: "14:00" };
}

// ── routing fetch stub (mirrors board_callbacks_test) ─────────────────────────

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
const isGcalToken = (c: Capture) => c.url.includes("oauth2.googleapis.com/token");
const isGcalEvents = (c: Capture) => c.url.includes("googleapis.com/calendar/v3/calendars");
const isFreeBusy = (c: Capture) => c.url.includes("googleapis.com/calendar/v3/freeBusy");
// patchCount counts the returned representation array (≥1 row = changed).
const patchOk = () => jsonRes([{ id: NEW_MID }]);

// The DB routes for a full booking: INSERT (guard) → SELECT the new row id →
// PATCH pending→confirmed. select=id... distinguishes the lookup from the patch.
function bookingDbRoutes(): Route[] {
  return [
    { match: (c) => isMeetingsRest(c) && c.method === "POST", respond: () => jsonRes({}, 201) },
    { match: (c) => isMeetingsRest(c) && c.method === "GET", respond: () => jsonRes([{ id: NEW_MID, starts_at: "2026-06-18T11:00:00Z" }]) },
    { match: (c) => isMeetingsRest(c) && c.method === "PATCH", respond: patchOk },
  ];
}

// ── 1. PURE slot generation ───────────────────────────────────────────────────

Deno.test("generateBookSlots never offers a Saturday and never a past slot", () => {
  // Run from a fixed 'now' (a Wednesday noon UTC) for determinism.
  const now = Date.parse("2026-06-17T09:00:00Z");
  const slots = generateBookSlots(now, 12);
  assert(slots.length > 0, "expected some slots");
  for (const s of slots) {
    // never Saturday (isodow 6 = getUTCDay 6)
    assertFalse(ilDow(s.day) === 6, `slot on Saturday: ${s.day}`);
    // every startsAt is in the future
    assert(Date.parse(s.startsAt) > now, `past slot: ${s.startsAt}`);
    // every slot survived the shared parser → valid HH:MM on the grid
    assert(/^\d{2}:(00|30)$/.test(s.slot), `off-grid slot: ${s.slot}`);
  }
});

Deno.test("generateBookSlots starts no earlier than tomorrow (parseReschedule's floor)", () => {
  const now = Date.parse("2026-06-17T09:00:00Z");
  const today = ilDay(new Date(now));
  const slots = generateBookSlots(now, 6);
  for (const s of slots) {
    assert(s.day > today, `slot is today or earlier: ${s.day} (today ${today})`);
  }
});

Deno.test("applyBusyToSlots greys a slot a calendar event overlaps; null busy offers all", () => {
  const now = Date.parse("2026-06-17T09:00:00Z");
  const base = generateBookSlots(now, 6);
  assert(base.length >= 1);
  // Mark the FIRST slot's exact window busy.
  const busy = [{ start: base[0].startsAt, end: new Date(Date.parse(base[0].startsAt) + 30 * 60_000).toISOString() }];
  const withBusy = applyBusyToSlots(base, busy);
  assertEquals(withBusy[0].busy, true);
  assert(withBusy.slice(1).every((s) => s.busy === false), "only the overlapping slot is busy");
  // null free/busy (dark / unavailable) → nothing marked busy (fail-soft).
  const dark = applyBusyToSlots(base, null);
  assert(dark.every((s) => s.busy === false), "null busy must offer every slot");
});

Deno.test("slotIsBusy is a pure half-open overlap test", () => {
  const start = "2026-06-18T11:00:00Z"; // 30-min window → ...11:30
  // adjacent-but-not-overlapping (ends exactly at start) is NOT busy
  assertFalse(slotIsBusy(start, 30, [{ start: "2026-06-18T10:30:00Z", end: "2026-06-18T11:00:00Z" }]));
  // partial overlap IS busy
  assert(slotIsBusy(start, 30, [{ start: "2026-06-18T11:15:00Z", end: "2026-06-18T12:00:00Z" }]));
  // empty list never busy
  assertFalse(slotIsBusy(start, 30, []));
});

Deno.test("bookSlotsKeyboard gives free slots a book:<day>:<slot> tap and busy ones a noop", () => {
  const slots = [
    { day: "2026-06-18", slot: "14:00", startsAt: "2026-06-18T11:00:00Z", busy: false },
    { day: "2026-06-18", slot: "16:00", startsAt: "2026-06-18T13:00:00Z", busy: true },
  ];
  const kb = bookSlotsKeyboard(slots).inline_keyboard;
  assertEquals(kb[0][0].callback_data, "book:2026-06-18:14:00");
  assertEquals(kb[1][0].callback_data, "book:busy:noop"); // greyed → not bookable
  assertStringIncludes(kb[1][0].text, "תפוס");
});

// ── 2. getFreeBusy fail-soft ──────────────────────────────────────────────────

Deno.test("getFreeBusy returns null (fail-soft) when Calendar is not configured", async () => {
  // No fetch should even be attempted when gcal is dark.
  const { calls, restore } = installRoutes([]);
  try {
    const res = await getFreeBusy(cfg(), "2026-06-18T11:00:00Z", "2026-06-18T20:00:00Z");
    assertEquals(res, null);
    assertEquals(calls.length, 0, "no network call when Calendar is unconfigured");
  } finally {
    restore();
  }
});

Deno.test("getFreeBusy parses busy windows when Calendar answers", async () => {
  const { restore } = installRoutes([
    { match: isGcalToken, respond: () => jsonRes({ access_token: "tok", expires_in: 3600 }) },
    {
      match: isFreeBusy,
      respond: () => jsonRes({ calendars: { primary: { busy: [{ start: "2026-06-18T11:00:00Z", end: "2026-06-18T11:30:00Z" }] } } }),
    },
  ]);
  try {
    const res = await getFreeBusy(cfgWithGoogle(), "2026-06-18T10:00:00Z", "2026-06-18T20:00:00Z");
    assert(res, "expected a busy list");
    assertEquals(res!.length, 1);
    assertEquals(res![0].start, "2026-06-18T11:00:00Z");
  } finally {
    restore();
  }
});

// ── 3. booking callback: insert → confirm (+ calendar) ────────────────────────

Deno.test("book:<day>:<slot> inserts then CONFIRMS the meeting + creates a calendar event (Google on)", async () => {
  const { day, slot } = nextWeekdaySlot();
  const { calls, restore } = installRoutes([
    ...bookingDbRoutes(),
    { match: isGcalToken, respond: () => jsonRes({ access_token: "tok", expires_in: 3600 }) },
    { match: isGcalEvents, respond: () => jsonRes({ id: "gcal-evt-123" }) },
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfgWithGoogle(), cb(`book:${day}:${slot}`));
    assertEquals(res.ok, true);

    // it inserted a PENDING row through the guard (status NOT forged to confirmed)
    const insert = calls.find((c) => isMeetingsRest(c) && c.method === "POST");
    assert(insert, "expected a meetings INSERT");
    assertEquals(insert!.body.meeting_date, day);
    assertEquals(insert!.body.slot, slot);
    assertEquals(insert!.body.source, "rep_book");
    assertEquals(insert!.body.status, undefined); // the guard owns status, we don't set it
    assert(/^[+0-9][0-9\-\s]{7,14}$/.test(String(insert!.body.phone)), "phone must satisfy the guard regex");

    // a REAL calendar event was created
    assert(calls.some((c) => isGcalEvents(c) && c.method === "POST"), "expected a calendar event create");

    // then PATCHed pending→confirmed (the guard-safe transition) with the event id
    const patch = calls.find((c) => isMeetingsRest(c) && c.method === "PATCH");
    assert(patch, "expected a confirm PATCH");
    assertStringIncludes(patch!.url, "status=eq.pending"); // atomic on the pending state
    assertEquals(patch!.body.status, "confirmed");
    assertEquals(patch!.body.gcal_event_id, "gcal-evt-123");

    // and confirmed in chat
    assert(calls.some((c) => isTg(c) && tgMethod(c, "sendMessage")), "expected an in-chat confirmation");
  } finally {
    restore();
  }
});

Deno.test("book:<day>:<slot> still confirms when Google is DARK (fail-soft, no event call)", async () => {
  const { day, slot } = nextWeekdaySlot();
  const { calls, restore } = installRoutes([
    ...bookingDbRoutes(),
    { match: isTg, respond: tgOk },
  ]);
  try {
    const res = await handleCallback(cfg(), cb(`book:${day}:${slot}`)); // no Google keys
    assertEquals(res.ok, true);
    // NO calendar token/event calls when Calendar is unconfigured
    assertFalse(calls.some((c) => isGcalToken(c) || isGcalEvents(c) || isFreeBusy(c)), "no Google calls when dark");
    // booking still completed: insert + confirm PATCH landed
    assert(calls.some((c) => isMeetingsRest(c) && c.method === "POST"), "expected INSERT");
    const patch = calls.find((c) => isMeetingsRest(c) && c.method === "PATCH");
    assert(patch, "expected confirm PATCH even when Google is dark");
    assertEquals(patch!.body.status, "confirmed");
    assertEquals(patch!.body.gcal_event_id, undefined); // nothing to stash when dark
    // the in-chat confirmation flags that the calendar wasn't synced
    const confirm = calls.find((c) => isTg(c) && tgMethod(c, "sendMessage") && String(c.body.text).includes("פגישה נקבעה"));
    assert(confirm, "expected the booking confirmation message");
    assertStringIncludes(String(confirm!.body.text), "סנכרון יומן Google לא בוצע");
  } finally {
    restore();
  }
});

Deno.test("a busy slot tap (book:busy:noop) books nothing — just toasts", async () => {
  const { calls, restore } = installRoutes([{ match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb("book:busy:noop"));
    assertEquals(res.ok, true);
    assertEquals(res.skipped, "busy slot");
    assertFalse(calls.some((c) => c.url.includes("/rest/v1/")), "a busy noop must not write");
  } finally {
    restore();
  }
});

// ── 4. AUTH preserved ─────────────────────────────────────────────────────────

Deno.test("a non-allowed user cannot book (allowlist enforced, nothing written)", async () => {
  const { day, slot } = nextWeekdaySlot();
  const { calls, restore } = installRoutes([...bookingDbRoutes(), { match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb(`book:${day}:${slot}`, { from: { id: 999, first_name: "זר" } as TgCallbackQuery["from"] }));
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "user not allowed");
    assertFalse(calls.some((c) => c.url.includes("/rest/v1/")), "no DB write for a refused user");
  } finally {
    restore();
  }
});

Deno.test("a press from a chat other than the team chat is refused (no booking)", async () => {
  const { day, slot } = nextWeekdaySlot();
  const { calls, restore } = installRoutes([...bookingDbRoutes(), { match: isTg, respond: tgOk }]);
  try {
    const wrongChat = cb(`book:${day}:${slot}`, { message: { message_id: 1, chat: { id: 42424242 } } as TgMessage });
    const res = await handleCallback(cfg(), wrongChat);
    assertEquals(res.ok, false);
    assertEquals(res.skipped, "wrong chat");
    assertFalse(calls.some((c) => c.url.includes("/rest/v1/")), "no DB write from the wrong chat");
  } finally {
    restore();
  }
});

Deno.test("a stale book: slot in the past is rejected by the shared parser (no write)", async () => {
  // A day far in the past → parseReschedule rejects (< tomorrow) → no DB write.
  const { calls, restore } = installRoutes([...bookingDbRoutes(), { match: isTg, respond: tgOk }]);
  try {
    const res = await handleCallback(cfg(), cb("book:2020-01-06:14:00"));
    assertEquals(res.ok, false);
    assertFalse(calls.some((c) => isMeetingsRest(c) && c.method === "POST"), "a past slot must never insert");
  } finally {
    restore();
  }
});

// ── 5. /book picker fail-soft when Google is dark ─────────────────────────────

Deno.test("buildBookPicker offers all slots and notes the dark calendar when Google is off", async () => {
  const { calls, restore } = installRoutes([]); // no Google routes needed (dark)
  try {
    const picker = await buildBookPicker(cfg(), Date.parse("2026-06-17T09:00:00Z"));
    assert(picker.slots.length > 0, "expected offered slots");
    assert(picker.slots.every((s) => s.busy === false), "dark calendar → every slot offered");
    assertStringIncludes(picker.text, "לא מחובר"); // honest dark-calendar note
    // no free/busy network attempt when Calendar is unconfigured
    assertFalse(calls.some((c) => isFreeBusy(c)), "no free/busy call when dark");
  } finally {
    restore();
  }
});

// ── applyBookSlot direct: invalid slot is a soft refusal, never a throw ────────

Deno.test("applyBookSlot rejects a Saturday slot without touching the DB", async () => {
  // Find a near-future Saturday Israel day.
  let cand = new Date(Date.now() + 2 * 86_400_000);
  for (let i = 0; i < 7; i++) {
    if (ilDow(ilDay(cand)) === 6) break;
    cand = new Date(cand.getTime() + 86_400_000);
  }
  const sat = ilDay(cand);
  const { calls, restore } = installRoutes([...bookingDbRoutes()]);
  try {
    const res = await applyBookSlot(cfg(), sat, "14:00", "דנה");
    assertEquals(res.ok, false);
    assertStringIncludes(String(res.error), "שבת");
    assertFalse(calls.some((c) => isMeetingsRest(c) && c.method === "POST"), "no insert for a Saturday slot");
  } finally {
    restore();
  }
});
