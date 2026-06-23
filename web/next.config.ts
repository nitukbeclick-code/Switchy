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

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
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
