// crm-api actions: the CRM roster + graded-role management (C.2, admin-only).

import { fetchRows, serviceFetch } from "../_shared/db.ts";
import { asStoredRole } from "../_shared/crm_roles.ts";
import { jlog } from "../_shared/log.ts";
import { s, shapeMember } from "./crm_logic.ts";
import { json, logAudit, q, type Row } from "./helpers.ts";

// ── CRM members (per-rep roles — C.2, admin-only) ───────────────────────────

// listMembers {} → the graded-roles roster: every crm_members row + each member's
// display name/email (joined from their OWN profile). Admin-only (capability
// gate). is_admin superset accounts are not listed here — this is the roles layer
// BELOW admin. Allowlist DTO (shapeMember): no profile column beyond name/email
// can leak.
export async function actListMembers(): Promise<Response> {
  const rows = await fetchRows<Row>(
    `/rest/v1/crm_members?order=granted_at.desc&limit=200&select=uid,role,granted_at`,
  );
  if (rows === null) return json({ error: "שגיאה בטעינת חברי הצוות" }, 502);
  // Enrich with the member's own profile name/email (batch, allowlist select).
  const uids = rows.map((r) => s(r.uid)).filter(Boolean);
  const profiles = new Map<string, Row>();
  if (uids.length) {
    const list = uids.map((id) => q(id)).join(",");
    const profRows = await fetchRows<Row>(
      `/rest/v1/profiles?id=in.(${list})&select=id,name,email`,
    );
    for (const p of profRows ?? []) profiles.set(s(p.id), p);
  }
  const members = rows.map((r) => shapeMember(r, profiles.get(s(r.uid))));
  return json({ members });
}

// setMemberRole {uid, role} → grant / change / revoke a member's CRM role.
// Admin-only (capability gate). role ∈ {viewer, rep} upserts the crm_members row;
// role 'none'/'' REVOKES it (deletes the row). REFUSES a self-change — an admin
// never manages their own row here (their access comes from is_admin, not this
// table), so this closes any "demote/elevate myself" confusion. Every change is
// audited to security_audit_log (Reg.13) with actor + target uid + the new role.
export async function actSetMemberRole(b: Row, actorUid: string): Promise<Response> {
  const uid = s(b.uid).trim();
  if (!uid) return json({ error: "uid חסר" }, 400);
  if (uid === actorUid) return json({ error: "אי אפשר לשנות את ההרשאה של עצמך" }, 400);

  const rawRole = s(b.role).trim().toLowerCase();

  // Revoke path: 'none'/'' removes the member's role entirely (idempotent — a
  // no-op delete on an absent row still succeeds).
  if (rawRole === "" || rawRole === "none") {
    const r = await serviceFetch(`/rest/v1/crm_members?uid=eq.${q(uid)}`, { method: "DELETE" });
    if (!r || !r.ok) {
      jlog({ at: "crm.setMemberRole", ok: false, op: "revoke", status: r?.status });
      return json({ error: "ביטול ההרשאה נכשל" }, 502);
    }
    await logAudit(actorUid, "crm_revoke_role", { target_uid: uid });
    return json({ ok: true, role: null });
  }

  // Grant / change path: only a valid stored role (viewer/rep) is ever written.
  const role = asStoredRole(rawRole);
  if (!role) return json({ error: "תפקיד לא תקין" }, 400);

  // Confirm the target is a real user (every user has a profiles row) — a clean
  // 404 instead of a confusing FK-violation 502.
  const who = await fetchRows<Row>(`/rest/v1/profiles?id=eq.${q(uid)}&select=id&limit=1`);
  if (who === null) return json({ error: "שגיאה באימות המשתמש" }, 502);
  if (!who.length) return json({ error: "המשתמש לא נמצא" }, 404);

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
    return json({ error: "עדכון ההרשאה נכשל" }, 502);
  }
  await logAudit(actorUid, "crm_set_role", { target_uid: uid, role });
  return json({ ok: true, role });
}
