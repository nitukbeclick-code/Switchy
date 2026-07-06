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
  /** Admin-pinned to the top of the feed (welcome / announcement). */
  is_pinned: boolean;
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
  /** The reply this one answers (same post), or null for a top-level reply.
   *  Depth is capped at 1 in the DB — a reply to a child re-parents to the ancestor. */
  parent_reply_id: string | null;
}

/** A top-level reply with its (single level of) child replies, oldest-first. */
export interface ReplyNode extends CommunityReply {
  children: CommunityReply[];
}

export interface CommunityNotification {
  id: number;
  user_id: string;
  kind: "reply" | "mention" | "flag" | "reaction";
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
  "id,user_id,author,avatar,channel,body,media_type,media_url,media_duration_ms,created_at,is_flagged,moderation_note,like_count,reply_count,is_pinned";
const REPLY_COLS =
  "id,post_id,user_id,author,avatar,body,media_type,media_url,media_duration_ms,created_at,is_flagged,parent_reply_id";

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
  // A freshly-created post is never pinned; fill the aggregate + pin defaults.
  return { ...(data as unknown as CommunityPost), like_count: 0, reply_count: 0, is_pinned: false };
}

export async function createReply(
  postId: string,
  author: AuthorRef,
  content: NewContent,
  opts?: { parentReplyId?: string | null },
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
      // The DB caps depth: a reply to a child re-parents to the top-level ancestor.
      parent_reply_id: opts?.parentReplyId ?? null,
      ...mediaFields(content.media),
    })
    .select(REPLY_COLS)
    .single();
  if (error || !data) return null;
  return data as unknown as CommunityReply;
}

/** Shape a flat, oldest-first reply list into a 2-level tree: top-level replies,
 *  each carrying its child replies (oldest-first). Depth is DB-capped at 1, but this
 *  is orphan-safe — a child whose parent isn't in the list is promoted to top level
 *  so no reply ever disappears. */
export function toReplyTree(replies: CommunityReply[]): ReplyNode[] {
  const byId = new Map<string, CommunityReply>();
  for (const r of replies) byId.set(r.id, r);
  const nodes = new Map<string, ReplyNode>();
  const roots: ReplyNode[] = [];
  for (const r of replies) {
    const isChild = r.parent_reply_id != null && byId.has(r.parent_reply_id);
    if (!isChild) {
      const node: ReplyNode = { ...r, children: [] };
      nodes.set(r.id, node);
      roots.push(node);
    }
  }
  for (const r of replies) {
    if (r.parent_reply_id != null) {
      const parent = nodes.get(r.parent_reply_id);
      if (parent) parent.children.push(r);
    }
  }
  return roots;
}

export async function deletePost(id: string): Promise<boolean> {
  const { error } = await getBrowserSupabase().from("community_posts").delete().eq("id", id);
  return !error;
}

export async function deleteReply(id: string): Promise<boolean> {
  const { error } = await getBrowserSupabase().from("community_replies").delete().eq("id", id);
  return !error;
}

/** Admin-only: pin / unpin a post to the top of the feed. Authorization is enforced
 *  in the DB by the posts_admin_update RLS policy (auth.uid() is an admin) — the
 *  client is_admin flag only decides whether the pin control is shown, never trusted
 *  for the write. A non-admin's update matches no row and returns without effect. */
export async function setPinned(postId: string, pinned: boolean): Promise<boolean> {
  const { error } = await getBrowserSupabase()
    .from("community_posts")
    .update({ is_pinned: pinned })
    .eq("id", postId);
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

// ── Reactions (multi-emoji, on posts AND replies) ────────────────────────────
// A polymorphic content_reactions table (target_type post|reply). ONE reaction per
// user per target — switching emoji is an upsert on the PK. The binary post_likes
// above is untouched (still drives the "popular" sort + like_count). A reply "like"
// is just the 👍 reaction on a reply. Every write is on the browser JWT (RLS).

export const REACTION_EMOJI = ["👍", "❤️", "😂", "😮"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];
export type ReactionTarget = "post" | "reply";

export interface ReactionSummary {
  emoji: ReactionEmoji;
  count: number;
}

const REACTION_SET: ReadonlySet<string> = new Set(REACTION_EMOJI);

/** Per-target reaction summaries (only emoji with count>0), for a batch of ids. */
export async function fetchReactions(
  target: ReactionTarget,
  targetIds: string[],
): Promise<Map<string, ReactionSummary[]>> {
  const out = new Map<string, ReactionSummary[]>();
  if (targetIds.length === 0) return out;
  const { data } = await getBrowserSupabase()
    .from("content_reactions")
    .select("target_id,emoji")
    .eq("target_type", target)
    .in("target_id", targetIds);
  // Aggregate client-side: id -> emoji -> count.
  const byId = new Map<string, Map<ReactionEmoji, number>>();
  for (const r of (data ?? []) as { target_id: string; emoji: string }[]) {
    if (!REACTION_SET.has(r.emoji)) continue;
    const e = r.emoji as ReactionEmoji;
    let m = byId.get(r.target_id);
    if (!m) byId.set(r.target_id, (m = new Map()));
    m.set(e, (m.get(e) ?? 0) + 1);
  }
  for (const [id, m] of byId) {
    // Keep the canonical emoji order; drop zero counts (truthful — never shown).
    out.set(
      id,
      REACTION_EMOJI.filter((e) => (m.get(e) ?? 0) > 0).map((e) => ({ emoji: e, count: m.get(e)! })),
    );
  }
  return out;
}

/** The viewer's OWN emoji per target (one per target, or absent). */
export async function fetchMyReactions(
  target: ReactionTarget,
  targetIds: string[],
): Promise<Map<string, ReactionEmoji>> {
  const out = new Map<string, ReactionEmoji>();
  if (targetIds.length === 0) return out;
  const sb = getBrowserSupabase();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return out;
  const { data } = await sb
    .from("content_reactions")
    .select("target_id,emoji")
    .eq("target_type", target)
    .eq("user_id", uid)
    .in("target_id", targetIds);
  for (const r of (data ?? []) as { target_id: string; emoji: string }[]) {
    if (REACTION_SET.has(r.emoji)) out.set(r.target_id, r.emoji as ReactionEmoji);
  }
  return out;
}

/** Set (or switch) the viewer's reaction, or remove it when emoji is null.
 *  Switching emoji is a single upsert on the PK (does NOT re-fire the notify insert). */
export async function setReaction(
  target: ReactionTarget,
  targetId: string,
  userId: string,
  emoji: ReactionEmoji | null,
): Promise<boolean> {
  const sb = getBrowserSupabase();
  if (emoji === null) {
    const { error } = await sb
      .from("content_reactions")
      .delete()
      .eq("target_type", target)
      .eq("target_id", targetId)
      .eq("user_id", userId);
    return !error;
  }
  const { error } = await sb
    .from("content_reactions")
    .upsert(
      { target_type: target, target_id: targetId, user_id: userId, emoji },
      { onConflict: "target_type,target_id,user_id" },
    );
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
