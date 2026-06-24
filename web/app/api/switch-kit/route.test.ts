import { describe, it, expect } from "vitest";
import { POST } from "./route";
import { getPlans } from "@/lib/data";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/switch-kit — the thin server route behind /switch-kit. It builds a
// personalised, HONEST switch packet from the REAL bundled catalogue (via
// lib/switch-kit) and OPTIONALLY persists tracker progress (own-row, fail-soft).
// These tests drive the handler directly with a Request (node env, cwd at the web
// root so lib/data can read the catalogue) and assert: input validation, the
// origin allow-list, that the kit is grounded in a real plan, that the letter is
// NEVER auto-sent, and that persistence is fail-soft (no service-role key in test
// → persisted:false, still 200).
// ────────────────────────────────────────────────────────────────────────────

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/switch-kit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** A real cellular plan id from the bundled catalogue. */
function cheapestCellularId(): string {
  const p = [...getPlans()]
    .filter((x) => x.cat === "cellular" && typeof x.price === "number")
    .sort((a, b) => a.price - b.price)[0];
  return String(p.id);
}

interface KitResp {
  ok: boolean;
  autoSent: boolean;
  persisted: boolean;
  error?: string;
  kit?: {
    fromProvider: string;
    toProvider: string;
    toPlanId?: string;
    category: string;
    price: number;
    switchSteps: { key: string; status: string }[];
    cancellationLetterHe: string;
    disclaimer: string;
    annualSavingUpTo?: number;
  };
}

describe("POST /api/switch-kit — validation + security", () => {
  it("rejects a missing target plan with 404 (no fabrication)", async () => {
    const res = await POST(postJson({ fromProvider: "סלקום" }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as KitResp;
    expect(json.ok).toBe(false);
  });

  it("rejects an unknown target plan id with 404", async () => {
    const res = await POST(postJson({ targetPlanId: "no_such_plan" }));
    expect(res.status).toBe(404);
    const json = (await res.json()) as KitResp;
    expect(json.ok).toBe(false);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const req = new Request("http://localhost:3000/api/switch-kit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects a cross-origin browser POST with 403", async () => {
    const res = await POST(
      postJson({ targetPlanId: cheapestCellularId() }, { origin: "https://evil.example.com" }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/switch-kit — grounded kit", () => {
  it("returns a real, honest kit and NEVER auto-sends the letter (same-origin)", async () => {
    const id = cheapestCellularId();
    const res = await POST(
      postJson({ targetPlanId: id, fromProvider: "סלקום" }, { origin: "http://localhost:3000" }),
    );
    expect(res.status).toBe(200);
    const { ok, kit, autoSent, persisted } = (await res.json()) as KitResp;
    expect(ok).toBe(true);
    expect(autoSent).toBe(false); // the letter is never sent for the user
    expect(kit?.toPlanId).toBe(id);
    expect(kit?.category).toBe("cellular");
    expect(kit?.price).toBeGreaterThan(0);
    // The canonical step keys are present.
    expect(kit?.switchSteps.map((s) => s.key)).toEqual([
      "check_terms",
      "compare_alternatives",
      "porting",
      "written_notice",
      "equipment_final_bill",
    ]);
    // The disclaimer is always present.
    expect(kit?.disclaimer).toContain("לא ייעוץ משפטי");
    // No service-role key in the test env → progress can't persist (fail-soft).
    expect(persisted).toBe(false);
  });

  it("surfaces an honest annual saving only when a real bill is given", async () => {
    const id = cheapestCellularId();
    const noBill = (await (
      await POST(postJson({ targetPlanId: id }))
    ).json()) as KitResp;
    expect(noBill.kit?.annualSavingUpTo).toBeUndefined();

    const withBill = (await (
      await POST(postJson({ targetPlanId: id, currentBill: 200 }))
    ).json()) as KitResp;
    expect(withBill.kit?.annualSavingUpTo).toBeGreaterThan(0);
  });

  it("allows non-browser callers (no Origin) since the kit is public data", async () => {
    const res = await POST(postJson({ targetPlanId: cheapestCellularId() }));
    expect(res.status).toBe(200);
    const { ok } = (await res.json()) as KitResp;
    expect(ok).toBe(true);
  });

  it("posting steps without an auth token stays fail-soft (persisted:false, 200)", async () => {
    const res = await POST(
      postJson({
        targetPlanId: cheapestCellularId(),
        steps: { porting: "done", check_terms: "in_progress", bogus: "done" },
        status: "active",
      }),
    );
    expect(res.status).toBe(200);
    const { ok, persisted } = (await res.json()) as KitResp;
    expect(ok).toBe(true);
    expect(persisted).toBe(false);
  });
});
