// ─────────────────────────────────────────────────────────────────────────────
// service-worker.js — חוסך / Switch AI PWA service worker.
//
// Two jobs, both fail-soft:
//   1. OFFLINE SHELL — precache a tiny app shell (offline fallback page + icons)
//      and serve a navigation fallback when the network is unreachable, so an
//      installed PWA opens to a branded "you're offline" page instead of the
//      browser's dino. NOTHING price-bearing is ever cached: HTML navigations use
//      network-first (fresh prices win; cache is only a last-resort offline
//      fallback), and same-origin static assets (Next's hashed /_next/static/*,
//      icons, manifest) use stale-while-revalidate. We NEVER cache cross-origin
//      requests, API routes (/api/*), or anything non-GET.
//   2. WEB PUSH — show notifications pushed from the backend (site-push-notify)
//      and focus/open the relevant URL on click.
//
// CACHE BUSTING ON DEPLOY: the cache name is versioned (CACHE_VERSION). The
// `activate` handler deletes every cache that isn't the current version, so a new
// deploy (new SW bytes → new install → activate) wipes the old shell. The SW
// itself is served with `Cache-Control: no-cache` (see next.config.ts headers) so
// the browser always revalidates it and picks up a new version promptly.
//
// IMPORTANT: this file MUST stay plain ES5-ish JS with no imports — it is served
// verbatim from /public and runs in the ServiceWorkerGlobalScope, not bundled.
// ─────────────────────────────────────────────────────────────────────────────

// Bump this string on any deploy that changes the shell. The activate step purges
// every cache whose name !== the current one, so stale assets can't linger.
const CACHE_VERSION = "chosech-shell-v2";

// The minimal offline shell. Kept deliberately tiny — just the offline fallback
// document + brand icons + manifest. Real pages/prices are NEVER precached.
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.json",
  "/icons/Icon-192.png",
  "/icons/Icon-512.png",
];

// ── install: precache the shell, then take over ASAP ─────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);
        // addAll is atomic-ish: if any precache URL 404s the whole install fails,
        // which would wedge updates. Add individually and ignore per-URL failures
        // so a missing optional asset never blocks activation.
        await Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch(() => {
              /* best-effort: a missing shell asset must not break install */
            }),
          ),
        );
      } catch {
        /* opening the cache failed (storage blocked) — SW still installs */
      }
      // Activate this SW immediately rather than waiting for old tabs to close,
      // so a fresh deploy's cache-purge + fetch handler apply on next navigation.
      await self.skipWaiting();
    })(),
  );
});

// ── activate: drop every cache that isn't the current version ────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name !== CACHE_VERSION)
            .map((name) => caches.delete(name)),
        );
      } catch {
        /* cache eviction is best-effort */
      }
      // Control already-open clients without a reload.
      await self.clients.claim();
    })(),
  );
});

// True for requests we must NEVER serve from / write to cache: cross-origin,
// non-GET, and API routes (prices, lead capture, AI chat — always live).
function isUncacheable(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  return false;
}

// A same-origin GET to /api/* that we serve network-only, but with a graceful
// offline fallback. We still NEVER cache these (live prices / lead / AI), but
// when the network is unreachable we hand back a small JSON sentinel + HTTP 503
// instead of letting fetch() reject with a TypeError. Clients that `await
// res.json()` then branch on `res.ok` (as the site's fetch callers do) degrade
// to their friendly "try again" path instead of an unhandled rejection. Only GET
// is eligible: POST/PUT/etc. are mutations we must not silently fake a reply for —
// those still pass through and surface the real network error to the caller.
function isApiGet(request, url) {
  return (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname.startsWith("/api/")
  );
}

// ── fetch: network-first for navigations, SWR for static, never cache prices ──
self.addEventListener("fetch", (event) => {
  const { request } = event;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return; // unparseable URL — let the browser handle it
  }

  // Same-origin /api/* GET: network-only (never cached) but with a graceful
  // offline JSON fallback so clients fail soft instead of throwing. Checked
  // BEFORE isUncacheable (which would otherwise pass these straight through).
  if (isApiGet(request, url)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return new Response(
            JSON.stringify({
              ok: false,
              offline: true,
              error: "אין חיבור לאינטרנט. נסו שוב כשהחיבור יחזור.",
            }),
            {
              status: 503,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
              },
            },
          );
        }
      })(),
    );
    return;
  }

  if (isUncacheable(request, url)) return; // pass through to network untouched

  // HTML navigations: NETWORK-FIRST so fresh content/prices always win. Only when
  // the network is unreachable do we fall back — to the matching cached page if we
  // have one, else the branded offline shell. We do NOT proactively cache HTML
  // (price drift risk); the offline fallback is the precached /offline.html.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ||
            new Response(
              "<!doctype html><meta charset=utf-8><title>אופליין</title><p dir=rtl>אין חיבור לאינטרנט.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
            )
          );
        }
      })(),
    );
    return;
  }

  // Same-origin static assets (Next hashed bundles, icons, fonts, manifest):
  // STALE-WHILE-REVALIDATE — serve the cached copy instantly, refresh in the
  // background. Next's /_next/static/* are content-hashed, so a stale hit is
  // always byte-correct; non-hashed assets self-heal on the next load.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          // Only cache successful, basic (same-origin) responses.
          if (response && response.ok && response.type === "basic") {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => undefined);
      return cached || (await network) || fetch(request);
    })(),
  );
});

// ── push: show the notification pushed by the backend ────────────────────────
// Payload shape (from site-push-notify): { title, body, url?, icon?, badge?, tag? }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payloads: fall back to the raw text as the body.
    try {
      data = { body: event.data ? event.data.text() : "" };
    } catch {
      data = {};
    }
  }

  const title = data.title || "חוסך / Switch AI";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/Icon-192.png",
    badge: data.badge || "/icons/Icon-192.png",
    lang: "he",
    dir: "rtl",
    tag: data.tag || undefined,
    // Stash the deep-link URL so the click handler can route to it.
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── notificationclick: focus an existing tab or open the deep-link URL ────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const targetUrl = new URL(target, self.location.origin).href;
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an already-open same-origin tab if one exists.
      for (const client of allClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window to the deep link.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
