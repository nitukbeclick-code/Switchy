import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// GET /api/wallet-stats — the REAL social-proof aggregate read from
// get_savings_stats(). We mock @supabase/supabase-js so no network/DB is touched;
// the test asserts the route's HONESTY + robustness contract:
//   • returns `published: true` only when the real sample clears the threshold;
//   • returns `published: false` for a small sample (the UI renders nothing);
//   • passes real aggregates straight through (never fabricated);
//   • degrades to a well-formed UNPUBLISHED 200 payload when the service-role key
//     is absent OR the RPC errors (the block is never load-bearing).
// The Supabase client's `.rpc(...)` is faked to resolve to our row(s).
// ────────────────────────────────────────────────────────────────────────────

import { SOCIAL_PROOF_MIN_MEMBERS } from "@/lib/wallet-stats";

let rpcData: unknown = null;
let rpcError: unknown = null;
let lastRpcName: string | null = null;

const rpc = vi.fn((name: string) => {
  lastRpcName = name;
  return Promise.resolve({ data: rpcError ? null : rpcData, error: rpcError });
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc })),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

beforeEach(() => {
  rpcData = null;
  rpcError = null;
  lastRpcName = null;
  rpc.mockClear();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/wallet-stats — happy path", () => {
  it("publishes a real aggregate above the threshold", async () => {
    rpcData = [
      {
        members: SOCIAL_PROOF_MIN_MEMBERS + 75,
        total_saving: 90000,
        avg_saving: 900,
        median_saving: 840,
        max_saving: 3200,
        first_at: "2026-01-01T00:00:00.000Z",
        last_at: "2026-06-20T00:00:00.000Z",
      },
    ];
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(lastRpcName).toBe("get_savings_stats");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary.published).toBe(true);
    expect(body.summary.members).toBe(SOCIAL_PROOF_MIN_MEMBERS + 75);
    expect(body.summary.typicalSaving).toBe(840); // median, real
    expect(body.summary.totalSaving).toBe(90000); // real, not fabricated
  });

  it("does NOT publish a sub-threshold sample (UI shows nothing)", async () => {
    rpcData = [{ members: SOCIAL_PROOF_MIN_MEMBERS - 1, median_saving: 700 }];
    const { GET } = await loadRoute();
    const body = await (await GET()).json();
    expect(body.summary.published).toBe(false);
  });

  it("accepts a single-object RPC payload (not wrapped in an array)", async () => {
    rpcData = { members: SOCIAL_PROOF_MIN_MEMBERS + 10, median_saving: 600 };
    const { GET } = await loadRoute();
    const body = await (await GET()).json();
    expect(body.summary.published).toBe(true);
    expect(body.summary.typicalSaving).toBe(600);
  });
});

describe("GET /api/wallet-stats — fail-soft", () => {
  it("degrades to UNPUBLISHED 200 when the service-role key is absent (no DB read)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.published).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("degrades to UNPUBLISHED 200 when the RPC errors (no leak)", async () => {
    rpcError = { message: "boom", code: "XX000" };
    const { GET } = await loadRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.published).toBe(false);
    expect(body.summary.members).toBe(0);
  });

  it("degrades to UNPUBLISHED when the RPC returns no rows", async () => {
    rpcData = [];
    const { GET } = await loadRoute();
    const body = await (await GET()).json();
    expect(body.summary.published).toBe(false);
  });
});
