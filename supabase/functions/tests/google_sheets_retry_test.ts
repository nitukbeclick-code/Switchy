// Regression tests for _shared/google_sheets.ts → appendRow's 401 token-refresh
// retry. The module memoizes the OAuth access token for ~50min; when a memoized
// token is revoked/rotated mid-life the Sheets append returns 401. The contract:
//   • on a 401, appendRow INVALIDATES the token cache, mints a FRESH token, and
//     retries the append EXACTLY ONCE — a successful retry returns { ok: true };
//   • a 401 that stays 401 is retried at most once, then gives up ({ ok: false })
//     — bounding the retry so a permanently-bad token can't loop;
//   • a non-401 error (e.g. 403) is NOT token-refresh-retried.
//
// The token cache is MODULE-LEVEL, so each test imports a FRESH module instance
// (dynamic import with a unique ?v= query) to start from an empty cache — otherwise
// a memoized token from a prior test would skip the token-mint fetch and shift the
// call sequence. We stub globalThis.fetch and answer the token-mint vs append calls
// by URL. A real throwaway RSA key makes signJwt succeed so the token endpoint is
// actually reached (same trick as google_sheets_test.ts). Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Cfg } from "../_shared/types.ts";

// ── a real throwaway RSA-2048 PKCS8 key so signJwt() succeeds (else the token
//    mint is skipped and the network path is never exercised) ─────────────────
async function genPkcs8Pem(): Promise<string> {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  let bin = "";
  for (let i = 0; i < der.length; i++) bin += String.fromCharCode(der[i]);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
}
const RSA_PKCS8_PEM = await genPkcs8Pem();

function saB64(pem = RSA_PKCS8_PEM): string {
  const json = JSON.stringify({ client_email: "svc@proj.iam.gserviceaccount.com", private_key: pem });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function cfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "", tgChat: "", resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "", webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: saB64(), googleCalendarId: "", googleSpreadsheetId: "SHEET-401",
    allowedUserIds: [], src: {},
    ...over,
  } as Cfg;
}

const realFetch = globalThis.fetch;
type Capture = { url: string };

function stubFetch(
  responders: Array<(c: Capture, i: number) => Response>,
): { calls: Capture[]; restore: () => void } {
  const calls: Capture[] = [];
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    const i = calls.length;
    calls.push({ url });
    return Promise.resolve(responders[Math.min(i, responders.length - 1)]({ url }, i));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

function tokenOk(token: string): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// Each test gets a fresh module (empty tokenCache) so the token-mint fetch always
// fires before the append — making the call sequence deterministic.
let v = 0;
async function freshAppendRow() {
  v += 1;
  const mod = await import(`../_shared/google_sheets.ts?v=${v}`);
  return mod.appendRow as (c: Cfg, tab: string, values: string[]) => Promise<{ ok: boolean }>;
}

const isToken = (u: string) => u.includes("oauth2.googleapis.com/token");
const isAppend = (u: string) => u.includes("/values/");

// ── 401 → invalidate cache, mint fresh token, retry once → succeeds ──────────

Deno.test("appendRow invalidates the token + retries ONCE on a 401, then succeeds", async () => {
  // Empty-cache sequence, scripted in order so the first append is a 401:
  //   token → append(401) → token(fresh) → append(200).
  const scripted = stubFetch([
    (c) => isToken(c.url) ? tokenOk("ya29.STALE") : new Response("{}", { status: 200 }), // 0: token
    () => new Response(JSON.stringify({ error: { message: "UNAUTHENTICATED" } }), { status: 401 }), // 1: append → 401
    (c) => isToken(c.url) ? tokenOk("ya29.FRESH") : new Response("{}", { status: 200 }), // 2: token (refresh)
    () => new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 }), // 3: append → ok
  ]);
  try {
    const appendRow = await freshAppendRow();
    const r = await appendRow(cfg(), "Leads!A:K", ["x"]);
    assertEquals(r, { ok: true });
    // Four calls in order: mint, append(401), re-mint, append(ok).
    assertEquals(scripted.calls.length, 4);
    assert(isToken(scripted.calls[0].url), "call 0 is the initial token mint");
    assert(isAppend(scripted.calls[1].url), "call 1 is the first append (401)");
    assert(isToken(scripted.calls[2].url), "call 2 is the token RE-mint after cache invalidation");
    assert(isAppend(scripted.calls[3].url), "call 3 is the retried append");
    assertStringIncludes(scripted.calls[3].url, "/values/");
  } finally {
    scripted.restore();
  }
});

// ── 401 that stays 401 → retried at most once, then gives up ─────────────────

Deno.test("appendRow retries a 401 at most ONCE then gives up (no unbounded loop)", async () => {
  const s = stubFetch([
    (c) => isToken(c.url) ? tokenOk("ya29.A") : new Response("{}", { status: 200 }), // 0: token
    () => new Response(JSON.stringify({ error: { message: "UNAUTHENTICATED" } }), { status: 401 }), // 1: append → 401
    (c) => isToken(c.url) ? tokenOk("ya29.B") : new Response("{}", { status: 200 }), // 2: token (refresh)
    () => new Response(JSON.stringify({ error: { message: "UNAUTHENTICATED" } }), { status: 401 }), // 3: append → 401 again
    () => new Response(JSON.stringify({ updates: {} }), { status: 200 }), // a 5th call would be an unbounded retry — must NOT happen
  ]);
  try {
    const appendRow = await freshAppendRow();
    const r = await appendRow(cfg(), "Leads!A:K", ["x"]);
    assertEquals(r, { ok: false });
    // mint, append(401), re-mint, append(401) — and STOP. Exactly four calls.
    assertEquals(s.calls.length, 4);
  } finally {
    s.restore();
  }
});

// ── a non-401 error (403) is NOT token-refresh-retried ───────────────────────

Deno.test("appendRow does NOT token-refresh-retry a non-401 error (e.g. 403)", async () => {
  const s = stubFetch([
    (c) => isToken(c.url) ? tokenOk("ya29.C") : new Response("{}", { status: 200 }), // 0: token
    () => new Response(JSON.stringify({ error: { message: "PERMISSION_DENIED" } }), { status: 403 }), // 1: append → 403
    (c) => isToken(c.url) ? tokenOk("ya29.D") : new Response("{}", { status: 200 }), // a re-mint would be wrong — must NOT happen
  ]);
  try {
    const appendRow = await freshAppendRow();
    const r = await appendRow(cfg(), "Leads!A:K", ["x"]);
    assertEquals(r, { ok: false });
    // Only the initial mint + the single (403) append — no refresh, no retry.
    assertEquals(s.calls.length, 2);
    assert(isToken(s.calls[0].url));
    assert(isAppend(s.calls[1].url));
  } finally {
    s.restore();
  }
});
