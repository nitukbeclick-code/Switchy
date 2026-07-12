// crm-api actions: the CRM roster + graded-role management (C.2, admin-only).

import { fetchRows, serviceFetch } from "../_shared/db.ts";
import { asStoredRole } from "../_shared/crm_roles.ts";
import { jlog } from "../_shared/log.ts";
import { clampListLimit, clampOffset, isUuidish, s, shapeMember } from "./crm_logic.ts";
import { err, json, logAudit, q, type Row } from "./helpers.ts";

// ── CRM members (per-rep roles — C.2, admin-only) ───────────────────────────

// listMembers {limit?, offset?} → the graded-roles roster: every crm_members row
// + each member's display name/email (joined from their OWN profile). Admin-only
// (capability gate). is_admin superset accounts are not listed here — this is
// the roles layer BELOW admin. Allowlist DTO (shapeMember): no profile column
// beyond name/email can leak. limit/offset+hasMore page the window like the
// other lists (default: the historical 200 rows). A failed profile join is
// REPORTED (additive profilesDegraded flag + null names), never silently blank.
export async function actListMembers(b: Row): Promise<Response> {
  const limit = clampListLimit(b.limit);
  const offset = clampOffset(b.offset);
  const rows = await fetchRows<Row>(
    `/rest/v1/crm_members?order=granted_at.desc&limit=${limit + 1}&offset=${offset}&select=uid,role,granted_at`,
  );
  if (rows === null) return err("שגיאה בטעינת חברי הצוות", 502, "db_error");
  const hasMore = rows.length > limit;
  const window = hasMore ? rows.slice(0, limit) : rows;
  // Enrich with the member's own profile name/email (batch, allowlist select).
  const uids = window.map((r) => s(r.uid)).filter(Boolean);
  const profiles = new Map<string, Row>();
  let profilesDegraded = false;
  if (uids.length) {
    const list = uids.map((id) => q(id)).join(",");
    const profRows = await fetchRows<Row>(
      `/rest/v1/profiles?id=in.(${list})&select=id,name,email`,
    );
    if (profRows === null) {
      // The roster itself is intact — degrade the join honestly instead of
      // failing the whole roles tab over a cosmetic name/email lookup.
      profilesDegraded = true;
      jlog({ at: "crm.listMembers", ok: false, error: "profiles read failed" });
    } else {
      for (const p of profRows) profiles.set(s(p.id), p);
    }
  }
  const members = window.map((r) => shapeMember(r, profiles.get(s(r.uid))));
  return json({ members, hasMore, profilesDegraded });
}

// setMemberRole {uid, role} → grant / change / revoke a member's CRM role.
// Admin-only (capability gate). role ∈ {viewer, rep} upserts the crm_members row;
// role 'none'/'' REVOKES it (deletes the row). REFUSES a self-change — an admin
// never manages their own row here (their access comes from is_admin, not this
// table), so this closes any "demote/elevate myself" confusion. Every change is
// audited to security_audit_log (Reg.13) with actor + target uid + the new role.
export async function actSetMemberRole(b: Row, actorUid: string): Promise<Response> {
  const uid = s(b.uid).trim();
  if (!uid) return err("uid חסר", 400, "bad_request");
  if (!isUuidish(uid)) return err("uid לא תקין", 400, "bad_request");
  // Self-change guard — compared case-INSENSITIVELY: isUuidish accepts any case, so
  // an admin submitting their own uid uppercased would otherwise slip past this and
  // demote/elevate their own row. Normalize both sides before the equality check.
  if (uid.toLowerCase() === s(actorUid).trim().toLowerCase()) {
    return err("אי אפשר לשנות את ההרשאה של עצמך", 400, "bad_request");
  }

  const rawRole = s(b.role).trim().toLowerCase();

  // Revoke path: 'none'/'' removes the member's role entirely (idempotent — a
  // no-op delete on an absent row still succeeds).
  if (rawRole === "" || rawRole === "none") {
    const r = await serviceFetch(`/rest/v1/crm_members?uid=eq.${q(uid)}`, { method: "DELETE" });
    if (!r || !r.ok) {
      jlog({ at: "crm.setMemberRole", ok: false, op: "revoke", status: r?.status });
      return err("ביטול ההרשאה נכשל", 502, "db_error");
    }
    await logAudit(actorUid, "crm_revoke_role", { target_uid: uid });
    return json({ ok: true, role: null });
  }

  // Grant / change path: only a valid stored role (viewer/rep) is ever written.
  const role = asStoredRole(rawRole);
  if (!role) return err("תפקיד לא תקין", 400, "bad_request");

  // Confirm the target is a real user (every user has a profiles row) — a clean
  // 404 instead of a confusing FK-violation 502.
  const who = await fetchRows<Row>(`/rest/v1/profiles?id=eq.${q(uid)}&select=id&limit=1`);
  if (who === null) return err("שגיאה באימות המשתמש", 502, "db_error");
  if (!who.length) return err("המשתמש לא נמצא", 404, "not_found");

  // Upsert on the uid PK (merge-duplicates): first grant INSERTs (granted_at
  // defaults to now()); a later change UPDATEs role/granted_by/updated_at and
  // preserves the original granted_at (not in the payload).
  const r = await serviceFetch(`/rest/v1/crm_members?on_conflict=uid`, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      uid,
      role,
      granted_by: actorUid || null,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!r || !r.ok) {
    jlog({ at: "crm.setMemberRole", ok: false, op: "grant", status: r?.status });
    return err("עדכון ההרשאה נכשל", 502, "db_error");
  }
  await logAudit(actorUid, "crm_set_role", { target_uid: uid, role });
  return json({ ok: true, role });
}
