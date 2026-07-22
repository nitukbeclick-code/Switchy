"use client";

// ────────────────────────────────────────────────────────────────────────────
// crm-admin.ts — the CRM management data layer. Talks ONLY to the crm-api edge
// function (the server authority), sending the signed-in member's access token so
// requireCrmAccess() (admin / viewer / rep, fail-closed) can authorize every
// action server-side and canDo() can gate each one per role.
//
// SECURITY (the spine of the whole CRM): the browser NEVER reads `leads` /
// `whatsapp_*` / `lead_events` directly — the PR#107 lockdown hides every PII
// column (phone/email/notes/source_ip/actual_saving/consent_*) from the anon +
// authenticated keys. Every read AND write goes through crm-api, which runs as
// service_role behind the access gate and returns only column-limited, PII-safe
// shapes. This module mirrors web/lib/community-admin.ts.
// ────────────────────────────────────────────────────────────────────────────

import { getBrowserSupabase } from "./supabase-browser";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-public";

const FN = `${SUPABASE_URL}/functions/v1/crm-api`;

/** The lead pipeline stages (single source of truth mirrors crm_logic.LEAD_STATUSES). */
export type LeadStatus = "new" | "contacted" | "won" | "lost";
export const LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "won", "lost"];

/** Narrow an arbitrary wire string to a known pipeline stage. The wire type is
 *  deliberately `string` (a server can add a stage before the console updates);
 *  narrow with this before indexing stage-keyed maps. */
export function isLeadStatus(v: string | null | undefined): v is LeadStatus {
  return !!v && (LEAD_STATUSES as readonly string[]).includes(v);
}

export type LeadPriority = "low" | "normal" | "high" | "urgent";
export const LEAD_PRIORITIES: readonly LeadPriority[] = ["low", "normal", "high", "urgent"];

export function isLeadPriority(v: string | null | undefined): v is LeadPriority {
  return !!v && (LEAD_PRIORITIES as readonly string[]).includes(v);
}

export interface CrmPipeline {
  new: number;
  contacted: number;
  won: number;
  lost: number;
}

export interface CrmRecentConversation {
  conversationId: string;
  contactId: string;
  name: string;
  phone: string;
  status: string;
  lastSnippet: string;
  lastAt: string | null;
}

export interface CrmOverview {
  pipeline: CrmPipeline;
  recent: CrmRecentConversation[];
}

export interface CrmLead {
  id: string;
  name: string;
  phone: string;
  provider: string | null;
  source: string | null;
  status: string; // wire-wide: narrow with isLeadStatus before keying stage maps
  createdAt: string | null;
  claimedBy: string | null;
  priority: string;
  followUpAt: string | null;
  nextBestAction?: CrmNextBestAction | null;
}

export interface CrmNextBestAction {
  code: "overdue_follow_up" | "sla_breach" | "urgent" | "high_priority";
  reason: string;
  action: string;
  score: number;
}

export interface RepStat {
  rep: string;
  claimed: number;
  won: number;
  lost: number;
  totalSaving: number;
}

/** Per-rep performance leaderboard (claimed / won / lost + real booked saving). */
export function fetchRepLeaderboard(): Promise<{ reps: RepStat[]; sampled: number; capped: boolean } | null> {
  return crmRead<{ reps: RepStat[]; sampled: number; capped: boolean }>("repLeaderboard", {}, (j) =>
    hasArray(j, "reps"),
  ).then((r) => r.data);
}

// Bearer + apikey headers from the live browser session, or null when there is no
// session (not signed in) so callers can fail soft without a network round-trip.
async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await getBrowserSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// A usable edge-function body is always a plain JSON object ({ ok }, { leads },
// { sla }, …). Any other 2xx shape (null / array / string / number — e.g. after
// a contract drift or deploy skew) must degrade into the callers' existing
// null → "couldn't load" path instead of blind-casting and crashing a component
// that dereferences a missing field.
function isJsonObject(j: unknown): j is Record<string, unknown> {
  return typeof j === "object" && j !== null && !Array.isArray(j);
}

