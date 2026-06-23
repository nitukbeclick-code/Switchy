// ────────────────────────────────────────────────────────────────────────────
// /api/analyze-bill — the bill-photo → savings proxy route. We assert the CONTRACT
// without a real Supabase or a real edge-function call:
//   • origin allow-list rejects an off-site Origin (403),
//   • a missing/oversized image is rejected (400 / 413),
//   • the strict per-IP/day guard blocks a second same-IP call in 24h (429) and
//     FAILS CLOSED on a DB query error,
//   • a successful upstream read is normalized (suggestions + headline saving),
//   • the real client IP is forwarded to the edge fn (X-Forwarded-For last hop +
//     CF-Connecting-IP) so the upstream guard keys on the user, not our server,
//   • an upstream timeout (AbortError) surfaces 504, other network errors 502.
//
// `@supabase/supabase-js` and global fetch are mocked at the module boundary; the
// route is imported dynamically AFTER env is stubbed so its top-level config reads
// the test values.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Each test does vi.resetModules() + a fresh dynamic import of the route, which on
// a COLD cache pays the full transform cost of @supabase/supabase-js on the very
// first import — that can exceed the default 5s test timeout and flake the first
// test. Give the file generous headroom so a cold run is as green as a warm one.
vi.setConfig({ testTimeout: 20_000 });

// ── Supabase mock: a chainable query builder ending in a resolved {data,error} ──
type RlRows = { data: { id: number }[] | null; error: unknown };
let rlResult: RlRows = { data: [], error: null };

const selectChain = {
  eq: () => selectChain,
  gte: () => selectChain,
  limit: () => Promise.resolve(rlResult),
};
const fromMock = vi.fn(() => ({ select: () => selectChain }));
const createClient = vi.fn(() => ({ from: fromMock }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const SUPABASE_URL = "https://orzitfqmlvopujsoyigr.supabase.co";
const EDGE_URL = `${SUPABASE_URL}/functions/v1/site-bill-analyzer`;

/** Build a POST Request with a JSON body + optional headers. */
function makeReq(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://app.switchy-ai.com/api/analyze-bill", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Import the route fresh so module-top config reads the current env. */
async function loadRoute() {
  vi.resetModules();
  return await import("./route");
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NODE_ENV", "production");
  rlResult = { data: [], error: null };
  createClient.mockClear();
  fromMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/analyze-bill — guards", () => {
  it("rejects an off-site Origin with 403", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://evil.example.com",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a missing image with 400", async () => {
    const { POST } = await loadRoute();
    const res = await POST(makeReq({}, { origin: "https://app.switchy-ai.com" }));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized image with 413", async () => {
    const { POST } = await loadRoute();
    const big = "data:image/jpeg;base64," + "A".repeat(6 * 1024 * 1024 + 10);
    const res = await POST(
      makeReq({ imageBase64: big }, { origin: "https://app.switchy-ai.com" }),
    );
    expect(res.status).toBe(413);
  });

  it("allows a request with NO Origin (non-browser caller) through to the guard", async () => {
    // No upstream call should be needed: stub fetch to a benign empty result so
    // a pass-through doesn't hit the network.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ provider: "", suggestions: [] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/analyze-bill — per-IP/day rate limit", () => {
  it("blocks a second same-IP analysis within 24h with 429 (no upstream call)", async () => {
    rlResult = { data: [{ id: 1 }], error: null }; // already 1 today → at limit
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "203.0.113.7",
      }),
    );
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED (429) when the rate-limit query errors", async () => {
    rlResult = { data: null, error: { message: "db down" } };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "203.0.113.8",
      }),
    );
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/analyze-bill — success path", () => {
  it("forwards the real client IP and normalizes the upstream result", async () => {
    const upstreamBody = {
      provider: "סלקום",
      currentSpend: 120,
      category: "cellular",
      confidence: 0.9,
      warnings: [],
      note: "מצאנו 2 מסלולים זולים יותר.",
      suggestions: [
        { id: "a", name: "מסלול א", provider: "פרטנר", price: 49, annualSaving: 852 },
        { id: "b", name: "מסלול ב", provider: "HOT", price: 79, annualSaving: 492 },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(upstreamBody), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "198.51.100.5",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    // Headline annual saving = the largest suggestion saving.
    expect(data.annualSaving).toBe(852);
    expect(data.provider).toBe("סלקום");
    expect(data.suggestions).toHaveLength(2);

    // The real client IP is forwarded to the edge fn.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(EDGE_URL);
    const fwdHeaders = init.headers as Record<string, string>;
    expect(fwdHeaders["cf-connecting-ip"]).toBe("198.51.100.5");
    expect(fwdHeaders["x-forwarded-for"]).toContain("198.51.100.5");
  });

  it("passes through an unreadable 200 result (friendly error + empty suggestions)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: "",
          currentSpend: 0,
          category: "",
          suggestions: [],
          confidence: 0.1,
          warnings: ["התמונה מטושטשת"],
          error: "לא הצלחנו לקרוא את החשבון מהתמונה.",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "198.51.100.6",
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toHaveLength(0);
    expect(data.annualSaving).toBe(0);
    expect(data.error).toContain("לא הצלחנו");
  });
});

describe("POST /api/analyze-bill — upstream failures", () => {
  it("returns 504 when the upstream call times out (AbortError)", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "198.51.100.9",
      }),
    );
    expect(res.status).toBe(504);
  });

  it("returns 502 on a generic upstream network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "198.51.100.10",
      }),
    );
    expect(res.status).toBe(502);
  });

  it("propagates an upstream 503 (edge fn not configured)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "unavailable" }), { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await loadRoute();
    const res = await POST(
      makeReq({ imageBase64: "data:image/jpeg;base64,AAAA" }, {
        origin: "https://app.switchy-ai.com",
        "cf-connecting-ip": "198.51.100.11",
      }),
    );
    expect(res.status).toBe(503);
  });
});
