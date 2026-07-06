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
// GET  → the queue: open reports + is_flagged posts + is_flagged replies (bounded).
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
    return json({ reports: reports ?? [], flaggedPosts: posts ?? [], flaggedReplies: replies ?? [] });
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
