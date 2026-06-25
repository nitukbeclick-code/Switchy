import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Pin the Turbopack workspace root to THIS app. Without it, Next walks up and
// picks the parent Flutter repo's package-lock.json (multiple lockfiles), which
// produces a wrong-root warning and can mis-resolve files.
const projectRoot = dirname(fileURLToPath(import.meta.url));

// Legacy opaque provider slugs → the new readable slug. These are the exact
// `p-<hash>` (and the old ASCII "019") tokens the previous providerSlug() emitted
// for the Hebrew-named carriers, before web/lib/data.ts gained SLUG_OVERRIDES.
// Mirrors LEGACY_PROVIDER_SLUG_REDIRECTS in web/lib/data.ts — kept inline here so
// the config has no dependency on the catalogue-reading data module at load time.
const LEGACY_PROVIDER_SLUGS: Record<string, string> = {
  "p-nr0ams": "cellcom", // סלקום
  "p-nsv1ek": "partner", // פרטנר
  "p-rcv4fq": "pelephone", // פלאפון
  "p-mkqt2p": "golan", // גולן טלקום
  "p-v0b8ln": "hot-mobile", // הוט מובייל
  "p-1irwebn": "rami-levy", // רמי לוי
  "p-jcymt6": "walla-mobile", // וואלה מובייל
  "p-vp0i": "bezeq", // בזק
  "p-rb9jp": "gilat", // גילת
  "019": "019mobile", // 019 מובייל (old ASCII slug → new readable)
};

// ────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy — backwards-compatible STRICT CSP (hash + strict-dynamic).
//
// WHY hashes, not 'unsafe-inline' for scripts: we enumerate the exact SHA-256 of
// every inline <script> we emit, so a modern (CSP3) browser executes only those
// and refuses any injected inline script — the core XSS mitigation. The hashes
// ARE the allowlist. 'strict-dynamic' then lets a hash-trusted loader (the Next
// runtime + GA's gtag.js, pulled via next/script src=) fetch its own child
// scripts without us listing every host. For legacy (CSP1/2) browsers that ignore
// hashes/strict-dynamic, 'unsafe-inline' + the https: host fallback keep GA/Meta
// working — and those tokens are *ignored* by CSP3 browsers exactly because a
// hash is present, so they don't weaken the modern policy. This is the documented
// "graceful degradation" strict-CSP recipe.
//
// Set entirely via next.config headers() (NOT a nonce/proxy) on purpose: a nonce
// forces every page to dynamic rendering, which would kill this app's static +
// ISR (revalidate=3600) output — the very thing CELL C3 is protecting. Static
// HTML + hashed inline scripts keeps full CDN cacheability AND a strict CSP.
//
// INLINE SCRIPT HASHES (recompute if the literal bytes below ever change):
//  • theme no-flash guard (app/layout.tsx <head> + app/global-error.tsx) — identical
//  • GA4 Consent Mode v2 default (app/layout.tsx, beforeInteractive)
//  • GA4 init/config (app/layout.tsx, lazyOnload) — GA4 id resolved into the string
// ────────────────────────────────────────────────────────────────────────────
const SCRIPT_HASHES = [
  // theme no-flash guard
  "'sha256-lt/jzp5WghHs55L76Qx27LnwaSq1sd0Otti3yNnkC9E='",
  // GA4 consent default (denied)
  "'sha256-Wm3VqYsyHNBkLe9vbwFfwvpleh3w28hOQ74uxW19xPo='",
  // GA4 init/config (G-YCTGRVN7SJ)
  "'sha256-FnLpdcBNhDmIMlNWpijeigE04yHv3SKWzGWhQXLY3PU='",
].join(" ");

// First-party Supabase project (public anon reads happen server-side today, but
// keep it allowlisted so any future client read isn't silently blocked by CSP).
const SUPABASE_ORIGIN = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://orzitfqmlvopujsoyigr.supabase.co"
).replace(/\/+$/, "");

// Google Analytics 4 (gtag.js) + Meta Pixel — script host, beacon (connect) and
// pixel (img) origins. These are the ONLY third parties the site talks to from
// the browser; everything else is same-origin (/api/* relative fetches).
const CSP = [
  "default-src 'self'",
  // Inline scripts pinned by hash; gtag.js arrives via next/script src= and is
  // trusted to load its children through 'strict-dynamic'. https: + 'unsafe-inline'
  // are CSP1/2-only fallbacks (ignored by CSP3 because a hash is present).
  `script-src 'self' 'strict-dynamic' 'unsafe-inline' https: ${SCRIPT_HASHES}`,
  // Next.js and several pages emit inline <style>; 'unsafe-inline' for styles is
  // required and low-risk (style injection is not script execution).
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://www.google-analytics.com https://www.googletagmanager.com https://www.facebook.com",
  "font-src 'self'",
  // XHR/fetch/beacon targets: GA4, Meta pixel, and the Supabase project.
  `connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://*.analytics.google.com https://connect.facebook.net https://www.facebook.com ${SUPABASE_ORIGIN}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Security headers applied to every HTML response (defence-in-depth alongside CSP).
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Don't leak full URLs (with query) cross-origin; send only the origin off-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Never let the browser MIME-sniff a response into an executable type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Clickjacking: redundant with frame-ancestors 'none' but covers pre-CSP UAs.
  { key: "X-Frame-Options", value: "DENY" },
  // Process isolation (Spectre-class) — safe here: no cross-origin popups embed us.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Powerful-feature lockdown. The bill flow uses a file <input> (not getUserMedia),
  // so camera/microphone/geolocation can all be denied site-wide.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Image optimization: prefer AVIF (≈20% smaller than WebP), fall back to WebP,
  // then the original format. Next negotiates per-request via the Accept header,
  // so unsupported browsers transparently get WebP/original — purely a payload win,
  // no behaviour change for any <Image> usage.
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Drop the `x-powered-by: Next.js` response header — a small footprint/security
  // hygiene win; it advertises the framework and adds bytes to every response.
  poweredByHeader: false,
  // Allow redirecting the build output off OneDrive-synced storage (which can
  // lock/`.map` files mid-build → "cloud operation was unsuccessful" os error
  // 389). Defaults to ".next"; set NEXT_DIST_DIR to a local path to opt out.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Service-worker headers — the SW must NEVER be cached by the browser, so a new
  // deploy is picked up promptly (it then purges the stale shell cache on
  // activate). Also pin the JS content type + a tight CSP for the SW itself. The
  // offline fallback is likewise served fresh. Mirrors the Next PWA guide.
  async headers() {
    return [
      {
        // Site-wide security headers (CSP + the hardening set) on every route.
        // The more-specific /service-worker.js and /offline.html rules below ALSO
        // match and add their own headers; the SW's own stricter CSP is the
        // intersection winner there, which is fine (it only needs 'self').
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        source: "/service-worker.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
      {
        source: "/offline.html",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
  // 301-redirect old provider slugs to the new readable ones so existing links /
  // indexed URLs (/providers/p-*, /switch/p-*) never 404 after the slug change.
  async redirects() {
    return Object.entries(LEGACY_PROVIDER_SLUGS).flatMap(([oldSlug, newSlug]) => [
      {
        source: `/providers/${oldSlug}`,
        destination: `/providers/${newSlug}`,
        permanent: true,
      },
      {
        source: `/switch/${oldSlug}`,
        destination: `/switch/${newSlug}`,
        permanent: true,
      },
    ]);
  },
};

export default nextConfig;
