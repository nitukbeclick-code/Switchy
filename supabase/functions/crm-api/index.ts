// crm-api — admin CRM backend for the Switchy WhatsApp pipeline.
//
// One POST endpoint, dispatched by a {action} body. EVERY request must carry an
// Authorization: Bearer <supabase user access token> and pass the CRM-access gate
// (requireCrmAccess → 403). Access is GRADED (C.2): is_admin === true is the full
// superset; otherwise a crm_members row grants a role — `viewer` (read-only) or
// `rep` (read + operate leads/conversations). Each action declares a minimum
// capability (crm_roles.ts) enforced BEFORE dispatch; an unmapped action is
// admin-only (fail-closed). The crm_members table is empty until an admin grants
// a role, so this changes nothing for existing admins. All DB access is
// service-role via _shared/db.ts — the app/site never touch the whatsapp_* tables
// directly.
//
// Actions (see SHARED CONTRACT):
//   overview            → pipeline counts + recent conversations
//   slaMetrics          → speed-to-lead: median response + uncontacted/SLA-breach
//   listConversations   → filtered conversation list
//   getThread           → one conversation's contact + messages
//   sendReply           → store an out/rep message, best-effort Graph send
//                         (implicitly takes over: bot_enabled=false + crm_event)
//   takeOver            → human takes the conversation (bot_enabled=false, silent)
//   handBack            → return control to the AI bot (bot_enabled=true)
//   setContactStatus    → patch whatsapp_contacts.status
//   listContacts        → the WhatsApp-contact lifecycle list
//   setLeadStatus       → patch leads.status + lead_events audit row
//   listLeads           → the lead pipeline
//   listSellableLeads   → READ-ONLY consented-sharing feed (audited; no buyer push)
//   repLeaderboard      → per-rep performance (claimed/won/lost + booked saving)
//   listMeetings        → Zoom-booking list · getMeeting → detail + timeline
//   setMeetingStatus    → patch meetings.status + meeting_events audit row
//   listMembers         → the CRM roster + each member's role (admin-only)
//   setMemberRole       → grant/change/revoke a member's role (admin-only, audited,
//                         refuses self-change)
//
// takeOver/handBack flip whatsapp_conversations.bot_enabled — the single gate the
// whatsapp-webhook checks before any AI auto-reply — and append a crm_events row
// (the admin CRM streams that feed via Realtime). See supabase/crm-takeover-2026-06.sql.
//
// Errors are always JSON {error}: 401 (no/invalid token), 403 (not admin),
// 400 (bad shape), 500 (unexpected). 502 when a DB write fails.
//
// Deploy: supabase functions deploy crm-api   (JWT is verified by us, not the
// gateway — requireAdmin does the real check, so --no-verify-jwt is fine too).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { requireCrmAccess } from "../_shared/admin.ts";
import { canDo } from "../_shared/crm_roles.ts";
import { jlog } from "../_shared/log.ts";
import { s } from "./crm_logic.ts";
import { cors, json, type Row } from "./helpers.ts";
import {
  actGetThread,
  actHandBack,
  actListContacts,
  actListConversations,
  actSendReply,
  actSetContactStatus,
  actTakeOver,
} from "./actions_conversations.ts";
import {
  actAddNote,
  actClaimLead,
  actGetLeadDetail,
  actListLeads,
  actListSellableLeads,
  actRecordSaving,
  actRepLeaderboard,
  actSetLeadNote,
  actSetLeadStatus,
} from "./actions_leads.ts";
import { actGetMeeting, actListMeetings, actSetMeetingStatus } from "./actions_meetings.ts";
import { actListMembers, actSetMemberRole } from "./actions_members.ts";
import { actOverview, actSlaMetrics } from "./actions_overview.ts";

// Status sets, length caps, and the s/snippet/contactName helpers live in
// crm_logic.ts (imported above) so they can be unit-tested without booting the
// server — this is the single source of truth for those validation/formatting
// rules. See tests/crm_api_test.ts.

// ── HTTP ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors({ "Access-Control-Allow-Methods": "POST, OPTIONS" }) });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // CRM-access gate: requireCrmAccess distinguishes "no/invalid token" from
  // "no CRM access" only by returning null — so we re-derive the 401-vs-403
  // split: a present bearer that fails ⇒ 403, an absent bearer ⇒ 401. An admin
  // (is_admin) or a granted crm_members role (viewer/rep) resolves; anyone else
  // is refused exactly as under the old is_admin-only gate.
  const access = await requireCrmAccess(req);
  if (!access) {
    const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    const hasBearer = auth.toLowerCase().startsWith("bearer ") && auth.slice(7).trim().length > 0;
    return hasBearer
      ? json({ error: "אין הרשאת גישה למערכת" }, 403)
      : json({ error: "נדרשת התחברות" }, 401);
  }

  let body: Row;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: "בקשה לא תקינה" }, 400);
  }
  const action = s(body.action).trim();
  if (!action) return json({ error: "action חסר" }, 400);

  // C.2 per-action authorization: is_admin is the superset; a graded role
  // (viewer/rep) may reach ONLY the actions its capability set allows, and an
  // unmapped action is admin-only (fail-closed). This is the authoritative gate —
  // the console UI's show/hide is cosmetic; a hidden button called directly
  // still 403s here.
  if (!canDo(access.role, action)) {
    jlog({ at: "crm.forbidden", uid: access.uid, role: access.role, action });
    return json({ error: "אין הרשאה לפעולה זו" }, 403);
  }

  try {
    switch (action) {
      case "overview":
        return await actOverview();
      case "slaMetrics":
        return await actSlaMetrics();
      case "listConversations":
        return await actListConversations(body);
      case "getThread":
        return await actGetThread(body);
      case "sendReply":
        return await actSendReply(body, access.uid);
      case "takeOver":
        return await actTakeOver(body, access.uid);
      case "handBack":
        return await actHandBack(body, access.uid);
      case "setContactStatus":
        return await actSetContactStatus(body, access.uid);
      case "listContacts":
        return await actListContacts(body);
      case "setLeadStatus":
        return await actSetLeadStatus(body, access.uid);
      case "listLeads":
        return await actListLeads(body);
      case "getLeadDetail":
        return await actGetLeadDetail(body);
      case "listSellableLeads":
        return await actListSellableLeads(body, access.uid);
      case "addNote":
        return await actAddNote(body, access.uid);
      case "setLeadNote":
        return await actSetLeadNote(body, access.uid);
      case "recordSaving":
        return await actRecordSaving(body, access.uid);
      case "claimLead":
        return await actClaimLead(body, access.uid);
      case "repLeaderboard":
        return await actRepLeaderboard();
      case "listMeetings":
        return await actListMeetings(body);
      case "getMeeting":
        return await actGetMeeting(body);
      case "setMeetingStatus":
        return await actSetMeetingStatus(body, access.uid);
      case "listMembers":
        return await actListMembers();
      case "setMemberRole":
        return await actSetMemberRole(body, access.uid);
      default:
        return json({ error: `פעולה לא מוכרת: ${action}` }, 400);
    }
  } catch (e) {
    jlog({ at: "crm.dispatch", ok: false, action, error: String(e) });
    return json({ error: "אירעה שגיאה בשרת" }, 500);
  }
});
