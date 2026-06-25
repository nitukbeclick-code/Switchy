// ─────────────────────────────────────────────────────────────────────────────
// lib/guides.ts — the GUIDES content layer for the /guides authority hub.
//
// The article content itself is REAL: it is ported verbatim from the hand-written
// static site (site/build.js guides[] + site/content/guides/*.json) into the
// generated, typed `GUIDES_RAW` array in ./guides.data.ts. This module adds:
//   • the public types (Guide / GuideSection / GuideFaq / HowToStep),
//   • pure accessors (getGuides / getGuide / guideCategories / relatedGuides),
//   • internal-link target resolution (a guide's category → the real on-site
//     /compare/<cat> page, plus the /providers hub) so a guide never dead-ends.
//
// PURE: no I/O — the data is embedded at build time. Fully unit-testable.
//
// HONESTY (E-E-A-T): nothing here fabricates content, prices, dates or claims.
// Every guide mirrors an existing published article; every internal link points
// at a real on-site route. The category→compare mapping only emits links for the
// five real compare categories; the editorial "מדריך כללי" bucket has no single
// category page and instead links to the compare/providers hubs.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORY_HE } from "./categories";
import { GUIDES_RAW } from "./guides.data";

// ── Raw (on-disk) shape — matches guides.data.ts verbatim ────────────────────
/** A tip/callout box inside a section (amber "tip" highlight or neutral note). */
export interface GuideCallout {
  /** Optional heading (defaults are applied at render time). */
  title?: string;
  /** The callout body text. */
  text: string;
}

/** One section of a guide article (heading + paragraphs and/or a bullet list). */
export interface GuideSection {
  /** Section heading (Hebrew). */
  h2: string;
  /** Body paragraphs, in order. */
  p?: string[];
  /** Bullet points, in order. */
  ul?: string[];
  /** An amber "tip" highlight callout. */
  tip?: GuideCallout;
  /** A neutral "note" callout. */
  callout?: GuideCallout;
}

/** A visible FAQ question/answer pair (kept in sync with the FAQPage JSON-LD). */
export interface GuideFaq {
  /** The question. */
  q: string;
  /** The answer. */
  a: string;
}

/** One ordered step of a how-to guide (drives the HowTo JSON-LD + visible list). */
export interface HowToStep {
  /** Short step name. */
  name: string;
  /** Step instructions. */
  text: string;
}

/** The raw guide shape as stored in guides.data.ts (the generated source). */
export interface RawGuide {
  /** URL-safe slug, e.g. "guide-switching" → /guides/guide-switching. */
  slug: string;
  /** Hebrew category label (e.g. "סלולר", "מדריך כללי"). */
  cat: string;
  /** Publish date (ISO yyyy-mm-dd). REAL — never fabricated. */
  date: string;
  /** Estimated read time in minutes. */
  read: number;
  /** Full <title> (already brand-suffixed in the source). */
  title: string;
  /** Meta description. */
  desc: string;
  /** Visible H1 (bare, no brand suffix). */
  h1: string;
  /** One-line "בקצרה" summary. */
  tldr: string;
  /** Article body sections, in order. */
  sections: GuideSection[];
  /** FAQ pairs (every ported guide carries these). */
  faq: GuideFaq[];
  /** Ordered how-to steps, when the guide is a step-by-step (drives HowTo schema). */
  howto?: HowToStep[];
}

/** A guide, as consumed by pages (identical fields to {@link RawGuide}). */
export type Guide = RawGuide;

// ── Internal-link target mapping (real on-site routes only) ──────────────────
/**
 * Hebrew guide-category label → the real /compare/<cat> route slug. Mirrors the
 * static site's `guideCatToSlug`. Only the five genuine compare categories are
 * mapped; the editorial "מדריך כללי" bucket intentionally has no entry (callers
 * fall back to the compare/providers hubs).
 */
