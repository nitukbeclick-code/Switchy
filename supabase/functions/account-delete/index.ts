import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// account-delete — Switchy AI
// Deletes the CALLER's account: scrubs their PII across the product tables,
// removes their storage objects, records do-not-contact suppression, writes a
// counts-only audit row, and finally deletes the auth.users row itself.
//
// Trust model:
//   • AUTH IS FAIL-CLOSED. The uid comes ONLY from the caller's own JWT
//     (GoTrue /auth/v1/user via _shared/admin.ts uidFromJwt). No JWT, a bad
//     JWT, or missing service env → 401/500 and NOTHING is touched. We never
//     delete on doubt.
//   • Steps 3–10 are FAIL-SOFT + IDEMPOTENT: a failed scrub logs and moves on
//     (the run can be retried — the caller still exists). ONLY a failed
//     auth-user delete (step 11) returns { ok:false }.
//   • CROSS-USER GUARD: contact-matched scrubs derive only from the caller's
//     own profiles row; an empty phone/email plans NO contact-matched op (see
//     lib.ts contactFilters).
//
// Deploy: gh workflow run deploy-functions.yml -f function=account-delete
//   (verify_jwt stays off — we resolve the JWT ourselves, fail-closed).
//
// POST { confirm:"DELETE", advisorSessionId? }  Authorization: Bearer <user jwt>
//   → { ok:true }                          account fully deleted
//   → 400 { ok:false, error }              confirm missing/wrong
//   → 401/429/500 { ok:false, error }      unauthorized / throttled / delete failed
// GET (any) → health string
// ─────────────────────────────────────────────────────────────────────────────

import { rateLimit } from "../_shared/ratelimit.ts";
import { jlog } from "../_shared/log.ts";
import { captureError } from "../_shared/observability.ts";
import { uidFromJwt } from "../_shared/admin.ts";
import { fetchRows, insertRow, logMeetingEvent, patchCount, serviceFetch } from "../_shared/db.ts";
import { recordSuppression, type SuppressionChannel } from "../_shared/compliance.ts";
import {
  planAccountDeletion,
  type ProfileContact,
  SCRUB_LEAD_PAYLOAD,
  SCRUB_MEETING_PAYLOAD,
} from "./lib.ts";

const ALLOWED_ORIGINS = new Set<string>([
  "https://switchy-ai.com",
  "https://www.switchy-ai.com",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  // Browser callers get an exact-origin echo (or "null" for a non-allowed origin);
  // non-browser callers (the Flutter app sends no Origin) get "*". apikey/authorization
  // MUST be echoed or the supabase-js invoke preflight fails.
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : (origin ? "null" : "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
      ...(extra ?? {}),
    },
  });
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

// DELETE that reports how many rows actually went away (0 = no match or a DB
// failure — both fail-soft here). Mirrors _shared/db.ts patchCount's contract.
async function deleteCount(path: string): Promise<number> {
  try {
    const r = await serviceFetch(path, {
      method: "DELETE",
      headers: { "Prefer": "return=representation" },
    });
    if (!r || !r.ok) {
      jlog({ at: "account-delete.deleteCount", path, ok: false, status: r?.status });
      await r?.body?.cancel?.().catch(() => {});
      return 0;
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    jlog({ at: "account-delete.deleteCount", path, ok: false, error: String(e) });
    return 0;
  }
}

// Per-run tallies for the counts-only audit row (NO PII — numbers only).
type Counts = {
  meetings_cancelled: number;
  meetings_scrubbed: number;
  leads_scrubbed: number;
  whatsapp_contacts_deleted: number;
  ai_sessions_deleted: number;
  email_otps_deleted: number;
  community_notifications_deleted: number;
  community_reports_anonymized: number;
  storage_objects_removed: number;
};

// ── Step 3: cancel open meetings (uid-matched + email-matched) ────────────────
// Same audit shape the Telegram rep console writes: a status_change row per
// cancelled meeting (see notify-lead's logMeetingEvent call sites).
async function cancelOpenMeetings(uid: string, emailFilter: string | null, counts: Counts): Promise<void> {
  const open = new Map<string, string>(); // id → old status (for the audit row)
  const collect = (rows: Array<{ id?: unknown; status?: unknown }> | null) => {
    for (const r of rows ?? []) {
      const id = typeof r.id === "string" ? r.id : "";
      if (id && !open.has(id)) open.set(id, typeof r.status === "string" ? r.status : "pending");
    }
  };
  collect(await fetchRows(
    `/rest/v1/meetings?user_id=eq.${enc(uid)}&status=in.(pending,confirmed)&select=id,status`,
  ));
  if (emailFilter) {
    collect(await fetchRows(
      `/rest/v1/meetings?${emailFilter}&status=in.(pending,confirmed)&select=id,status`,
    ));
  }
  for (const [id, oldStatus] of open) {
    // The status=in.(…) guard makes the PATCH idempotent under a retried run.
    const n = await patchCount(
      `/rest/v1/meetings?id=eq.${enc(id)}&status=in.(pending,confirmed)`,
      { status: "cancelled" },
    );
    if (n > 0) {
      counts.meetings_cancelled += n;
      await logMeetingEvent({
        meeting_id: id,
        event: "status_change",
        old_status: oldStatus,
        new_status: "cancelled",
        actor_name: "account-delete",
        note: "account deletion",
      });
    }
  }
}

// ── Step 9: purge community-media/<uid>/ via the Storage API ─────────────────
// List → batch-remove, page by page. offset stays 0 because each remove shifts
// the remaining objects into the window; the page cap bounds a hostile bucket.
async function purgeStorage(prefix: string): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 20; page++) {
    const list = await serviceFetch("/storage/v1/object/list/community-media", {
      method: "POST",
      body: JSON.stringify({ prefix, limit: 100, offset: 0 }),
    });
    if (!list || !list.ok) {
      jlog({ at: "account-delete.storage_list", ok: false, status: list?.status });
      await list?.body?.cancel?.().catch(() => {});
      break;
    }
    const items = await list.json().catch(() => []) as Array<{ name?: unknown }>;
    const names = (Array.isArray(items) ? items : [])
      .map((i) => (typeof i?.name === "string" ? i.name : ""))
      .filter(Boolean);
    if (names.length === 0) break;
    const del = await serviceFetch("/storage/v1/object/community-media", {
      method: "DELETE",
      body: JSON.stringify({ prefixes: names.map((n) => `${prefix}${n}`) }),
    });
    if (!del || !del.ok) {
      jlog({ at: "account-delete.storage_remove", ok: false, status: del?.status });
      await del?.body?.cancel?.().catch(() => {});
      break;
    }
    await del.body?.cancel?.().catch(() => {});
    removed += names.length;
    if (names.length < 100) break;
  }
  return removed;
}

