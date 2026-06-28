// ─────────────────────────────────────────────────────────────────────────────
// Pure routing helper for the device-split middleware (web/middleware.ts).
//
// On the apex switchy-ai.com, DESKTOP requests are served the desktop-optimized
// STATIC marketing site (a separate project authored entirely as *.html + "/" +
// assets), while PHONES get this Next.js app. After the apex cutover the Next app
// self-canonicals to the apex, so Google (mobile-first) indexes CLEAN apex URLs
// (e.g. /cellular, /compare/cellular). A desktop visitor who then clicks one of
// those indexed clean URLs must NOT 404 — the static site only has *.html twins.
//
// staticDesktopPath() resolves that: a clean marketing path → its static .html
// twin; the static site's own *.html + "/" + assets → passed through unchanged;
// and a Next-only route (no static twin) → null, signalling the middleware to
// render it from the Next app on desktop too rather than rewrite to a 404.
//
// Pure + total (no I/O) so it unit-tests directly and runs in the edge runtime.
// ─────────────────────────────────────────────────────────────────────────────

// Clean canonical marketing path → its static .html twin. ONLY paths whose .html
// is CONFIRMED to exist in the static `site/` project are listed; anything not
// here (and not an asset/.html) falls through to the Next app on desktop (null)
// rather than risk a 404 from an optimistic guess.
const STATIC_HTML_MAP: ReadonlyMap<string, string> = new Map([
  ["/cellular", "/cellular.html"],
  ["/internet", "/internet.html"],
  ["/tv", "/tv.html"],
  ["/triple", "/triple.html"],
  ["/abroad", "/abroad.html"],
  ["/providers", "/providers.html"],
  ["/compare", "/compare.html"],
  ["/guides", "/guides.html"],
  ["/glossary", "/glossary.html"],
  ["/book", "/book.html"],
  ["/faq", "/faq.html"],
  ["/about", "/about.html"],
  ["/how-it-works", "/how-it-works.html"],
  ["/community", "/community.html"],
  ["/accessibility", "/accessibility.html"],
  ["/privacy", "/privacy.html"],
  ["/terms", "/terms.html"],
  ["/plans", "/plans.html"],
  ["/comparisons", "/comparisons.html"],
]);

// Files the static project serves verbatim — its own *.html pages plus every
// static asset / crawl / meta file. Matched by extension so a desktop request for
// one is NEVER diverted to the Next app (which would 404 it). MUST include media
// (mp4/webm/… — the hero video lives at /assets/videos/*.mp4; omitting it 404'd
// the static homepage video) and audio, alongside images/fonts/styles/scripts.
const STATIC_PASSTHROUGH_RE =
  /\.(?:html?|css|m?js|json|txt|xml|ico|png|jpe?g|webp|avif|gif|svg|woff2?|ttf|otf|eot|map|pdf|webmanifest|mp4|webm|mov|m4v|ogv|mp3|wav|ogg|m4a|aac|flac|vtt|wasm|csv)$/i;

/**
 * The path to fetch from the STATIC origin for a DESKTOP request to `pathname`,
 * or `null` when there is no static twin and the request should instead be served
 * by the Next app (so a Next-only clean route never 404s on desktop).
 */
export function staticDesktopPath(pathname: string): string | null {
  // Normalize a trailing slash (except root) so "/cellular/" routes like "/cellular".
  const p = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.replace(/\/+$/, "")
    : pathname;

  // The static homepage.
  if (p === "" || p === "/") return "/";

  // The static site's own pages (*.html) + assets + crawl files → serve verbatim.
  if (STATIC_PASSTHROUGH_RE.test(p)) return p;

  // A clean canonical marketing path with a known static .html twin.
  const exact = STATIC_HTML_MAP.get(p);
  if (exact) return exact;

  // Dynamic marketing families whose static twin is guaranteed to exist:
  //   /compare/<service> → the single static compare tool (params carried in query)
  //   /providers/<slug>  → the per-provider static page (shared providerSlug())
  if (/^\/compare\/[a-z]+$/.test(p)) return "/compare.html";
  const prov = p.match(/^\/providers\/([a-z0-9-]+)$/);
  if (prov) return `/provider-${prov[1]}.html`;

  // No static twin → a Next-only route (e.g. /quiz, /referral, /plans/<id>,
  // /vs/<pair>, /guides/<slug>); serve it from the Next app on desktop.
  return null;
}
