// Unit tests for _shared/google_sheets.ts — the fail-soft Sheets lead-logger.
// Three concerns:
//   1) buildLeadSheetRow — PURE field mapping + name split (no network).
//   2) sheetsConfigured — gating on an empty/partial config.
//   3) appendRow — posts the right URL + body (we stub globalThis.fetch and
//      capture each call) AND is fail-soft: returns { ok:false } on any error
//      and NEVER throws.
//
// appendRow first mints a token (POST oauth2.googleapis.com/token), then POSTs
// the values:append endpoint — so the stub answers the token call first, then
// the append call. Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse, assertStringIncludes } from "@std/assert";
import type { Cfg, Lead } from "../_shared/types.ts";
import { appendRow, buildLeadSheetRow, sheetsConfigured } from "../_shared/google_sheets.ts";

// A fully-zeroed Cfg; tests flip exactly the fields under test.
function blankCfg(over: Partial<Cfg> = {}): Cfg {
  return {
    tgToken: "", tgChat: "", resend: "", resendFrom: "", notifyEmail: "",
    openai: "", anthropic: "", gemini: "", webhookSecret: "",
    zoomAccountId: "", zoomClientId: "", zoomClientSecret: "", zoomHostEmail: "",
    googleServiceAccount: "", googleCalendarId: "", googleSpreadsheetId: "",
    allowedUserIds: [], src: {},
    ...over,
  };
}

// A base64-encoded, minimally-valid service-account JSON whose private_key is a
// REAL throwaway RSA-2048 PKCS8 key generated at test time. Without a valid key,
// signJwt's importKey throws (caught fail-soft → null) and getSheetsToken bails
// BEFORE the token fetch, so we could never exercise the network path. Generating
// a real key lets signJwt succeed → the token endpoint actually gets hit.
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

const realFetch = globalThis.fetch;

type Capture = { url: string; body: Record<string, unknown> };

// Record every call; return queued responses in order (extra calls reuse the
// last responder). Mirrors the stub in whatsapp_send_test.ts.
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
      body = {}; // form-encoded token body — not JSON, irrelevant to assertions
    }
    const c: Capture = { url, body };
    const i = calls.length;
    calls.push(c);
    return Promise.resolve(responders[Math.min(i, responders.length - 1)](c, i));
  }) as typeof globalThis.fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

