// Contract tests for the CRM data layer (lib/crm-admin.ts) — the crmPost/crmRead
// wire contract, pinned WITHOUT any real network or Supabase session:
//   · no session → null/failure with ZERO network round-trips
//   · non-2xx → null (legacy fetchers) / typed CrmFailure (401/403 non-retryable)
//   · 2xx shape-guards (wrong shape degrades, additive extra fields tolerated)
//   · exact headers (apikey + Bearer + JSON) and payload elision (absent opts
//     never serialize; default sort is elided)
//   · in-flight dedupe for reads ONLY — identical concurrent reads share one
//     request, listSellableLeads (audited per call) and writes never coalesce.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabase-browser", () => ({
  getBrowserSupabase: () => ({ auth: { getSession } }),
}));

import {
  fetchCrmContacts,
  fetchCrmLeads,
  fetchCrmOverview,
  fetchCrmThread,
  fetchSellableLeads,
  hasArray,
  hasObject,
  isLeadStatus,
  isMeetingStatus,
  setCrmLeadStatus,
  setCrmLeadWorkflow,
} from "@/lib/crm-admin";
import { SUPABASE_ANON_KEY } from "@/lib/supabase-public";

const fetchMock = vi.fn();

function withSession(token = "tok-123") {
  getSession.mockResolvedValue({ data: { session: { access_token: token } } });
}

function withoutSession() {
  getSession.mockResolvedValue({ data: { session: null } });
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function brokenJsonResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error("not json");
    },
  };
}

function lastRequest(): { url: string; init: RequestInit & { headers: Record<string, string> } } {
  const call = fetchMock.mock.calls.at(-1)!;
  return { url: String(call[0]), init: call[1] as RequestInit & { headers: Record<string, string> } };
}

beforeEach(() => {
  fetchMock.mockReset();
  getSession.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("crm-admin: session gate", () => {
  it("no session → legacy fetcher returns null WITHOUT a network round-trip", async () => {
    withoutSession();
    const res = await fetchCrmContacts();
    expect(res).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no session → typed fetcher fails non-retryable, still zero network", async () => {
    withoutSession();
    const res = await fetchCrmLeads();
    expect(res.data).toBeNull();
    expect(res.failure).toMatchObject({ status: 401, retryable: false });
    expect(res.failure!.message).toMatch(/התחברות/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no session → write helper resolves false without network", async () => {
    withoutSession();
    await expect(setCrmLeadStatus("L1", "won")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("crm-admin: headers + payload", () => {
  it("sends apikey + Bearer + JSON content-type with a POST {action} body", async () => {
    withSession("tok-abc");
    fetchMock.mockResolvedValue(jsonResponse(200, { contacts: [] }));
    await fetchCrmContacts();
    const { url, init } = lastRequest();
    expect(url).toMatch(/\/functions\/v1\/crm-api$/);
    expect(init.method).toBe("POST");
    expect(init.headers.apikey).toBe(SUPABASE_ANON_KEY);
    expect(init.headers.Authorization).toBe("Bearer tok-abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ action: "listContacts" });
  });

  it("elides absent opts from the payload (no undefined/null keys on the wire)", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { leads: [] }));
    await fetchCrmLeads();
    expect(JSON.parse(String(lastRequest().init.body))).toEqual({ action: "listLeads" });
  });

  it("elides the DEFAULT sort but serializes explicit filters", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { leads: [] }));
    await fetchCrmLeads({ status: "new", search: "דנה", sort: "recent" });
    expect(JSON.parse(String(lastRequest().init.body))).toEqual({
      action: "listLeads",
      status: "new",
      search: "דנה",
    });
    await fetchCrmLeads({ sort: "oldest" });
    expect(JSON.parse(String(lastRequest().init.body))).toEqual({ action: "listLeads", sort: "oldest" });
  });
});

describe("crm-admin: failure mapping", () => {
  it("non-2xx → null for a legacy fetcher", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "db down" }));
    expect(await fetchCrmContacts()).toBeNull();
  });

  it("5xx → retryable failure carrying the server's own message", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "db down" }));
    const res = await fetchCrmLeads();
    expect(res.data).toBeNull();
    expect(res.failure).toMatchObject({ status: 500, retryable: true });
    expect(res.failure!.message).toContain("db down");
  });

  it("401/403 → NON-retryable failures with fixed Hebrew copy", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "bad jwt" }));
    const unauth = await fetchCrmLeads();
    expect(unauth.failure).toMatchObject({ status: 401, retryable: false });

    fetchMock.mockResolvedValue(jsonResponse(403, { error: "not admin" }));
    const forbidden = await fetchCrmThread("c1");
    expect(forbidden.data).toBeNull();
    expect(forbidden.failure).toMatchObject({ status: 403, retryable: false });
    expect(forbidden.failure!.message).toMatch(/הרשאה/);
  });

  it("a thrown fetch → network failure (retryable) / null, never a throw", async () => {
    withSession();
    fetchMock.mockRejectedValue(new Error("offline"));
    const typed = await fetchCrmLeads();
    expect(typed.failure).toMatchObject({ status: 0, retryable: true });
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await fetchCrmContacts()).toBeNull();
  });

  it("a 2xx body that isn't JSON degrades instead of throwing", async () => {
    withSession();
    fetchMock.mockResolvedValue(brokenJsonResponse(200));
    const res = await fetchCrmLeads();
    expect(res.data).toBeNull();
    expect(res.failure!.retryable).toBe(true);
  });
});

