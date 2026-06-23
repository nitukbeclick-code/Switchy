// Shared catalogue grounding for the AI agent (WhatsApp bot, future reuse by the
// site-* functions). Pure functions over the bundled plans snapshot
// (site/data/plans.json shape) so the model is grounded in REAL catalogue rows
// and can never invent providers/plans/prices.

export type Plan = {
  id?: string;
  cat?: string;
  provider?: string;
  plan?: string;
  price?: number;
  priceExact?: number | null;
  after?: number | null;
  afterExact?: number | null;
  is5G?: boolean;
  noCommit?: boolean;
  hasAbroad?: boolean;
  priceUnit?: string;
  kind?: string;
  specs?: Record<string, string>;
  feats?: string[];
};

export const CATEGORIES = ["cellular", "internet", "tv", "triple", "abroad"] as const;

export const CATEGORY_HE: Record<string, string> = {
  cellular: "סלולר",
  internet: "אינטרנט",
  tv: "טלוויזיה",
  triple: "חבילה משולבת",
  abroad: 'חו"ל',
};

export function plansFromSnapshot(snapshot: unknown): Plan[] {
  const rows = (snapshot as { plans?: Plan[] })?.plans;
  return Array.isArray(rows) ? rows : [];
}

// Pull a post-promo ("after the promo") price out of free text. The DB has no
// explicit `after` column, but the title/subtitle/specs often spell it out
// ("אחרי שנה ₪89", "המחיר יעלה ל-99 ₪", "לאחר המבצע 120"). Returns a plausible
// monthly figure only when it differs from the headline price.
function deriveAfterPrice(blob: string, price: number | undefined): number | null {
  if (!(typeof price === "number")) return null;
  const m = blob.match(
    /(?:אחרי|לאחר|בתום|בסיום)[^0-9]{0,24}?(?:המבצע|התקופה|השנה|שנה|שנתיים|המחיר)?[^0-9]{0,12}?(?:יעלה|עולה|יהיה|ל-?|₪)?\s*₪?\s*(\d{2,4})/,
  );
  if (!m) return null;
  const after = Number(m[1]);
  if (!Number.isFinite(after) || after <= 0 || after > 5000) return null;
  // Only meaningful if it's strictly above the promo price (a real step-up).
  return after > price ? Math.round(after) : null;
}

// Capture the handful of spec fields the model finds most useful for telecom
// recommendations, normalized to a flat string map regardless of the source key
// language (the live `specs` jsonb uses Hebrew keys; be forgiving of synonyms).
const SPEC_PICKERS: { out: string; keys: string[] }[] = [
  { out: "data", keys: ["נתונים", "גלישה", "נפח", "data", "gb"] },
  { out: "speed", keys: ["מהירות", "speed", "מבית"] },
  { out: "minutes", keys: ["דקות", "שיחות", "minutes"] },
  { out: "channels", keys: ["ערוצים", "channels", "תכנים"] },
  { out: "commit", keys: ["התחייבות", "commitment"] },
  { out: "abroad", keys: ['חו"ל', "חול", "roaming", "abroad"] },
];

function pickSpecs(specs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const entries = Object.entries(specs);
  for (const { out: key, keys } of SPEC_PICKERS) {
    for (const [k, v] of entries) {
      const lk = k.toLowerCase();
      if (v && keys.some((a) => lk.includes(a.toLowerCase()))) { out[key] = String(v); break; }
    }
  }
  return out;
}

// Coerce a DB value to a boolean when it's an explicit flag column, else null
// (so callers know to fall back to text derivation). Accepts true/false plus the
// stringy forms PostgREST can hand back ("true"/"t"/"1").
function boolColumn(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "t" || s === "1") return true;
    if (s === "false" || s === "f" || s === "0") return false;
  }
  return null;
}

