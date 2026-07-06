// Pure planning helpers for community-admin — NO DB / Deno / network access, so
// they unit-test in isolation (mirrors admin-metrics/metrics.ts). index.ts wires
// requireAdmin + serviceFetch around these.

export const QUEUE_LIMIT = 200;

// Tables the moderation RPC may touch. Defense-in-depth: the SECURITY DEFINER RPC
// whitelists this server-side too, but the edge fn must never trust the client's
// `table` field.
export const MODERATABLE = ["community_posts", "community_replies"] as const;
export type Moderatable = (typeof MODERATABLE)[number];

export interface ActionBody {
  action?: string;
  table?: string;
  id?: string;
  userId?: string;
  reportId?: string;
  note?: string;
  resolution?: string;
}

export type ActionPlan =
  | { kind: "rpc"; rpc: string; args: Record<string, unknown> }
  | { kind: "error"; status: number; error: string };

/** Map a POST body to the RPC to call (with its args), or a 400 with the reason.
 *  p_admin is always the requireAdmin-verified uid — never taken from the body. */
export function planAction(adminUid: string, body: ActionBody | null | undefined): ActionPlan {
  const b = body ?? {};
  const action = String(b.action ?? "");
  switch (action) {
    case "approve":
    case "remove": {
      if (!b.id) return { kind: "error", status: 400, error: "missing id" };
      if (!b.table || !MODERATABLE.includes(b.table as Moderatable)) {
        return { kind: "error", status: 400, error: "bad table" };
      }
      return {
        kind: "rpc",
        rpc: "admin_moderate_content",
        args: { p_admin: adminUid, p_table: b.table, p_id: b.id, p_action: action, p_note: b.note ?? null },
      };
    }
    case "ban":
    case "unban": {
      if (!b.userId) return { kind: "error", status: 400, error: "missing userId" };
      return {
        kind: "rpc",
        rpc: "admin_set_ban",
        args: { p_admin: adminUid, p_user: b.userId, p_banned: action === "ban" },
      };
    }
    case "resolve":
    case "dismiss": {
      if (!b.reportId) return { kind: "error", status: 400, error: "missing reportId" };
      return {
        kind: "rpc",
        rpc: "admin_resolve_report",
        args: {
          p_admin: adminUid,
          p_report: b.reportId,
          p_status: action === "resolve" ? "resolved" : "dismissed",
          p_resolution: b.resolution ?? null,
        },
      };
    }
    default:
      return { kind: "error", status: 400, error: "unknown action" };
  }
}

/** The three bounded, filtered queue-read URLs — pins the "open reports only" +
 *  "flagged only" contracts and the row shape. */
export function queueUrls(limit = QUEUE_LIMIT): { reports: string; posts: string; replies: string } {
  return {
    reports:
      `/rest/v1/community_reports?status=eq.open&order=created_at.desc&limit=${limit}` +
      `&select=id,target_type,target_id,reporter_user_id,body,created_at`,
    posts:
      `/rest/v1/community_posts?is_flagged=eq.true&order=created_at.desc&limit=${limit}` +
      `&select=id,user_id,author,channel,body,moderation_note,created_at`,
    replies:
      `/rest/v1/community_replies?is_flagged=eq.true&order=created_at.desc&limit=${limit}` +
      `&select=id,post_id,user_id,author,body,created_at`,
  };
}