/** Shape-guard helper: `key` is present and is an array. Extra/unknown fields on
 *  the body are deliberately tolerated (the server adds fields additively). */
export function hasArray(j: Record<string, unknown>, key: string): boolean {
  return Array.isArray(j[key]);
}

/** Shape-guard helper: `key` is present and is a plain object. */
export function hasObject(j: Record<string, unknown>, key: string): boolean {
  return isJsonObject(j[key]);
}

// ── Typed failures ────────────────────────────────────────────────────────────

/** Why a CRM fetch failed — typed so the console can show the real reason (in
 *  Hebrew) instead of a generic "couldn't load", and can suppress the retry
 *  button when retrying cannot help (401/403). */
export interface CrmFailure {
  /** HTTP status; 0 = network error / thrown fetch, 401 also covers "no session". */
  status: number;
  /** Display-ready Hebrew message (server-supplied detail folded in when present). */
  message: string;
  /** false on 401/403 — an immediate retry can never succeed. */
  retryable: boolean;
}

/** A fetch outcome: data XOR a typed failure (never both, never neither). */
export type CrmFetch<T> = { data: T; failure: null } | { data: null; failure: CrmFailure };

const NO_SESSION_FAILURE: CrmFailure = {
  status: 401,
  message: "נדרשת התחברות כדי לצפות בקונסולה.",
  retryable: false,
};

const NETWORK_FAILURE: CrmFailure = {
  status: 0,
  message: "שגיאת רשת — לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.",
  retryable: true,
};

const BAD_SHAPE_FAILURE: CrmFailure = {
  status: 200,
  message: "השרת החזיר תשובה בלתי צפויה. ייתכן שגרסת הקונסולה אינה מעודכנת — רעננו את הדף.",
  retryable: true,
};

/** Map a non-2xx response (+ its parsed body, when it is JSON) to a CrmFailure.
 *  401/403 get fixed Hebrew copy and are non-retryable; anything else surfaces
 *  the server's own message when one exists. */
function failureFor(status: number, body: unknown): CrmFailure {
  if (status === 401) {
    return { status, message: "פג תוקף ההתחברות. התחברו מחדש כדי להמשיך.", retryable: false };
  }
  if (status === 403) {
    return { status, message: "אין לך הרשאה לפעולה הזו.", retryable: false };
  }
  let detail: string | null = null;
  if (isJsonObject(body)) {
    if (typeof body.error === "string" && body.error) detail = body.error;
    else if (typeof body.message === "string" && body.message) detail = body.message;
  }
  return {
    status,
    message: detail ? `הבקשה נכשלה: ${detail}` : `הבקשה נכשלה (שגיאת שרת ${status}). נסו שוב.`,
    retryable: true,
  };
}

// POST {action,...payload} to crm-api and return a typed outcome. Never throws.
// A 2xx body must be a plain JSON object AND pass the caller's shape `guard`
// (when given) — otherwise it degrades to a BAD_SHAPE failure instead of
// blind-casting and crashing a component that dereferences a missing field.
async function crmRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
  guard?: (j: Record<string, unknown>) => boolean,
): Promise<CrmFetch<T>> {
  const h = await authHeaders();
  if (!h) return { data: null, failure: NO_SESSION_FAILURE }; // no network round-trip
  try {
    const r = await fetch(FN, { method: "POST", headers: h, body: JSON.stringify({ action, ...payload }) });
    let j: unknown = null;
    try {
      j = await r.json();
    } catch {
      j = null;
    }
    if (!r.ok) return { data: null, failure: failureFor(r.status, j) };
    if (!isJsonObject(j) || (guard && !guard(j))) return { data: null, failure: BAD_SHAPE_FAILURE };
    return { data: j as T, failure: null };
  } catch {
    return { data: null, failure: NETWORK_FAILURE };
  }
}

