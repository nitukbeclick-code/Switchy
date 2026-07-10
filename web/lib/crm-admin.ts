"use client";

// ────────────────────────────────────────────────────────────────────────────
// crm-admin.ts — the CRM management data layer. Talks ONLY to the crm-api edge
// function (the server authority), sending the signed-in admin's access token so
// requireAdmin() can verify profiles.is_admin server-side.
//
// SECURITY (the spine of the whole CRM): the browser NEVER reads `leads` /
// `whatsapp_*` / `lead_events` directly — the PR#107 lockdown hides every PII
// column (phone/email/notes/source_ip/actual_saving/consent_*) from the anon +
// authenticated keys. Every read AND write goes through crm-api, which runs as
// service_role behind the admin gate and returns only column-limited, PII-safe
// shapes. This module mirrors web/lib/community-admin.ts.
// ────────────────────────────────────────────────────────────────────────────

import { getBrowserSupabase } from "./supabase-browser";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase-public";

const FN = `${SUPABASE_URL}/functions/v1/crm-api`;

/** The lead pipeline stages (single source of truth mirrors crm_logic.LEAD_STATUSES). */
export type LeadStatus = "new" | "contacted" | "won" | "lost";
export const LEAD_STATUSES: readonly LeadStatus[] = ["new", "contacted", "won", "lost"];

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
  status: LeadStatus;
  createdAt: string | null;
  claimedBy: string | null;
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
  return crmPost<{ reps: RepStat[]; sampled: number; capped: boolean }>("repLeaderboard");
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

// POST {action,...payload} to crm-api and return the parsed JSON body, or null on
// ANY failure (no session / not admin / network / non-2xx). Never throws — the UI
// render-gates on is_admin for UX and treats null as "couldn't load".
async function crmPost<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  const h = await authHeaders();
  if (!h) return null;
  try {
    const r = await fetch(FN, { method: "POST", headers: h, body: JSON.stringify({ action, ...payload }) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Pipeline counts (by lead status) + the most recent conversations. */
export function fetchCrmOverview(): Promise<CrmOverview | null> {
  return crmPost<CrmOverview>("overview");
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
export function fetchCrmSla(): Promise<{ sla: CrmSla } | null> {
  return crmPost<{ sla: CrmSla }>("slaMetrics");
}

export type LeadSort = "recent" | "oldest";

/** The lead pipeline (≤200), optionally filtered to one status, a name/phone
 *  search, and a created-at sort direction. */
export function fetchCrmLeads(
  opts?: { status?: LeadStatus; search?: string; sort?: LeadSort },
): Promise<{ leads: CrmLead[] } | null> {
  return crmPost<{ leads: CrmLead[] }>("listLeads", {
    ...(opts?.status ? { status: opts.status } : {}),
    ...(opts?.search ? { search: opts.search } : {}),
    ...(opts?.sort === "oldest" ? { sort: "oldest" } : {}),
  });
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
  status: LeadStatus;
  createdAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  contactedAt: string | null;
  actualSaving: number | null;
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

/** One lead's full CRM detail + its activity timeline, or null on failure. */
export function fetchCrmLeadDetail(
  leadId: string,
): Promise<{ lead: CrmLeadDetail; events: CrmLeadEvent[] } | null> {
  return crmPost<{ lead: CrmLeadDetail; events: CrmLeadEvent[] }>("getLeadDetail", { leadId });
}

/** Move a lead to a new pipeline stage (server validates + audits). true on success. */
export async function setCrmLeadStatus(leadId: string, status: LeadStatus): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("setLeadStatus", { leadId, status });
  return !!res?.ok;
}

/** Append a note to the lead's activity timeline. */
export async function addCrmNote(leadId: string, note: string): Promise<boolean> {
  const res = await crmPost<{ ok?: boolean }>("addNote", { leadId, note });
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

/** Upcoming-first meeting list, optionally filtered to one status. */
export function fetchCrmMeetings(opts?: { status?: MeetingStatus }): Promise<{ meetings: CrmMeeting[] } | null> {
  return crmPost<{ meetings: CrmMeeting[] }>("listMeetings", {
    ...(opts?.status ? { status: opts.status } : {}),
  });
}

/** One meeting's full detail + its status timeline. */
export function fetchCrmMeetingDetail(
  meetingId: string,
): Promise<{ meeting: CrmMeetingDetail; events: CrmMeetingEvent[] } | null> {
  return crmPost<{ meeting: CrmMeetingDetail; events: CrmMeetingEvent[] }>("getMeeting", { meetingId });
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

/** The WhatsApp-contact lifecycle list, optionally filtered by status + search. */
export function fetchCrmContacts(
  opts?: { status?: ContactStatus; search?: string },
): Promise<{ contacts: CrmContact[] } | null> {
  return crmPost<{ contacts: CrmContact[] }>("listContacts", {
    ...(opts?.status ? { status: opts.status } : {}),
    ...(opts?.search ? { search: opts.search } : {}),
  });
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
): Promise<{ conversations: CrmConversation[] } | null> {
  return crmPost<{ conversations: CrmConversation[] }>("listConversations", {
    ...(opts?.status ? { status: opts.status } : {}),
    ...(opts?.search ? { search: opts.search } : {}),
  });
}

/** One conversation: the contact + its ordered messages (oldest→newest). */
export function fetchCrmThread(conversationId: string): Promise<CrmThread | null> {
  return crmPost<CrmThread>("getThread", { conversationId });
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
    return (await r.json()) as AdminMetrics;
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
    return (await r.json()) as RepBriefResult;
  } catch {
    return null;
  }
}
