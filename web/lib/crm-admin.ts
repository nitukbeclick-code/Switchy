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

/** The lead pipeline (newest first, ≤200), optionally filtered to one status. */
export function fetchCrmLeads(status?: LeadStatus): Promise<{ leads: CrmLead[] } | null> {
  return crmPost<{ leads: CrmLead[] }>("listLeads", status ? { status } : {});
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
