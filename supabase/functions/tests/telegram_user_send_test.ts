// Unit tests for the SHARED hardened user-bot sender (_shared/telegram_user.ts)
// — the ONE delivery path both halves of the customer Telegram channel use:
// telegram-user-webhook (the bot's own replies) and notify-lead/callbacks.ts
// (the team→customer human-takeover relay). We stub globalThis.fetch and pin:
//   • the outgoing payload shape (chat_id / parse_mode HTML / no preview)
//   • ships-dark: no TELEGRAM_USER_BOT_TOKEN ⇒ false with ZERO network calls
//   • the permanent HTML-rejection ("can't parse entities" / "too long")
//     degrade lane: ONE clipped plain-text re-send (no parse_mode), never a drop
//   • fail-soft: a persistent failure returns false and NEVER throws
// (The 429/transient-retry lanes sleep real seconds by design — the fast lanes
// above pin the contract without slowing the suite.)
// Run from supabase/functions/:  deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";

// The token is read PER CALL (that contract is itself under test), so set it
// before each test and restore the process state after — other test files in
// this process (e.g. tg_handoff_test.ts) depend on this exact env var.
const TOKEN_VAR = "TELEGRAM_USER_BOT_TOKEN";
const prevToken = Deno.env.get(TOKEN_VAR);
function restoreToken(): void {
  if (prevToken === undefined) Deno.env.delete(TOKEN_VAR);
  else Deno.env.set(TOKEN_VAR, prevToken);
}

const { sendUserBotMessage, sendUserBotPlain, userBotToken } = await import(
  "../_shared/telegram_user.ts"
);

const realFetch = globalThis.fetch;
type Capture = { url: string; body: Record<string, unknown> };

// Fetch stub returning queued responses in order (extra calls get the last one).
function stubFetch(
  responders: Array<(c: Capture, i: number) => Response>,
): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    let body: Record<string, unknown> = {};
    try {
      body = init?.body ? JSON.parse(String(init.body)) : {};
    } catch {
      body = {};
    }
    const c: Capture = { url, body };
    const i = calls.length;
    calls.push(c);
    const f = responders[Math.min(i, responders.length - 1)];
    return Promise.resolve(f(c, i));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

Deno.test("userBotToken: trims the env value; empty/unset ⇒ '' (dark)", () => {
  try {
    Deno.env.set(TOKEN_VAR, "  tok-123  ");
    assertEquals(userBotToken(), "tok-123");
    Deno.env.set(TOKEN_VAR, "   ");
    assertEquals(userBotToken(), "");
    Deno.env.delete(TOKEN_VAR);
    assertEquals(userBotToken(), "");
  } finally {
    restoreToken();
  }
});

Deno.test("sendUserBotMessage: sends ONE HTML message with the exact payload shape", async () => {
  Deno.env.set(TOKEN_VAR, "send-test-token");
  const s = stubFetch([() => new Response(JSON.stringify({ ok: true }), { status: 200 })]);
  try {
    const ok = await sendUserBotMessage(900100, "שלום <b>דנה</b>", { inline_keyboard: [] });
    assert(ok);
    assertEquals(s.calls.length, 1);
    assertStringIncludes(s.calls[0].url, "/botsend-test-token/sendMessage");
    assertEquals(s.calls[0].body.chat_id, 900100);
    assertEquals(s.calls[0].body.text, "שלום <b>דנה</b>");
    assertEquals(s.calls[0].body.parse_mode, "HTML");
    assertEquals(s.calls[0].body.disable_web_page_preview, true);
    assert("reply_markup" in s.calls[0].body);
  } finally {
    s.restore();
    restoreToken();
  }
});

Deno.test("sendUserBotMessage: ships dark — no token ⇒ false with ZERO network calls", async () => {
  Deno.env.delete(TOKEN_VAR);
  const s = stubFetch([() => new Response("must not be called", { status: 500 })]);
  try {
    assertFalse(await sendUserBotMessage("900100", "היי"));
    assertFalse(await sendUserBotPlain("900100", "היי"));
    assertEquals(s.calls.length, 0, "a dark user bot never hits the network");
  } finally {
    s.restore();
    restoreToken();
  }
});

Deno.test("sendUserBotMessage: a permanently-rejected HTML payload degrades ONCE to clipped plain text", async () => {
  Deno.env.set(TOKEN_VAR, "send-test-token");
  const s = stubFetch([
    () =>
      new Response(
        JSON.stringify({ ok: false, description: "Bad Request: can't parse entities" }),
        { status: 400 },
      ),
    () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  ]);
  try {
    const long = "<b>שורה</b> " + "מ".repeat(4200); // over the 3900 plain clip
    const ok = await sendUserBotMessage("900100", long);
    assert(ok, "the reply degrades instead of dropping");
    assertEquals(s.calls.length, 2, "one HTML attempt + one plain fallback");
    // The fallback is PLAIN (no parse_mode), tag-stripped and clipped ≤ 3900.
    const fb = s.calls[1].body;
    assertFalse("parse_mode" in fb);
    const fbText = String(fb.text ?? "");
    assertFalse(fbText.includes("<b>"), "tags are stripped in the plain lane");
    assert(fbText.length <= 3900, `plain fallback must be clipped, got ${fbText.length}`);
  } finally {
    s.restore();
    restoreToken();
  }
});

Deno.test("sendUserBotMessage: a persistent non-recoverable failure returns false and never throws", async () => {
  Deno.env.set(TOKEN_VAR, "send-test-token");
  const s = stubFetch([
    () => new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 }),
  ]);
  try {
    assertFalse(await sendUserBotMessage("900100", "היי"));
    assertEquals(s.calls.length, 1, "a permanent (non-429, non-parse) failure is not retried");
  } finally {
    s.restore();
    restoreToken();
  }
});
