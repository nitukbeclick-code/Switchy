import { describe, it, expect } from "vitest";
import { POST } from "./route";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/negotiate — the thin server route behind /negotiate. It builds a
// GROUNDED retention script from the REAL bundled catalogue (via app/negotiate/
// lib.ts). These tests drive the handler directly with a Request (node env, cwd
// at the web root so lib/data can read the catalogue) and assert: input
// validation, the origin allow-list, the honest-saving framing (hasBaseline),
// and that the market-rate evidence is a real, cheapest-comparable catalogue row.
// ────────────────────────────────────────────────────────────────────────────

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/negotiate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

interface ScriptResp {
  ok: boolean;
  script: {
    category: string;
    categoryHe: string;
    provider: string | null;
    currentBill: number | null;
    hasBaseline: boolean;
    marketRate: { provider: string; plan: string; price: number; annualSavingUpTo: number };
    sameProvider: { provider: string; price: number } | null;
    steps: string[];
    framing: string;
  };
}

describe("POST /api/negotiate — validation + security", () => {
  it("rejects an invalid/missing category with 400", async () => {
    const res = await POST(postJson({ category: "electricity" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const req = new Request("http://localhost:3000/api/negotiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a cross-origin browser POST with 403", async () => {
    const res = await POST(
      postJson({ category: "cellular" }, { origin: "https://evil.example.com" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/negotiate — grounded script", () => {
  it("returns a real cheapest-comparable market rate (same-origin)", async () => {
    const res = await POST(
      postJson({ category: "cellular" }, { origin: "http://localhost:3000" }),
    );
    expect(res.status).toBe(200);
    const { ok, script } = (await res.json()) as ScriptResp;
    expect(ok).toBe(true);
    expect(script.category).toBe("cellular");
    expect(script.categoryHe).toBe("סלולר");
    // Market rate is a REAL catalogue row.
    expect(typeof script.marketRate.provider).toBe("string");
    expect(script.marketRate.provider.length).toBeGreaterThan(0);
    expect(script.marketRate.price).toBeGreaterThan(0);
    // No bill → no baseline, no fabricated saving.
    expect(script.hasBaseline).toBe(false);
    expect(script.currentBill).toBeNull();
    expect(script.marketRate.annualSavingUpTo).toBe(0);
    // The honest framing is always present.
    expect(script.framing).toContain("לא הבטחה");
    expect(script.steps.length).toBeGreaterThanOrEqual(4);
  });

  it("surfaces a same-provider option when a real provider is given", async () => {
    const res = await POST(
      postJson({ category: "cellular", provider: "סלקום" }, {}),
    );
    expect(res.status).toBe(200);
    const { script } = (await res.json()) as ScriptResp;
    expect(script.provider).toBe("סלקום");
    expect(script.sameProvider).not.toBeNull();
    expect(script.sameProvider?.provider).toBe("סלקום");
  });

  it("flags hasBaseline + surfaces an honest annual saving when a bill is given", async () => {
    const res = await POST(
      postJson({ category: "cellular", currentBill: 200 }, {}),
    );
    expect(res.status).toBe(200);
    const { script } = (await res.json()) as ScriptResp;
    expect(script.hasBaseline).toBe(true);
    expect(script.currentBill).toBe(200);
    // The cheapest cellular plan is well under ₪200, so there is a real saving.
    expect(script.marketRate.annualSavingUpTo).toBeGreaterThan(0);
  });

  it("allows non-browser callers (no Origin) since the output is public data", async () => {
    const res = await POST(postJson({ category: "internet" }));
    expect(res.status).toBe(200);
    const { ok, script } = (await res.json()) as ScriptResp;
    expect(ok).toBe(true);
    expect(script.category).toBe("internet");
  });
});