// A finite positive post-promo price from the explicit `after`/`after_exact`
// columns, or null when absent (→ caller derives it from the text instead).
function afterColumn(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// Map rows from the live `public.plans` table (DB column names differ from the
// JSON snapshot: category→cat, title→plan) into the Plan shape.
//
// PREFER the now-explicit catalogue columns when present — after / after_exact
// (post-promo price), is_5g, no_commit, has_abroad — and FALL BACK to deriving
// each from the title/subtitle/specs text when the column is null/absent (older
// rows, or a row the export tool hasn't refreshed yet). This keeps the live
// webhook working whether or not the enrich migration + export have run.
export function plansFromRows(rows: Array<Record<string, unknown>>): Plan[] {
  return rows
    .map((r) => {
      const title = String(r.title ?? "");
      const subtitle = String(r.subtitle ?? "");
      const rawSpecs = (r.specs && typeof r.specs === "object" ? r.specs : {}) as Record<string, string>;
      const blob = `${title} ${subtitle} ${JSON.stringify(rawSpecs)}`.toLowerCase();
      const price = Number(r.price);
      const priceNum = Number.isFinite(price) ? price : undefined;
      const picked = pickSpecs(rawSpecs);
      // Preserve the original Hebrew "נתונים" key the catalogue context reads,
      // and add the normalized slots so callers get both.
      const specs: Record<string, string> = { ...rawSpecs, ...picked };
      // Explicit columns win; null means "not set" → derive from text.
      const after = afterColumn(r.after_exact ?? r.after);
      const is5g = boolColumn(r.is_5g);
      const noCommit = boolColumn(r.no_commit);
      const hasAbroad = boolColumn(r.has_abroad);
      return {
        id: r.id ? String(r.id) : undefined,
        cat: r.category ? String(r.category) : undefined,
        provider: r.provider ? String(r.provider) : undefined,
        plan: title,
        price: priceNum,
        after: after ?? deriveAfterPrice(blob, priceNum),
        priceUnit: r.price_unit ? String(r.price_unit) : undefined,
        kind: r.kind ? String(r.kind) : "regular",
        specs,
        is5G: is5g ?? /5g/.test(blob),
        hasAbroad: hasAbroad ?? /חו"ל|חול|abroad|roaming|esim/.test(blob),
        noCommit: noCommit ?? /ללא התחייבות|בלי התחייבות|no commit|ללא הת'/.test(blob),
        feats: subtitle ? [subtitle].filter(Boolean) : undefined,
      } as Plan;
    })
    .filter((p) => p.cat && typeof p.price === "number");
}

export function catalogueProviders(plans: Plan[]): string[] {
  const set = new Set<string>();
  for (const p of plans) if (p.provider) set.add(p.provider);
  return [...set];
}

function unitLabel(u?: string): string {
  return u === "package" ? "לחבילה" : u === "day" ? "ליום" : u === "minute" ? "לדקה" : "לחודש";
}

// Compact pipe-delimited rows, cheapest `perCat` regular plans per category.
// Mirrors the site AI grounding format, enriched with the post-promo price and
// key data spec (kamaze-parity) so the bot can answer "price after the year".
export function buildCatalogueContext(plans: Plan[], perCat = 14): string {
  const byCat = new Map<string, Plan[]>();
  for (const p of plans) {
    if (!p.cat || typeof p.price !== "number") continue;
    if ((p.kind ?? "regular") !== "regular") continue;
    if (!byCat.has(p.cat)) byCat.set(p.cat, []);
    byCat.get(p.cat)!.push(p);
  }
  const lines: string[] = [];
  for (const cat of CATEGORIES) {
    const rows = byCat.get(cat);
    if (!rows) continue;
    rows.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    for (const p of rows.slice(0, perCat)) {
      const unit = unitLabel(p.priceUnit);
      const after = (typeof p.after === "number" && p.after > 0 && p.after !== p.price)
        ? `, אחרי המבצע ₪${p.after}`
        : "";
      const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && 'כולל חו"ל']
        .filter(Boolean).join(", ");
      // Most useful spec per category: data for cellular/abroad, speed for
      // internet, channels for tv — fall back to the raw Hebrew "נתונים" key.
      const spec = p.specs?.data ?? p.specs?.["נתונים"] ?? "";
      const extra = cat === "internet"
        ? (p.specs?.speed ?? "")
        : cat === "tv"
        ? (p.specs?.channels ?? "")
        : (spec || p.specs?.minutes || "");
      const detail = extra ? `, ${extra}` : "";
      lines.push(`${cat} | ${p.provider} | ${p.plan} | ₪${p.price} ${unit}${after}${detail}${flags ? " | " + flags : ""}`);
    }
  }
  return lines.join("\n");
}

