// ────────────────────────────────────────────────────────────────────────────
// SEO metadata helper — builds a complete Next.js `Metadata` object (canonical +
// OpenGraph + Twitter) from a page's real title/description/path. PURE: no I/O,
// fully unit-testable.
//
// WHY: every page already sets `title` + `description` + `alternates.canonical`,
// but no inner page set its OWN OpenGraph/Twitter block — so sharing
// /compare/cellular surfaced the HOMEPAGE og:title/og:description and the homepage
// og:url (inherited from the layout). This centralises a per-page OG/Twitter block
// that mirrors each page's own (truthful) title/description and points og:url at
// the page's canonical URL.
//
// IMPORTANT (Next metadata merge semantics): `openGraph`/`twitter` are merged
// SHALLOW — a page that sets `openGraph` REPLACES the parent's `openGraph`
// entirely (incl. `images`). So we MUST re-declare the shared OG/Twitter image
// here, otherwise setting a per-page block would silently drop the file-based
// `opengraph-image.png` / `twitter-image.png` that previously cascaded by
// inheritance. We point at those same file-convention assets (resolved absolute
// via the layout's `metadataBase`) so the picture stays identical site-wide.
//
// HONESTY: this only re-states the title/description the page already declares and
// reuses the existing shared share-image — it fabricates no claims/prices/data.
// ────────────────────────────────────────────────────────────────────────────

import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "./schema";

/** The brand suffix the layout's title `template` appends ("%s | <brand>"). */
const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/** Shared OG/Twitter alt text (mirrors app/opengraph-image.alt.txt). */
const SHARE_IMAGE_ALT =
  "חוסך / Switch AI — השוואת מסלולי תקשורת בישראל: סלולר, אינטרנט, טלוויזיה " +
  "וחבילות. חינם ובלי התחייבות.";

/**
 * The file-convention share images at the app root (Next serves them with a
 * content-hashed query). Re-declared so every page's own openGraph/twitter block
 * keeps them after the shallow metadata merge. Relative paths resolve to absolute
 * URLs via the layout's `metadataBase`.
 */
const OG_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: SHARE_IMAGE_ALT,
} as const;
const TWITTER_IMAGE = { url: "/twitter-image.png", alt: SHARE_IMAGE_ALT } as const;

/** Resolve a possibly-relative path to an absolute canonical URL on SITE_URL. */
function absUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Normalise an OpenGraph/Twitter title to a single, branded form. The layout
 * `title.template` brands the visible <title> for pages whose `title` is a bare
 * string, but it does NOT brand `openGraph.title`/`twitter.title`. A few pages
 * also inline the brand suffix in their own `title`. To get ONE consistent
 * branded share-title everywhere, strip any existing brand suffix, then append
 * it exactly once.
 */
function brandedTitle(title: string): string {
  const base = title.endsWith(BRAND_SUFFIX)
    ? title.slice(0, -BRAND_SUFFIX.length)
    : title;
  return `${base}${BRAND_SUFFIX}`;
}

export interface PageMetaInput {
  /** The page's visible title (bare — the layout template brands the <title>). */
  title: string;
  /** The page's meta description. */
  description: string;
  /** The page's canonical path (absolute or site-relative, e.g. "/compare"). */
  path: string;
  /** Optional robots override (e.g. national city pages → noindex, follow). */
  robots?: Metadata["robots"];
}

/**
 * Build a complete `Metadata` object for a page: canonical + OpenGraph + Twitter.
 *
 * - `title`/`description` are passed through verbatim for the page <title>/<meta>
 *   (the layout's title template brands the <title>).
 * - `openGraph`/`twitter` mirror the same title/description (brand-normalised),
 *   point `og:url` at the page's own canonical URL, carry `locale: he_IL`, and
 *   RE-DECLARE the shared file-convention share image (required — see header:
 *   the shallow merge would otherwise drop the inherited image).
 * - `twitter.card` is `summary_large_image` with the same shared image.
 * - `robots`, when given, is forwarded (used by the national city pages).
 */
export function pageMetadata(input: PageMetaInput): Metadata {
  const { title, description, path, robots } = input;
  const url = absUrl(path);
  const ogTitle = brandedTitle(title);

  const meta: Metadata = {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "he_IL",
      siteName: SITE_NAME,
      url,
      title: ogTitle,
      description,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [TWITTER_IMAGE],
    },
  };
  if (robots) meta.robots = robots;
  return meta;
}
