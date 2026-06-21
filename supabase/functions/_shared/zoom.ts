// Zoom Server-to-Server OAuth + meeting creation. Fail-soft: every network
// helper returns null on failure (with a structured log line) so the caller
// can fall back to the manual link-ask flow in chat.

import type { Cfg } from "./types.ts";
import { jlog } from "./log.ts";

export function zoomConfigured(cfg: Cfg): boolean {
  return !!(cfg.zoomAccountId && cfg.zoomClientId && cfg.zoomClientSecret);
}

// Zoom access tokens live 60 minutes — memoize for 50 so a burst of
// confirmations doesn't hammer the OAuth endpoint (same module-level cache
// pattern as config.ts's cfgCache).
let tokenCache: { token: string; at: number } | null = null;

export async function getZoomToken(cfg: Cfg): Promise<string | null> {
  if (!zoomConfigured(cfg)) return null;
  if (tokenCache && Date.now() - tokenCache.at < 50 * 60_000) return tokenCache.token;
  try {
    const basic = btoa(`${cfg.zoomClientId}:${cfg.zoomClientSecret}`);
    const r = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.zoomAccountId)}`,
      { method: "POST", headers: { "Authorization": `Basic ${basic}` } },
    );
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    const token = String(j.access_token ?? "");
    if (!r.ok || !token) {
      jlog({ at: "getZoomToken", ok: false, status: r.status, error: j.reason ?? j.error });
      return null;
    }
    tokenCache = { token, at: Date.now() };
    return token;
  } catch (e) {
    jlog({ at: "getZoomToken", ok: false, error: String(e) });
    return null;
  }
}

// PURE — unit-tested. A 30-minute Israel-time consultation with a waiting room
// (the rep admits the customer; nobody joins an empty room).
// starts_at arrives from PostgREST as e.g. '2026-06-16T11:30:00+00:00', but
// Zoom wants UTC as 'yyyy-MM-ddTHH:mm:ssZ' — normalize when parseable and
// fall back to the raw string otherwise (callers already fail-soft).
export function buildZoomMeetingBody(opts: { topic: string; startsAtIso: string }): Record<string, unknown> {
  const t = new Date(opts.startsAtIso);
  const startTime = Number.isNaN(t.getTime())
    ? opts.startsAtIso
    : t.toISOString().slice(0, 19) + "Z";
  return {
    topic: opts.topic,
    type: 2,
    start_time: startTime,
    duration: 30,
    timezone: "Asia/Jerusalem",
    settings: { waiting_room: true, join_before_host: false },
  };
}

export async function createZoomMeeting(
  cfg: Cfg,
  opts: { topic: string; startsAtIso: string },
): Promise<{ join_url: string; id: string } | null> {
  let token = await getZoomToken(cfg);
  if (!token) {
    // Auth failure is distinct from create failure: getZoomToken already logged
    // the OAuth status, but this line tells us the create path bailed BEFORE the
    // API call (vs. a non-OK create below) when reading the logs back.
    jlog({ at: "createZoomMeeting", ok: false, phase: "auth", error: "no zoom token" });
    return null;
  }
  // S2S account tokens may not resolve /users/me in every configuration —
  // prefer an explicit host email when configured.
  const host = encodeURIComponent(cfg.zoomHostEmail || "me");
  const post = (t: string) =>
    fetch(`https://api.zoom.us/v2/users/${host}/meetings`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildZoomMeetingBody(opts)),
    });
  try {
    let r = await post(token);
    if (r.status === 401) {
      // cached token revoked/expired early — refresh once and retry
      tokenCache = null;
      token = await getZoomToken(cfg);
      if (!token) {
        jlog({ at: "createZoomMeeting", ok: false, phase: "auth", error: "token refresh failed after 401" });
        return null;
      }
      r = await post(token);
    }
    const j = await r.json().catch(() => ({} as Record<string, unknown>)) as Record<string, unknown>;
    if (!r.ok || !j.join_url) {
      jlog({ at: "createZoomMeeting", ok: false, phase: "create", status: r.status, error: j.message ?? j.error });
      return null;
    }
    return { join_url: String(j.join_url), id: String(j.id ?? "") };
  } catch (e) {
    jlog({ at: "createZoomMeeting", ok: false, error: String(e) });
    return null;
  }
}

// Best-effort cleanup when the confirm race is lost — a stray meeting on the
// Zoom account is harmless, a thrown error here is not.
export async function deleteZoomMeeting(cfg: Cfg, meetingId: string): Promise<void> {
  if (!meetingId) return;
  try {
    const token = await getZoomToken(cfg);
    if (!token) return;
    await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
  } catch (_) { /* best-effort */ }
}
