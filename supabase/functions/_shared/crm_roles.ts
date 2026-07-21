// ── CRM capability model (pure, unit-tested — no I/O) ────────────────────────
// The single source of truth for "which CRM role may perform which action".
// Enforced per-action in crm-api/index.ts AFTER requireCrmAccess resolves the
// caller's effective role. is_admin === true maps to the effective role "admin"
// (a superset), so existing admins are unaffected by this layer.
//
// FAIL-CLOSED BY CONSTRUCTION: an action with no ACTION_CAP entry (e.g. a new
// action added without a mapping) is treated as admin-only — canDo() returns
// true only for "admin". A capability is granted only if the role's set contains
// it; there is no implicit allow.

/** Roles that can be STORED in crm_members. "admin" is NOT stored here — it is
 *  derived from profiles.is_admin and always outranks these. */
export type StoredCrmRole = "viewer" | "rep";

/** The effective role used for authorization = a stored role OR "admin". */
export type EffectiveCrmRole = StoredCrmRole | "admin";

/** Valid values accepted by setMemberRole (what an admin may assign). */
export const CRM_ROLE_VALUES: ReadonlySet<string> = new Set<StoredCrmRole>([
  "viewer",
  "rep",
]);

/** Coarse capabilities every CRM action requires exactly one of. */
export type CrmCapability = "read" | "write_leads" | "converse" | "admin_only";

/** role → the capabilities it holds. admin holds all. */
const ROLE_CAPS: Record<EffectiveCrmRole, ReadonlySet<CrmCapability>> = {
  viewer: new Set<CrmCapability>(["read"]),
  rep: new Set<CrmCapability>(["read", "write_leads", "converse"]),
  admin: new Set<CrmCapability>(["read", "write_leads", "converse", "admin_only"]),
};

/** action → the single capability it requires. Anything absent here is
 *  admin-only (see canDo) — new actions are locked down until mapped. */
export const ACTION_CAP: Readonly<Record<string, CrmCapability>> = {
  // read-only surfaces
  overview: "read",
  slaMetrics: "read",
  listConversations: "read",
  getThread: "read",
  listContacts: "read",
  listLeads: "read",
  getLeadDetail: "read",
  repLeaderboard: "read",
  listMeetings: "read",
  getMeeting: "read",
  // conversation control (implicit takeover)
  sendReply: "converse",
  takeOver: "converse",
  handBack: "converse",
  // lead / meeting mutations
  setContactStatus: "write_leads",
  setLeadStatus: "write_leads",
  setLeadWorkflow: "write_leads",
  addNote: "write_leads",
  setLeadNote: "write_leads",
  recordSaving: "write_leads",
  claimLead: "write_leads",
  setMeetingStatus: "write_leads",
  // admin-only: the sensitive consented-PII feed + role management
  listSellableLeads: "admin_only",
  listMembers: "admin_only",
  setMemberRole: "admin_only",
};

/** Does `role` hold the capability `cap` grants? */
export function roleHasCapability(role: EffectiveCrmRole, cap: CrmCapability): boolean {
  return ROLE_CAPS[role]?.has(cap) ?? false;
}

/** May `role` perform `action`? Unknown/unmapped actions are admin-only
 *  (fail-closed), so a forgotten mapping denies non-admins rather than leaking. */
export function canDo(role: EffectiveCrmRole, action: string): boolean {
  const cap = ACTION_CAP[action];
  if (cap === undefined) return role === "admin";
  return roleHasCapability(role, cap);
}

/** Narrow an arbitrary string to a storable role, or null. */
export function asStoredRole(v: unknown): StoredCrmRole | null {
  return typeof v === "string" && CRM_ROLE_VALUES.has(v) ? (v as StoredCrmRole) : null;
}
