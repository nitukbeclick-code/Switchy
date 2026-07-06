// ────────────────────────────────────────────────────────────────────────────
// community.ts — the typed data layer for the web community.
//
// The ONLY place the web community talks to Supabase. Every write goes through the
// session-persisting browser client (lib/supabase-browser) so RLS sees the user's
// JWT (auth.uid() = user_id) — components never touch supabase directly, which
// keeps the security surface in one reviewed file. Reuses the EXISTING backend:
// community_posts / community_replies / post_likes / post_bookmarks /
// community_reports / community_notifications / community_blocks + the
// `community-media` storage bucket + the community_feed view. The community-moderate
// and community-notify triggers fire automatically on insert — nothing to call.
//
// Contract for the UI components (they import these types + functions only).
// ────────────────────────────────────────────────────────────────────────────

import { getBrowserSupabase } from "./supabase-browser";

export type MediaType = "image" | "video" | "audio";

/** The 8 community channels — the post's `channel` column stores the Hebrew label
 *  verbatim (matches the app + static site). `הכל` is the "all" filter, never stored. */
export const CHANNELS = [
  "המלצות",
  "סלולר",
  "אינטרנט",
  "טלוויזיה",
  "חו״ל",
  "חבילה משולבת",
  "עזרה בניתוק",
] as const;
export type Channel = (typeof CHANNELS)[number];
export const ALL_CHANNEL = "הכל";

export interface Media {
  type: MediaType;
  url: string;
  durationMs?: number | null;
}

export interface CommunityPost {
  id: string;
  user_id: string;
  author: string;
  avatar: string | null;
  channel: string;
  body: string;
  media_type: MediaType | null;
  media_url: string | null;
  media_duration_ms: number | null;
  created_at: string;
  is_flagged: boolean;
  moderation_note: string | null;
  like_count: number;
  reply_count: number;
}

export interface CommunityReply {
  id: string;
  post_id: string;
  user_id: string;
  author: string;
  avatar: string | null;
  body: string;
  media_type: MediaType | null;
  media_url: string | null;
  media_duration_ms: number | null;
  created_at: string;
  is_flagged: boolean;
}

export interface CommunityNotification {
  id: number;
  user_id: string;
  kind: "reply" | "mention" | "flag";
  post_id: string | null;
  reply_id: string | null;
  actor: string | null;
  read_at: string | null;
  created_at: string;
}

/** Author identity attached to a new post/reply — resolved from the profile. */
export interface AuthorRef {
  user_id: string;
  author: string;
  avatar: string | null;
}

export interface NewContent {
  body: string;
  media?: Media | null;
}

const FEED_COLS =
  "id,user_id,author,avatar,channel,body,media_type,media_url,media_duration_ms,created_at,is_flagged,moderation_note,like_count,reply_count";
const REPLY_COLS =
  "id,post_id,user_id,author,avatar,body,media_type,media_url,media_duration_ms,created_at,is_flagged";

export const MAX_BODY = 4000;

// ── Feed ─────────────────────────────────────────────────────────────────────

export interface FeedQuery {
  channel?: Channel | typeof ALL_CHANNEL;
  /** created_at cursor for "load older" (exclusive). */
  before?: string | null;
  limit?: number;
  /** exclude posts authored by these user ids (the viewer's block list). */
  blocked?: string[];
  /** the viewer, so their own flagged posts stay visible to them ("under review"). */
  viewerId?: string | null;
}

/** A page of feed posts, newest first. Public rows are readable with the anon key;
 *  flagged rows are hidden by RLS-independent filtering here (is_flagged=false) EXCEPT
 *  the viewer's own (shown with an "under review" note). */
export async function fetchFeed(q: FeedQuery = {}): Promise<CommunityPost[]> {
  const sb = getBrowserSupabase();
  const limit = Math.min(50, Math.max(1, q.limit ?? 20));
  let query = sb
    .from("community_feed")
    .select(FEED_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (q.channel && q.channel !== ALL_CHANNEL) query = query.eq("channel", q.channel);
  if (q.before) query = query.lt("created_at", q.before);
  const { data, error } = await query;
  if (error || !data) return [];
  let rows = data as unknown as CommunityPost[];
  // Hide flagged content from everyone except its author.
  rows = rows.filter((p) => !p.is_flagged || p.user_id === q.viewerId);
  // Hide blocked authors.
  if (q.blocked && q.blocked.length) {
    const set = new Set(q.blocked);
    rows = rows.filter((p) => !set.has(p.user_id));
  }
  return rows;
}

export async function fetchReplies(postId: string, viewerId?: string | null): Promise<CommunityReply[]> {
  const sb = getBrowserSupabase();
  const { data, error } = await sb
    .from("community_replies")
    .select(REPLY_COLS)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as unknown as CommunityReply[]).filter((r) => !r.is_flagged || r.user_id === viewerId);
}

export async function fetchPostsByUser(userId: string, viewerId?: string | null): Promise<CommunityPost[]> {
  const sb = getBrowserSupabase();
  const { data, error } = await sb
    .from("community_feed")
    .select(FEED_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as unknown as CommunityPost[]).filter((p) => !p.is_flagged || p.user_id === viewerId);
}

// ── Create ───────────────────────────────────────────────────────────────────

function mediaFields(media?: Media | null) {
  return {
    media_type: media?.type ?? null,
    media_url: media?.url ?? null,
    media_duration_ms: media?.durationMs ?? null,
  };
}