function tokenOk(token = "ya29.TEST"): Response {
  return new Response(JSON.stringify({ access_token: token, expires_in: 3600 }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}
function sheetsOk(): Response {
  return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}

// NOTE on the token memo: getSheetsToken caches the access token at module level
// for ~50min. Tests therefore assert on URL/body shape, not token identity, and
// the success-path test locates the append call by URL so it's robust whether or
// not a prior test already warmed the cache.

// ── buildLeadSheetRow: PURE mapping + name split ─────────────────────────────

Deno.test("buildLeadSheetRow maps the 12 columns in order: empty company, FILLED category, trailing quality", () => {
  const lead: Lead = {
    name: "דנה כהן",
    email: "dana@example.com",
    phone: "0501234567",
    plan_id: "partner-cellular-100",
    source: "form",
    status: "new",
    notes: "רוצה לעבור",
    created_at: "2026-06-20T08:00:00.000Z",
    // consent timestamps present → the legal-to-act gate is satisfied (scored)
    terms_accepted_at: "2026-06-20T08:00:00.000Z",
    privacy_accepted_at: "2026-06-20T08:00:00.000Z",
  } as Lead;
  const row = buildLeadSheetRow(lead);
  // indices 0–10 keep their original order/contract; category (7) is now filled
  // from the "partner-cellular-100" plan_id; a 12th column (quality) is appended.
  assertEquals(row.slice(0, 11), [
    "",                              // company
    "2026-06-20T08:00:00.000Z",      // date (created_at)
    "דנה",                           // firstName
    "כהן",                           // lastName
    "dana@example.com",              // email
    "0501234567",                    // phone
    "partner-cellular-100",          // plan_id
    "cellular",                      // category — recovered from plan_id
    "form",                          // source
    "new",                           // status
    "רוצה לעבור",                    // notes
  ]);
  assertEquals(row.length, 12);
  // quality is a 0–100 numeric string; this rich, consented lead scores high.
  const quality = Number(row[11]);
  assert(Number.isFinite(quality) && quality >= 0 && quality <= 100);
  assert(quality >= 90, `expected a high score for a complete consented lead, got ${quality}`);
});

Deno.test("buildLeadSheetRow splits name on the FIRST space (multi-word surname folds into last)", () => {
  assertEquals(buildLeadSheetRow({ name: "אבי בן דוד" }).slice(2, 4), ["אבי", "בן דוד"]);
  // single token → empty last name
  assertEquals(buildLeadSheetRow({ name: "מדונה" }).slice(2, 4), ["מדונה", ""]);
  // leading/trailing whitespace is trimmed before the split
  assertEquals(buildLeadSheetRow({ name: "  יעל   לוי  " }).slice(2, 4), ["יעל", "לוי"]);
  // empty name → both empty
  assertEquals(buildLeadSheetRow({ name: "" }).slice(2, 4), ["", ""]);
});

Deno.test("buildLeadSheetRow falls back to now() when created_at is missing, and coerces null fields to ''", () => {
  const row = buildLeadSheetRow({ name: "טל", email: null, plan_id: null, notes: null }, "2026-01-01T00:00:00.000Z");
  assertEquals(row[1], "2026-01-01T00:00:00.000Z"); // injected now
  assertEquals(row[0], ""); // company
  assertEquals(row[4], ""); // email (null → '')
  assertEquals(row[6], ""); // plan_id (null → '')
  assertEquals(row[7], ""); // category — nothing to recover (no plan_id/notes) → ''
  assertEquals(row[10], ""); // notes (null → '')
  assertEquals(row.length, 12); // 11 original columns + trailing quality score
  // a name-only, phoneless, unconsented lead still produces a finite 0–100 score.
  const quality = Number(row[11]);
  assert(Number.isFinite(quality) && quality >= 0 && quality <= 100);
});

// ── sheetsConfigured: gating ─────────────────────────────────────────────────

Deno.test("sheetsConfigured requires BOTH the service-account json and a spreadsheet id", () => {
  assertFalse(sheetsConfigured(blankCfg()));
  assertFalse(sheetsConfigured(blankCfg({ googleServiceAccount: "eyJ9" })));
  assertFalse(sheetsConfigured(blankCfg({ googleSpreadsheetId: "1AbC" })));
  assert(sheetsConfigured(blankCfg({ googleServiceAccount: "eyJ9", googleSpreadsheetId: "1AbC" })));
});

// ── appendRow: gating short-circuit (no network when unconfigured) ───────────

Deno.test("appendRow returns { ok:false } and makes NO network call when unconfigured", async () => {
  const s = stubFetch([() => sheetsOk()]);
  try {
    const r = await appendRow(blankCfg(), "Leads!A:K", ["a", "b"]);
    assertEquals(r, { ok: false });
    assertEquals(s.calls.length, 0); // gated before any fetch
  } finally {
    s.restore();
  }
});

// ── appendRow: fail-soft on a token-mint failure ─────────────────────────────

Deno.test("appendRow is fail-soft when the OAuth token mint fails (never throws)", async () => {
  // token endpoint returns 401 → getSheetsToken returns null → appendRow bails
  const s = stubFetch([
    () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 401 }),
  ]);
  try {
    const r = await appendRow(
      blankCfg({ googleServiceAccount: saB64(), googleSpreadsheetId: "SHEET1" }),
      "Leads!A:K",
      ["x"],
    );
    assertEquals(r, { ok: false });
    // exactly one call (the token attempt); no append after a failed token
    assertEquals(s.calls.length, 1);
    assertStringIncludes(s.calls[0].url, "oauth2.googleapis.com/token");
  } finally {
    s.restore();
  }
});

// ── appendRow: fail-soft on a non-2xx append (never throws) ──────────────────

Deno.test("appendRow returns { ok:false } when the Sheets append responds non-2xx", async () => {
  const s = stubFetch([
    () => tokenOk("ya29.A"),
    () => new Response(JSON.stringify({ error: { message: "PERMISSION_DENIED" } }), { status: 403 }),
  ]);
  try {
    const r = await appendRow(
      blankCfg({ googleServiceAccount: saB64(), googleSpreadsheetId: "SHEET2" }),
      "Leads!A:K",
      ["x"],
    );
    assertEquals(r, { ok: false });
  } finally {
    s.restore();
  }
});

// ── appendRow: success path posts the correct values:append URL + body ───────

Deno.test("appendRow posts {values:[row]} to the values:append endpoint with USER_ENTERED", async () => {
  // The module-level token may already be memoized from an earlier test, so the
  // token call is optional — every responder returns an OK token-or-append, and
  // we locate the append call by its URL rather than a fixed index.
  const s = stubFetch([
    (c) => c.url.includes("oauth2.googleapis.com/token") ? tokenOk("ya29.OK") : sheetsOk(),
  ]);
  try {
    const row = buildLeadSheetRow({ name: "דנה כהן", phone: "0501234567", source: "form", status: "new" });
    const r = await appendRow(
      blankCfg({ googleServiceAccount: saB64(), googleSpreadsheetId: "SHEET-XYZ" }),
      "Leads!A:K",
      row,
    );
    assertEquals(r, { ok: true });
    const append = s.calls.find((c) => c.url.includes("/values/"));
    assert(append, "expected a values:append call");
    // URL: base/{spreadsheetId}/values/{tab}:append?valueInputOption=USER_ENTERED
    assertStringIncludes(append!.url, "https://sheets.googleapis.com/v4/spreadsheets/SHEET-XYZ/values/");
    assertStringIncludes(append!.url, ":append?valueInputOption=USER_ENTERED");
    // tab is URL-encoded ('!' and ':' inside "Leads!A:K")
    assertStringIncludes(append!.url, encodeURIComponent("Leads!A:K"));
    // body wraps the row in a single-element values array
    assertEquals(append!.body, { values: [row] });
  } finally {
    s.restore();
  }
});
