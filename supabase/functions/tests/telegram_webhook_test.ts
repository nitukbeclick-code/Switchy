// Unit tests for the telegram-webhook edge function (telegram-webhook/index.ts).
//
// This function authenticates inbound Telegram updates with the
// `x-telegram-bot-api-secret-token` header, which must equal
// tgWebhookToken(lead_webhook_secret) — a SHA-256 hex digest, NOT the raw secret
// (Telegram restricts the secret_token charset, see config.ts). It then guards
// the account-link deep link (`/start user_<uuid>`) against a notification-
// hijack: the payload is attacker-controllable, so the id must match a canonical
// UUID *before* any DB access.
//
// The handler registers via Deno.serve (house style), so we (1) verify the real
// secret-verification primitives the handler uses, imported from
// _shared/config.ts, (2) PIN the exact UUID_RE + /start parse the handler
// applies inline, with the attack vectors it must reject (if the source regex
// ever changes, these pins force a deliberate, visible update), and (3) capture
// the REAL handler with tests/_capture_handler.ts and drive it end-to-end:
// method gate, fail-closed auth, the /start link replies, /help, and the
// rep→WhatsApp relay.
//
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertMatch, assertStringIncludes } from "@std/assert";
import { safeEqual, tgWebhookToken } from "../_shared/config.ts";
import { captureServeHandler, jsonResponse, stubFetch, withFetchStub } from "./_capture_handler.ts";

// ── webhook-secret verification contract ───────────────────────────────────────
// The handler computes `await tgWebhookToken(cfg.webhookSecret)` and compares it
// (constant-time) to the inbound header. These pin that the header an attacker
// must forge is the DIGEST, not the secret, and that a wrong/empty token fails.

Deno.test("telegram-webhook secret token is the SHA-256 digest of the secret, not the secret", async () => {
  const secret = "lead-webhook-secret-xyz";
  const token = await tgWebhookToken(secret);
  assertMatch(token, /^[0-9a-f]{64}$/); // 64-char hex digest
  assert(token !== secret); // never the raw secret on the wire
  // The gate accepts exactly this token…
  assert(await safeEqual(token, await tgWebhookToken(secret)));
});

Deno.test("telegram-webhook gate rejects a wrong or empty secret token (fail-closed)", async () => {
  const expected = await tgWebhookToken("the-real-secret");
  assertFalse(await safeEqual("", expected)); // no header → unauthorized
  assertFalse(await safeEqual("deadbeef", expected)); // arbitrary token
  // The raw secret itself is NOT a valid token (must be digested first).
  assertFalse(await safeEqual("the-real-secret", expected));
});

// ── /start deep-link UUID validation (notification-hijack guard) ────────────────
// Pins the exact validation telegram-webhook/index.ts applies before any DB
// query. parseStart mirrors the handler: `payload.match(/^user_(.+)$/)` then
// `UUID_RE.test(trimmed)`. Keep these two literals in sync with the source.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStart(payload: string): { appUserId: string; valid: boolean } {
  const match = payload.match(/^user_(.+)$/);
  const appUserId = match?.[1]?.trim() ?? "";
  return { appUserId, valid: !!match && UUID_RE.test(appUserId) };
}

Deno.test("parseStart accepts a well-formed `user_<uuid>` deep link", () => {
  const r = parseStart("user_11111111-2222-3333-4444-555555555555");
  assert(r.valid);
  assertEquals(r.appUserId, "11111111-2222-3333-4444-555555555555");
});

Deno.test("parseStart trims surrounding whitespace around the uuid", () => {
  const r = parseStart("user_ 11111111-2222-3333-4444-555555555555 ");
  assert(r.valid);
  assertEquals(r.appUserId, "11111111-2222-3333-4444-555555555555");
});

Deno.test("parseStart is case-insensitive on the hex uuid", () => {
  assert(parseStart("user_AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE").valid);
});

Deno.test("parseStart rejects a SQL-injection payload before any DB access", () => {
  const r = parseStart("user_'; DROP TABLE profiles;--");
  assertFalse(r.valid);
});

Deno.test("parseStart rejects an uuid with a trailing injection suffix", () => {
  // The $ anchor in UUID_RE means a valid prefix + extra chars is still invalid —
  // this is the guard against binding a victim's profile via a crafted id.
  assertFalse(parseStart("user_11111111-2222-3333-4444-555555555555 OR 1=1").valid);
});

Deno.test("parseStart rejects empty / prefix-only / missing-prefix payloads", () => {
  assertFalse(parseStart("").valid);
  assertFalse(parseStart("user_").valid);
  assertFalse(parseStart("user_   ").valid);
  // No `user_` prefix at all (a bare uuid is not a valid /start payload).
  assertFalse(parseStart("11111111-2222-3333-4444-555555555555").valid);
});