export async function createPost(
  author: AuthorRef,
  channel: Channel,
  content: NewContent,
): Promise<CommunityPost | null> {
  const sb = getBrowserSupabase();
  const body = content.body.trim().slice(0, MAX_BODY);
  if (!body && !content.media) return null;
  const { data, error } = await sb
    .from("community_posts")
    .insert({
      user_id: author.user_id,
      author: author.author,
      avatar: author.avatar,
      channel,
      body,
      ...mediaFields(content.media),
    })
    .select(
      "id,user_id,author,avatar,channel,body,media_type,media_url,media_duration_ms,created_at,is_flagged,moderation_note",
    )
    .single();
  if (error || !data) return null;
  return { ...(data as unknown as CommunityPost), like_count: 0, reply_count: 0 };
}

export async function createReply(
  postId: string,
  author: AuthorRef,
  content: NewContent,
): Promise<CommunityReply | null> {
  const sb = getBrowserSupabase();
  const body = content.body.trim().slice(0, MAX_BODY);
  if (!body && !content.media) return null;
  const { data, error } = await sb
    .from("community_replies")
    .insert({
      post_id: postId,
      user_id: author.user_id,
      author: author.author,
      avatar: author.avatar,
      body,
      ...mediaFields(content.media),
    })
    .select(REPLY_COLS)
    .single();
  if (error || !data) return null;
  return data as unknown as CommunityReply;
}

export async function deletePost(id: string): Promise<boolean> {
  const { error } = await getBrowserSupabase().from("community_posts").delete().eq("id", id);
  return !error;
}

export async function deleteReply(id: string): Promise<boolean> {
  const { error } = await getBrowserSupabase().from("community_replies").delete().eq("id", id);
  return !error;
}

// ── Likes / bookmarks ────────────────────────────────────────────────────────

/** The subset of these post ids the current user has liked / bookmarked. */
export async function fetchMyLikes(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const sb = getBrowserSupabase();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return new Set();
  const { data } = await sb.from("post_likes").select("post_id").eq("user_id", uid).in("post_id", postIds);
  return new Set((data ?? []).map((r: { post_id: string }) => r.post_id));
}

export async function fetchMyBookmarks(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const sb = getBrowserSupabase();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return new Set();
  const { data } = await sb.from("post_bookmarks").select("post_id").eq("user_id", uid).in("post_id", postIds);
  return new Set((data ?? []).map((r: { post_id: string }) => r.post_id));
}

export async function setLike(postId: string, userId: string, liked: boolean): Promise<boolean> {
  const sb = getBrowserSupabase();
  if (liked) {
    const { error } = await sb
      .from("post_likes")
      .upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    return !error;
  }
  const { error } = await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", userId);
  return !error;
}

export async function setBookmark(postId: string, userId: string, on: boolean): Promise<boolean> {
  const sb = getBrowserSupabase();
  if (on) {
    const { error } = await sb
      .from("post_bookmarks")
      .upsert({ post_id: postId, user_id: userId }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    return !error;
  }
  const { error } = await sb.from("post_bookmarks").delete().eq("post_id", postId).eq("user_id", userId);
  return !error;
}

// ── Report / block ───────────────────────────────────────────────────────────

export async function reportContent(
  targetType: "post" | "reply",
  targetId: string,
  reporterId: string,
  body: string,
): Promise<boolean> {
  const { error } = await getBrowserSupabase().from("community_reports").insert({
    target_type: targetType,
    target_id: targetId,
    reporter_user_id: reporterId,
    body: body.slice(0, 1000),
  });
  return !error;
}

export async function fetchMyBlocks(blockerId: string): Promise<string[]> {
  const { data } = await getBrowserSupabase()
    .from("community_blocks")
    .select("blocked_id")
    .eq("blocker_id", blockerId);
  return (data ?? []).map((r: { blocked_id: string }) => r.blocked_id);
}

export async function setBlock(blockerId: string, blockedId: string, on: boolean): Promise<boolean> {
  const sb = getBrowserSupabase();
  if (on) {
    const { error } = await sb.from("community_blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
    return !error;
  }
  const { error } = await sb
    .from("community_blocks")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId);
  return !error;
}

// ── Notifications ────────────────────────────────────────────────────────────

export async function fetchNotifications(limit = 30): Promise<CommunityNotification[]> {
  const { data } = await getBrowserSupabase()
    .from("community_notifications")
    .select("id,user_id,kind,post_id,reply_id,actor,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as CommunityNotification[];
}

export async function markNotificationRead(id: number): Promise<void> {
  await getBrowserSupabase()
    .from("community_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
}

// ── Profile ──────────────────────────────────────────────────────────────────

export interface PublicProfile {
  id: string;
  name: string | null;
  avatar_url: string | null;
  is_verified_customer: boolean | null;
  is_admin: boolean | null;
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfile | null> {
  // Reads the public_profiles VIEW, not the profiles table: profiles RLS is own-row-only
  // (auth.uid()=id) so members can't read each other's rows, and a blanket profiles grant
  // would expose phone/email/consent. The view exposes only public-safe columns and is
  // granted to anon + authenticated, so any visitor can see another member's public profile.
  const { data } = await getBrowserSupabase()
    .from("public_profiles")
    .select("id,name,avatar_url,is_verified_customer,is_admin")
    .eq("id", userId)
    .maybeSingle();
  return (data as PublicProfile) ?? null;
}

export async function updateMyProfile(
  userId: string,
  patch: { name?: string; avatar_url?: string; community_notify_opt_out?: boolean },
): Promise<boolean> {
  const { error } = await getBrowserSupabase().from("profiles").update(patch).eq("id", userId);
  return !error;
}

// ── Mentions (display) ───────────────────────────────────────────────────────

/** Same @-name grammar the community-notify function resolves (Hebrew+Latin+_). */
export const MENTION_RE = /@([A-Za-z0-9_א-׿]+)/g;
