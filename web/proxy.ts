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
// separately, so a phone never gets a cached desktop page (or vice-versa).
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
    const res = NextResponse.rewrite(target);
    res.headers.set("Vary", "User-Agent");
    return res;
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
    const res = NextResponse.rewrite(target);
    res.headers.set("Vary", "User-Agent");
    return res;
  }

  // Phone/tablet → stay on the Next.js app. No rewrite; just mark the response
  // Vary so the CDN keys this device class separately.
  if (isMobileUA(ua)) {
    const res = NextResponse.next();
    res.headers.set("Vary", "User-Agent");
    return res;
  }

  // Desktop (and unknown UA) → the desktop-optimized static site. Since the app
  // now self-canonicals to the apex, Google (mobile-first) indexes CLEAN apex
  // URLs; a desktop visitor landing on one must not 404. staticDesktopPath maps a
  // clean marketing path to its static .html twin, passes the static site's own
  // *.html + "/" + assets through unchanged, and returns null for a Next-only
  // route — which we then render from THIS app on desktop rather than rewrite to
  // a non-existent static page.
  const staticPath = staticDesktopPath(request.nextUrl.pathname);
  if (staticPath === null) {
    const res = NextResponse.next();
    res.headers.set("Vary", "User-Agent");
    return res;
  }
  const target = new URL(staticPath + request.nextUrl.search, STATIC_ORIGIN);
  const res = NextResponse.rewrite(target);
  res.headers.set("Vary", "User-Agent");
  return res;
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
