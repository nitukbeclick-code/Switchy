// ────────────────────────────────────────────────────────────────────────────
// POST /api/switch-kit — build a personalised, HONEST switch packet ("ערכת מעבר")
// for a user moving FROM their current provider TO a real catalogue plan, and
// OPTIONALLY persist their tracker progress (own-row) into public.switch_progress.
//
// This is the thin server route behind the /switch-kit page. It validates the
// inputs, then asks the pure builder (lib/switch-kit → buildSwitchKit) to derive
// the packet from the REAL bundled catalogue: the cancellation letter to review,
// the ניוד-מספר / disconnection checklist, the factual switch steps + honest
// relative key-dates. The packet content is rebuilt from real data every time; the
// only thing persisted is WHICH step the user has reached.
//
// E-E-A-T / HONESTY (ABSOLUTE):
//   • Every plan/price/provider returned is a REAL catalogue row — nothing is
//     fabricated, no invented phone numbers / in-app steps / timelines (the binding
//     procedure lives on the provider's official site, surfaced via lib/data).
//   • The annual saving is computed ONLY against a real current bill (0 otherwise)
//     and only for monthly plans — an upper-bound estimate, not a promise.
//   • The cancellation letter is NEVER auto-sent — the response carries
//     autoSent:false and the USER reviews + sends it via the provider's channels.
//   • Every packet carries the "הנחיה כללית, לא ייעוץ משפטי" disclaimer.
//
// SECURITY / PERSISTENCE (fail-soft):
//   • Building the kit reads PUBLIC catalogue data and writes nothing — same Origin
//     allow-list as /api/recommend so a third-party site can't drive it from a
//     browser; non-browser callers (no Origin) pass through (output is public).
//   • Persisting the tracker is the USER'S OWN data (RLS own-row). It happens ONLY
//     when the caller supplies a valid Supabase access token (Bearer) → we resolve
//     the user via auth.getUser and upsert public.switch_progress with the
//     SERVICE-ROLE key (server-only, never exposed) stamped with that user_id. With
//     no/invalid token, or no service-role key, or a DB error, we degrade to
//     `persisted:false` and still return the full kit (the page's tracker persists
//     locally via localStorage regardless). Persistence is an enhancement, never
//     load-bearing — mirrors /api/referral's posture.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { getPlans, getProviders, providerOfficialUrl } from "@/lib/data";
import {
  buildSwitchKit,
  isSwitchKit,
  isSwitchStepKey,
  type SwitchKit,
  type SwitchStepStatus,
} from "@/lib/switch-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Origin allow-list (mirrors /api/recommend + /api/negotiate + /api/referral) ──
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
interface SwitchKitBody {
  /** The user's current provider name (free text — resolved to a real one). */
  fromProvider?: unknown;
  /** The catalogue id of the target plan (required). */
  targetPlanId?: unknown;
  /** Optional honest profile fields for the letter (no PII stored beyond progress). */
  fullName?: unknown;
  accountNumber?: unknown;
  phone?: unknown;
  currentBill?: unknown;
  hasCommitment?: unknown;
  /** Optional per-step progress map to persist: { stepKey: 'todo'|'in_progress'|'done' }. */
  steps?: unknown;
  /** Overall lifecycle to persist: 'active' | 'done' | 'abandoned'. */
  status?: unknown;
}

/** The response contract. `persisted` tells the client whether the tracker saved. */
export interface SwitchKitResponse {
  ok: boolean;
  /** The full kit (when ok). */
  kit?: SwitchKit;
  /** The cancellation letter is NEVER auto-sent — explicit, always false. */
  autoSent: false;
  /** True only when the tracker progress was written to the user's own row. */
  persisted: boolean;
  /** Error note when ok is false. */
  error?: string;
}

function json(body: SwitchKitResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Sanitise an optional bounded string field. */
function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}

/** Sanitise the posted steps map into canonical { stepKey: status } only. */
function sanitizeSteps(v: unknown): Record<string, SwitchStepStatus> {
  const out: Record<string, SwitchStepStatus> = {};
  if (!v || typeof v !== "object") return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (
      isSwitchStepKey(k) &&
      (val === "todo" || val === "in_progress" || val === "done")
    ) {
      out[k] = val;
    }
  }
  return out;
}

