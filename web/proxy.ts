import { NextRequest, NextResponse } from "next/server";
import { staticDesktopPath } from "@/lib/device-routing";

// ────────────────────────────────────────────────────────────────────────────
// DEVICE-SPLIT ROUTING for the one canonical domain (switchy-ai.com).
//
// Owner decision: each device gets the surface it was tuned for —
//   • PHONES / tablets  → the mobile-first Next.js app (this project, `web/`).
//   • DESKTOP computers  → the desktop-optimised static marketing site (the
//     separate `switchy` project, served at STATIC_ORIGIN).
//
// We keep ONE URL in the address bar by REWRITING (not redirecting) desktop
// requests to the static origin: Vercel fetches the static page server-side and
// returns it under switchy-ai.com, so the user never sees the proxy hop. The
// static site uses root-relative assets (styles.css, script.js, assets/*), so
// every follow-up asset request re-enters this middleware on switchy-ai.com and
// is rewritten the same way → the whole static page loads transparently.
//
// `Vary: User-Agent` tells Vercel's CDN to cache desktop and mobile responses
// separately, so a phone never gets a cached desktop page (or vice-versa). It is
// set on the DEVICE-DEPENDENT responses ONLY — the paths where a static twin
// exists, so phone and desktop genuinely get different bytes. A user-agent
// string is close to unique per browser build, so a response carrying that Vary
// is effectively uncacheable at the edge and is re-fetched from the origin on
// nearly every request (billed as Fast Origin Transfer). The branches that serve
// the SAME bytes to every device — the static root assets, every *.html, and
// every Next-only route with no static twin — therefore carry no Vary and cache
// once. See docs/vercel-isr-budget.md.
// ────────────────────────────────────────────────────────────────────────────

// The static site's origin. Overridable per-environment; defaults to the
// `switchy` project's production alias (verified to serve the static `site/`).
const STATIC_ORIGIN =
  process.env.DESKTOP_STATIC_ORIGIN ?? "https://switchy-phi.vercel.app";

// Phones AND tablets count as "mobile" so touch devices get the touch-first app.
// iPadOS 13+ masquerades as desktop Safari (no 'iPad' token, says 'Macintosh');
// those rare cases fall through to the static site, which is an acceptable
// desktop-class experience on a large screen. Unknown/empty UA → desktop (the
// safe default: most crawlers without a Mobile token should index the static
// canonical, and a no-JS static page degrades better than a stuck app shell).
const MOBILE_UA =
  /android|iphone|ipod|iemobile|blackberry|opera mini|mobile|silk|kindle|playbook|tablet|ipad|webos|windows phone/i;

// Root assets emitted by the static site. These must always come from the
// static project, including when a phone opens a legacy *.html URL. Previously
// the HTML was proxied but these follow-up requests stayed in Next and 404'd.
const STATIC_ROOT_ASSETS = new Set([
  "/styles.css",
  "/styles.min.css",
  "/script.js",
  "/script.min.js",
]);

function isMobileUA(ua: string): boolean {
  return ua.length > 0 && MOBILE_UA.test(ua);
}

/**
 * Mark a response as device-dependent.
 *
 * APPEND, never `set`: Next.js puts its OWN `Vary` on App Router responses
 * (`rsc`, `next-router-state-tree`, `next-router-prefetch`, …) and relies on it
 * so a CDN cannot hand an RSC request a cached HTML response — overwriting it
 * breaks client-side navigation (see node_modules/next/dist/docs/01-app/
 * 02-guides/cdn-caching.md).
 *
 * Call this ONLY where the response genuinely differs between device classes.
 * `User-Agent` values are near-unique, so every response carrying it is
 * effectively uncacheable at the CDN and is re-fetched from the origin — which
 * is billed as Fast Origin Transfer. See docs/vercel-isr-budget.md.
 */
function varyByDevice(res: NextResponse): NextResponse {
  res.headers.append("Vary", "User-Agent");
  return res;
}

export function proxy(request: NextRequest): NextResponse {
  const ua = request.headers.get("user-agent") ?? "";

  // Retire the one legacy directory-style provider URL seen in production logs.
  // Keep the public URL clean and let the normal device split choose the surface.
  if (request.nextUrl.pathname === "/providers/index.html") {
    return NextResponse.redirect(new URL("/providers", request.url), 308);
  }

  // The static HTML imports these files with root-relative URLs. Route them to
  // the static origin for every device so a legacy *.html page is complete on
  // mobile as well as desktop.
  if (STATIC_ROOT_ASSETS.has(request.nextUrl.pathname)) {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      STATIC_ORIGIN,
    );
    // Same bytes for every device, so NO Vary: the CDN caches one copy instead
    // of one per user-agent string.
    return NextResponse.rewrite(target);
  }

  // A ".html" URL exists ONLY on the static site — the Next app has no .html
  // routes. Serve it from the static origin for EVERY device: desktop already
  // did (via the passthrough below), and doing it up-front also stops mobile-
  // first Googlebot from 404ing static-only pages (/app.html, /calc-*.html,
  // /*-vs-*.html, /account-deletion.html) that have no clean Next twin. Assets
  // (.css/.js/img) are NOT .html, so the device split below still serves those
  // per-device. (offline.html is excluded from the matcher, so it never reaches
  // here and stays served by this app.)
  if (request.nextUrl.pathname.endsWith(".html")) {
    const target = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      STATIC_ORIGIN,
    );
    // This branch is explicitly device-INDEPENDENT ("for EVERY device", above),
    // so no Vary — these documents are the bulk of desktop pageviews and now
    // cache once at the edge instead of once per user-agent.
    return NextResponse.rewrite(target);
  }

  // Resolve the desktop twin BEFORE the device check, because it is what decides
  // whether this path is device-dependent at all. staticDesktopPath maps a clean
  // marketing path to its static .html twin, passes the static site's own *.html
  // + "/" + assets through unchanged, and returns null for a Next-only route.
  const staticPath = staticDesktopPath(request.nextUrl.pathname);

  // No static twin → BOTH device classes render this from the Next app. The
  // response is identical either way, so it carries no Vary and the CDN can
  // cache it once. (Desktop included: the app self-canonicals to the apex, so a
  // desktop visitor landing on an indexed Next-only route must render here
  // rather than be rewritten to a static page that does not exist.)
  if (staticPath === null) return NextResponse.next();

  // From here the two device classes genuinely diverge — phone/tablet gets the
  // Next app, desktop gets the static twin — so BOTH responses must declare it.
  if (isMobileUA(ua)) return varyByDevice(NextResponse.next());

  const target = new URL(staticPath + request.nextUrl.search, STATIC_ORIGIN);
  return varyByDevice(NextResponse.rewrite(target));
}

export const config = {
  // Run on every request EXCEPT:
  //  • the Next app's own build output (_next/*) — needed by mobile, never by the
  //    static desktop page (whose assets live at /styles.css, /assets/* etc.,
  //    which are NOT excluded so they DO pass through and get rewritten);
  //  • API routes — used only by the mobile app (the static site talks to
  //    Supabase directly, never to /api), so they always hit the Next handlers;
  //  • files that must be served by THIS app regardless of device: the service
  //    worker, its offline fallback, the PWA manifest, and the crawl files
  //    (one canonical robots/sitemap from the Next app for both device classes).
  matcher: [
    "/((?!_next/static|_next/image|_next/data|api/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|service-worker.js|offline.html).*)",
  ],
};