Deno.test("parseStart rejects a malformed uuid (wrong segment lengths)", () => {
  assertFalse(parseStart("user_1111-2222-3333-4444-555555555555").valid);
  assertFalse(parseStart("user_11111111222233334444555555555555").valid);
  assertFalse(parseStart("user_zzzzzzzz-2222-3333-4444-555555555555").valid); // non-hex
});

// UUID_RE itself, pinned directly (the handler also calls UUID_RE.test on the id).
Deno.test("UUID_RE matches a canonical uuid and nothing longer or shorter", () => {
  assert(UUID_RE.test("11111111-2222-3333-4444-555555555555"));
  assertFalse(UUID_RE.test("11111111-2222-3333-4444-555555555555-extra"));
  assertFalse(UUID_RE.test(" 11111111-2222-3333-4444-555555555555")); // unanchored leading space
});

// ── Integration rig ─────────────────────────────────────────────────────────────
// fetchRows / serviceFetch require SUPABASE_URL + the service-role key; the bot
// token and WhatsApp token are read at module load, so everything is set BEFORE
// the capture. The secret comes from env (the vault RPC is stubbed to {}, so
// vaultConfig() fails soft and the env secret wins). Rep 777 in team chat
// -100555 is the ONLY authorized relay sender.
const SECRET = "tg-webhook-test-secret";
const SUPA = "https://tg-webhook-test.supabase.co";
Deno.env.set("LEAD_WEBHOOK_SECRET", SECRET);
Deno.env.set("TELEGRAM_BOT_TOKEN", "link-bot-test-token");
Deno.env.set("TELEGRAM_ALLOWED_USER_IDS", "777");
Deno.env.set("TELEGRAM_CHAT_ID", "-100555");
Deno.env.set("SUPABASE_URL", SUPA);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("WHATSAPP_TOKEN", "wa-test-token");

// A default stub so nothing at module load can touch the network; replaced
// per-test by withFetchStub.
const baseStub = stubFetch([{ match: () => true, respond: () => jsonResponse({}) }]);
const handler = await captureServeHandler("../telegram-webhook/index.ts");
baseStub.restore();

const TG_TOKEN = await tgWebhookToken(SECRET);

function tgPost(update: unknown, token: string | null = TG_TOKEN): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers["x-telegram-bot-api-secret-token"] = token;
  return Promise.resolve(handler(
    new Request("https://edge/telegram-webhook", { method: "POST", body: JSON.stringify(update), headers }),
  ));
}

// A minimal Telegram message update. Defaults: an UNauthorized private sender.
function msgUpdate(over: { chatId?: number; fromId?: number; text?: string; replyTo?: number } = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 42,
      from: { id: over.fromId ?? 999, is_bot: false, first_name: "דנה" },
      chat: { id: over.chatId ?? 555, type: "private" },
      date: 0,
      text: over.text ?? "",
      ...(over.replyTo ? { reply_to_message: { message_id: over.replyTo } } : {}),
    },
  };
}

// Telegram sink — records every Bot API call (method + parsed body).
type TgCall = { method: string; body: Record<string, unknown> };
function telegramSink(calls: TgCall[]) {
  return {
    match: (u: string) => u.includes("api.telegram.org"),
    respond: (u: string, init?: RequestInit) => {
      calls.push({ method: u.split("/").pop() ?? "", body: JSON.parse(String(init?.body ?? "{}")) });
      return jsonResponse({ ok: true, result: {} });
    },
  };
}

// WhatsApp Graph sink — records outbound payloads, answers with a wamid.
function graphSink(sent: Array<Record<string, unknown>>) {
  return {
    match: (u: string) => u.includes("graph.facebook.com"),
    respond: (_u: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body ?? "{}")));
      return jsonResponse({ messages: [{ id: "wamid.TEST-1" }] });
    },
  };
}

// PostgREST sink — serves the vault RPC ({}) plus any matchers a test supplies;
// everything else answers []. Records every request for shape assertions.
function restSink(handlers: Array<{ when: (u: string, method: string) => boolean; rows: unknown }> = []) {
  const reqs: Array<{ url: string; method: string; body: string }> = [];
  const route = {
    match: (u: string) => u.startsWith(SUPA + "/rest/v1/"),
    respond: (u: string, init?: RequestInit) => {
      const method = String(init?.method ?? "GET");
      reqs.push({ url: u, method, body: String(init?.body ?? "") });
      if (u.includes("/rest/v1/rpc/get_lead_notify_config")) return jsonResponse({});
      for (const h of handlers) if (h.when(u, method)) return jsonResponse(h.rows);
      return jsonResponse([]);
    },
  };
  return { reqs, route };
}

// ── method + secret gate ────────────────────────────────────────────────────────

