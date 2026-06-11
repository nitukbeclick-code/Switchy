// Service-role PostgREST helpers. All fail-soft: callers get empty results /
// false and a structured log line rather than an exception.

import { jlog } from "./log.ts";

export async function serviceFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return null;
  return await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json", "apikey": key, "Authorization": `Bearer ${key}`,
      "Prefer": "return=minimal", ...(init.headers ?? {}),
    },
  });
}

// Returns null on a FAILED query (so callers can say "try again" instead of
// confidently reporting "no results"), [] only when genuinely empty.
export async function fetchRows<T = Record<string, unknown>>(path: string): Promise<T[] | null> {
  try {
    const r = await serviceFetch(path, { method: "GET" });
    if (!r || !r.ok) {
      jlog({ at: "fetchRows", path, ok: false, status: r?.status });
      return null;
    }
    const j = await r.json();
    return Array.isArray(j) ? j as T[] : [];
  } catch (e) {
    jlog({ at: "fetchRows", path, ok: false, error: String(e) });
    return null;
  }
}

// PATCH that reports how many rows actually changed (0 = no match / lost race).
export async function patchCount(path: string, body: Record<string, unknown>): Promise<number> {
  try {
    const r = await serviceFetch(path, {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(body),
    });
    if (!r || !r.ok) {
      jlog({ at: "patchCount", path, ok: false, status: r?.status });
      return 0;
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    jlog({ at: "patchCount", path, ok: false, error: String(e) });
    return 0;
  }
}

export async function insertRow(table: string, body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await serviceFetch(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(body) });
    if (!r || !r.ok) {
      jlog({ at: "insertRow", table, ok: false, status: r?.status });
      return false;
    }
    return true;
  } catch (e) {
    jlog({ at: "insertRow", table, ok: false, error: String(e) });
    return false;
  }
}

// Same null-vs-empty contract as fetchRows.
export async function rpcRows<T = Record<string, unknown>>(name: string, args: Record<string, unknown>): Promise<T[] | null> {
  try {
    const r = await serviceFetch(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
    if (!r || !r.ok) {
      jlog({ at: "rpcRows", name, ok: false, status: r?.status });
      return null;
    }
    const j = await r.json();
    return Array.isArray(j) ? j as T[] : [];
  } catch (e) {
    jlog({ at: "rpcRows", name, ok: false, error: String(e) });
    return null;
  }
}

// Audit-trail write; never throws, never blocks the user-facing flow.
export async function logEvent(ev: {
  lead_id: string;
  event: string;
  old_status?: string | null;
  new_status?: string | null;
  actor_tg_id?: number | null;
  actor_name?: string | null;
  note?: string | null;
}): Promise<void> {
  await insertRow("lead_events", ev);
}

// Same contract for the meetings audit trail (meeting_events mirrors lead_events).
export async function logMeetingEvent(ev: {
  meeting_id: string;
  event: string;
  old_status?: string | null;
  new_status?: string | null;
  actor_tg_id?: number | null;
  actor_name?: string | null;
  note?: string | null;
}): Promise<void> {
  await insertRow("meeting_events", ev);
}
