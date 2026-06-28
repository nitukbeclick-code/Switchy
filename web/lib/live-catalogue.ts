// ────────────────────────────────────────────────────────────────────────────
// Live catalogue — ONE source of truth per render for the AEO pages.
//
// WHAT: `getLivePlans()` reads the CURRENT plan catalogue from Supabase
// (public.plans) at render / ISR-revalidate time, normalised to the bundled
// `Plan` shape (lib/types). The bundled lib/data catalogue is the resilient
// FALLBACK: if the live read fails (network, RLS, env unset, malformed row) the
// function NEVER throws — it returns the bundled snapshot plus `stale: true` so
// the page can render honestly and (optionally) flag that prices may be slightly
// behind.
//
// WHY: FRESHNESS = real accuracy. The AEO direct-answer, comparison table and
// JSON-LD on a page MUST all read from the SAME plan list so they can never
// disagree. Pages call getLivePlans() ONCE and thread the result through every
// AEO helper + component + schema builder. Pair this with the page's
// `export const revalidate = 3600` (ISR) so the static HTML is regenerated on a
// schedule with fresh DB prices, while still serving instantly from cache.
//
// SECURITY: reads use the PUBLIC anon (publishable) key only — public.plans has
// a "publicly readable" RLS policy + an anon SELECT grant. No service-role key,
// no secret, ever touches this path. Writes are impossible from here.
//
// TRUTH-ONLY: this module only TRANSPORTS real rows (live or bundled). It
// fabricates no prices, fills no gaps with guesses, and invents no plans.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import type { Category, Plan, PriceUnit } from "./types";
import { getPlans } from "./data";

/** Public project URL (safe to expose). Falls back to the known project ref. */
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co";

/** Public anon / publishable key — RLS-gated, safe in any context. */
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Hard cap on how long we wait for the live read before falling back. */
const READ_TIMEOUT_MS = 4_000;

/** The catalogue categories the GEO app surfaces (matches lib/types Category). */
const KNOWN_CATEGORIES: ReadonlySet<string> = new Set<Category>([
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
  "electricity",
]);

const VALID_PRICE_UNITS: ReadonlySet<string> = new Set<PriceUnit>([
  "month",
  "package",
  "day",
  "minute",
]);