/** Resolve the signed-in user id from a Bearer access token, or null. */
async function resolveUserId(req: Request): Promise<string | null> {
  if (!SERVICE_ROLE_KEY) return null;
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  const token = m?.[1];
  if (!token) return null;
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Best-effort persist of the tracker progress into public.switch_progress
 * (own-row, supabase/switch-kit-2026-06.sql). Returns true only on a real write.
 * Fail-soft: any missing key / unresolved user / DB error → false (the kit is
 * still returned + the client persists locally).
 *
 * The table has a PARTIAL unique index on (user_id, from_provider,
 * coalesce(to_plan_id,'')) WHERE status='active' — so a plain conflict-target
 * upsert can't target it. We therefore "update the active attempt if it exists,
 * else insert": select the user's active row for this move, UPDATE it when found,
 * otherwise INSERT a fresh one. This keeps a user from accumulating duplicate
 * active trackers for the same move while staying compatible with SA-E's schema.
 */
async function persistProgress(args: {
  userId: string;
  fromProvider: string;
  toPlanId: string | undefined;
  steps: Record<string, SwitchStepStatus>;
  status: "active" | "done" | "abandoned";
}): Promise<boolean> {
  if (!SERVICE_ROLE_KEY) return false;
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find an existing ACTIVE attempt for this exact move (matches the partial
    // unique index). to_plan_id null ⇒ match the null rows.
    let existing = supabase
      .from("switch_progress")
      .select("id")
      .eq("user_id", args.userId)
      .eq("from_provider", args.fromProvider)
      .eq("status", "active")
      .limit(1);
    existing = args.toPlanId
      ? existing.eq("to_plan_id", args.toPlanId)
      : existing.is("to_plan_id", null);
    const found = await existing.maybeSingle();
    if (found.error) return false;

    if (found.data?.id) {
      const { error } = await supabase
        .from("switch_progress")
        .update({ steps: args.steps, status: args.status })
        .eq("id", found.data.id);
      return !error;
    }

    const { error } = await supabase.from("switch_progress").insert({
      user_id: args.userId,
      from_provider: args.fromProvider,
      to_plan_id: args.toPlanId ?? null,
      steps: args.steps,
      status: args.status,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return json({ ok: false, autoSent: false, persisted: false, error: "forbidden origin" }, 403);
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: SwitchKitBody;
  try {
    body = (await req.json()) as SwitchKitBody;
  } catch {
    return json({ ok: false, autoSent: false, persisted: false, error: "invalid JSON body" }, 400);
  }

  // ── Build the kit from the REAL bundled catalogue ───────────────────────────
  const currentBillNum = Number(body.currentBill);
  const result = buildSwitchKit(
    {
      plans: getPlans(),
      providers: getProviders().map((p) => p.name),
      fromProvider: str(body.fromProvider, 60),
      targetPlanId: str(body.targetPlanId, 80),
      profile: {
        fullName: str(body.fullName, 80) ?? null,
        accountNumber: str(body.accountNumber, 40) ?? null,
        phone: str(body.phone, 20) ?? null,
        currentBill:
          Number.isFinite(currentBillNum) && currentBillNum > 0 ? currentBillNum : null,
        hasCommitment:
          body.hasCommitment === true
            ? true
            : body.hasCommitment === false
              ? false
              : null,
      },
    },
    providerOfficialUrl,
  );

  // No real target plan to ground a kit on — honest 404, no fabrication.
  if (!isSwitchKit(result)) {
    return json(
      { ok: false, autoSent: false, persisted: false, error: result.note },
      404,
    );
  }

  // ── Optional, fail-soft persist of the tracker progress (own-row) ───────────
  let persisted = false;
  const steps = sanitizeSteps(body.steps);
  if (Object.keys(steps).length > 0) {
    const userId = await resolveUserId(req);
    if (userId) {
      const status =
        body.status === "done" || body.status === "abandoned"
          ? body.status
          : "active";
      persisted = await persistProgress({
        userId,
        fromProvider: result.fromProvider,
        toPlanId: result.toPlanId,
        steps,
        status,
      });
    }
  }

  return json({ ok: true, kit: result, autoSent: false, persisted });
}
