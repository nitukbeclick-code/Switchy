import { describe, it, expect } from "vitest";
import { POST } from "./route";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/recommend — the thin server route behind the /quiz wizard. It ranks
// the REAL bundled catalogue through lib/recommend.ts. These tests drive the
// handler directly with a Request (node env, cwd at the web root so lib/data can
// read the catalogue) and assert: input validation, the origin allow-list, the
// honest-saving framing (hasBill), and that every returned match is a real
// catalogue row in the requested category.
// ────────────────────────────────────────────────────────────────────────────

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/recommend", () => {
  it("rejects an invalid/missing category with 400", async () => {
    const res = await POST(postJson({ category: "electricity" }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(false);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const req = new Request("http://localhost:3000/api/recommend", {
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

  it("allows a same-origin POST and returns ranked real matches", async () => {
    const res = await POST(
      postJson(
        { category: "cellular", priority: "price", budget: 70, limit: 5 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      category: string;
      matches: { id: string; cat: string; provider: string; price: number; score: number }[];
      hasBill: boolean;
    };
    expect(json.ok).toBe(true);
    expect(json.category).toBe("cellular");
    expect(json.matches.length).toBeGreaterThan(0);
    expect(json.matches.length).toBeLessThanOrEqual(5);
    // Every match is a REAL catalogue row in the requested category.
    for (const m of json.matches) {
      expect(m.cat).toBe("cellular");
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(typeof m.provider).toBe("string");
      expect(m.score).toBeGreaterThanOrEqual(0);
      expect(m.score).toBeLessThanOrEqual(100);
    }
    // Non-increasing scores (best first).
    for (let i = 1; i < json.matches.length; i++) {
      expect(json.matches[i].score).toBeLessThanOrEqual(json.matches[i - 1].score);
    }
    // No bill supplied → honest framing flag is false.
    expect(json.hasBill).toBe(false);
  });

  it("includes the rich plan-display fields the quiz cards render", async () => {
    const res = await POST(
      postJson(
        { category: "cellular", priority: "balanced", limit: 5 },
        { origin: "http://localhost:3000" },
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      matches: {
        priceText: string;
        afterLabel: { kind: "jump" | "fixed"; text: string };
        fields: { label: string; value: string }[];
        perks: string[];
      }[];
    };
    expect(json.matches.length).toBeGreaterThan(0);
    for (const m of json.matches) {
      // Exact-aware headline price string (no ₪ prefix) — always present.
      expect(typeof m.priceText).toBe("string");
      expect(m.priceText.length).toBeGreaterThan(0);
      // Honest post-promo label — a jump or the neutral "מחיר קבוע" marker.
      expect(["jump", "fixed"]).toContain(m.afterLabel.kind);
      expect(typeof m.afterLabel.text).toBe("string");
      expect(m.afterLabel.text.length).toBeGreaterThan(0);
      if (m.afterLabel.kind === "fixed") {
        expect(m.afterLabel.text).toBe("מחיר קבוע");
      }
      // Truth-only rich fields: each carries a non-empty label + value.
      expect(Array.isArray(m.fields)).toBe(true);
      for (const f of m.fields) {
        expect(f.label.length).toBeGreaterThan(0);
        expect(f.value.length).toBeGreaterThan(0);
      }
      expect(Array.isArray(m.perks)).toBe(true);
    }
    // At least one cellular match exposes a category-relevant rich field (e.g. נפח),
    // proving the enrichment is wired through and not universally empty.
    expect(json.matches.some((m) => m.fields.length > 0)).toBe(true);
  });

  it("flags hasBill + surfaces a real annual saving when a bill is given", async () => {
    const res = await POST(
      postJson(
        { category: "cellular", priority: "price", currentBill: 120, limit: 10 },
        {},
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      hasBill: boolean;
      matches: { annualSaving: number }[];
    };
    expect(json.hasBill).toBe(true);
    expect(json.matches.some((m) => m.annualSaving > 0)).toBe(true);
  });

  it("defaults the limit to 5 and clamps it to 10", async () => {
    const res = await POST(postJson({ category: "internet", limit: 999 }));
    const json = (await res.json()) as { matches: unknown[] };
    expect(json.matches.length).toBeLessThanOrEqual(10);
  });
});