// ── In-flight dedupe (READS only) ─────────────────────────────────────────────
//
// Several console views fire the same read at the same moment (e.g. a Realtime
// event refreshing the dashboard AND the inbox list). Identical in-flight reads
// share one request; entries clear as soon as the promise settles, so this is a
// coalescer, never a cache — no response is ever served stale.
//
// WRITES are never deduped (each must hit the server), and `listSellableLeads`
// is deliberately EXCLUDED even though it is a read: every call to it writes a
// crm_lead_export audit row server-side, and coalescing would under-count the
// audited views of that controlled §7b surface.
const DEDUPED_READS = new Set([
  "overview",
  "slaMetrics",
  "listLeads",
  "attentionLeads",
  "getLeadDetail",
  "listMeetings",
  "getMeeting",
  "listContacts",
  "listConversations",
  "getThread",
  "listMembers",
  "repLeaderboard",
]);

const inFlight = new Map<string, Promise<CrmFetch<unknown>>>();

/** A read through crmRequest, coalescing identical in-flight calls (see above). */
function crmRead<T>(
  action: string,
  payload: Record<string, unknown> = {},
  guard?: (j: Record<string, unknown>) => boolean,
): Promise<CrmFetch<T>> {
  if (!DEDUPED_READS.has(action)) return crmRequest<T>(action, payload, guard);
  const key = `${action}:${JSON.stringify(payload)}`;
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<CrmFetch<T>>;
  const p = crmRequest<T>(action, payload, guard).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, p as Promise<CrmFetch<unknown>>);
  return p;
}

// POST a WRITE (or a legacy null-contract read) and return the parsed JSON body,
// or null on ANY failure (no session / no access / network / non-2xx / bad shape).
// Never throws — the UI render-gates on is_admin for UX and treats null as
// "couldn't load" / "failed".
function crmPost<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  return crmRequest<T>(action, payload).then((r) => r.data);
}

/** Pipeline counts (by lead status) + the most recent conversations. */
export function fetchCrmOverview(): Promise<CrmFetch<CrmOverview>> {
  // Shape guard: the dashboard dereferences pipeline/recent unguarded, so an
  // unexpected 2xx body must land in its existing failure → retry state.
  return crmRead<CrmOverview>("overview", {}, (j) => hasObject(j, "pipeline") && hasArray(j, "recent"));
}

export interface CrmSla {
  slaHours: number;
  uncontacted: number; // new leads with no contacted_at
  breaching: number; // of those, waiting longer than slaHours
  oldestUncontactedAt: string | null;
  medianResponseMinutes: number | null; // median created_at → contacted_at
  responseSampleSize: number;
}

/** Speed-to-lead health: median first-response time + uncontacted / SLA-breach counts. */
export function fetchCrmSla(): Promise<CrmFetch<{ sla: CrmSla }>> {
  return crmRead<{ sla: CrmSla }>("slaMetrics", {}, (j) => hasObject(j, "sla"));
}

export type LeadSort = "recent" | "oldest";

/** The lead pipeline (≤200), optionally filtered to one status, a name/phone
 *  search, and a created-at sort direction. `hasMore` is the server's
 *  authoritative "the table continues past this window" flag (computed on the
 *  raw window, before the search filter) — use it, not `leads.length >= 200`,
 *  to decide whether an export is partial. */
export function fetchCrmLeads(
  opts?: { status?: LeadStatus; search?: string; sort?: LeadSort },
): Promise<CrmFetch<{ leads: CrmLead[]; hasMore: boolean }>> {
  return crmRead<{ leads: CrmLead[]; hasMore: boolean }>(
    "listLeads",
    {
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.search ? { search: opts.search } : {}),
      ...(opts?.sort === "oldest" ? { sort: "oldest" } : {}),
    },
    (j) => hasArray(j, "leads"),
  );
}

export interface CrmAttentionSummary {
  total: number;
  overdueFollowUps: number;
  highPriority: number;
  slaBreaches: number;
}