Deno.test("telegram-webhook answers non-POST with a plain 200 OK (bot-health probe contract)", async () => {
  await withFetchStub([telegramSink([])], async () => {
    const r = await Promise.resolve(handler(new Request("https://edge/telegram-webhook", { method: "GET" })));
    assertEquals(r.status, 200);
    assertEquals(await r.text(), "OK");
  });
});

Deno.test("telegram-webhook fails CLOSED (401) on a missing/wrong/raw secret token and sends nothing", async () => {
  const tg: TgCall[] = [];
  const rest = restSink();
  await withFetchStub([rest.route, telegramSink(tg)], async () => {
    const missing = await tgPost(msgUpdate({ text: "/help" }), null);
    assertEquals(missing.status, 401);
    assertEquals(await missing.json(), { ok: false, error: "unauthorized" });
    assertEquals((await tgPost(msgUpdate({ text: "/help" }), "deadbeef")).status, 401);
    // The RAW secret is not a valid token — only its SHA-256 digest is.
    assertEquals((await tgPost(msgUpdate({ text: "/help" }), SECRET)).status, 401);
  });
  assertEquals(tg.length, 0);
});

Deno.test("telegram-webhook 200-oks an authenticated non-text update without sending", async () => {
  const tg: TgCall[] = [];
  const rest = restSink();
  await withFetchStub([rest.route, telegramSink(tg)], async () => {
    const r = await tgPost({ update_id: 7 });
    assertEquals(r.status, 200);
    assertEquals(await r.json(), { ok: true });
  });
  assertEquals(tg.length, 0);
});

// ── /start deep link ────────────────────────────────────────────────────────────

const UUID = "11111111-2222-3333-4444-555555555555";

Deno.test("/start with an invalid payload replies the invalid-link line and never touches profiles", async () => {
  const tg: TgCall[] = [];
  const rest = restSink();
  await withFetchStub([rest.route, telegramSink(tg)], async () => {
    const r = await tgPost(msgUpdate({ text: "/start user_'; DROP TABLE profiles;--" }));
    assertEquals(r.status, 200);
  });
  assertEquals(tg.length, 1);
  assertEquals(tg[0].method, "sendMessage");
  assertEquals(tg[0].body.chat_id, 555);
  assertEquals(tg[0].body.text, "קישור לא תקין. אנא השתמשו בקישור מתוך האפליקציה.");
  assertEquals(rest.reqs.filter((q) => q.url.includes("/profiles")).length, 0);
});

Deno.test("/start happy path: conditional PATCH guarded by telegram_chat_id=is.null, then the success reply", async () => {
  const tg: TgCall[] = [];
  const rest = restSink([
    { when: (u) => u.includes("telegram_chat_id=eq.555"), rows: [] }, // per-chat link count
    { when: (u) => u.includes("select=id,telegram_chat_id"), rows: [{ id: UUID, telegram_chat_id: null }] },
    { when: (u, m) => m === "PATCH" && u.includes("telegram_chat_id=is.null"), rows: [{ id: UUID }] },
  ]);
  await withFetchStub([rest.route, telegramSink(tg)], async () => {
    assertEquals((await tgPost(msgUpdate({ text: `/start user_${UUID}` }))).status, 200);
  });
  const patch = rest.reqs.find((q) => q.method === "PATCH");
  assert(patch, "expected a conditional profile PATCH");
  assertStringIncludes(patch!.url, `id=eq.${UUID}`);
  assertStringIncludes(patch!.url, "telegram_chat_id=is.null"); // never overwrites an existing link
  const body = JSON.parse(patch!.body) as Record<string, unknown>;
  assertEquals(body.telegram_chat_id, "555");
  assertEquals(body.telegram_enabled, true);
  assertEquals(tg.length, 1);
  assertEquals(
    tg[0].body.text,
    "<b>✅ מחוברים!</b>\n\nשלום דנה! החשבון קושר לצ׳אט הזה.\nכשנפעיל התראות בטלגרם — אישורי פגישות, תזכורות חידוש ודילים — הן יגיעו לכאן אוטומטית.\nבינתיים העדכונים נשלחים באפליקציה ובמייל; אפשר לנתק בכל רגע בהגדרות האפליקציה.",
  );
});

Deno.test("/start refuses to re-link a profile already bound to ANOTHER chat", async () => {
  const tg: TgCall[] = [];
  const rest = restSink([
    { when: (u) => u.includes("telegram_chat_id=eq.555"), rows: [] },
    { when: (u) => u.includes("select=id,telegram_chat_id"), rows: [{ id: UUID, telegram_chat_id: "888" }] },
  ]);
  await withFetchStub([rest.route, telegramSink(tg)], async () => {
    assertEquals((await tgPost(msgUpdate({ text: `/start user_${UUID}` }))).status, 200);
  });
  assertEquals(rest.reqs.filter((q) => q.method === "PATCH").length, 0); // no overwrite
  assertEquals(tg.length, 1);
  assertEquals(tg[0].body.text, "כבר מקושר — פנו לתמיכה.");
});

