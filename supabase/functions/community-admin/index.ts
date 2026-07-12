import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ─────────────────────────────────────────────────────────────────────────────
// community-admin — the moderation dashboard's server authority.
//
// The browser physically CANNOT do this work: community_reports grants SELECT to
// service_role only (authenticated has INSERT-only, no read), and posts/replies
// UPDATE/DELETE RLS is own-row. So the admin surface reads the queue and mutates
// other users' content ONLY here, gated by requireAdmin() (Bearer user-JWT →
// service-role reads profiles.is_admin, fail-closed). Every destructive action goes
// through a SECURITY DEFINER RPC that ALSO re-checks is_admin (defense-in-depth) and
// writes a security_audit_log row.
//
// GET  → the queue: open reports + is_flagged posts + is_flagged replies (bounded),
//        ENRICHED with reportCount (open reports per flagged item) + authorBanned
//        (profiles.is_banned) via TWO extra bounded service-role reads. Additive
//        and fail-soft: if an enrichment read fails, the fields are simply absent
//        (never a fabricated 0/false).
// POST → { action: 'approve'|'remove'|'ban'|'unban'|'resolve'|'dismiss', ... }.
// Missing/invalid admin ⇒ 401. Deploy: supabase functions deploy community-admin
//
// Pure planning (which RPC, which URLs) lives in actions.ts and is unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchRows, serviceFetch } from "../_shared/db.ts";
import { requireAdmin } from "../_shared/admin.ts";
import { jlog } from "../_shared/log.ts";
import { planAction, queueUrls } from "./actions.ts";

function cors(extra: Record<string, string> = {}): Record<string, string> {
  return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", ...extra };
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors() } });
}

/** Call a SECURITY DEFINER RPC via the service role; true on 2xx. */
async function callRpc(name: string, args: Record<string, unknown>): Promise<boolean> {
  const r = await serviceFetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  return !!r && r.ok;
}

// ── Queue enrichment ─────────────────────────────────────────────────────────
// Two extra BOUNDED service-role reads per queue load (never per row): the open-
// report counts for the flagged items and the ban flag of their authors. `in.()`
// id lists are capped so a pathological queue can't build an unbounded URL.

const ENRICH_IDS_CAP = 200;

type FlaggedRow = { id?: unknown; user_id?: unknown } & Record<string, unknown>;

function uniqueIds(rows: FlaggedRow[], key: "id" | "user_id"): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    // Only uuid-ish values are ever interpolated into the in.() filter.
    if (typeof v === "string" && /^[0-9a-fA-F-]{32,40}$/.test(v)) out.add(v);
    if (out.size >= ENRICH_IDS_CAP) break;
  }
  return [...out];
}

/** Attach reportCount / authorBanned to the flagged rows IN PLACE (additive).
 *  Each field is only written when its read succeeded — a failed read leaves the
 *  rows unannotated instead of faking 0 / false. */
async function enrichFlagged(posts: FlaggedRow[], replies: FlaggedRow[]): Promise<void> {
  const flagged = [...posts, ...replies];
  if (flagged.length === 0) return;
  const targetIds = uniqueIds(flagged, "id");
  const authorIds = uniqueIds(flagged, "user_id");
  // uniqueIds caps the lookups at ENRICH_IDS_CAP, so only rows whose id was
  // ACTUALLY queried can be truthfully annotated. Rows past the cap must be left
  // unannotated (field absent = "unknown" to the web client) — never a faked
  // reportCount:0 / authorBanned:false for an item we never looked up.
  const queriedTargets = new Set(targetIds);
  const queriedAuthors = new Set(authorIds);
  const [reportRows, profileRows] = await Promise.all([
    targetIds.length
      ? fetchRows<{ target_id?: unknown }>(
        `/rest/v1/community_reports?select=target_id&status=eq.open` +
          `&target_id=in.(${targetIds.join(",")})&limit=1000`,
      )
      : Promise.resolve([]),
    authorIds.length
      ? fetchRows<{ id?: unknown; is_banned?: unknown }>(
        `/rest/v1/profiles?select=id,is_banned&id=in.(${authorIds.join(",")})` +
          `&limit=${ENRICH_IDS_CAP}`,
      )
      : Promise.resolve([]),
  ]);
  if (reportRows !== null) {
    const counts = new Map<string, number>();
    for (const r of reportRows) {
      if (typeof r.target_id === "string") {
        counts.set(r.target_id, (counts.get(r.target_id) ?? 0) + 1);
      }
    }
    for (const row of flagged) {
      if (typeof row.id === "string" && queriedTargets.has(row.id)) {
        row.reportCount = counts.get(row.id) ?? 0;
      }
    }
  }
  if (profileRows !== null) {
    const banned = new Set<string>();
    for (const p of profileRows) {
      if (typeof p.id === "string" && p.is_banned === true) banned.add(p.id);
    }
    for (const row of flagged) {
      if (typeof row.user_id === "string" && queriedAuthors.has(row.user_id)) {
        row.authorBanned = banned.has(row.user_id);
      }
    }
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });

  const admin = await requireAdmin(req);
  if (!admin) return json({ error: "unauthorized" }, 401);

  // ── Queue read ──────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const u = queueUrls();
    const [reports, posts, replies] = await Promise.all([
      fetchRows(u.reports),
      fetchRows(u.posts),
      fetchRows(u.replies),
    ]);
    const flaggedPosts = (posts ?? []) as FlaggedRow[];
    const flaggedReplies = (replies ?? []) as FlaggedRow[];
    // Additive enrichment (reportCount / authorBanned) — two bounded reads total.
    await enrichFlagged(flaggedPosts, flaggedReplies);
    return json({ reports: reports ?? [], flaggedPosts, flaggedReplies });
  }

  // ── Actions ─────────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    const plan = planAction(admin.uid, body);
    if (plan.kind === "error") return json({ error: plan.error }, plan.status);

    const ok = await callRpc(plan.rpc, plan.args);
    jlog({ at: "community-admin", ok, rpc: plan.rpc, admin: admin.uid });
    return ok ? json({ ok: true }) : json({ error: "action failed" }, 500);
  }

  return json({ error: "method not allowed" }, 405);
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    jlog({ at: "community-admin", ok: false, error: String(e) });
    return json({ error: "internal error" }, 500);
  }
});