export interface CrmAttentionQueue {
  leads: CrmLead[];
  summary: CrmAttentionSummary;
  hasMore: boolean;
  asOf: string;
}

/** Targeted due / urgent / SLA queue. Unlike listLeads, this is assembled from
 * the attention predicates on the server and cannot miss rows outside a generic
 * 200-lead chronological window. */
export function fetchCrmAttentionLeads(): Promise<CrmFetch<CrmAttentionQueue>> {
  return crmRead<CrmAttentionQueue>(
    "attentionLeads",
    {},
    (j) => hasArray(j, "leads") && hasObject(j, "summary"),
  );
}

// ── Sellable leads (third-party-sharing feed — read-only, audited) ─────────────

export interface CrmSellableLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  provider: string | null;
  source: string | null;
  status: string;
  consentShareAt: string | null;
  createdAt: string | null;
}

/** The READ-ONLY consented-sharing feed: ONLY leads with an explicit
 *  consent_share_at (the exporter's legal gate). Every call is audited server-side
 *  (crm_lead_export) — which is why this read is NEVER deduped/coalesced. This
 *  never pushes anything to a buyer. */
export function fetchSellableLeads(opts?: { status?: LeadStatus }): Promise<{ leads: CrmSellableLead[] } | null> {
  return crmRequest<{ leads: CrmSellableLead[] }>(
    "listSellableLeads",
    {
      ...(opts?.status ? { status: opts.status } : {}),
    },
    (j) => hasArray(j, "leads"),
  ).then((r) => r.data);
}

// ── CRM members (per-rep roles — C.2, admin-only) ─────────────────────────────

/** The storable CRM roles below the is_admin superset (mirrors crm_roles.ts). */
export type CrmRole = "viewer" | "rep";

export interface CrmMember {
  uid: string;
  role: string; // "viewer" | "rep"
  name: string | null;
  email: string | null;
  grantedAt: string | null;
}

/** The CRM roster (admin-only). Each row is a member's uid + their graded role +
 *  their own name/email — no other profile field is exposed (server allowlist). */
export function fetchMembers(): Promise<{ members: CrmMember[] } | null> {
  return crmRead<{ members: CrmMember[] }>("listMembers", {}, (j) => hasArray(j, "members")).then((r) => r.data);
}

/** Grant/change a member's role, or revoke it (role="none"). Admin-only, audited
 *  server-side; the server refuses a self-change. Returns true on success. */
export async function setCrmMemberRole(uid: string, role: CrmRole | "none"): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setMemberRole", { uid, role });
  return !!res?.ok;
}

export interface CrmLeadDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  provider: string | null;
  planId: string | null;
  source: string | null;
  callbackTime: string | null;
  city: string | null;
  status: string; // wire-wide: narrow with isLeadStatus before keying stage maps
  createdAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  contactedAt: string | null;
  actualSaving: number | null;
  priority: string;
  followUpAt: string | null;
  followUpNote: string | null;
  lostReason: string | null;
  notes: string | null;
  referrerCode: string | null;
  consent: { sms: boolean; email: boolean; whatsapp: boolean };
}

export interface CrmLeadEvent {
  id: string;
  event: string;
  oldStatus: string | null;
  newStatus: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string | null;
}

/** One lead's full CRM detail + its activity timeline. */
export function fetchCrmLeadDetail(
  leadId: string,
): Promise<CrmFetch<{ lead: CrmLeadDetail; events: CrmLeadEvent[] }>> {
  return crmRead<{ lead: CrmLeadDetail; events: CrmLeadEvent[] }>(
    "getLeadDetail",
    { leadId },
    (j) => hasObject(j, "lead") && hasArray(j, "events"),
  );
}

/** Move a lead to a new pipeline stage (server validates + audits). true on success. */
export async function setCrmLeadStatus(
  leadId: string,
  status: LeadStatus,
  lostReason?: string,
): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setLeadStatus", {
    leadId,
    status,
    ...(lostReason ? { lostReason } : {}),
  });
  return !!res?.ok;
}

