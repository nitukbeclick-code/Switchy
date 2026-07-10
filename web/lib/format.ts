// ────────────────────────────────────────────────────────────────────────────
// Presentation helpers — price formatting + per-unit Hebrew suffixes. Pure, no
// state. Mirrors the app's priceUnitLabel contract: the suffix is driven by
// Plan.priceUnit (month/package/day/minute); abroad plans default to per-package
// when unset. Never hardcode the suffix in a page — go through here.
// ────────────────────────────────────────────────────────────────────────────

import type { Plan, PriceUnit } from "./types";

/** Hebrew per-unit suffix, full form (e.g. "לחודש"). */
export function priceUnitLabel(plan: Plan): string {
  const unit = resolveUnit(plan);
  switch (unit) {
    case "package":
      return "לחבילה";
    case "day":
      return "ליום";
    case "minute":
      return "לדקה";
    case "month":
    default:
      return "לחודש";
  }
}

/** Hebrew per-unit suffix, short form (e.g. "/ח׳"). */
export function priceUnitShort(plan: Plan): string {
  const unit = resolveUnit(plan);
  switch (unit) {
    case "package":
      return "/חבילה";
    case "day":
      return "/יום";
    case "minute":
      return "/דק׳";
    case "month":
    default:
      return "/ח׳";
  }
}

/** Resolve the effective price unit: abroad defaults to per-package when unset. */
function resolveUnit(plan: Plan): PriceUnit {
  if (plan.priceUnit) return plan.priceUnit;
  return plan.cat === "abroad" ? "package" : "month";
}

/**
 * Format a number as an ILS price string with he-IL thousands grouping,
 * e.g. 69 → "₪69", 1068 → "₪1,068". THE single money formatter — every other
 * module (bill-forensics, street-price, wallet-stats, SavingsReveal,
 * BillUploader) imports this so a 4-figure saving never renders two ways.
 */
export function ils(n: number): string {
  return `₪${Math.round(n).toLocaleString("he-IL")}`;
}

/**
 * Categories the LeadForm accepts as a default (it has no "electricity" option).
 * Narrows an arbitrary category string to that set, or undefined if unsupported —
 * so pages can pass `leadCategory(cat)` straight into <LeadForm defaultCategory>.
 */
export type LeadCategory = "cellular" | "internet" | "tv" | "triple" | "abroad";

const LEAD_CATEGORIES: readonly LeadCategory[] = [
  "cellular",
  "internet",
  "tv",
  "triple",
  "abroad",
];

export function leadCategory(cat: string | undefined): LeadCategory | undefined {
  return LEAD_CATEGORIES.includes(cat as LeadCategory)
    ? (cat as LeadCategory)
    : undefined;
}

// ── Provider brand identity (avatar) ─────────────────────────────────────────
// Each carrier's OWN brand color, used to paint a small initial-circle avatar so
// a plan row is scannable at a glance. These are the providers' real brand hues —
// they are NOT the app's accent/value palette and must NEVER be recolored to it
// (the brand directive: per-carrier brand colors are not the app theme). The
// avatar USES the brand color; it never imposes the app's green/amber on it.
//
// Keys are the catalogue's exact provider display names (Hebrew or latin handle).
// A provider with no mapping falls back to a neutral ink so the avatar still
// renders (graceful, never blank) — truth-only: a guessed-wrong brand color would
// be worse than a neutral one, so unknowns stay neutral rather than fabricated.
const PROVIDER_BRAND_COLOR: Readonly<Record<string, string>> = {
  סלקום: "#0098DA", // Cellcom blue
  פרטנר: "#00B5A5", // Partner teal
  פלאפון: "#E5202E", // Pelephone red
  "גולן טלקום": "#00A859", // Golan Telecom green
  "הוט מובייל": "#ED1C24", // HOT Mobile red
  HOT: "#ED1C24", // HOT red
  "רמי לוי": "#E30613", // Rami Levy red
  "וואלה מובייל": "#5B2D8E", // Walla purple
  בזק: "#005CA9", // Bezeq blue
  גילת: "#1F3A5F", // Gilat deep blue
  "019 מובייל": "#F6921E", // 019 Mobile orange
  Xphone: "#7C3AED", // Xphone violet
  WeCom: "#2563EB", // WeCom blue
  CCC: "#0F766E", // CCC teal
  "STING TV": "#DB2777", // Sting magenta
  yes: "#6D28D9", // yes purple
  NextTV: "#0EA5E9", // NextTV sky
  "Airalo eSIM": "#1D4ED8", // Airalo blue
};

/** Neutral fallback (structural ink) for providers with no known brand color. */
const PROVIDER_BRAND_FALLBACK = "#374151";

/**
 * The carrier's own brand color, for painting the row avatar. Returns a neutral
 * ink for unknown providers (never blank, never the app accent). NOT the app
 * theme — do not recolor these to the brand palette.
 */
export function providerBrandColor(provider: string): string {
  return PROVIDER_BRAND_COLOR[provider.trim()] ?? PROVIDER_BRAND_FALLBACK;
}

/**
 * Provider SLUG → logo filename in web/public/assets/logos/. Mirrors the static
 * site's LOGO_FILE (site/build.js) exactly — same asset files, same slugs (from
 * providerSlug()) — so a real carrier logo renders identically on web + static.
 * A provider with no entry here has no bundled logo asset, so the caller falls
 * back to the colored-initials avatar (truth-only: never a wrong/placeholder
 * logo). Brand assets are the carriers' own — never recolored.
 */
const PROVIDER_LOGO_FILES: Readonly<Record<string, string>> = {
  cellcom: "cellcom.webp",
  partner: "partner.webp",
  pelephone: "pelephone.svg",
  golan: "golan.webp",
  "hot-mobile": "hot-mobile.webp",
  hot: "hot.svg",
  "rami-levy": "rami-levy.webp",
  "walla-mobile": "walla-mobile.webp",
  bezeq: "bezeq.svg",
  gilat: "gilat.webp",
  "019mobile": "019mobile.webp",
  xphone: "xphone.png",
  wecom: "wecom.png",
  ccc: "ccc.png",
  "sting-tv": "sting-tv.png",
  yes: "yes.webp",
  nexttv: "nexttv.png",
  airalo: "airalo.webp",
  // providerSlug("Airalo eSIM") yields "airalo-esim" on the Next app (no
  // SLUG_OVERRIDES entry, unlike the static site's PROVIDER_SLUGS) — alias it
  // to the same brand asset instead of changing the public /providers URL.
  "airalo-esim": "airalo.webp",
};

/**
 * The logo filename for a provider SLUG (from providerSlug()), or undefined when
 * the carrier has no bundled logo → the caller should fall back to the initials
 * avatar. Use as `/assets/logos/${providerLogoFile(slug)}`.
 */
export function providerLogoFile(slug: string): string | undefined {
  return PROVIDER_LOGO_FILES[slug];
}

/**
 * The 1–2 character monogram for a provider avatar — the leading word's first
 * character, plus the next word's first character when the name is multi-word
 * (e.g. "גולן טלקום" → "גט", "סלקום" → "ס"). Latin handles upper-case (e.g.
 * "NextTV" → "N", "STING TV" → "ST"). Presentation only — drives the avatar glyph.
 */
export function providerInitials(provider: string): string {
  const words = provider.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const second = words.length > 1 ? (words[1][0] ?? "") : "";
  const mono = (first + second) || "?";
  // Upper-case latin; Hebrew has no case so this is a no-op for it.
  return mono.toUpperCase();
}