/** The raw shape of a `public.plans` row (snake_case columns). */
interface RawPlanRow {
  id: string;
  category: string;
  provider: string;
  title: string;
  subtitle?: string | null;
  price: number | string;
  price_exact?: number | string | null;
  after?: number | string | null;
  after_exact?: number | string | null;
  is_5g?: boolean | null;
  no_commit?: boolean | null;
  has_abroad?: boolean | null;
  price_unit?: string | null;
  kind?: string | null;
  specs?: Record<string, string> | null;
  // Rich fee/spec data the comparison views render — exists on public.plans (jsonb).
  fees?: unknown;
  // ── Owner-editable QUALITATIVE columns (AGREED SCHEMA CONTRACT) ──────────────
  // `feats` (jsonb array of "what's included" benefit strings), `fine_lines`
  // (jsonb array of the small-print clauses) and `notes` (free text) are now REAL
  // owner-editable columns on public.plans. They are read live and normalised to
  // the camelCase Plan shape (feats / fineLines / notes). When a column is absent
  // or empty the bundled snapshot fills it in by id (see mergeBundledRichFields),
  // so the page stays correct whether or not the owner has seeded a given plan.
  feats?: unknown;
  fine_lines?: unknown;
  notes?: string | null;
  highlight?: string | null;
  terms?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

/** The result of a catalogue read: the plans + provenance flags. */
export interface LiveCatalogue {
  /** Normalised plans (live when `stale` is false, bundled when true). */
  plans: Plan[];
  /**
   * True when the LIVE read failed and these are the BUNDLED fallback plans, so
   * the caller can (honestly) note prices may be slightly behind. False when
   * the rows are the fresh live snapshot.
   */
  stale: boolean;
  /** Where the plans came from — for diagnostics / honest UI copy. */
  source: "live" | "bundled";
  /**
   * Most recent `updated_at` across the live rows (ISO), when available. `null`
   * for the bundled fallback (it has no per-row timestamp). Lets the page show a
   * truthful "data as of" date from the real DB rather than a build constant.
   */
  lastUpdated: string | null;
}

/** Options for {@link getLivePlans}. */
export interface GetLivePlansOptions {
  /**
   * Limit to a single category (e.g. "cellular"). Omit for the whole catalogue.
   * Applied in the live query AND to the bundled fallback so both honour it.
   */
  category?: string;
  /**
   * Force the bundled snapshot without attempting a live read (e.g. for tests
   * or when the caller knows it has no network). Defaults to false.
   */
  bundledOnly?: boolean;
}

/** Coerce a possibly-string numeric to a finite number, or null. */
function num(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Coerce a live jsonb value into a clean `string[]` of trimmed, non-empty
 * strings, or `null` when there is nothing usable. Accepts a real array (the
 * expected jsonb shape) and is defensive about a stray JSON-encoded string. Used
 * for the `feats` / `fine_lines` columns so a malformed cell degrades to "absent"
 * (→ bundled fallback fills in) rather than poisoning the row. Truth-only: it
 * only filters/trims what the DB actually holds — it invents nothing.
 */
function strArray(value: unknown): string[] | null {
  let arr: unknown = value;
  if (typeof arr === "string") {
    const t = arr.trim();
    if (!t) return null;
    // A jsonb array column normally arrives parsed; tolerate a stringified one.
    if (t.startsWith("[")) {
      try {
        arr = JSON.parse(t);
      } catch {
        return null;
      }
    } else {
      return [t];
    }
  }
  if (!Array.isArray(arr)) return null;
  const out = arr
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  return out.length ? out : null;
}

/**
 * Normalise one raw `public.plans` row into the bundled {@link Plan} shape.
 * Returns `null` for rows missing the load-bearing fields (id/provider/title/
 * price or an unknown category) so a single malformed row can't poison the page.
 * Prefers the exact price columns (price_exact/after_exact) when present, falling
 * back to the rounded headline columns — mirroring the bundled catalogue, which
 * carries both `price` and `priceExact`.
 */
function normalizeRow(row: RawPlanRow): Plan | null {
  if (!row || typeof row !== "object") return null;
  const id = typeof row.id === "string" ? row.id : null;
  const provider = typeof row.provider === "string" ? row.provider : null;
  const title = typeof row.title === "string" ? row.title : null;
  const cat = typeof row.category === "string" ? row.category : null;
  const price = num(row.price_exact) ?? num(row.price);

  if (!id || !provider || !title || !cat || price == null) return null;
  if (!KNOWN_CATEGORIES.has(cat)) return null;

  const after = num(row.after_exact) ?? num(row.after);
  const priceUnit =
    typeof row.price_unit === "string" && VALID_PRICE_UNITS.has(row.price_unit)
      ? (row.price_unit as PriceUnit)
      : undefined;

  const plan: Plan = {
    id,
    cat: cat as Category,
    provider,
    plan: title,
    price,
    after: after,
    is5G: row.is_5g === true,
    noCommit: row.no_commit === true,
    hasAbroad: row.has_abroad === true,
  };

  if (priceUnit) plan.priceUnit = priceUnit;
  if (typeof row.kind === "string" && row.kind) plan.kind = row.kind;
  if (row.specs && typeof row.specs === "object") plan.specs = row.specs;
  if (typeof row.subtitle === "string" && row.subtitle) {
    plan.subtitle = row.subtitle;
  }
  if (typeof row.highlight === "string" && row.highlight) {
    plan.highlight = row.highlight;
  }
  if (typeof row.terms === "string" && row.terms) plan.terms = row.terms;

  // ── Rich display payload (truth-only passthrough) ───────────────────────────
  // Carry the EXACT price columns so the comparison views can show ₪69.90 (not a
  // rounded ₪70) and decide "price jump vs קבוע" the same way the bundled
  // catalogue does. `fees` (jsonb) is a real column and drives the נתב/ממיר/
  // התקנה table fields. The QUALITATIVE columns feats / fine_lines / notes are now
  // REAL owner-editable columns too — read live here, normalised to the camelCase
  // Plan shape (feats / fineLines / notes). Empty/absent columns are left unset so
  // mergeBundledRichFields can fall back to the committed snapshot by id. Nothing
  // here is fabricated — only real cells are passed through.
  const priceExact = num(row.price_exact);
  if (priceExact != null) plan.priceExact = priceExact;
  const afterExact = num(row.after_exact);
  if (afterExact != null) plan.afterExact = afterExact;
  if (row.fees && typeof row.fees === "object") plan.fees = row.fees;

  const feats = strArray(row.feats);
  if (feats) plan.feats = feats;
  const fineLines = strArray(row.fine_lines);
  if (fineLines) plan.fineLines = fineLines;
  if (typeof row.notes === "string" && row.notes.trim()) {
    plan.notes = row.notes.trim();
  }

  // Real rating data only (callers omit Review/Rating schema when absent).
  const rating = num(row.rating);
  const reviewCount = num(row.review_count);
  if (rating != null) plan.rating = rating;
  if (reviewCount != null) plan.reviews = reviewCount;

  return plan;
}

/** The bundled fallback as a {@link LiveCatalogue}, optionally category-scoped. */
function bundledCatalogue(category?: string): LiveCatalogue {
  const all = getPlans();
  const plans = category ? all.filter((p) => p.cat === category) : all;
  return { plans, stale: true, source: "bundled", lastUpdated: null };
}

/** True when a rich value is "present + non-empty" (array with items / non-blank string). */
function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.some((x) => String(x ?? "").trim().length > 0);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

/**
 * Reconcile the QUALITATIVE rich fields (`feats`, `fineLines`, `notes`) between
 * the LIVE rows and the committed bundled catalogue, matched by plan `id`.
 *
 * DB-FIRST, BUNDLE-FALLBACK: when the live plan already carries a present +
 * non-empty value for a field, that owner-edited DB value WINS untouched. Only
 * when the field is absent/empty on the live plan do we fall back to the bundled
 * snapshot for the SAME id — keeping the committed catalogue as last-known-good.
 * This stays correct whether or not the owner has seeded a given plan's columns:
 * a freshly-edited plan shows its DB perks/fine-print; an unseeded one shows the
 * committed copy; a brand-new live-only plan keeps exactly its DB data.
 *
 * TRUTH-ONLY: never overrides a real DB value, never crosses plan ids, fabricates
 * nothing. Mutates the passed plans in place (freshly built per render) and
 * returns them for chaining.
 */
function mergeBundledRichFields(plans: Plan[]): Plan[] {
  const bundledById = new Map(getPlans().map((p) => [p.id, p]));
  for (const plan of plans) {
    const bundled = bundledById.get(plan.id);
    if (!bundled) continue;
    if (!hasContent(plan.feats) && hasContent(bundled.feats)) {
      plan.feats = bundled.feats;
    }
    if (!hasContent(plan.fineLines) && hasContent(bundled.fineLines)) {
      plan.fineLines = bundled.fineLines;
    }
    if (!hasContent(plan.notes) && hasContent(bundled.notes)) {
      plan.notes = bundled.notes;
    }
  }
  return plans;
}

/** Newest `updated_at` across the rows (ISO), or null when none is parseable. */
function newestUpdatedAt(rows: RawPlanRow[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const r of rows) {
    if (typeof r.updated_at !== "string") continue;
    const t = Date.parse(r.updated_at);
    if (Number.isNaN(t)) continue;
    if (best == null || t > best) {
      best = t;
      bestIso = r.updated_at;
    }
  }
  return bestIso;
}

/**
 * Read the CURRENT plan catalogue, live from Supabase when possible.
 *
 * - On success: `{ plans, stale: false, source: "live", lastUpdated }` — the
 *   fresh DB snapshot, normalised to the {@link Plan} shape, sorted cheapest
 *   first (so a page's "cheapest" and table order are deterministic).
 * - On ANY failure (env unset, network, RLS, timeout, zero valid rows): the
 *   BUNDLED fallback `{ plans, stale: true, source: "bundled" }`. NEVER throws.
 *
 * FRESHNESS: uses `cache: "no-store"` on the underlying read so each ISR
 * regeneration reads the real current DB state; the page's `revalidate` controls
 * how often that regeneration runs. Call this ONCE per render and thread the
 * result through every AEO helper/component/schema builder so they agree.
 */
export async function getLivePlans(
  opts: GetLivePlansOptions = {},
): Promise<LiveCatalogue> {
  const { category, bundledOnly } = opts;

  // No key (or explicitly bundled-only) → use the resilient bundled snapshot.
  if (bundledOnly || !ANON_KEY) return bundledCatalogue(category);

  try {
    const supabase = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Bypass Next's fetch cache so each ISR regeneration reads fresh DB
        // state; the page's `export const revalidate` governs regeneration.
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            cache: "no-store",
            signal: AbortSignal.timeout(READ_TIMEOUT_MS),
          }),
      },
    });

    let query = supabase
      .from("plans")
      .select(
        "id,category,provider,title,subtitle,price,price_exact,after,after_exact,is_5g,no_commit,has_abroad,price_unit,kind,specs,fees,feats,fine_lines,notes,highlight,terms,rating,review_count,updated_at",
      );
    if (category) query = query.eq("category", category);

    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length === 0) {
      return bundledCatalogue(category);
    }

    const rows = data as RawPlanRow[];
    const plans: Plan[] = [];
    for (const row of rows) {
      const p = normalizeRow(row);
      if (p) plans.push(p);
    }
    // Zero valid rows after normalisation → fall back rather than render empty.
    if (plans.length === 0) return bundledCatalogue(category);

    // Reconcile the qualitative perks/fine-print/notes: DB-first (owner-edited
    // feats/fine_lines/notes win), bundled snapshot as last-known-good fallback by
    // id for any plan whose columns are unseeded/empty. Truth-only, same-id only.
    mergeBundledRichFields(plans);

    plans.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return {
      plans,
      stale: false,
      source: "live",
      lastUpdated: newestUpdatedAt(rows),
    };
  } catch {
    // Any unexpected failure (timeout, abort, parse) → resilient fallback.
    return bundledCatalogue(category);
  }
}