export interface LeadWorkflowInput {
  priority: LeadPriority;
  followUpAt: string | null;
  followUpNote: string;
  lostReason: string;
}

/** Save priority, next action and disposition context through the audited CRM API. */
export async function setCrmLeadWorkflow(
  leadId: string,
  workflow: LeadWorkflowInput,
): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setLeadWorkflow", {
    leadId,
    ...workflow,
  });
  return !!res?.ok;
}

/** Append a note to the lead's activity timeline. */
export async function addCrmNote(leadId: string, note: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("addNote", { leadId, note });
  return !!res?.ok;
}

/** Overwrite the lead's primary notes field (the edit is recorded on the timeline). */
export async function setCrmLeadNote(leadId: string, note: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setLeadNote", { leadId, note });
  return !!res?.ok;
}

/** The won-flow: record the real annual saving (₪/year) and close the lead (→ won). */
export async function recordCrmSaving(leadId: string, annualSaving: number): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("recordSaving", { leadId, annualSaving });
  return !!res?.ok;
}

/** Assign the lead to a named rep (claimed_by + timestamp). */
export async function claimCrmLead(leadId: string, rep: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("claimLead", { leadId, rep });
  return !!res?.ok;
}

// ── Meetings (Zoom bookings) ────────────────────────────────────────────────

/** Meeting lifecycle status (mirrors crm_logic.MEETING_STATUSES / meetings.status). */
export type MeetingStatus = "pending" | "confirmed" | "no_rep" | "cancelled" | "expired" | "completed";
export const MEETING_STATUSES: readonly MeetingStatus[] = [
  "pending",
  "confirmed",
  "no_rep",
  "cancelled",
  "expired",
  "completed",
];

/** Narrow an arbitrary wire string to a known meeting lifecycle status. */
export function isMeetingStatus(v: string | null | undefined): v is MeetingStatus {
  return !!v && (MEETING_STATUSES as readonly string[]).includes(v);
}

export interface CrmMeeting {
  id: string;
  name: string;
  phone: string;
  provider: string | null;
  meetingDate: string | null;
  slot: string | null;
  startsAt: string | null;
  status: string;
  source: string | null;
  claimedBy: string | null;
}

export interface CrmMeetingDetail {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  provider: string | null;
  planId: string | null;
  meetingDate: string | null;
  slot: string | null;
  startsAt: string | null;
  status: string;
  joinUrl: string | null;
  zoomMeetingId: string | null;
  notes: string | null;
  source: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  confirmedAt: string | null;
  createdAt: string | null;
}

export interface CrmMeetingEvent {
  id: string;
  event: string;
  oldStatus: string | null;
  newStatus: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string | null;
}

/** Upcoming-first meeting list (server order: starts_at.desc.nullslast — the
 *  furthest-future bookings first), optionally filtered to one status. The
 *  server caps `limit` at 200 (LIST_LIMIT) and has no date filter / ascending
 *  option, so `limit`+`offset` are the only levers for paging the window;
 *  `hasMore` reports whether the table continues past this page (used to page
 *  toward "today" in the dashboard strip, and to label a partial CSV export). */
export function fetchCrmMeetings(
  opts?: { status?: MeetingStatus; limit?: number; offset?: number },
): Promise<{ meetings: CrmMeeting[]; hasMore: boolean } | null> {
  return crmRead<{ meetings: CrmMeeting[]; hasMore: boolean }>(
    "listMeetings",
    {
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.limit != null ? { limit: opts.limit } : {}),
      ...(opts?.offset != null ? { offset: opts.offset } : {}),
    },
    (j) => hasArray(j, "meetings"),
  ).then((r) => r.data);
}

/** One meeting's full detail + its status timeline. Returns the full
 *  {data,failure} shape (like fetchCrmLeadDetail) so the drawer can show the
 *  server's real error message and hide "retry" on a non-retryable failure,
 *  instead of a single generic string for every kind of load failure. */
