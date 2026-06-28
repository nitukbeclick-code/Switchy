// ────────────────────────────────────────────────────────────────────────────
// POST /api/recommend — rank REAL catalogue plans for a quiz profile.
//
// This is the thin server route behind the /quiz wizard. It validates the five
// quiz inputs (category / budget / priority / lines / abroad), builds a
// MatchProfile, and ranks the LIVE catalogue's plans (read from public.plans via
// getLivePlans, with the bundled snapshot as a resilient fallback) through THE
// shared, provider-neutral formula in lib/recommend.ts — the SAME formula the
// WhatsApp bot, the edge agent (_shared/scoring.ts), and the Flutter app use, so
// the rankings match across every surface AND the prices match /compare + the
// plan-detail pages. It returns the top matches with their score, annual saving
// (only when a real bill is given), and Hebrew reasons/caveats.
//
// E-E-A-T / HONESTY:
//   • Every plan returned is a REAL catalogue row (id/provider/plan/price/…),
//     never fabricated. We surface only fields that exist in the catalogue.
//   • annualSaving is computed ONLY against a real current bill (the formula
//     returns 0 otherwise) and only for monthly plans — never a promised figure.
//   • Ranking is provider-neutral: scorePlan never reads the provider, and ties
//     break with a deterministic, seeded, provider-free shuffle.
//
// SECURITY: this route reads PUBLIC catalogue data and writes NOTHING — no DB, no
// PII, no secrets. It still applies the same Origin allow-list as /api/lead so a
// third-party site can't drive it from a browser; non-browser callers (no Origin)
// are allowed through since the output is public information either way.
// ────────────────────────────────────────────────────────────────────────────

import { getPlans } from "@/lib/data";
import { getLivePlans } from "@/lib/live-catalogue";
import {
  rankPlans,
  priorityFromId,
  type MatchPriority,
  type MatchProfile,
  type ScorablePlan,
} from "@/lib/recommend";
import { priceUnitLabel } from "@/lib/format";
import { planDisplay } from "@/lib/plan-display";
import type { Plan } from "@/lib/types";
import type { RecommendMatch } from "@/app/quiz/types";

export const runtime = "nodejs";
// Ranking depends on the per-request body AND the live catalogue read, so keep it
// dynamic (per-request) and cache-free — each call sees the current DB prices.
export const dynamic = "force-dynamic";

// ── Origin allow-list (mirrors /api/lead + /api/rights) ──────────────────────
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

/** Categories the quiz accepts (matches the LeadForm + the catalogue, no electricity). */
const QUIZ_CATEGORIES = ["cellular", "internet", "tv", "triple", "abroad"] as const;
type QuizCategory = (typeof QUIZ_CATEGORIES)[number];

function isQuizCategory(v: unknown): v is QuizCategory {
  return typeof v === "string" && (QUIZ_CATEGORIES as readonly string[]).includes(v);
}

/** The five quiz answers the client posts. */
interface RecommendBody {
  category?: unknown;
  /** Monthly budget ceiling in ₪ (optional). */
  budget?: unknown;
  /** What to optimise for — a priority id the formula normalizes. */
  priority?: unknown;
  /** Number of lines/people (cellular) — informational + tie-break seed. */
  lines?: unknown;
  /** Whether the user needs abroad/roaming. */
  abroad?: unknown;
  /** Current monthly bill in ₪ — drives honest annual-saving (optional). */
  currentBill?: unknown;
  /** Max number of matches to return (clamped 1..10, default 5). */
  limit?: unknown;
}

/** Coerce to a positive finite number, or undefined. */
function posNum(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function POST(req: Request) {
  // ── Origin allow-list (block off-site / CSRF browser POSTs) ─────────────────
  if (!isAllowedOrigin(req)) {
    return Response.json({ ok: false, error: "forbidden origin" }, { status: 403 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: RecommendBody;
  try {
    body = (await req.json()) as RecommendBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // ── Validate: category is the only required input ───────────────────────────
  if (!isQuizCategory(body.category)) {
    return Response.json(
      { ok: false, error: "קטגוריה לא תקינה" },
      { status: 400 },
    );
  }
  const category = body.category;

  const priority: MatchPriority = priorityFromId(
    typeof body.priority === "string" ? body.priority : undefined,
  );
  const budget = posNum(body.budget);
  const currentBill = posNum(body.currentBill);
  const lines = posNum(body.lines);
  const wantsAbroad = body.abroad === true;
  const limitRaw = posNum(body.limit);
  const limit = limitRaw ? Math.min(10, Math.round(limitRaw)) : 5;

  // Derive the boolean needs the formula bonuses use from the priority + abroad
  // answer. (The quiz's priority answer "speed" implies wants5G; the abroad step
  // implies wantsAbroad; "flexibility" implies wantsNoCommit.) These only ever
  // ADD a small bonus to genuinely-matching plans — never fabricate a fit.
  const profile: MatchProfile = {
    category,
    priority,
    budget,
    currentBill,
    lines,
    wants5G: priority === "speed",
    wantsAbroad: wantsAbroad || category === "abroad",
    wantsNoCommit: priority === "flexibility",
  };

  // ── Rank REAL catalogue plans through the shared, provider-neutral formula ──
  // Read the LIVE DB catalogue (scoped to the quiz category) so the quiz ranks the
  // SAME fresh prices /compare and the plan-detail pages show. getLivePlans never
  // throws — on any failure it returns the bundled snapshot (stale) — and we add a
  // belt-and-braces bundled fallback if the live list comes back empty for the
  // category, so the quiz can never return zero matches from a transient read.
  const { plans: live } = await getLivePlans({ category });
  const plans = (live.length ? live : getPlans()) as ScorablePlan[];
  const ranked = rankPlans(plans, profile, { limit });

  const matches: RecommendMatch[] = ranked.map((m) => {
    const p = m.plan as Plan;
    // Build the SAME rich display bundle the comparison tables render from, so the
    // quiz result cards surface identical category-aware catalogue data (post-promo
    // price, decoder/router/installation, data/speed/minutes specs, perks) without
    // duplicating any of plan-display's truth-only logic.
    const d = planDisplay(p);
    return {
      id: String(p.id ?? ""),
      provider: String(p.provider ?? ""),
      plan: String(p.plan ?? ""),
      cat: String(p.cat ?? category),
      price: typeof p.price === "number" ? p.price : 0,
      after: typeof p.after === "number" ? p.after : null,
      priceUnit: priceUnitLabel(p),
      priceText: d.price,
      afterLabel: { kind: d.after.kind, text: d.after.text },
      fields: d.fields,
      perks: d.perks,
      is5G: p.is5G === true,
      noCommit: p.noCommit === true,
      hasAbroad: p.hasAbroad === true,
      score: m.scorePct,
      label: m.label,
      annualSaving: m.annualSaving,
      reasons: m.reasons,
      caveats: m.caveats,
    };
  });

  return Response.json({
    ok: true,
    category,
    priority,
    matches,
    // Echo whether a saving figure is meaningful, so the UI can frame it honestly
    // (no current bill ⇒ every annualSaving is 0 by design, not "no savings").
    hasBill: currentBill != null,
  });
}
