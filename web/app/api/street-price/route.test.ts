import { describe, it, expect, vi, afterEach } from "vitest";
import { GET, POST } from "./route";
import { STREET_PRICE_CATEGORIES } from "@/lib/street-price";

// ────────────────────────────────────────────────────────────────────────────
// /api/street-price — the public "מחיר הרחוב" surface.
//
//   GET  reads the threshold-gated aggregate via the service-role RPC. With NO
//        SUPABASE_SERVICE_ROLE_KEY in the test env it MUST fail-soft to a
//        well-formed, all-unpublished payload (the page shows the empty state),
//        never throw.
//   POST validates the submission + enforces the same-site origin allow-list
//        BEFORE any network call, so we can assert those without a live edge fn.
//        (A clean submission would forward to the edge function; we don't assert
//        that path here to avoid touching the network — the validation/origin
//        gates are the route's own contract.)
// ────────────────────────────────────────────────────────────────────────────

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/street-price", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("GET /api/street-price", () => {
  it("fails soft to a well-formed, all-unpublished payload (no service key)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      categories: { category: string; published: boolean; count: number }[];
      threshold: number;
    };
    expect(json.ok).toBe(true);
    expect(json.threshold).toBe(5);
    // One aggregate per known category.
    expect(json.categories.length).toBe(STREET_PRICE_CATEGORIES.length);
    const cats = new Set(json.categories.map((c) => c.category));
    for (const c of STREET_PRICE_CATEGORIES) expect(cats.has(c)).toBe(true);
    // Nothing fabricated: every slice is unpublished with a zero count.
    for (const c of json.categories) {
      expect(c.published).toBe(false);
      expect(c.count).toBe(0);
    }
  });
});

describe("POST /api/street-price", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects a cross-origin browser POST with 403", async () => {
    const res = await POST(
      postJson(
        { category: "cellular", provider: "סלקום", reported_price: 49 },
        { origin: "https://evil.example.com" },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const req = new Request("http://localhost:3000/api/street-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects an unknown category with 400 (never guesses)", async () => {
    const res = await POST(
      postJson(
        { category: "electricity", provider: "סלקום", reported_price: 49 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it("rejects a missing provider with 400", async () => {
    const res = await POST(
      postJson(
        { category: "cellular", provider: "", reported_price: 49 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an out-of-band price with 400", async () => {
    const res = await POST(
      postJson(
        { category: "cellular", provider: "סלקום", reported_price: 999999 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("accepts the `price` alias + forwards a clean report to the edge fn", async () => {
    // A valid body passes validation and is FORWARDED (we stub fetch so no real
    // network call happens). The edge fn's verdict is normalised back to the
    // client as { ok, status, message }.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "approved", lead_captured: false }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await POST(
      postJson(
        { category: "cellular", provider: "סלקום", price: 49 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      status: string;
      message: string;
    };
    expect(json.ok).toBe(true);
    expect(json.status).toBe("approved");
    expect(json.message.length).toBeGreaterThan(0);
    // The forwarded body used the `price` alias → reported_price=49.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const forwarded = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    ) as { reported_price: number; provider: string; category: string };
    expect(forwarded.reported_price).toBe(49);
    expect(forwarded.provider).toBe("סלקום");
    expect(forwarded.category).toBe("cellular");
  });

  it("maps an edge-fn 429 to a friendly Hebrew message", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "too many requests" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const res = await POST(
      postJson(
        { category: "cellular", provider: "סלקום", reported_price: 49 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(429);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error.length).toBeGreaterThan(0);
  });
});
