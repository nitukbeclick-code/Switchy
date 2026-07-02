// Admin gate for CRM endpoints.
//
// requireAdmin(req) resolves the caller's Supabase auth user from the
// `Authorization: Bearer <jwt>` header (the user access token the app attaches
// automatically), then service-role reads `profiles.is_admin` for that uid.
// Returns { uid } only when the row exists AND is_admin === true; otherwise null.
//
// FAIL-CLOSED: any missing token, bad token, missing creds, network error, or
// non-admin profile resolves to null so the caller can return 401/403. We never
// "allow on error".

import { fetchRows } from "./db.ts";
import { jlog } from "./log.ts";

// Resolve the user id behind a JWT via GoTrue (/auth/v1/user). We pass the
// user's token as the Authorization bearer and the service role as the apikey —
// GoTrue returns the authenticated user for that token. Exported (fail-closed:
// null on ANY doubt) so account-delete can identify the caller without the
// is_admin gate.
export async function uidFromJwt(jwt: string): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key || !jwt) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { "Authorization": `Bearer ${jwt}`, "apikey": key },
    });
    if (!r.ok) {
      jlog({ at: "admin.uidFromJwt", ok: false, status: r.status });
      return null;
    }
    const j = await r.json().catch(() => null) as { id?: unknown } | null;
    const uid = j && typeof j.id === "string" ? j.id : null;
    if (!uid) jlog({ at: "admin.uidFromJwt", ok: false, error: "no id in user payload" });
    return uid;
  } catch (e) {
    jlog({ at: "admin.uidFromJwt", ok: false, error: String(e) });
    return null;
  }
}

// Returns { uid } only for a verified admin; null otherwise (fail-closed).
export async function requireAdmin(req: Request): Promise<{ uid: string } | null> {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) {
    jlog({ at: "admin.requireAdmin", ok: false, error: "missing bearer token" });
    return null;
  }
  const uid = await uidFromJwt(jwt);
  if (!uid) return null;
  const rows = await fetchRows<{ is_admin?: unknown }>(
    `/rest/v1/profiles?select=is_admin&id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  if (rows === null) {
    // DB error reading the profile ⇒ fail closed.
    jlog({ at: "admin.requireAdmin", ok: false, error: "profile read failed" });
    return null;
  }
  const isAdmin = rows.length > 0 && rows[0]?.is_admin === true;
  if (!isAdmin) {
    jlog({ at: "admin.requireAdmin", ok: false, uid, error: "not admin" });
    return null;
  }
  return { uid };
}