describe("crm-admin: shape guards", () => {
  it("rejects a 2xx body whose expected array is missing or mis-typed", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { contacts: "nope" }));
    expect(await fetchCrmContacts()).toBeNull();
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    expect(await fetchCrmContacts()).toBeNull();
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    expect(await fetchCrmContacts()).toBeNull();
  });

  it("overview requires BOTH pipeline (object) and recent (array)", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { pipeline: { new: 1, contacted: 0, won: 0, lost: 0 } }));
    const missing = await fetchCrmOverview();
    expect(missing.data).toBeNull();

    fetchMock.mockResolvedValue(
      jsonResponse(200, { pipeline: { new: 1, contacted: 0, won: 0, lost: 0 }, recent: [] }),
    );
    const ok = await fetchCrmOverview();
    expect(ok.data?.pipeline.new).toBe(1);
  });

  it("tolerates unknown ADDITIVE fields on a valid body (server may extend)", async () => {
    withSession();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { leads: [], hasMore: false, nextOffset: 200, futureField: { x: 1 } }),
    );
    const res = await fetchCrmLeads();
    expect(res.data).toEqual(expect.objectContaining({ leads: [] }));
    expect(res.failure).toBeNull();
  });

  it("hasArray / hasObject helpers", () => {
    expect(hasArray({ a: [] }, "a")).toBe(true);
    expect(hasArray({ a: [1, 2] }, "a")).toBe(true);
    expect(hasArray({ a: {} }, "a")).toBe(false);
    expect(hasArray({}, "a")).toBe(false);
    expect(hasObject({ a: {} }, "a")).toBe(true);
    expect(hasObject({ a: [] }, "a")).toBe(false);
    expect(hasObject({ a: null }, "a")).toBe(false);
  });
});

describe("crm-admin: status narrowing", () => {
  it("isLeadStatus accepts exactly the four pipeline stages", () => {
    expect(isLeadStatus("new")).toBe(true);
    expect(isLeadStatus("contacted")).toBe(true);
    expect(isLeadStatus("won")).toBe(true);
    expect(isLeadStatus("lost")).toBe(true);
    expect(isLeadStatus("qualified")).toBe(false);
    expect(isLeadStatus("")).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
    expect(isLeadStatus(undefined)).toBe(false);
  });

  it("isMeetingStatus accepts exactly the meeting lifecycle", () => {
    for (const s of ["pending", "confirmed", "no_rep", "cancelled", "expired", "completed"]) {
      expect(isMeetingStatus(s)).toBe(true);
    }
    expect(isMeetingStatus("won")).toBe(false);
    expect(isMeetingStatus(null)).toBe(false);
  });
});

describe("crm-admin: in-flight dedupe (reads only)", () => {
  it("identical concurrent reads share ONE request; a later read re-fetches", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { leads: [] }));
    const [r1, r2] = await Promise.all([fetchCrmLeads(), fetchCrmLeads()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2); // literally the same settled outcome

    await fetchCrmLeads(); // in-flight entry cleared on settle → fresh request
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("different payloads never coalesce", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { leads: [] }));
    await Promise.all([fetchCrmLeads(), fetchCrmLeads({ status: "new" })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("listSellableLeads is EXCLUDED — every call hits the server (audited read)", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { leads: [] }));
    await Promise.all([fetchSellableLeads(), fetchSellableLeads()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("writes never coalesce and return the ok flag", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const [a, b] = await Promise.all([setCrmLeadStatus("L1", "won"), setCrmLeadStatus("L1", "won")]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a).toBe(true);
    expect(b).toBe(true);

    fetchMock.mockResolvedValue(jsonResponse(404, { error: "not found" }));
    await expect(setCrmLeadStatus("missing", "won")).resolves.toBe(false);
  });

  it("serializes the private lead workflow fields through the CRM API", async () => {
    withSession();
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    await expect(
      setCrmLeadWorkflow("L1", {
        priority: "urgent",
        followUpAt: "2026-07-23T09:30:00.000Z",
        followUpNote: "Call after the morning meeting",
        lostReason: "",
      }),
    ).resolves.toBe(true);

    expect(JSON.parse(String(lastRequest().init.body))).toEqual({
      action: "setLeadWorkflow",
      leadId: "L1",
      priority: "urgent",
      followUpAt: "2026-07-23T09:30:00.000Z",
      followUpNote: "Call after the morning meeting",
      lostReason: "",
    });
  });
});
