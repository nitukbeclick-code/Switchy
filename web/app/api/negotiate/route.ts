// ────────────────────────────────────────────────────────────────────────────
// POST /api/negotiate — build a GROUNDED retention/negotiation script for a user
// who wants to STAY with their provider but pay less ("לפני שעוזבים — כך משיגים
// מהספק את המחיר").
//
// This is the thin server route behind the /negotiate page. It validates the
// inputs (category / provider / currentBill / abroad), then asks the pure engine
// (app/negotiate/lib.ts → buildNegotiation) to derive the script from the REAL
// bundled catalogue: the cheapest comparable plan (any provider) = the market
// rate, plus the user's OWN provider's cheapest comparable plan. The script is
// honest leverage, never a promised outcome.
//
// E-E-A-T / HONESTY:
//   • Every plan/price/provider returned is a REAL catalogue row — nothing is
//     fabricated, and no plan is invented to "win" a category.
//   • The annual saving is computed ONLY against a real current bill (0 otherwise)
//     and only for monthly plans — it is an upper-bound estimate, not a promise.
//   • The response carries the explicit framing: the market rate is a starting
//     point for negotiation; the decision to match it is the provider's.
//
// SECURITY: this route reads PUBLIC catalogue data and writes NOTHING — no DB, no
// PII, no secrets. It applies the same Origin allow-list as /api/recommend so a
// third-party site can't drive it from a browser; non-browser callers (no Origin)
// pass through since the output is public information either way.
// ────────────────────────────────────────────────────────────────────────────

import { getPlans } from "@/lib/data";
import {
  buildNegotiation,
  isNegotiateCategory,
  isNegotiationScript,
} from "@/app/negotiate/lib";

export const runtime = "nodejs";
// The catalogue is bundled + immutable at build time, so a script for a given
// body is pure. Keep it dynamic (per-request body) but cache-free.
export const dynamic = "force-dynamic";

// ── Origin allow-list (mirrors /api/recommend + /api/lead) ───────────────────
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
  if (!origin) return true; // non-browser callers: output is public data anyway
  return ALLOWED_ORIGINS.has(origin);
}

/** The inputs the client posts. */
interface NegotiateBody {
  /** The service to negotiate over (required). */
  category?: unknown;
  /** The user's current provider name (optional). */
  provider?: unknown;
  /** The user's current monthly bill in ₪ (optional — drives saving figures). */
  currentBill?: unknown;
  /** Whether the user needs abroad/roaming included. */
  abroad?: unknown;
}

export async function POST(req: Request) {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ ok: false, error: "forbidden origin" }, { status: 403 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: NegotiateBody;
  try {
    body = (await req.json()) as NegotiateBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // ── Validate: category is the only required input ───────────────────────────
  if (!isNegotiateCategory(body.category)) {
    return Response.json(
      { ok: false, error: "קטגוריה לא תקינה" },
      { status: 400 },
    );
  }

  // ── Build the grounded script from the REAL bundled catalogue ──────────────
  const result = buildNegotiation({
    plans: getPlans(),
    category: body.category,
    provider: typeof body.provider === "string" ? body.provider : undefined,
    currentBill: body.currentBill,
    abroad: body.abroad === true || body.abroad === "true",
  });

  // No comparable real plan to ground a script on — honest 404, no fabrication.
  if (!isNegotiationScript(result)) {
    return Response.json(
      { ok: false, error: result.note, reason: result.reason },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, script: result });
}
