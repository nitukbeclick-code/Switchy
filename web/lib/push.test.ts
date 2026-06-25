// ────────────────────────────────────────────────────────────────────────────
// lib/push.ts — the testable web-push helpers. We cover the pure VAPID decoder
// (the byte-exact bit) and the fail-soft contract of postSubscription /
// (un)subscribe under a stubbed fetch + navigator. Push is a progressive
// enhancement, so the load-bearing guarantee is: NOTHING here ever throws, and an
// unsupported/failed path resolves a benign value.
// ────────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  urlBase64ToUint8Array,
  isPushSupported,
  postSubscription,
} from "@/lib/push";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("urlBase64ToUint8Array", () => {
  it("decodes a URL-safe base64 string to the exact bytes", () => {
    // "hello" → base64 "aGVsbG8=" → url-safe "aGVsbG8" (padding stripped).
    const out = urlBase64ToUint8Array("aGVsbG8");
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]); // "hello"
  });

  it("restores '-' and '_' to '+' and '/' before decoding", () => {
    // Bytes [251, 255] → base64 "+/8=" → url-safe "-_8". Round-trips exactly.
    const out = urlBase64ToUint8Array("-_8");
    expect(Array.from(out)).toEqual([251, 255]);
  });
});

describe("isPushSupported", () => {
  it("is false when the browser lacks the push stack (node env, no navigator)", () => {
    // In the node test env there's no serviceWorker/PushManager → unsupported.
    expect(isPushSupported()).toBe(false);
  });
});

describe("postSubscription — fail-soft network contract", () => {
  // A minimal PushSubscription stub with the toJSON() the helper calls.
  const fakeSub = {
    endpoint: "https://push.example.com/abc",
    toJSON(this: { endpoint: string }) {
      return { endpoint: this.endpoint, keys: { p256dh: "k", auth: "a" } };
    },
  } as unknown as PushSubscription;

  it("POSTs to /api/push with the serialized subscription and returns true on ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const ok = await postSubscription("subscribe", fakeSub);
    expect(ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/push");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.action).toBe("subscribe");
    expect(body.subscription.endpoint).toBe("https://push.example.com/abc");
  });

  it("returns false (never throws) when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(postSubscription("unsubscribe", fakeSub)).resolves.toBe(false);
  });

  it("returns false (never throws) when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(postSubscription("subscribe", fakeSub)).resolves.toBe(false);
  });
});