// ── Grounding with citations (site AI chat, Track 2E) ────────────────────────
// A catalogue context where every row is tagged with a short, stable citation
// marker [Sn] so the model can ground each factual claim in a REAL row and cite
// it inline. The marker is derived from the row's position (S1, S2, …) — the
// model echoes [Sn] in its answer and we leave it as a lightweight provenance
// signal the front-end can render. Refusing/omitting when data is missing is
// enforced by the system prompt (see buildGroundedSystemPrompt): the model only
// ever sees these rows, so it can't cite a plan that isn't here.
export function buildCitedCatalogueContext(plans: Plan[], perCat = 14): string {
  const byCat = new Map<string, Plan[]>();
  for (const p of plans) {
    if (!p.cat || typeof p.price !== "number") continue;
    if ((p.kind ?? "regular") !== "regular") continue;
    if (!byCat.has(p.cat)) byCat.set(p.cat, []);
    byCat.get(p.cat)!.push(p);
  }
  const lines: string[] = [];
  let n = 0;
  for (const cat of CATEGORIES) {
    const rows = byCat.get(cat);
    if (!rows) continue;
    rows.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    for (const p of rows.slice(0, perCat)) {
      n += 1;
      const unit = unitLabel(p.priceUnit);
      const after = (typeof p.after === "number" && p.after > 0 && p.after !== p.price)
        ? `, אחרי המבצע ₪${p.after}`
        : "";
      const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && 'כולל חו"ל']
        .filter(Boolean).join(", ");
      const spec = p.specs?.data ?? p.specs?.["נתונים"] ?? "";
      const extra = cat === "internet"
        ? (p.specs?.speed ?? "")
        : cat === "tv"
        ? (p.specs?.channels ?? "")
        : (spec || p.specs?.minutes || "");
      const detail = extra ? `, ${extra}` : "";
      lines.push(`[S${n}] ${CATEGORY_HE[cat] ?? cat} | ${p.provider} | ${p.plan} | ₪${p.price} ${unit}${after}${detail}${flags ? " | " + flags : ""}`);
    }
  }
  return lines.join("\n");
}

export function annualSaving(currentSpend: number, planPrice: number): number {
  if (!(currentSpend > 0) || typeof planPrice !== "number") return 0;
  return Math.max(0, Math.round((currentSpend - planPrice) * 12));
}

export type Suggestion = { id?: string; name: string; provider: string; price: number; annualSaving: number };

// Up to `max` cheaper regular plans in the same category, sorted by price.
export function buildSuggestions(plans: Plan[], category: string, currentSpend: number, max = 3): Suggestion[] {
  if (!category || !(currentSpend > 0)) return [];
  return plans
    .filter((p) =>
      p.cat === category &&
      typeof p.price === "number" &&
      (p.price as number) < currentSpend &&
      (p.kind ?? "regular") === "regular")
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    .slice(0, max)
    .map((p) => ({
      id: p.id,
      name: String(p.plan ?? ""),
      provider: String(p.provider ?? ""),
      price: p.price as number,
      annualSaving: annualSaving(currentSpend, p.price as number),
    }));
}

// Candidate set for the advisor flow: cheapest N regular plans in a category
// (optionally abroad-capable / under budget), used to ground recommendations.
export function pickCandidates(
  plans: Plan[],
  opts: { category?: string; budget?: number; abroad?: boolean },
  n = 12,
): Plan[] {
  let rows = plans.filter((p) => typeof p.price === "number" && (p.kind ?? "regular") === "regular");
  if (opts.category) rows = rows.filter((p) => p.cat === opts.category);
  if (opts.abroad) rows = rows.filter((p) => p.hasAbroad);
  rows.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (opts.budget && opts.budget > 0) {
    const under = rows.filter((p) => (p.price ?? 0) <= opts.budget!);
    if (under.length >= 3) rows = under;
  }
  return rows.slice(0, n);
}

// Best-effort parse of a free-text WhatsApp message into recommendation hints:
// which category, a rough monthly budget (₪), and whether abroad matters.
export function parseAdvisorHints(
  text: string,
): { category?: string; budget?: number; abroad?: boolean } {
  const s = (text ?? "").toLowerCase();
  const category = normalizeCategory(s) || undefined;
  const abroad = /חו"ל|חול|abroad|roaming|esim|נסיע|טיול/.test(s) || undefined;
  // A price-ish number near a ₪/שקל/"עד" cue, else the first 2-4 digit number.
  let budget: number | undefined;
  const cue = s.match(/(?:עד|תקציב|מחיר|₪|שקל[ים]?)[^0-9]{0,8}(\d{2,4})/) ??
    s.match(/(\d{2,4})\s*(?:₪|שקל)/);
  const n = Number((cue?.[1] ?? "").replace(/[^\d]/g, ""));
  if (Number.isFinite(n) && n >= 10 && n <= 5000) budget = n;
  return { category, budget, abroad };
}

