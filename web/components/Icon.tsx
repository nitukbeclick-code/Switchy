// ────────────────────────────────────────────────────────────────────────────
// <Icon> — the site's single, consistent-weight inline-SVG icon set.
//
// One source of truth for line icons, keyed by SEMANTIC name (what it MEANS, not
// what it looks like) so callers say <Icon name="check" /> not a hand-rolled
// <svg>. Every glyph shares the same drawing contract:
//   • 24×24 viewBox, drawn on a 1.5–2px grid
//   • stroke = currentColor (inherits text color → dark-mode + accent safe)
//   • round caps/joins, no fills (outline style)
//   • `size` (px) drives both width/height; defaults to 20 (the masthead/run size)
//
// RTL: glyphs are mirror-aware where direction is semantic. `arrow` and `chevron`
// point to the logical *end* (used for "forward"/"next"); in an RTL document the
// inline flow already flips them visually via the parent's direction, but the
// caret/arrow paths here are drawn pointing toward the inline-start "back" by the
// `flip` convention callers choose. We keep the raw glyph LTR and let callers pass
// the right name; no glyph hard-codes a left/right that fights RTL.
//
// a11y: decorative by default (aria-hidden), since most icons sit beside text that
// already carries the meaning. Pass `label` to make an icon a labelled image
// (role="img" + <title>) when it stands alone and must be announced.
// ────────────────────────────────────────────────────────────────────────────

import type { ReactNode, SVGProps } from "react";

/** Semantic icon names — only the glyphs actually used across the site. */
export type IconName =
  | "check"
  | "chevron"
  | "arrow"
  | "close"
  | "search"
  | "star"
  | "info"
  | "alert"
  | "lock"
  | "spark"
  | "sun"
  | "moon"
  | "chat"
  // Category glyphs — used by the homepage category launcher tiles. Decorative
  // (the tile's Hebrew label carries the meaning), so they stay aria-hidden.
  | "cellular"
  | "internet"
  | "tv"
  | "triple"
  | "abroad"
  | "bolt";

// Each entry is the inner path markup for the glyph, drawn in a 24×24 box on a
// 1.5–2px stroke grid. Kept as JSX fragments so the shared <svg> wrapper owns the
// stroke/fill/cap contract and every icon stays visually consistent.
const PATHS: Record<IconName, ReactNode> = {
  // ✓ — confirmation / "read clearly" / success.
  check: <path d="M20 6 9 17l-5-5" />,
  // ▾/› — disclosure caret. Drawn as a right-pointing chevron (logical "forward").
  chevron: <path d="m9 6 6 6-6 6" />,
  // → — directional arrow (links, "continue"). Logical forward.
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  // ✕ — dismiss / close.
  close: <path d="M18 6 6 18M6 6l12 12" />,
  // 🔍 — search.
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  // ★ — rating (outline; fill via currentColor at the call-site if needed).
  star: (
    <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85L12 3.5z" />
  ),
  // ℹ — informational note.
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  // ⚠ — warning / caution (low-confidence read, etc.).
  alert: (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  // 🔒 — privacy / not stored.
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  // ✦ — agent / AI spark.
  spark: (
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  ),
  // ☀ — light mode.
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  // ☾ — dark mode.
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  // 💬 — chat / advisor (speech bubble with a tail).
  chat: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  // 📱 — סלולר (cellular): a smartphone with a speaker dot.
  cellular: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  // 🌐 — אינטרנט (internet): a globe with meridians.
  internet: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
    </>
  ),
  // 📺 — טלוויזיה (tv): a screen with a small antenna.
  tv: (
    <>
      <rect x="2.5" y="7" width="19" height="13" rx="2" />
      <path d="m7.5 3.5 4.5 3 4.5-3" />
    </>
  ),
  // 🧩 — חבילה משולבת (triple): stacked layers = a bundled package.
  triple: (
    <>
      <path d="m12 2.5 9 4.5-9 4.5-9-4.5 9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  // ✈ — חבילות חו״ל (abroad): a paper plane.
  abroad: (
    <>
      <path d="M21.5 2.5 3 10l6.5 2.5L12 19l2.5-6.5 7-10z" />
      <path d="m9.5 12.5 3-3" />
    </>
  ),
  // ⚡ — חשמל (electricity): a lightning bolt.
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** Semantic glyph to render. */
  name: IconName;
  /** Square size in px (width = height). Defaults to 20. */
  size?: number;
  /**
   * Accessible name. When set, the icon becomes a labelled image (role="img" +
   * <title>) and is announced. When omitted, the icon is decorative (aria-hidden)
   * — the default, since icons usually sit beside text that carries the meaning.
   */
  label?: string;
  /** Stroke width override. Defaults to 1.75 (the shared line weight). */
  strokeWidth?: number;
}

export default function Icon({
  name,
  size = 20,
  label,
  strokeWidth = 1.75,
  className,
  ...rest
}: IconProps) {
  const decorative = label == null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      {...rest}
    >
      {label != null && <title>{label}</title>}
      {PATHS[name]}
    </svg>
  );
}