const GUIDE_CAT_TO_COMPARE: Readonly<Record<string, string>> = {
  סלולר: "cellular",
  אינטרנט: "internet",
  טלוויזיה: "tv",
  "חבילה משולבת": "triple",
  "חבילות חו״ל": "abroad",
  // The static site labelled the abroad guides "חו״ל"; map that form too so older
  // ported content resolves to the same real /compare/abroad page.
  "חו״ל": "abroad",
};

/**
 * The real /compare/<cat> route slug for a guide's category, or `null` when the
 * category has no single compare page (the editorial "מדריך כללי" bucket).
 */
export function guideCompareSlug(cat: string): string | null {
  return GUIDE_CAT_TO_COMPARE[cat] ?? null;
}

// ── Accessors (pure) ─────────────────────────────────────────────────────────

/** All guides, in their canonical published order (curated first, then extras). */
export function getGuides(): Guide[] {
  return GUIDES_RAW.slice();
}

/** A single guide by slug, or `undefined` when unknown. */
export function getGuide(slug: string): Guide | undefined {
  return GUIDES_RAW.find((g) => g.slug === slug);
}

/**
 * The distinct guide categories with their counts, ordered by the brand's
 * canonical category order (general guide → cellular → internet → tv → triple →
 * abroad), with any unmapped category appended last. Used to group the hub.
 */
export function guideCategories(): { cat: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const g of GUIDES_RAW) counts.set(g.cat, (counts.get(g.cat) ?? 0) + 1);

  // Canonical display order. "מדריך כללי" leads (broad entry guides); the rest
  // follow the catalogue category order. Unknown labels sort to the end (stable).
  const ORDER = [
    "מדריך כללי",
    "סלולר",
    "אינטרנט",
    "טלוויזיה",
    "חבילה משולבת",
    "חבילות חו״ל",
    "חו״ל",
  ];
  const rank = (c: string) => {
    const i = ORDER.indexOf(c);
    return i === -1 ? ORDER.length : i;
  };
  return [...counts.entries()]
    .map(([cat, count]) => ({ cat, count }))
    .sort((a, b) => rank(a.cat) - rank(b.cat) || a.cat.localeCompare(b.cat, "he"));
}

/** All guides in a given category, in published order. */
export function guidesInCategory(cat: string): Guide[] {
  return GUIDES_RAW.filter((g) => g.cat === cat);
}

/**
 * Up to `limit` guides related to `guide`: same-category siblings first (most
 * relevant for cross-linking), then other guides to fill the quota — so a guide
 * page always offers further reading and never dead-ends. The guide itself is
 * always excluded. Order within each bucket is the canonical published order.
 */
export function relatedGuides(guide: Guide, limit = 3): Guide[] {
  if (limit <= 0) return [];
  const sameCat = GUIDES_RAW.filter(
    (g) => g.slug !== guide.slug && g.cat === guide.cat,
  );
  const others = GUIDES_RAW.filter(
    (g) => g.slug !== guide.slug && g.cat !== guide.cat,
  );
  return [...sameCat, ...others].slice(0, limit);
}

/**
 * The internal cross-links a guide should surface (real on-site routes only):
 * its category's /compare/<cat> page when it has one, otherwise the /compare and
 * /providers hubs. Returned as `{ href, label }` pairs for the page to render.
 *
 * HONESTY: every href is a genuine route; labels are derived from CATEGORY_HE.
 */
export function guideInternalLinks(
  guide: Guide,
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  const compareSlug = guideCompareSlug(guide.cat);
  if (compareSlug) {
    const he = CATEGORY_HE[compareSlug] ?? guide.cat;
    links.push({ href: `/compare/${compareSlug}`, label: `השוואת מסלולי ${he}` });
  } else {
    // Editorial/general guide — point at the broad hubs.
    links.push({ href: "/compare/cellular", label: "השוואת מסלולי סלולר" });
    links.push({ href: "/compare/internet", label: "השוואת מסלולי אינטרנט" });
  }
  links.push({ href: "/providers", label: "כל הספקים" });
  return links;
}
