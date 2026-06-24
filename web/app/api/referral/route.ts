// ────────────────────────────────────────────────────────────────────────────
// POST /api/referral — issue a REAL, persisted, attributable referral code into
// public.referral_codes (server-side), and return it (+ its share link) so the
// site can render a shareable invite. The site channel is anonymous: the row
// records only the channel ("site") + an optional non-PII conversation token, so
// a future signup that arrives with this code (leads.referrer_code) can be
// credited back to the share. Mirrors /api/lead's posture exactly.
//
// SECURITY: uses the Supabase SERVICE-ROLE key, which lives ONLY in the server env
// (SUPABASE_SERVICE_ROLE_KEY) and is NEVER exposed to the browser. Same Origin
// allow-list as /api/lead + /api/recommend blocks off-site/CSRF browser POSTs.
//
// TRUTH-ONLY / E-E-A-T (ABSOLUTE):
//   • The code is minted with Web Crypto (lib/referral) and INSERTed, so it is a
//     real token — never fabricated. A unique index on `code` turns the
//     (vanishingly rare) collision into an insert failure → we retry with a fresh
//     code (capped), so a caller always gets a usable code.
//   • NO advertised monetary reward is created, stored, or returned. The route
//     never invents a reward — the response carries only the code + share assets.
//   • Issuing a SHARE code is not marketing TO anyone (§30A): the referrer chooses
//     to share it. No consent gate here; the consent/suppression gates apply later
//     to the NEW lead if/when a referee redeems the code.
//
// FAIL-SOFT: when the service-role key is absent we still return a real, UNPERSISTED
// code (200) so the share UI works in every environment — attribution is simply
// off until the key + table are configured (identical to how the agent's tool
// returns a real code even before the issue-sink is wired). When the DB write
// errors for a non-collision reason we degrade the same way rather than 500, since
// a sharable code is an enhancement, never load-bearing. The response always tells
// the client, via `persisted`, whether attribution is on.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import {
  buildReferralRow,
  makeReferralCode,
  referralLink,
  referralShareText,
  type ReferralResponse,
} from "@/lib/referral";

// Re-export the response contract (declared in lib/referral so it stays client-
// safe — see lib/referral.ts) for callers that import it from the route.
export type { ReferralResponse };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// How many times to re-mint on a unique-collision before giving up persistence.
// 30^6 keyspace makes even one collision astronomically unlikely at our volume;
// two attempts is ample headroom and bounds the loop.
const MAX_ISSUE_ATTEMPTS = 3;

// ── Origin allow-list (mirrors /api/lead + /api/recommend) ───────────────────
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  [
    "https://switchy-ai.com",
    "https://www.switchy-ai.com",
    "https://app.switchy-ai.com",
    "https://switchyy-omega.vercel.app",
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    process.env.NODE_ENV !== "production" ? "http://localhost:3000" : undefined,
  ].filter((o): o is string => typeof o === "string" && o.length > 0),
);

/** True when the request's Origin is same-site (or absent → non-browser caller). */
function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser callers: DB gates still apply
  return ALLOWED_ORIGINS.has(origin);
}

interface ReferralBody {
  /** Optional non-PII per-visit token for conversation-only attribution. */
  conversationId?: unknown;
}

/** Build the success body for an (already-minted) code. */
function bodyFor(code: string, persisted: boolean): ReferralResponse {
  return {
    ok: true,
    code,
    link: referralLink(code),
    shareText: referralShareText(code),
    persisted,
  };
}

function json(body: ReferralResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A freshly-minted code must never be cached/shared between visitors.
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ ok: false, error: "forbidden origin" }, { status: 403 });
  }

  // ── Parse body (optional — an empty/absent body is fine; the code is the point)
  let body: ReferralBody = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as ReferralBody;
  } catch {
    // Malformed JSON: ignore the body and still issue a code (it carries no PII).
    body = {};
  }

  // ── No service-role key → real, UNPERSISTED code (attribution off) ──────────
  if (!SERVICE_ROLE_KEY) {
    return json(bodyFor(makeReferralCode(), false));
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Mint + INSERT, retrying only on a unique-code collision ─────────────────
  let lastCode = "";
  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt++) {
    const row = buildReferralRow({ conversationId: body.conversationId });
    lastCode = row.code;
    const { error } = await supabase.from("referral_codes").insert(row);
    if (!error) return json(bodyFor(row.code, true)); // persisted → attribution ON

    // 23505 = unique_violation → a code collision; re-mint and retry.
    const code = error.code ?? "";
    const msg = (error.message || "").toLowerCase();
    const isCollision =
      code === "23505" || msg.includes("duplicate") || msg.includes("unique");
    if (!isCollision) break; // any other DB error → degrade below (fail-soft)
  }

  // DB write failed (non-collision error, or we exhausted collision retries):
  // degrade to a real-but-unpersisted code so the share UI always works. We never
  // leak the DB error and never 500 — a shareable code is an enhancement.
  return json(bodyFor(lastCode || makeReferralCode(), false));
}