// A tight, grounded candidate block for the recommend path: the cheapest real
// plans matching the user's hints, formatted like the catalogue context so the
// model picks FROM these rows instead of scanning the whole list.
export function buildRecommendBlock(
  plans: Plan[],
  hints: { category?: string; budget?: number; abroad?: boolean },
  n = 6,
): string {
  const rows = pickCandidates(plans, hints, n);
  if (!rows.length) return "";
  const lines = rows.map((p) => {
    const unit = unitLabel(p.priceUnit);
    const after = (typeof p.after === "number" && p.after > 0 && p.after !== p.price)
      ? `, אחרי המבצע ₪${p.after}`
      : "";
    const flags = [p.is5G && "5G", p.noCommit && "ללא התחייבות", p.hasAbroad && 'כולל חו"ל']
      .filter(Boolean).join(", ");
    const spec = p.specs?.data ?? p.specs?.speed ?? p.specs?.channels ?? p.specs?.["נתונים"] ?? "";
    const detail = spec ? `, ${spec}` : "";
    return `${p.cat} | ${p.provider} | ${p.plan} | ₪${p.price} ${unit}${after}${detail}${flags ? " | " + flags : ""}`;
  });
  return lines.join("\n");
}

// Provider/category normalization (the single source of truth, shared with the
// bill-photo flow in site-bill-analyzer and the WhatsApp bot). Longer,
// more-specific aliases ("הוט מובייל") precede looser ones ("הוט") so they win.
// This is the SUPERSET of every provider either surface recognizes — keep the
// live bill analyzer importing this so a brand the bot knows is also matched on
// a photographed bill, and vice versa.
export const PROVIDER_ALIASES: { canonical: string; aliases: string[] }[] = [
  { canonical: "סלקום", aliases: ["סלקום", "cellcom"] },
  { canonical: "פרטנר", aliases: ["פרטנר", "partner", "orange"] },
  { canonical: "פלאפון", aliases: ["פלאפון", "pelephone"] },
  { canonical: "הוט מובייל", aliases: ["הוט מובייל", "hot mobile"] },
  { canonical: "HOT", aliases: ["הוט", "hot"] },
  { canonical: "בזק", aliases: ["בזק", "bezeq"] },
  { canonical: "yes", aliases: ["yes", "יס"] },
  { canonical: "גולן טלקום", aliases: ["גולן", "golan"] },
  { canonical: "019 מובייל", aliases: ["019"] },
  { canonical: "רמי לוי", aliases: ["רמי לוי", "rami levy", "rami levi"] },
  { canonical: "וואלה מובייל", aliases: ["וואלה", "walla"] },
  { canonical: "Xphone", aliases: ["xphone", "אקספון"] },
  { canonical: "WeCom", aliases: ["wecom"] },
  { canonical: "CCC", aliases: ["ccc"] },
  { canonical: "STING TV", aliases: ["sting"] },
  { canonical: "NextTV", aliases: ["nexttv", "next tv"] },
  { canonical: "גילת", aliases: ["גילת", "gilat"] },
  { canonical: "Airalo eSIM", aliases: ["airalo"] },
];

export function normalizeProvider(raw: string, providers: string[]): string {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "";
  for (const p of providers) if (p.toLowerCase() === s) return p;
  for (const { canonical, aliases } of PROVIDER_ALIASES) if (aliases.some((a) => s.includes(a))) return canonical;
  for (const p of providers) if (p && s.includes(p.toLowerCase())) return p;
  return "";
}

export function normalizeCategory(raw: string): string {
  const s = (raw ?? "").trim().toLowerCase();
  if ((CATEGORIES as readonly string[]).includes(s)) return s;
  if (/(סלולר|נייד|mobile|phone|cellular)/.test(s)) return "cellular";
  // abroad BEFORE internet: "גלישה בחו״ל" carries both the bare internet cue
  // (גלישה) and the abroad cue (חו"ל) — abroad is the more specific intent, so
  // it must win. A bare "גלישה" with no abroad cue still falls through to
  // internet below.
  if (/(חו"ל|חול|abroad|roaming|esim)/.test(s)) return "abroad";
  if (/(אינטרנט|גלישה|internet|fiber|סיב)/.test(s)) return "internet";
  if (/(טלוויזיה|טלויזיה|tv|stream)/.test(s)) return "tv";
  if (/(טריפל|triple|חבילה משולבת|משולב)/.test(s)) return "triple";
  return "";
}
