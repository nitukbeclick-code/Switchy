// Component tests for <CrmDashboard> — the "פגישות היום" strip. The regression:
// listMeetings returns furthest-future-first and caps the window at 200 rows, so
// with ≥200 future bookings ahead of today's, a single default fetch never reaches
// today and the strip goes wrongly empty. The dashboard now PAGES the window
// (offset) toward today. The crm-admin data layer is mocked at the module boundary
// so no network/realtime is involved.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { CrmFetch, CrmMeeting, CrmOverview, CrmSla } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({
  fetchCrmOverview: vi.fn(),
  fetchCrmSla: vi.fn(),
  fetchCrmMeetings: vi.fn(),
  fetchCrmAttentionLeads: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchCrmOverview: mocks.fetchCrmOverview,
    fetchCrmSla: mocks.fetchCrmSla,
    fetchCrmMeetings: mocks.fetchCrmMeetings,
    fetchCrmAttentionLeads: mocks.fetchCrmAttentionLeads,
  };
});

// Realtime is irrelevant to these tests — make the hook a no-op so no supabase
// browser client is constructed.
vi.mock("@/lib/use-crm-events", () => ({ useCrmEvents: () => {} }));

vi.mock("@/components/crm/CrmMeetingDrawer", () => ({ default: () => null }));

import CrmDashboard from "@/components/crm/CrmDashboard";

function meeting(id: string, over: Partial<CrmMeeting> = {}): CrmMeeting {
  return {
    id,
    name: `פגישה ${id}`,
    phone: `0500000${id}`,
    provider: null,
    meetingDate: null,
    slot: null,
    startsAt: null,
    status: "confirmed",
    source: null,
    claimedBy: null,
    ...over,
  };
}

const overview: CrmFetch<CrmOverview> = {
  data: { pipeline: { new: 1, contacted: 0, won: 0, lost: 0 }, recent: [] },
  failure: null,
};

const sla: CrmFetch<{ sla: CrmSla }> = {
  data: {
    sla: {
      slaHours: 4,
      uncontacted: 0,
      breaching: 0,
      oldestUncontactedAt: null,
      medianResponseMinutes: null,
      responseSampleSize: 0,
    },
  },
  failure: null,
};

// ISO timestamps anchored to the LOCAL day so isToday() matches regardless of TZ.
function isoNoonToday(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
function isoNextYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
function isoYesterday(): string {
  return new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchCrmOverview.mockResolvedValue(overview);
  mocks.fetchCrmSla.mockResolvedValue(sla);
  mocks.fetchCrmAttentionLeads.mockResolvedValue({
    data: {
      leads: [],
      summary: { total: 0, overdueFollowUps: 0, highPriority: 0, slaBreaches: 0 },
      hasMore: false,
      asOf: new Date().toISOString(),
    },
    failure: null,
  });
});

describe("CrmDashboard פגישות היום strip", () => {
  it("surfaces today's meeting even when ≥200 future bookings sit ahead of it", async () => {
    // Page 0 (offset 0): a full window of far-future meetings, more behind it.
    const futurePage = Array.from({ length: 200 }, (_, i) =>
      meeting(`f${i}`, { startsAt: isoNextYear() }),
    );
    // Page 1 (offset 200): today's meeting, then a past one that crosses below
    // today (so paging stops here).
    const todayMeeting = meeting("today", { startsAt: isoNoonToday() });
    const pastMeeting = meeting("past", { startsAt: isoYesterday() });

    mocks.fetchCrmMeetings.mockImplementation((opts?: { offset?: number }) => {
      const offset = opts?.offset ?? 0;
      if (offset === 0) return Promise.resolve({ meetings: futurePage, hasMore: true });
      if (offset === 200) return Promise.resolve({ meetings: [todayMeeting, pastMeeting], hasMore: false });
      return Promise.resolve({ meetings: [], hasMore: false });
    });

    render(<CrmDashboard />);

    // The strip renders today's meeting…
    expect(await screen.findByText("פגישה today")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "פגישות היום" })).toBeInTheDocument();
    // …and does NOT show a far-future booking (not today).
    expect(screen.queryByText("פגישה f0")).toBeNull();
    // It paged exactly twice — offset 0, then offset 200 (where it crossed today).
    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(2);
  });

  it("makes exactly one request when the first window already reaches today", async () => {
    const todayMeeting = meeting("today", { startsAt: isoNoonToday() });
    mocks.fetchCrmMeetings.mockResolvedValue({ meetings: [todayMeeting], hasMore: false });

    render(<CrmDashboard />);

    expect(await screen.findByText("פגישה today")).toBeInTheDocument();
    // hasMore=false on the first page → no paging.
    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(1);
  });

  it("hides the strip when there are no meetings today", async () => {
    mocks.fetchCrmMeetings.mockResolvedValue({
      meetings: [meeting("f0", { startsAt: isoNextYear() })],
      hasMore: false,
    });

    render(<CrmDashboard />);

    // Wait for the dashboard to finish loading (a KPI card appears), then assert
    // the strip heading is absent.
    await screen.findByText("סה״כ לידים");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "פגישות היום" })).toBeNull());
  });
});
