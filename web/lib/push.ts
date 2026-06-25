// ────────────────────────────────────────────────────────────────────────────
// lib/push.ts — client-side Web Push helpers (no React, no DOM-render).
//
// Pure-ish utilities for registering the service worker and (un)subscribing to
// web push. Kept out of the component so the tricky bits — VAPID key decoding,
// the support gate, the fail-soft subscribe/unsubscribe flow, and the POST to our
// /api/push proxy — can be unit-tested in isolation.
//
// FAIL-SOFT EVERYWHERE: push is a progressive enhancement. If the browser lacks
// support, the VAPID key is unset, the user denies permission, or the network is
// down, every function returns a benign result (false/null) and NEVER throws into
// the UI. Prices/leads/chat all work without push.
//
// PRIVACY: the only thing sent server-side is the opaque PushSubscription (an
// endpoint URL + public keys minted by the browser's push service). No PII.
// ────────────────────────────────────────────────────────────────────────────

/** Public VAPID key (safe to expose). Push is disabled when this is unset. */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Path the service worker is served from (in /public). */
export const SERVICE_WORKER_URL = "/service-worker.js";

/**
 * Decode a URL-safe base64 VAPID key into the Uint8Array the Push API wants for
 * `applicationServerKey`. Exported for testing. Throws on malformed input — the
 * caller (subscribe) catches and fails soft.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  // Back the view with a concrete ArrayBuffer (not ArrayBufferLike) so the result
  // is assignable to the Push API's `applicationServerKey: BufferSource`.
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * True when this browser supports the full web-push stack AND we have a VAPID
 * key configured. Used to gate the whole UI: with no support we render nothing.
 */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    typeof VAPID_PUBLIC_KEY === "string" &&
    VAPID_PUBLIC_KEY.length > 0
  );
}

/**
 * Register the service worker (idempotent — the browser dedupes by URL+scope) and
 * resolve its ready registration. Returns null on any failure (storage blocked,
 * SW disabled) so callers can no-op.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: "/",
      updateViaCache: "none",
    });
    // `ready` resolves once an active SW controls the page.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Read the current push subscription, if any. Null on error/no-support. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * POST a subscription (or unsubscribe) to our own /api/push proxy, which forwards
 * to the backend store (site-push-notify). Fail-soft: a non-OK response or a
 * network error resolves false rather than throwing.
 *
 * @param action     "subscribe" | "unsubscribe"
 * @param subscription the serialized PushSubscription (endpoint + keys)
 */
export async function postSubscription(
  action: "subscribe" | "unsubscribe",
  subscription: PushSubscription,
): Promise<boolean> {
  try {
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // PushSubscription serializes to { endpoint, keys: { p256dh, auth } }.
      body: JSON.stringify({ action, subscription: subscription.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Full subscribe flow: ensure permission → register SW → reuse-or-create a
 * subscription → POST it to the backend. Returns the live subscription on
 * success, or null on any failure / denial (fail-soft, never throws).
 *
 * The browser permission prompt is only triggered by an explicit user gesture
 * (the component calls this from a click handler), per platform requirements.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return null;

  try {
    // Ask for permission first — a denied/blocked permission ⇒ no subscription.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const reg = await registerServiceWorker();
    if (!reg) return null;

    // Reuse an existing subscription if the browser already minted one.
    const existing = await reg.pushManager.getSubscription();
    const subscription =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    // Best-effort hand-off to the backend store. If it fails we keep the local
    // subscription (the next attempt can re-POST) but report failure so the UI
    // can surface a gentle retry.
    const stored = await postSubscription("subscribe", subscription);
    return stored ? subscription : null;
  } catch {
    return null;
  }
}

/**
 * Full unsubscribe flow: tell the backend to forget the subscription, then drop
 * it locally. Returns true if the local unsubscribe succeeded. Fail-soft.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const sub = await getExistingSubscription();
    if (!sub) return true; // already unsubscribed
    // Tell the backend to forget it (best-effort, before we drop it locally).
    await postSubscription("unsubscribe", sub);
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}
