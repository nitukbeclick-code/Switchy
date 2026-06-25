// Unit tests for the AbortController timeout wrapper in _shared/ai.ts. These pin
// the hardening property: a paid LLM fetch that hangs is aborted after the budget
// and surfaces AiTimeoutError (which the site-* handlers map to 504) instead of
// pinning the function. We stub globalThis.fetch so there's no real network.
//   deno task test

import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { AiTimeoutError, fetchWithTimeout } from "../_shared/ai.ts";

const realFetch = globalThis.fetch;

// A fetch stub that never resolves on its own but rejects (AbortError) the moment
// the caller's AbortController fires — exactly how the platform fetch behaves.
function hangingFetch(): typeof globalThis.fetch {
  return ((_input: string | URL | Request, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }
    });
  }) as typeof globalThis.fetch;
}

Deno.test("fetchWithTimeout throws AiTimeoutError when the request hangs past the budget", async () => {
  globalThis.fetch = hangingFetch();
  try {
    const err = await fetchWithTimeout("https://x.test", { method: "POST" }, 20, "stub")
      .then(() => null)
      .catch((e) => e);
    assertInstanceOf(err, AiTimeoutError);
    assert(String(err).includes("stub"));
    assert(String(err).includes("20ms"));
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("fetchWithTimeout returns the response when it resolves in time", async () => {
  globalThis.fetch = ((_i: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response("ok", { status: 200 }))) as typeof globalThis.fetch;
  try {
    const r = await fetchWithTimeout("https://x.test", { method: "POST" }, 1000, "stub");
    assertEquals(r.status, 200);
    assertEquals(await r.text(), "ok");
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("fetchWithTimeout propagates a non-abort network error unchanged", async () => {
  globalThis.fetch = ((_i: string | URL | Request, _init?: RequestInit) =>
    Promise.reject(new TypeError("dns failure"))) as typeof globalThis.fetch;
  try {
    const err = await fetchWithTimeout("https://x.test", { method: "POST" }, 1000, "stub")
      .then(() => null)
      .catch((e) => e);
    assertInstanceOf(err, TypeError);
    assert(!(err instanceof AiTimeoutError));
  } finally {
    globalThis.fetch = realFetch;
  }
});
