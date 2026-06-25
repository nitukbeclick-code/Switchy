// Google Calendar event creation via a service-account JWT (RS256) → OAuth2
// access token. Mirrors zoom.ts: every network helper is fail-soft (returns
// null / swallows errors with a structured log line) so a calendar hiccup can
// never break the meeting-confirm flow — the Zoom link is the source of truth,
// the calendar event is a best-effort convenience.

import type { Cfg } from "./types.ts";
import { jlog } from "./log.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const IL_TZ = "Asia/Jerusalem";

export function gcalConfigured(cfg: Cfg): boolean {
  return !!(cfg.googleServiceAccount && cfg.googleCalendarId);
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
    jlog({ at: "gcal.parseServiceAccount", ok: false, error: String(e) });
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
    jlog({ at: "gcal.signJwt", ok: false, error: String(e) });
    return null;
  }
}

// Access tokens live 60 minutes — memoize for ~50 so a burst of confirmations
// doesn't re-sign/re-fetch (same module-level cache pattern as zoom.ts).
let tokenCache: { token: string; at: number } | null = null;

export async function getCalendarToken(cfg: Cfg): Promise<string | null> {
  if (!gcalConfigured(cfg)) return null;
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
      jlog({ at: "gcal.getCalendarToken", ok: false, status: r.status, error: j.error_description ?? j.error });
      return null;
    }
    tokenCache = { token, at: Date.now() };
    return token;
  } catch (e) {
    jlog({ at: "gcal.getCalendarToken", ok: false, error: String(e) });
    return null;
  }
}

// PURE — the event end is `start + durationMin`. start arrives as an ISO instant
// (the meeting's starts_at, e.g. '2026-06-16T11:30:00+00:00'); we hand Google
// both endpoints in that instant plus an Asia/Jerusalem timeZone hint. When the
// start is unparseable we fall back to the raw string (callers already fail-soft).
export function buildCalendarEventBody(opts: {
  summary: string;
  description?: string;
  startIso: string;
  durationMin?: number;
}): Record<string, unknown> {
  const dur = opts.durationMin ?? 30;
  const t = new Date(opts.startIso);
  const startIso = Number.isNaN(t.getTime()) ? opts.startIso : t.toISOString();
  const endIso = Number.isNaN(t.getTime())
    ? opts.startIso
    : new Date(t.getTime() + dur * 60_000).toISOString();
  return {
    summary: opts.summary,
    description: opts.description ?? "",
    start: { dateTime: startIso, timeZone: IL_TZ },
    end: { dateTime: endIso, timeZone: IL_TZ },
  };
}

function eventsUrl(cfg: Cfg): string {
  return `${CAL_BASE}/${encodeURIComponent(cfg.googleCalendarId)}/events`;
}

export async function createCalendarEvent(
  cfg: Cfg,
  opts: { summary: string; description?: string; startIso: string; durationMin?: number; calendarId?: string },
): Promise<{ id: string } | null> {
  const token = await getCalendarToken(cfg);
  if (!token) return null;
  try {
    const calId = opts.calendarId || cfg.googleCalendarId;
    const r = await fetch(`${CAL_BASE}/${encodeURIComponent(calId)}/events`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildCalendarEventBody(opts)),
    });
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (!r.ok || !j.id) {
      jlog({ at: "gcal.createCalendarEvent", ok: false, status: r.status, error: (j.error as Record<string, unknown>)?.message ?? j.error });
      return null;
    }
    return { id: String(j.id) };
  } catch (e) {
    jlog({ at: "gcal.createCalendarEvent", ok: false, error: String(e) });
    return null;
  }
}

// Best-effort cleanup when a confirmed meeting is cancelled / marked no-rep — a
// stray calendar event is harmless, a thrown error here is not.
export async function deleteCalendarEvent(cfg: Cfg, eventId: string): Promise<void> {
  if (!eventId) return;
  try {
    const token = await getCalendarToken(cfg);
    if (!token) return;
    await fetch(`${eventsUrl(cfg)}/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
  } catch (_) { /* best-effort */ }
}

// Best-effort move when a confirmed meeting is rescheduled — PATCH only the
// start/end so the event title/description are preserved.
export async function updateCalendarEventStart(
  cfg: Cfg,
  eventId: string,
  startIso: string,
  durationMin = 30,
): Promise<void> {
  if (!eventId) return;
  try {
    const token = await getCalendarToken(cfg);
    if (!token) return;
    const t = new Date(startIso);
    const startVal = Number.isNaN(t.getTime()) ? startIso : t.toISOString();
    const endVal = Number.isNaN(t.getTime())
      ? startIso
      : new Date(t.getTime() + durationMin * 60_000).toISOString();
    await fetch(`${eventsUrl(cfg)}/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { dateTime: startVal, timeZone: IL_TZ },
        end: { dateTime: endVal, timeZone: IL_TZ },
      }),
    });
  } catch (_) { /* best-effort */ }
}
