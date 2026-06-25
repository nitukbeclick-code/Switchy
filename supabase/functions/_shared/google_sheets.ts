// Google Sheets row-append via a service-account JWT (RS256) → OAuth2 access
// token. Mirrors google_calendar.ts exactly (same JWT/PEM/sign helpers, same
// ~50min token memo) but scoped to the Sheets API so every captured lead can be
// logged as one row in a spreadsheet. Every network helper is fail-soft (returns
// { ok: false } / null + a structured log line, never throws) so a Sheets hiccup
// can never break the lead fan-out — Telegram + email are the source of truth,
// the spreadsheet row is a best-effort convenience.

import type { Cfg, Lead } from "./types.ts";
import { jlog } from "./log.ts";
import { deriveCategory, scoreLead } from "./lead_quality.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function sheetsConfigured(cfg: Cfg): boolean {
  return !!(cfg.googleServiceAccount && cfg.googleSpreadsheetId);
}

// ── base64url helpers ────────────────────────────────────────────────────────
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlFromString(s: string): string {
  return b64urlFromBytes(new TextEncoder().encode(s));
}
// Standard base64 → bytes (PEM body, service-account JSON envelope).
function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Parse the base64-encoded service-account JSON → {client_email, private_key}.
// Returns null on any malformed input (caller fails soft).
function parseServiceAccount(raw: string): { clientEmail: string; privateKeyPem: string } | null {
  try {
    // Accept EITHER the raw service-account JSON ({"type":"service_account",...})
    // OR a base64 envelope of it — owners paste whichever form they have.
    const trimmed = raw.trim();
    const json = trimmed.startsWith("{")
      ? trimmed
      : new TextDecoder().decode(bytesFromB64(trimmed));
    const j = JSON.parse(json) as Record<string, unknown>;
    const clientEmail = String(j.client_email ?? "");
    const privateKeyPem = String(j.private_key ?? "");
    if (!clientEmail || !privateKeyPem) return null;
    return { clientEmail, privateKeyPem };
  } catch (e) {
    jlog({ at: "gsheets.parseServiceAccount", ok: false, error: String(e) });
    return null;
  }
}

// PEM (PKCS8, '-----BEGIN PRIVATE KEY-----') → DER bytes for WebCrypto import.
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return bytesFromB64(body);
}

// WebCrypto's importKey/sign want a BufferSource backed by a real ArrayBuffer;
// a plain Uint8Array is typed ArrayBufferLike under Deno's strict lib (could be
// a SharedArrayBuffer), so copy into a fresh ArrayBuffer to satisfy the types.
function ab(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

// Build + RS256-sign the service-account assertion JWT.
async function signJwt(clientEmail: string, privateKeyPem: string): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const signingInput = `${b64urlFromString(JSON.stringify(header))}.${b64urlFromString(JSON.stringify(claims))}`;
    const key = await crypto.subtle.importKey(
      "pkcs8",
      ab(pemToDer(privateKeyPem)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      ab(new TextEncoder().encode(signingInput)),
    );
    return `${signingInput}.${b64urlFromBytes(new Uint8Array(sig))}`;
  } catch (e) {
    jlog({ at: "gsheets.signJwt", ok: false, error: String(e) });
    return null;
  }
}

// Access tokens live 60 minutes — memoize for ~50 so a burst of lead inserts
// doesn't re-sign/re-fetch (its own cache, independent of the calendar token).
let tokenCache: { token: string; at: number } | null = null;

export async function getSheetsToken(cfg: Cfg): Promise<string | null> {
  if (!sheetsConfigured(cfg)) return null;
  if (tokenCache && Date.now() - tokenCache.at < 50 * 60_000) return tokenCache.token;
  const sa = parseServiceAccount(cfg.googleServiceAccount);
  if (!sa) return null;
  const jwt = await signJwt(sa.clientEmail, sa.privateKeyPem);
  if (!jwt) return null;
  try {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    });
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const token = String(j.access_token ?? "");
    if (!r.ok || !token) {
      jlog({ at: "gsheets.getSheetsToken", ok: false, status: r.status, error: j.error_description ?? j.error });
      return null;
    }
    tokenCache = { token, at: Date.now() };
    return token;
  } catch (e) {
    jlog({ at: "gsheets.getSheetsToken", ok: false, error: String(e) });
    return null;
  }
}

// Append one row to a spreadsheet tab (e.g. "Leads!A:K") via the Sheets
// values:append endpoint. valueInputOption=USER_ENTERED so Sheets parses dates /
// numbers like a human paste. Fail-soft: { ok: false } on any error — a logging
// miss must never change the lead's Telegram/email outcome.
export async function appendRow(cfg: Cfg, tab: string, values: string[]): Promise<{ ok: boolean }> {
  if (!sheetsConfigured(cfg)) return { ok: false };
  const token = await getSheetsToken(cfg);
  if (!token) return { ok: false };
  try {
    const url = `${SHEETS_BASE}/${encodeURIComponent(cfg.googleSpreadsheetId)}/values/${encodeURIComponent(tab)}:append?valueInputOption=USER_ENTERED`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [values] }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
      jlog({ at: "gsheets.appendRow", ok: false, status: r.status, error: (j.error as Record<string, unknown>)?.message ?? j.error });
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    jlog({ at: "gsheets.appendRow", ok: false, error: String(e) });
    return { ok: false };
  }
}

// PURE — flatten a Lead into the 12-column row written to the "Leads" tab:
// [company, date, firstName, lastName, email, phone, plan_id, category, source,
// status, notes, quality]. The leads table has no company column yet, so company
// is "". name is split on the FIRST space into first/last (multi-word surnames
// fold into lastName). date is the created_at instant (or now() when absent) as
// an ISO string. The original 11-column order (indices 0–10) is preserved
// exactly so existing sheet headers/formulas don't shift — the two enrichments
// the business needs for sellable rows are layered on without breaking it:
//   • column 7 (category) is now FILLED via deriveCategory — the canonical
//     desired service recovered from plan_id/notes, or "" when truly unknown
//     (honest, never fabricated);
//   • a NEW trailing column 11 (quality) carries scoreLead's 0–100 completeness
//     score, so a buyer can sort/triage rows by how workable they are.
export function buildLeadSheetRow(lead: Lead, nowIso = new Date().toISOString()): string[] {
  const fullName = String(lead.name ?? "").trim();
  const sp = fullName.indexOf(" ");
  const firstName = sp === -1 ? fullName : fullName.slice(0, sp);
  const lastName = sp === -1 ? "" : fullName.slice(sp + 1).trim();
  const created = String(lead.created_at ?? "").trim() || nowIso;
  return [
    "", // company — leads has no company column yet
    created,
    firstName,
    lastName,
    String(lead.email ?? ""),
    String(lead.phone ?? ""),
    String(lead.plan_id ?? ""),
    deriveCategory(lead), // category — recovered from plan_id/notes, "" if unknown
    String(lead.source ?? ""),
    String(lead.status ?? ""),
    String(lead.notes ?? ""),
    String(scoreLead(lead)), // quality — 0–100 completeness score (new column)
  ];
}
