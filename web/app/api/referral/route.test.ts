import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ────────────────────────────────────────────────────────────────────────────
// POST /api/referral — issues a REAL referral code into public.referral_codes.
// We mock @supabase/supabase-js so no network/DB is touched, and assert the
// route's HONESTY + robustness contract:
//   • mints a valid SW-XXXXXX code and INSERTs it (persisted: true);
//   • the inserted row is attribution-only with NO reward field, channel "site";
//   • degrades to a real-but-UNPERSISTED code (persisted: false) when no
//     service-role key is set OR the DB write errors (the share UI never breaks);
//   • retries on a unique-collision (23505) and persists on the next attempt;
//   • response NEVER promises a monetary reward;
//   • the Origin allow-list blocks off-site browser POSTs.
// ────────────────────────────────────────────────────────────────────────────

import { REFERRAL_CODE_RE } from "@/lib/referral";

// Mutable mock state for the faked supabase insert.
let insertErrors: Array<unknown>; // one entry consumed per insert() call
const insertedRows: unknown[] = [];

const insert = vi.fn((row: unknown) => {
  insertedRows.push(row);
  const err = insertErrors.length ? insertErrors.shift() : null;
  return Promise.resolve({ error: err ?? null });
});

const from = vi.fn(() => ({ insert }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from })),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

/** A POST Request with a same-origin header (passes the allow-list in dev). */
function postReq(body: unknown = {}, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/referral", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  insertErrors = [];
  insertedRows.length = 0;
  insert.mockClear();
  from.mockClear();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  vi.stubEnv("NODE_ENV", "development"); // allow localhost origin
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/referral — happy path", () => {
  it("mints a real SW-XXXXXX code and persists it (attribution ON)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq({ conversationId: "sess-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.code).toMatch(REFERRAL_CODE_RE);
    expect(body.persisted).toBe(true);
    expect(body.link).toContain(`?ref=${body.code}`);
    expect(typeof body.shareText).toBe("string");
    // Inserted exactly one attribution-only row, channel "site", NO reward field.
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insertedRows[0] as Record<string, unknown>;
    expect(row.channel).toBe("site");
    expect(row.source).toBe("site");
    expect(row.conversation_id).toBe("sess-1");
    expect(row.referrer_contact).toBeNull();
    expect("reward" in row).toBe(false);
  });

  it("response NEVER promises a monetary reward", async () => {
    const { POST } = await loadRoute();
    const body = await (await POST(postReq())).json();
    const blob = JSON.stringify(body);
    expect(blob).not.toMatch(/₪|בונוס|תשלום|תגמול|פרס/);
  });

  it("retries on a unique-collision (23505) then persists", async () => {
    insertErrors = [{ code: "23505", message: "duplicate key value" }, null];
    const { POST } = await loadRoute();
    const body = await (await POST(postReq())).json();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(body.persisted).toBe(true);
    // The two minted codes differ (re-minted on collision).
    const a = (insertedRows[0] as Record<string, string>).code;
    const b = (insertedRows[1] as Record<string, string>).code;
    expect(a).not.toBe(b);
  });
});

describe("POST /api/referral — fail-soft (always returns a usable code)", () => {
  it("returns a real, UNPERSISTED code when no service-role key is set (no DB)", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { POST } = await loadRoute();
    const body = await (await POST(postReq())).json();
    expect(body.ok).toBe(true);
    expect(body.code).toMatch(REFERRAL_CODE_RE);
    expect(body.persisted).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("degrades to UNPERSISTED on a non-collision DB error (no leak, no 500)", async () => {
    insertErrors = [{ code: "XX000", message: "boom" }];
    const { POST } = await loadRoute();
    const res = await POST(postReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.code).toMatch(REFERRAL_CODE_RE);
    // One attempt, no retry (the error wasn't a collision).
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("still issues a code when the JSON body is malformed", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost:3000/api/referral", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: "{not json",
    });
    const body = await (await POST(req)).json();
    expect(body.ok).toBe(true);
    expect(body.code).toMatch(REFERRAL_CODE_RE);
  });
});

describe("POST /api/referral — origin allow-list", () => {
  it("rejects a cross-origin browser POST with 403", async () => {
    const { POST } = await loadRoute();
    const res = await POST(postReq({}, "https://evil.example.com"));
    expect(res.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it("allows a request with no Origin header (non-browser caller)", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost:3000/api/referral", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