export function fetchCrmMeetingDetail(
  meetingId: string,
): Promise<CrmFetch<{ meeting: CrmMeetingDetail; events: CrmMeetingEvent[] }>> {
  return crmRead<{ meeting: CrmMeetingDetail; events: CrmMeetingEvent[] }>(
    "getMeeting",
    { meetingId },
    (j) => hasObject(j, "meeting") && hasArray(j, "events"),
  );
}

/** Move a meeting to a new lifecycle status (server validates + audits). */
export async function setCrmMeetingStatus(meetingId: string, status: MeetingStatus): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setMeetingStatus", { meetingId, status });
  return !!res?.ok;
}

// ── Contacts (WhatsApp lifecycle) ───────────────────────────────────────────

/** Contact lifecycle status (mirrors crm_logic.CONTACT_STATUSES). */
export type ContactStatus = "new" | "active" | "qualified" | "handed_off" | "won" | "lost" | "blocked";
export const CONTACT_STATUSES: readonly ContactStatus[] = [
  "new",
  "active",
  "qualified",
  "handed_off",
  "won",
  "lost",
  "blocked",
];

export interface CrmContact {
  id: string;
  name: string;
  phone: string;
  status: string;
  leadId: string | null;
  lastMessageAt: string | null;
}

/** The WhatsApp-contact lifecycle list, optionally filtered by status + search.
 *  `hasMore` is the server's authoritative "the table continues past this
 *  window" flag (pre-search) — use it, not `contacts.length >= 200`, to decide
 *  whether an export is partial. */
export function fetchCrmContacts(
  opts?: { status?: ContactStatus; search?: string },
): Promise<{ contacts: CrmContact[]; hasMore: boolean } | null> {
  return crmRead<{ contacts: CrmContact[]; hasMore: boolean }>(
    "listContacts",
    {
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.search ? { search: opts.search } : {}),
    },
    (j) => hasArray(j, "contacts"),
  ).then((r) => r.data);
}

/** Move a contact to a new lifecycle status (server validates + audits). */
export async function setCrmContactStatus(contactId: string, status: ContactStatus): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setContactStatus", { contactId, status });
  return !!res?.ok;
}

// ── WhatsApp inbox ────────────────────────────────────────────────────────────

/** Conversation lifecycle status (mirrors crm_logic.CONVERSATION_STATUSES). */
export type ConversationStatus = "open" | "bot" | "human" | "closed";
export const CONVERSATION_STATUSES: readonly ConversationStatus[] = ["open", "bot", "human", "closed"];

export interface CrmConversation {
  conversationId: string;
  contactId: string;
  name: string;
  phone: string;
  status: string;
  intent: string | null;
  lastSnippet: string;
  lastAt: string | null;
  leadStatus: string | null;
}

export interface CrmMessage {
  id: string;
  direction: string; // "in" | "out"
  actor: string; // "customer" | "bot" | "rep"
  body: string;
  createdAt: string | null;
}

export interface CrmThreadContact {
  id: string;
  name: string;
  phone: string;
  status: string;
  leadId: string | null;
  leadStatus: string | null;
}

export interface CrmThread {
  contact: CrmThreadContact;
  messages: CrmMessage[];
}

/** The conversation list, optionally filtered by status + a free-text name/phone search. */
export function fetchCrmConversations(
  opts?: { status?: ConversationStatus; search?: string },
): Promise<CrmFetch<{ conversations: CrmConversation[] }>> {
  return crmRead<{ conversations: CrmConversation[] }>(
    "listConversations",
    {
      ...(opts?.status ? { status: opts.status } : {}),
      ...(opts?.search ? { search: opts.search } : {}),
    },
    (j) => hasArray(j, "conversations"),
  );
}