// ── Step 10: counts-only audit + do-not-contact suppression ─────────────────
async function auditAndSuppress(uid: string, phoneE164: string, email: string, counts: Counts): Promise<void> {
  // security_audit_log detail carries COUNTS ONLY — never the contact values.
  await insertRow("security_audit_log", {
    user_id: uid,
    event: "account_deleted",
    detail: { ...counts, had_phone: phoneE164 !== "", had_email: email !== "" },
  });
  // marketing_suppression's CHECK allows sms/email/whatsapp/telegram (see
  // marketing-consent-2026-06.sql + telegram-user-suppression-2026-06.sql); the
  // helper's TS union is narrower, so the sms/email channels need a local cast.
  if (phoneE164) {
    await recordSuppression("whatsapp", phoneE164, "account_deleted");
    await recordSuppression("sms" as unknown as SuppressionChannel, phoneE164, "account_deleted");
  }
  if (email) {
    await recordSuppression("email" as unknown as SuppressionChannel, email, "account_deleted");
  }
}

// ── Step 11: delete the auth user — the ONLY fail-CLOSED step ────────────────
async function deleteAuthUser(uid: string): Promise<{ ok: boolean; error?: string }> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return { ok: false, error: "missing service credentials" };
  try {
    const r = await fetch(`${url}/auth/v1/admin/users/${enc(uid)}`, {
      method: "DELETE",
      headers: { "apikey": key, "Authorization": `Bearer ${key}` },
    });
    await r.body?.cancel?.().catch(() => {});
    if (r.status === 200 || r.status === 204) return { ok: true };
    return { ok: false, error: `auth delete failed (${r.status})` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
    if (req.method === "GET") {
      return new Response("account-delete: ok", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders(origin) },
      });
    }
    if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405, origin);

    // Deletion is heavyweight and irreversible — a tight per-IP cap (3/hour)
    // sheds loops/abuse long before the expensive work. Unlike referral-issue
    // there is NO fail-soft fallback here: a throttled caller gets a plain 429.
    const ip = clientIp(req);
    const rl = rateLimit(`acct:delete:${ip || "noip"}`, 3, 60 * 60_000);
    if (!rl.allowed) {
      jlog({ at: "account-delete", ok: false, throttled: true });
      return json({ ok: false, error: "rate limited" }, 429, origin, {
        "Retry-After": String(rl.retryAfterSec),
      });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // fall through — the confirm gate below rejects an empty body
    }

    // Explicit-confirmation gate: the client must literally send "DELETE".
    if (body.confirm !== "DELETE") {
      return json({ ok: false, error: "confirm required" }, 400, origin);
    }

    // 1) AUTH — FAIL-CLOSED. uid comes only from the caller's own JWT; any
    // missing/bad token or missing service env resolves to null → 401.
    const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    const uid = jwt ? await uidFromJwt(jwt) : null;
    if (!uid) {
      jlog({ at: "account-delete", ok: false, error: "unauthorized" });
      return json({ ok: false, error: "unauthorized" }, 401, origin);
    }

    // 2) The caller's own profile row — the ONLY source of contact-matched
    // filters. A failed read degrades to uid-matched ops only (fail-soft, and
    // still the safe side of the cross-user guard).
    const rows = await fetchRows<ProfileContact>(
      `/rest/v1/profiles?select=name,phone,email&id=eq.${enc(uid)}&limit=1`,
    );
    const profile: ProfileContact = rows && rows.length > 0 ? rows[0] : {};

    const plan = planAccountDeletion(uid, profile, body.advisorSessionId);
    const counts: Counts = {
      meetings_cancelled: 0,
      meetings_scrubbed: 0,
      leads_scrubbed: 0,
      whatsapp_contacts_deleted: 0,
      ai_sessions_deleted: 0,
      email_otps_deleted: 0,
      community_notifications_deleted: 0,
      community_reports_anonymized: 0,
      storage_objects_removed: 0,
    };

    for (const op of plan) {
      switch (op.op) {
        case "cancelOpenMeetings":
          await cancelOpenMeetings(uid, op.emailFilter, counts);
          break;
        case "scrubMeetings": {
          counts.meetings_scrubbed += await patchCount(
            `/rest/v1/meetings?user_id=eq.${enc(uid)}`,
            { ...SCRUB_MEETING_PAYLOAD },
          );
          if (op.emailFilter) {
            counts.meetings_scrubbed += await patchCount(
              `/rest/v1/meetings?${op.emailFilter}`,
              { ...SCRUB_MEETING_PAYLOAD },
            );
          }
          break;
        }
        case "scrubLeads": {
          counts.leads_scrubbed += await patchCount(
            `/rest/v1/leads?user_id=eq.${enc(uid)}`,
            { ...SCRUB_LEAD_PAYLOAD },
          );
          if (op.phoneFilter) {
            counts.leads_scrubbed += await patchCount(
              `/rest/v1/leads?${op.phoneFilter}`,
              { ...SCRUB_LEAD_PAYLOAD },
            );
          }
          if (op.emailFilter) {
            counts.leads_scrubbed += await patchCount(
              `/rest/v1/leads?${op.emailFilter}`,
              { ...SCRUB_LEAD_PAYLOAD },
            );
          }
          break;
        }
        case "deleteWhatsappContact":
          // Cascades whatsapp_conversations + whatsapp_messages (FKs in
          // whatsapp-2026-06.sql).
          counts.whatsapp_contacts_deleted += await deleteCount(
            `/rest/v1/whatsapp_contacts?wa_phone=eq.${enc(op.waPhone)}`,
          );
          break;
        case "deleteAiSession":
          counts.ai_sessions_deleted += await deleteCount(
            `/rest/v1/ai_sessions?session_id=eq.${enc(op.sessionId)}`,
          );
          break;
        case "deleteEmailOtps":
          // meeting_email_otps.email is stored lowercased (meeting-email-otp-
          // 2026-06.sql); op.email is already lowercased by lib.ts cleanEmail.
          counts.email_otps_deleted += await deleteCount(
            `/rest/v1/meeting_email_otps?email=eq.${enc(op.email)}`,
          );
          break;
        case "deleteCommunityNotifications":
          counts.community_notifications_deleted += await deleteCount(
            `/rest/v1/community_notifications?user_id=eq.${enc(uid)}`,
          );
          break;
        case "anonymizeCommunityReports":
          // Reports stay (moderation history) but lose their author.
          counts.community_reports_anonymized += await patchCount(
            `/rest/v1/community_reports?reporter_user_id=eq.${enc(uid)}`,
            { reporter_user_id: null },
          );
          break;
        case "deleteStorageObjects":
          counts.storage_objects_removed += await purgeStorage(op.prefix);
          break;
        case "auditAndSuppress":
          await auditAndSuppress(uid, op.phoneE164, op.email, counts);
          break;
        case "deleteUser": {
          const res = await deleteAuthUser(uid);
          if (res.ok) {
            jlog({ at: "account-delete", ok: true, ...counts });
            return json({ ok: true }, 200, origin);
          }
          // Steps 3–10 already ran and are idempotent — the caller still
          // exists, so a retry is safe and completes the deletion.
          jlog({ at: "account-delete", ok: false, error: res.error, ...counts });
          return json({ ok: false, error: res.error ?? "delete failed" }, 500, origin);
        }
      }
    }
    // Unreachable — planAccountDeletion always ends with deleteUser.
    return json({ ok: false, error: "plan did not complete" }, 500, origin);
  } catch (e) {
    captureError(e, { fn: "account-delete", method: req.method });
    jlog({ at: "account-delete", ok: false, error: String(e) });
    // Fail-CLOSED: an unexpected throw means we cannot know what ran — report
    // failure so the client can retry; nothing here auto-deletes on doubt.
    return json({ ok: false, error: "internal error" }, 500, origin);
  }
});
