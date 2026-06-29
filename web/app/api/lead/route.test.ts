import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/lead — captures a contact request into public.leads (service-role).
// We mock @supabase/supabase-js so no network/DB is touched, and assert the
// referral-attribution contract added to the route:
//   • a VALID SW-XXXXXX referrer_code is forwarded onto the inserted row AND,
//     after a successful insert, credited via the redeem_referral_code RPC
//     (with the read-back lead id);
//   • an INVALID or ABSENT referrer_code is silently dropped — it is NOT written
//     to the row and redeem_referral_code is NEVER called;
//   • a redeem RPC failure is fail-soft: the lead still returns ok:true (a
//     redemption error must never fail a captured lead).
// It also pins the pending-migration fallback: if the insert errors because the
// `referrer_code` column doesn't exist yet, the route retries WITHOUT it (the
// lead is never lost) and skips the redeem (the code never landed on the row).
//
// Mirrors the mock style of ../referral/route.test.ts (mutable insertErrors
// queue, captured rows), extended for this route's .select("id").single() chain
// + the supabase.rpc() redemption call.
// ────────────────────────────────────────────────────────────────────────────

// ── Mutable mock state for the faked supabase client ─────────────────────────
// One entry consumed per insert() call; an entry of `null` means "succeeded".
let insertErrors: Array<{ code?: string; message?: string } | null>;
// The id returned by the read-back .single() on a SUCCESSFUL insert.
let insertedLeadId: string | null;
const insertedRows: Record<string, unknown>[] = [];
// Captured redeem_referral_code RPC calls: { name, params }.
const rpcCalls: Array<{ name: string; params: unknown }> = [];
// When set, the next rpc() call rejects with this (to test fail-soft).
let rpcRejection: unknown = null;

// .insert(row).select("id").single() → { data, error }
const single = vi.fn(async () => {
  const err = insertErrors.length ? insertErrors.shift() : null;
  if (err) return { data: null, error: err };
  return { data: { id: insertedLeadId }, error: null };
});
const select = vi.fn(() => ({ single }));
const insert = vi.fn((row: Record<string, unknown>) => {
  insertedRows.push(row);
  return { select };
});
const from = vi.fn(() => ({ insert }));
const rpc = vi.fn(async (name: string, params: unknown) => {
  rpcCalls.push({ name, params });
  if (rpcRejection) throw rpcRejection;
  return { data: null, error: null };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from, rpc })),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

/** A POST Request with a same-origin header (passes the allow-list in dev). */
function postReq(body: unknown = {}, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

/** A minimal valid lead body (passes name/phone/consent validation). */
function validLead(extra: Record<string, unknown> = {}) {
  return {
    name: "ישראל ישראלי",
    phone: "050-123-4567",
    consent: true,
    ...extra,
  };
}

const VALID_CODE = "SW-7KQ4M9";

beforeEach(() => {
  insertErrors = [];
  insertedLeadId = "lead-uuid-1";
  insertedRows.length = 0;
  rpcCalls.length = 0;
  rpcRejection = null;
  insert.mockClear();
  select.mockClear();
  single.mockClear();
  from.mockClear();
  rpc.mockClear();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("NODE_ENV", "development"); // allow localhost origin
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/lead — referral attribution", () => {
  it("forwards a VALID SW-XXXXXX code onto the row and redeems it after insert", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq(validLead({ referrer_code: VALID_CODE })));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // The code landed on the inserted row (normalized, canonical form).
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertedRows[0].referrer_code).toBe(VALID_CODE);

    // Redemption credited exactly once, with the read-back lead id.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpcCalls[0].name).toBe("redeem_referral_code");
    expect(rpcCalls[0].params).toEqual({
      p_code: VALID_CODE,
      p_lead_id: "lead-uuid-1",
    });
  });

  it("normalizes a lowercase/whitespace code before forwarding + redeeming", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      postReq(validLead({ referrer_code: "  sw-7kq4m9 " })),
    );
    expect(res.status).toBe(200);
    expect(insertedRows[0].referrer_code).toBe(VALID_CODE);
    expect(rpcCalls[0].params).toMatchObject({ p_code: VALID_CODE });
  });

  it("DROPS an invalid code: not written to the row, redeem NOT called", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      postReq(validLead({ referrer_code: "not-a-code" })),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    // Invalid → never persisted as referrer_code, never redeemed.
    expect("referrer_code" in insertedRows[0]).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("omits referrer_code and skips redeem when ABSENT", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq(validLead()));
    expect(res.status).toBe(200);
    expect("referrer_code" in insertedRows[0]).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is fail-soft: a redeem RPC error does NOT fail the captured lead", async () => {
    rpcRejection = new Error("redeem_referral_code not deployed");
    const { POST } = await loadRoute();
    const res = await POST(postReq(validLead({ referrer_code: VALID_CODE })));
    // Lead still succeeds despite the redemption throwing.
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("strips referrer_code on a pending-migration retry and skips redeem", async () => {
    // First insert fails with a missing-column error naming referrer_code; the
    // route must retry WITHOUT the column (lead never lost) and, since the code
    // never landed on the row, NOT attempt a redemption.
    insertErrors = [
      { code: "PGRST204", message: "Could not find the 'referrer_code' column" },
      null,
    ];
    const { POST } = await loadRoute();
    const res = await POST(postReq(validLead({ referrer_code: VALID_CODE })));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    // Two insert attempts; the second (retry) row has no referrer_code.
    expect(insert).toHaveBeenCalledTimes(2);
    expect("referrer_code" in insertedRows[1]).toBe(false);
    // Redemption skipped — the code was stripped, so it never landed.
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/lead — validation still gates the lead", () => {
  it("rejects without consent and never inserts/redeems", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      postReq({ name: "ישראל ישראלי", phone: "050-123-4567", consent: false, referrer_code: VALID_CODE }),
    );
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an off-site origin with 403 before any DB work", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      postReq(validLead({ referrer_code: VALID_CODE }), "https://evil.example.com"),
    );
    expect(res.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
