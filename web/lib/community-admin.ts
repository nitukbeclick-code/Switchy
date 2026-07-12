"use client";

// ────────────────────────────────────────────────────────────────────────────
// community-admin.ts — the admin moderation data layer. Talks ONLY to the
// community-admin edge function (server authority), sending the signed-in user's
// access token so requireAdmin() can verify is_admin server-side. The browser
// never reads community_reports or mutates others' content directly (RLS forbids
// it) — everything routes through the edge fn + its SECURITY DEFINER RPCs.
// ────────────────────────────────────────────────────────────────────────────

import { getBrowserSupabase } from "./supabase-browser";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-public";

const FN = `${SUPABASE_URL}/functions/v1/community-admin`;

export interface ModReport {
  id: string;
  target_type: "post" | "reply";
  target_id: string;
  reporter_user_id: string;
  body: string | null;
  created_at: string;
}
export interface ModPost {
  id: string;
  user_id: string;
  author: string;
  channel: string;
  body: string;
  moderation_note: string | null;
  created_at: string;
  /** How many OPEN reports point at this post — server-side enrichment (additive;
   *  absent when the enrichment read failed, so 0 is never faked). */
  reportCount?: number;
  /** The author is currently banned (profiles.is_banned) — server-side enrichment. */
  authorBanned?: boolean;
}
export interface ModReply {
  id: string;
  post_id: string;
  user_id: string;
  author: string;
  body: string;
  created_at: string;
  /** See ModPost.reportCount. */
  reportCount?: number;
  /** See ModPost.authorBanned. */
  authorBanned?: boolean;
}
export interface ModerationQueue {
  reports: ModReport[];
  flaggedPosts: ModPost[];
  flaggedReplies: ModReply[];
}

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

/** The moderation queue (open reports + flagged posts/replies), or null if not an
 *  admin / not signed in / the call failed. */
export async function fetchModerationQueue(): Promise<ModerationQueue | null> {
  const h = await authHeaders();
  if (!h) return null;
  try {
    const r = await fetch(FN, { headers: h });
    if (!r.ok) return null;
    return (await r.json()) as ModerationQueue;
  } catch {
    return null;
  }
}

async function action(payload: Record<string, unknown>): Promise<boolean> {
  const h = await authHeaders();
  if (!h) return false;
  try {
    const r = await fetch(FN, { method: "POST", headers: h, body: JSON.stringify(payload) });
    return r.ok;
  } catch {
    return false;
  }
}

export function moderateContent(
  table: "community_posts" | "community_replies",
  id: string,
  act: "approve" | "remove",
  note?: string,
): Promise<boolean> {
  return action({ action: act, table, id, note });
}
export function setBan(userId: string, banned: boolean): Promise<boolean> {
  return action({ action: banned ? "ban" : "unban", userId });
}
export function resolveReport(
  reportId: string,
  status: "resolved" | "dismissed",
  resolution?: string,
): Promise<boolean> {
  return action({ action: status === "resolved" ? "resolve" : "dismiss", reportId, resolution });
}