/** One conversation: the contact + its ordered messages (oldest→newest). */
export function fetchCrmThread(conversationId: string): Promise<CrmFetch<CrmThread>> {
  return crmRead<CrmThread>(
    "getThread",
    { conversationId },
    (j) => hasObject(j, "contact") && hasArray(j, "messages"),
  );
}

/** Send a rep reply. This IMPLICITLY takes the conversation over from the bot. */
export async function sendCrmReply(conversationId: string, body: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("sendReply", { conversationId, body });
  return !!res?.ok;
}

/** Take a conversation off the bot (human handling); optional rep display name. */
export async function crmTakeOver(conversationId: string, rep?: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("takeOver", {
    conversationId,
    ...(rep ? { rep } : {}),
  });
  return !!res?.ok;
}

/** Return a conversation to the AI bot. */
export async function crmHandBack(conversationId: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("handBack", { conversationId });
  return !!res?.ok;
}

// ── Analytics (admin-metrics) ─────────────────────────────────────────────────

const METRICS_FN = `${SUPABASE_URL}/functions/v1/admin-metrics`;

export interface MetricRate {
  key: string;
  calls: number;
  ok: number;
  rate: number; // 0..1
}

export interface MetricEventSeries {
  event: string;
  total: number;
  days: { day: string; events: number }[];
}

export interface AdminMetrics {
  ok: boolean;
  window: { days: number; since: string };
  analytics: { events: MetricEventSeries[]; total: number };
  toolCalls: { total: number; ok: number; rate: number; byTool: MetricRate[]; byChannel: MetricRate[] };
  audit: { total: number; byEvent: { event: string; count: number }[] };
  cron: { ok: boolean; known: number; stale: string[]; failing: string[] };
}

/** Admin observability rollup over a trailing window (GET admin-metrics?days=). */
export async function fetchAdminMetrics(days = 7): Promise<AdminMetrics | null> {
  const h = await authHeaders();
  if (!h) return null;
  try {
    const r = await fetch(`${METRICS_FN}?days=${days}`, { headers: h });
    if (!r.ok) return null;
    const j: unknown = await r.json();
    // Shape guard: the analytics tab dereferences all four sections unguarded.
    if (!isJsonObject(j) || !j.analytics || !j.toolCalls || !j.audit || !j.cron) return null;
    return j as unknown as AdminMetrics;
  } catch {
    return null;
  }
}

// ── Rep call-brief (rep-brief) ────────────────────────────────────────────────

const REP_BRIEF_FN = `${SUPABASE_URL}/functions/v1/rep-brief`;

export interface RepBriefPlan {
  provider: string;
  name: string;
  price: number;
  unitLabel: string;
  annualSaving: number;
  abroad: boolean;
  is5G: boolean;
  noCommit: boolean;
}

export interface RepBriefResult {
  need: { category: string; categoryHe: string; budget: number; provider: string; abroad: boolean };
  plans: RepBriefPlan[];
  talkingPoints: string[];
  objections: { objection: string; answer: string }[];
  compliance: { law: string; mustSay: string }[];
  brief: string; // the deterministic, copy-paste brief
  narrative: string | null; // optional AI rephrasing of the SAME brief
}

/** A grounded Hebrew call-brief for a lead (talking points, objections, §7b/§30A). */
export async function fetchRepBrief(leadId: string): Promise<RepBriefResult | null> {
  const h = await authHeaders();
  if (!h) return null;
  try {
    const r = await fetch(REP_BRIEF_FN, { method: "POST", headers: h, body: JSON.stringify({ lead_id: leadId }) });
    if (!r.ok) return null;
    const j: unknown = await r.json();
    // Shape guard: the brief card maps over these arrays unguarded.
    if (
      !isJsonObject(j) ||
      !j.need ||
      !Array.isArray(j.plans) ||
      !Array.isArray(j.talkingPoints) ||
      !Array.isArray(j.objections) ||
      !Array.isArray(j.compliance)
    ) {
      return null;
    }
    return j as unknown as RepBriefResult;
  } catch {
    return null;
  }
}
