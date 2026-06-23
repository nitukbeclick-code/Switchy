import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// GET /api/price-history — REAL price movement read from plan_price_history.
// We mock @supabase/supabase-js so no network/DB is touched; the test asserts
// the route's HONESTY + robustness contract:
//   • parses one-or-many plan_id query params (repeat + comma forms), de-duped;
//   • groups snapshots per plan and attaches a `drop` ONLY for a real qualifying
//     week-over-week decrease (delegated to lib/price-history);
//   • degrades to a well-formed EMPTY 200 payload when the service-role key is
//     absent or the DB errors (the badge is never load-bearing).
// The Supabase query builder is faked as a thenable that resolves to our rows.
// ────────────────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString();

// Captured args + the rows the fake DB returns for the next call.
let lastSelect: { in?: unknown[]; gte?: string } = {};
let rows: Array<{ plan_id: string; price: number; captured_at: string }> = [];
let dbError: unknown = null;

function makeQuery() {
  const q: Record<string, unknown> = {};
  q.select = vi.fn(() => q);
  q.in = vi.fn((_col: string, vals: unknown[]) => {
    lastSelect.in = vals;
    return q;
  });
  q.gte = vi.fn((_col: string, v: string) => {
    lastSelect.gte = v;
    return q;
  });
  // `.order(...)` is the awaited terminal — make the builder thenable.
  q.order = vi.fn(() => ({
    then: (resolve: (r: unknown) => void) =>
      resolve({ data: dbError ? null : rows, error: dbError }),
  }));
  return q;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: vi.fn(() => makeQuery()) })),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function req(qs: string): Request {
  return new Request(`https://switchy-ai.com/api/price-history${qs}`);
}

beforeEach(() => {
  lastSelect = {};
  rows = [];
  dbError = null;
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/price-history — happy path", () => {
  it("returns a real drop for a plan whose history qualifies", async () => {
    rows = [
      { plan_id: "cel_x", price: 120, captured_at: iso(7) },
      { plan_id: "cel_x", price: 100, captured_at: iso(0) },
    ];
    const { GET } = await loadRoute();
    const res = await GET(req("?plan_id=cel_x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.plans.cel_x.drop).not.toBeNull();
    expect(body.plans.cel_x.drop.from).toBe(120);
    expect(body.plans.cel_x.drop.to).toBe(100);
    expect(body.plans.cel_x.drop.amount).toBe(20);
    expect(body.plans.cel_x.points).toHaveLength(2);
    expect(body.thresholds).toEqual({ minAbs: 5, minPct: 10 });
  });

  it("attaches drop=null when the movement does not clear a threshold", async () => {
    rows = [
      { plan_id: "cel_y", price: 50, captured_at: iso(7) },
      { plan_id: "cel_y", price: 47, captured_at: iso(0) }, // ₪3 / 6% → no badge
    ];
    const { GET } = await loadRoute();
    const body = await (await GET(req("?plan_id=cel_y"))).json();
    expect(body.plans.cel_y.drop).toBeNull();
    expect(body.plans.cel_y.points).toHaveLength(2);
  });

  it("never fabricates a drop for a price RISE", async () => {
    rows = [
      { plan_id: "cel_z", price: 80, captured_at: iso(7) },
      { plan_id: "cel_z", price: 99, captured_at: iso(0) },
    ];
    const { GET } = await loadRoute();
    const body = await (await GET(req("?plan_id=cel_z"))).json();
    expect(body.plans.cel_z.drop).toBeNull();
  });
});

describe("GET /api/price-history — query parsing", () => {
  it("accepts repeated plan_id params and de-dupes them", async () => {
    const { GET } = await loadRoute();
    await GET(req("?plan_id=a&plan_id=b&plan_id=a"));
    expect(new Set(lastSelect.in as string[])).toEqual(new Set(["a", "b"]));
  });

  it("accepts a comma-separated plan_id list", async () => {
    const { GET } = await loadRoute();
    await GET(req("?plan_id=a,b,c"));
    expect(new Set(lastSelect.in as string[])).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("returns EMPTY (no DB read) when no plan_id is given", async () => {
    const { GET } = await loadRoute();
    const body = await (await GET(req(""))).json();
    expect(body.ok).toBe(true);
    expect(body.plans).toEqual({});
    expect(lastSelect.in).toBeUndefined(); // never queried
  });
});

describe("GET /api/price-history — fail-soft", () => {
  it("degrades to EMPTY 200 when the service-role key is absent", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { GET } = await loadRoute();
    const res = await GET(req("?plan_id=cel_x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toEqual({});
  });

  it("degrades to EMPTY 200 when the DB errors (no leak)", async () => {
    dbError = { message: "boom", code: "XX000" };
    const { GET } = await loadRoute();
    const res = await GET(req("?plan_id=cel_x"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plans).toEqual({});
  });
});
