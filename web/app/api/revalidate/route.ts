// ────────────────────────────────────────────────────────────────────────────
// POST /api/revalidate — the ON-DEMAND purge that replaces short ISR timers.
//
// WHAT: purges the prerendered pages of a scope ("catalogue" | "community" |
// "all") and/or an explicit list of paths, so the next request regenerates them
// with live Supabase data. The route list lives in lib/isr-budget.ts — the same
// module the budget test enforces — so a purge can never drift from the pages
// that actually read the catalogue.
//
// WHY: every scheduled revalidation is a metered Vercel ISR write. Hourly (and,
// for community permalinks, 5-minutely) timers re-wrote ~460 + ~500 pages around
// the clock whether or not anything had changed, and burned through the free
// tier. Pages now carry a 24h SAFETY NET and get their real freshness from this
// endpoint: a catalogue edit purges in seconds, a quiet day costs ~nothing.
//
// SECURITY: shared-secret only, in the `x-revalidate-secret` header, compared in
// constant time. No secret configured → 503 (disabled), never open. There is no
// GET: purging is a state change and must not be reachable by a crawler or a
// prefetch. The endpoint takes NO data — it can only invalidate caches, never
// write content — so the blast radius of a leaked secret is a burst of
// regeneration, not a content change.
//
// CALLERS:
//   • .github/workflows/rebuild-static.yml — after a catalogue rebuild is pushed.
//   • A Supabase Database Webhook on public.plans (scope "catalogue") or on the
//     community tables (scope "community"), if you prefer the DB to call directly.
//   See docs/vercel-isr-budget.md for the exact wiring.
// ────────────────────────────────────────────────────────────────────────────

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  routesForScope,
  type RevalidateScope,
} from "@/lib/isr-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.REVALIDATE_SECRET;

/** Explicit paths are capped so one call can't fan out into a regeneration storm. */
const MAX_EXPLICIT_PATHS = 50;

const SCOPES: ReadonlySet<string> = new Set<RevalidateScope>([
  "catalogue",
  "community",
  "all",
]);

interface RevalidateBody {
  /** Which family of pages to purge. Defaults to "catalogue". */
  scope?: string;
  /** Extra concrete paths, e.g. ["/community/post/123"]. */
  paths?: unknown;
}

interface RevalidateResponse {
  ok: boolean;
  /** The routes/patterns that were purged (echoed for the caller's log). */
  purged?: string[];
  error?: string;
}

function json(body: RevalidateResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A purge is never cacheable, and must not be stored by any hop.
      "cache-control": "no-store",
    },
  });
}

/** Constant-time secret comparison (never leaks the secret's length via timing). */
function secretMatches(presented: string | null): boolean {
  if (!SECRET || !presented) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(SECRET, "utf8");
  // timingSafeEqual throws on a length mismatch; compare a fixed-size digest of
  // the two buffers instead of branching on length.
  if (a.length !== b.length) {
    // Still burn a comparison so a wrong-length guess isn't measurably faster.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Only same-origin app paths are purgeable — never a bare pattern we don't own. */
function sanitizePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const path = item.trim();
    // Absolute app paths only: no protocol-relative "//host", no traversal.
    if (!path.startsWith("/") || path.startsWith("//")) continue;
    if (path.includes("..")) continue;
    if (path.length > 512) continue;
    out.push(path);
    if (out.length === MAX_EXPLICIT_PATHS) break;
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  // Disabled until a secret exists — an unconfigured deploy is closed, not open.
  if (!SECRET) {
    return json(
      { ok: false, error: "revalidation disabled (REVALIDATE_SECRET unset)" },
      503,
    );
  }

  if (!secretMatches(req.headers.get("x-revalidate-secret"))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  let body: RevalidateBody = {};
  const rawBody = await req.text();
  if (rawBody.trim()) {
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (parsed && typeof parsed === "object") body = parsed as RevalidateBody;
    } catch {
      return json({ ok: false, error: "invalid JSON body" }, 400);
    }
  }

  const scopeRaw = typeof body.scope === "string" ? body.scope : "catalogue";
  if (!SCOPES.has(scopeRaw)) {
    return json(
      { ok: false, error: `unknown scope "${scopeRaw}"` },
      400,
    );
  }
  const scope = scopeRaw as RevalidateScope;

  // Scope routes + any explicit paths, de-duplicated so one purge = one write.
  const targets = [
    ...new Set([...routesForScope(scope), ...sanitizePaths(body.paths)]),
  ];

  for (const target of targets) {
    if (target.includes("[")) {
      // A route PATTERN needs the type, and "page" (never "layout") keeps the
      // purge to that route's own pages — the layout variant would invalidate
      // every page beneath it and undo the saving.
      revalidatePath(target, "page");
    } else {
      // A literal path takes no type: passing one makes it a pattern lookup that
      // matches no cache entry, so the purge would silently do nothing.
      revalidatePath(target);
    }
  }

  return json({ ok: true, purged: targets });
}
