// Unit tests for the CRM capability model (_shared/crm_roles.ts) — the per-action
// authorization matrix crm-api enforces after requireCrmAccess resolves the
// caller's role. This is the security-critical table: a viewer must never reach a
// write, a rep must never reach the sensitive admin-only surfaces, and an unmapped
// action must default to admin-only (fail-closed). Run from supabase/functions/:
//   deno task test

import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  ACTION_CAP,
  asStoredRole,
  canDo,
  CRM_ROLE_VALUES,
  type EffectiveCrmRole,
  roleHasCapability,
} from "../_shared/crm_roles.ts";

const READ_ACTIONS = [
  "overview",
  "slaMetrics",
  "listConversations",
  "getThread",
  "listContacts",
  "listLeads",
  "getLeadDetail",
  "repLeaderboard",
  "listMeetings",
  "getMeeting",
];
const CONVERSE_ACTIONS = ["sendReply", "takeOver", "handBack"];
const WRITE_ACTIONS = [
  "setContactStatus",
  "setLeadStatus",
  "setLeadWorkflow",
  "addNote",
  "setLeadNote",
  "recordSaving",
  "claimLead",
  "setMeetingStatus",
];
const ADMIN_ACTIONS = ["listSellableLeads", "listMembers", "setMemberRole"];

Deno.test("viewer: read-only — every read passes, every write/converse/admin denied", () => {
  for (const a of READ_ACTIONS) assert(canDo("viewer", a), `viewer should read ${a}`);
  for (const a of [...CONVERSE_ACTIONS, ...WRITE_ACTIONS, ...ADMIN_ACTIONS]) {
    assertFalse(canDo("viewer", a), `viewer must NOT do ${a}`);
  }
});

Deno.test("rep: read + converse + write leads — but NEVER an admin-only action", () => {
  for (const a of [...READ_ACTIONS, ...CONVERSE_ACTIONS, ...WRITE_ACTIONS]) {
    assert(canDo("rep", a), `rep should do ${a}`);
  }
  for (const a of ADMIN_ACTIONS) assertFalse(canDo("rep", a), `rep must NOT do ${a}`);
});

Deno.test("admin: superset — every mapped action passes", () => {
  for (const a of [...READ_ACTIONS, ...CONVERSE_ACTIONS, ...WRITE_ACTIONS, ...ADMIN_ACTIONS]) {
    assert(canDo("admin", a), `admin should do ${a}`);
  }
});

Deno.test("unmapped/unknown action is admin-only (fail-closed)", () => {
  for (const role of ["viewer", "rep"] as EffectiveCrmRole[]) {
    assertFalse(canDo(role, "someFutureAction"), `${role} must be denied an unmapped action`);
    assertFalse(canDo(role, ""), `${role} must be denied an empty action`);
  }
  // admin still passes an unmapped action (superset), so a new action is reachable
  // by an admin immediately but locked for graded roles until it is mapped.
  assert(canDo("admin", "someFutureAction"));
});

Deno.test("the sensitive surfaces (sellable feed + role mgmt) require admin_only", () => {
  assertEquals(ACTION_CAP["listSellableLeads"], "admin_only");
  assertEquals(ACTION_CAP["listMembers"], "admin_only");
  assertEquals(ACTION_CAP["setMemberRole"], "admin_only");
  // only admin holds admin_only
  assert(roleHasCapability("admin", "admin_only"));
  assertFalse(roleHasCapability("rep", "admin_only"));
  assertFalse(roleHasCapability("viewer", "admin_only"));
});

Deno.test("asStoredRole accepts only viewer/rep; rejects admin/none/junk", () => {
  assertEquals(asStoredRole("viewer"), "viewer");
  assertEquals(asStoredRole("rep"), "rep");
  // 'admin' is NOT storable — it comes from is_admin, never from crm_members.
  assertEquals(asStoredRole("admin"), null);
  assertEquals(asStoredRole("none"), null);
  assertEquals(asStoredRole(""), null);
  assertEquals(asStoredRole("REP"), null); // case-sensitive; caller lowercases first
  assertEquals(asStoredRole(undefined), null);
  assertEquals(asStoredRole(123), null);
  assertEquals(asStoredRole(null), null);
});

Deno.test("CRM_ROLE_VALUES is exactly {viewer, rep}", () => {
  assertEquals([...CRM_ROLE_VALUES].sort(), ["rep", "viewer"]);
});