// ── /help + unknown command ─────────────────────────────────────────────────────

Deno.test("/help replies the exact help text", async () => {
  const tg: TgCall[] = [];
  const rest = restSink();
  await withFetchStub([rest.route, telegramSink(tg)], async () => {
    assertEquals((await tgPost(msgUpdate({ text: "/help" }))).status, 200);
  });
  assertEquals(tg.length, 1);
  assertEquals(
    tg[0].body.text,
    "<b>עזרה — בוט Switchy AI</b>\n\n<b>פקודות:</b>\n/start - חיבור החשבון\n/help - הצגת הודעה זו\n\nהצ׳אט מקושר לחשבון Switchy שלכם.\nכשנפעיל כאן התראות (אישורי פגישות, תזכורות חידוש, דילים) — הן יגיעו אוטומטית; בינתיים העדכונים באפליקציה ובמייל.",
  );
});

Deno.test("plain text from an unauthorized sender gets the unknown-command hint (no relay)", async () => {
  const tg: TgCall[] = [];
  const wa: Array<Record<string, unknown>> = [];
  const rest = restSink();
  await withFetchStub([rest.route, telegramSink(tg), graphSink(wa)], async () => {
    assertEquals((await tgPost(msgUpdate({ text: "שלום" }))).status, 200); // from.id 999 ∉ allowlist
  });
  assertEquals(wa.length, 0);
  assertEquals(tg.length, 1);
  assertEquals(tg[0].body.text, "פקודה לא מוכרת. הקלידו /help לרשימת הפקודות, או חברו את החשבון עם /start.");
});

// ── rep → WhatsApp relay ────────────────────────────────────────────────────────

Deno.test("rep relay: authorized rep in the team chat forwards to WhatsApp, stores the message, reacts ✅", async () => {
  const tg: TgCall[] = [];
  const wa: Array<Record<string, unknown>> = [];
  const rest = restSink([
    { when: (u) => u.includes("whatsapp_contacts?assigned_tg_id=eq.777"), rows: [{ id: "c1", wa_phone: "972501234567", assigned_tg_id: 777 }] },
    { when: (u, m) => m === "GET" && u.includes("whatsapp_conversations?contact_id=eq.c1"), rows: [{ id: "v1", contact_id: "c1" }] },
  ]);
  await withFetchStub([rest.route, telegramSink(tg), graphSink(wa)], async () => {
    const r = await tgPost(msgUpdate({ fromId: 777, chatId: -100555, text: "בודקים את המסלול החדש" }));
    assertEquals(r.status, 200);
    assertEquals(await r.json(), { ok: true });
  });
  // WhatsApp got exactly the rep's text, to the assigned contact's phone.
  assertEquals(wa.length, 1);
  assertEquals(wa[0].to, "972501234567");
  assertEquals((wa[0].text as Record<string, unknown>).body, "בודקים את המסלול החדש");
  // The outbound message is stored with the whatsapp-webhook contract.
  const ins = rest.reqs.find((q) => q.method === "POST" && q.url.includes("/whatsapp_messages"));
  assert(ins, "expected an outbound whatsapp_messages insert");
  const row = JSON.parse(ins!.body) as Record<string, unknown>;
  assertEquals(row.direction, "out");
  assertEquals(row.actor, "rep");
  assertEquals(row.wa_message_id, "wamid.TEST-1");
  assertEquals(row.status, "sent");
  // Both freshness timestamps are touched.
  assert(rest.reqs.some((q) => q.method === "PATCH" && q.url.includes("whatsapp_conversations?id=eq.v1")));
  assert(rest.reqs.some((q) => q.method === "PATCH" && q.url.includes("whatsapp_contacts?id=eq.c1")));
  // Ack is a ✅ reaction on the rep's message — not a chat reply.
  assertEquals(tg.length, 1);
  assertEquals(tg[0].method, "setMessageReaction");
  assertEquals(tg[0].body.message_id, 42);
});

Deno.test("rep relay with no assignable conversation tells the rep why nothing was sent", async () => {
  const tg: TgCall[] = [];
  const wa: Array<Record<string, unknown>> = [];
  const rest = restSink(); // no contacts assigned to 777
  await withFetchStub([rest.route, telegramSink(tg), graphSink(wa)], async () => {
    assertEquals((await tgPost(msgUpdate({ fromId: 777, chatId: -100555, text: "היי" }))).status, 200);
  });
  assertEquals(wa.length, 0);
  assertEquals(tg.length, 1);
  assertEquals(
    tg[0].body.text,
    "אין שיחת WhatsApp פעילה לשיוך — פתחו את הכרטיס של הלקוח/ה והשיבו עליו, או המתינו שהלקוח/ה יכתבו.",
  );
});
