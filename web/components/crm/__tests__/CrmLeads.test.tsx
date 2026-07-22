// Component tests for <CrmLeads> — the two-step bulk stage change (arm →
// confirm), partial-failure honesty, the bulk "claim to me", the one-shot undo
// from pre-apply statuses, the CSV export (id column + "-partial" filename), the
// typed 403 failure (no retry), and the keyboard row navigation. The crm-admin
// data layer is mocked at the module boundary, so no network/auth is involved;
// everything below exercises the REAL component logic.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CrmFetch, CrmLead } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({
  fetchCrmLeads: vi.fn(),
  fetchCrmAttentionLeads: vi.fn(),
  fetchCrmSla: vi.fn(),
  setCrmLeadStatus: vi.fn(),
  claimCrmLead: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchCrmLeads: mocks.fetchCrmLeads,
    fetchCrmAttentionLeads: mocks.fetchCrmAttentionLeads,
    fetchCrmSla: mocks.fetchCrmSla,
    setCrmLeadStatus: mocks.setCrmLeadStatus,
    claimCrmLead: mocks.claimCrmLead,
  };
});

vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, downloadCsv: mocks.downloadCsv };
});

// The drawer pulls auth/focus-trap/detail loads — stubbed; its own behaviour is
// covered in CrmLeadDrawer.test.tsx.
vi.mock("@/components/crm/CrmLeadDrawer", () => ({
  default: ({ leadId }: { leadId: string }) => <div data-testid="lead-drawer">{leadId}</div>,
}));

import CrmLeads from "@/components/crm/CrmLeads";

function lead(id: string, over: Partial<CrmLead> = {}): CrmLead {
  return {
    id,
    name: `ליד ${id}`,
    phone: `05000000${id}`,
    provider: null,
    source: null,
    status: "new",
    createdAt: "2026-07-12T08:00:00Z",
    claimedBy: null,
    priority: "normal",
    followUpAt: null,
    ...over,
  };
}

function ok(leads: CrmLead[], hasMore = false): CrmFetch<{ leads: CrmLead[]; hasMore: boolean }> {
  return { data: { leads, hasMore }, failure: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  mocks.fetchCrmSla.mockResolvedValue({
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
  });
  mocks.fetchCrmAttentionLeads.mockResolvedValue({
    data: {
      leads: [],
      summary: { total: 0, overdueFollowUps: 0, highPriority: 0, slaBreaches: 0 },
      hasMore: false,
      asOf: new Date().toISOString(),
    },
    failure: null,
  });
  mocks.setCrmLeadStatus.mockResolvedValue(true);
  mocks.claimCrmLead.mockResolvedValue(true);
});

// Select lead rows by their checkbox aria-label. The desktop table AND the
// mobile cards are both in the JSDOM tree (CSS hides one), so pick the first.
function selectLead(id: string) {
  fireEvent.click(screen.getAllByLabelText(`בחירת הליד ליד ${id}`)[0]);
}

// The bulk action bar (rendered once rows are selected). Its buttons share
// labels with the stage-filter chips, so queries must be scoped inside it.
function bulkBar() {
  return within(screen.getByText(/נבחרו$/).closest("div") as HTMLElement);
}

describe("CrmLeads bulk actions", () => {
  it("bulk stage change is two-step: arming never writes, confirming does", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a"), lead("b")]));
    render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    selectLead("a");
    selectLead("b");
    expect(screen.getByText("2 נבחרו")).toBeInTheDocument();

    // First click only ARMS the target.
    fireEvent.click(bulkBar().getByRole("button", { name: "יצרנו קשר" }));
    expect(mocks.setCrmLeadStatus).not.toHaveBeenCalled();

    // Second, explicit click applies — one audited write per lead.
    fireEvent.click(bulkBar().getByRole("button", { name: /אישור: העבר 2 ל״יצרנו קשר״/ }));
    await screen.findByText("עודכנו 2 לידים.");
    expect(mocks.setCrmLeadStatus).toHaveBeenCalledTimes(2);
    expect(mocks.setCrmLeadStatus).toHaveBeenCalledWith("a", "contacted");
    expect(mocks.setCrmLeadStatus).toHaveBeenCalledWith("b", "contacted");
    // The apply reloads the view (mount + reload).
    expect(mocks.fetchCrmLeads.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("a partial failure is reported in the danger tone, never as a win", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a"), lead("b")]));
    mocks.setCrmLeadStatus.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    selectLead("a");
    selectLead("b");
    fireEvent.click(bulkBar().getByRole("button", { name: "יצרנו קשר" }));
    fireEvent.click(bulkBar().getByRole("button", { name: /אישור: העבר 2 ל״יצרנו קשר״/ }));

    const msg = await screen.findByText("עודכנו 1 מתוך 2 לידים (חלק נכשלו).");
    expect(msg.className).toContain("text-danger-text");
  });

  it("bulk 'שייך אליי' claims every selected lead for the signed-in rep", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a"), lead("b")]));
    render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    selectLead("a");
    selectLead("b");
    fireEvent.click(bulkBar().getByRole("button", { name: "שייך אליי" }));
    expect(mocks.claimCrmLead).not.toHaveBeenCalled(); // armed only

    fireEvent.click(bulkBar().getByRole("button", { name: /אישור: שייך 2 אליי/ }));
    await screen.findByText(/שויכו 2 לידים אליך/);
    expect(mocks.claimCrmLead).toHaveBeenCalledTimes(2);
    // No profile in the test tree → the shared "מנהל" fallback rep name.
    expect(mocks.claimCrmLead).toHaveBeenCalledWith("a", "מנהל");
    expect(mocks.claimCrmLead).toHaveBeenCalledWith("b", "מנהל");
  });

  it("one-shot undo restores the statuses captured BEFORE the apply", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a", { status: "new" }), lead("b", { status: "lost" })]));
    render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    selectLead("a");
    selectLead("b");
    fireEvent.click(bulkBar().getByRole("button", { name: "יצרנו קשר" }));
    fireEvent.click(bulkBar().getByRole("button", { name: /אישור: העבר 2 ל״יצרנו קשר״/ }));
    await screen.findByText("עודכנו 2 לידים.");
    mocks.setCrmLeadStatus.mockClear();

    const undoBtn = screen.getByRole("button", { name: /שחזור השלבים הקודמים/ });
    fireEvent.click(undoBtn);
    await screen.findByText("שוחזרו 2 לידים לשלב הקודם.");
    // Restored to what each lead showed before the bulk — not a blanket value.
    expect(mocks.setCrmLeadStatus).toHaveBeenCalledWith("a", "new");
    expect(mocks.setCrmLeadStatus).toHaveBeenCalledWith("b", "lost");
    // One-shot: consumed on use.
    expect(screen.queryByRole("button", { name: /שחזור השלבים הקודמים/ })).toBeNull();
  });
});

describe("CrmLeads CSV export", () => {
  it("exports the current view with an id column", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a"), lead("b", { status: "won" })]));
    render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    fireEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
    const [name, content] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("leads-all.csv"); // 2 rows — window not full, no -partial
    const lines = content.slice(1).split("\r\n"); // strip the BOM
    expect(lines[0].startsWith("id,")).toBe(true);
    expect(lines[1].startsWith("a,")).toBe(true);
    expect(lines[2]).toContain("נסגר בהצלחה"); // Hebrew stage label, not the raw enum
  });

  it("marks a truncated window (server hasMore) with the -partial filename suffix", async () => {
    // A full 200-row window WITH more rows behind it on the server.
    const many = Array.from({ length: 200 }, (_, i) => lead(String(i)));
    mocks.fetchCrmLeads.mockResolvedValue(ok(many, true));
    render(<CrmLeads />);
    await screen.findAllByText("ליד 0");

    fireEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    const [name] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("leads-all-partial.csv");
  });

  it("does NOT mark an exactly-200-row window with no more rows as -partial", async () => {
    // The regression: 200 rows is the full window, but the server says hasMore
    // is false — there is nothing past it, so the export is complete, not partial.
    const exactly = Array.from({ length: 200 }, (_, i) => lead(String(i)));
    mocks.fetchCrmLeads.mockResolvedValue(ok(exactly, false));
    render(<CrmLeads />);
    await screen.findAllByText("ליד 0");

    fireEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    const [name] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("leads-all.csv");
  });
});

describe("CrmLeads failures", () => {
  it("shows the typed server message and hides retry on a 403", async () => {
    mocks.fetchCrmLeads.mockResolvedValue({
      data: null,
      failure: { status: 403, message: "אין לך הרשאה לפעולה הזו.", retryable: false },
    } satisfies CrmFetch<{ leads: CrmLead[] }>);
    render(<CrmLeads />);
    await screen.findByText("אין לך הרשאה לפעולה הזו.");
    expect(screen.queryByRole("button", { name: "נסו שוב" })).toBeNull();
  });

  it("a retryable failure keeps the retry button and it re-fetches", async () => {
    mocks.fetchCrmLeads
      .mockResolvedValueOnce({
        data: null,
        failure: { status: 500, message: "הבקשה נכשלה: db down", retryable: true },
      })
      .mockResolvedValue(ok([lead("a")]));
    render(<CrmLeads />);
    await screen.findByText("הבקשה נכשלה: db down");
    fireEvent.click(screen.getByRole("button", { name: "נסו שוב" }));
    await screen.findAllByText("ליד a");
  });
});

describe("CrmLeads attention queue", () => {
  it("switches to the dedicated server queue instead of filtering the 200-row list", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("ordinary")]));
    mocks.fetchCrmAttentionLeads.mockResolvedValue({
      data: {
        leads: [lead("urgent", { priority: "urgent" })],
        summary: { total: 1, overdueFollowUps: 0, highPriority: 1, slaBreaches: 1 },
        hasMore: false,
        asOf: new Date().toISOString(),
      },
      failure: null,
    });
    render(<CrmLeads />);
    await screen.findAllByText("ליד ordinary");

    fireEvent.click(screen.getByRole("button", { name: "לטיפול עכשיו" }));
    expect((await screen.findAllByText("ליד urgent")).length).toBeGreaterThan(0);
    expect(mocks.fetchCrmAttentionLeads).toHaveBeenCalledTimes(1);
  });
});

describe("CrmLeads keyboard navigation", () => {
  it("arrows move the roving row focus; Enter opens the drawer; Space selects", async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a"), lead("b")]));
    const { container } = render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    const rows = container.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    act(() => (rows[0] as HTMLElement).focus());
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(rows[1]));

    // Space (on the row itself) toggles selection without opening the drawer.
    fireEvent.keyDown(rows[1], { key: " " });
    expect(await screen.findByText("1 נבחרו")).toBeInTheDocument();
    expect(screen.queryByTestId("lead-drawer")).toBeNull();

    // Enter opens the drawer for that row's lead.
    fireEvent.keyDown(rows[1], { key: "Enter" });
    expect(await screen.findByTestId("lead-drawer")).toHaveTextContent("b");
  });

  it('"/" jumps focus to the search box', async () => {
    mocks.fetchCrmLeads.mockResolvedValue(ok([lead("a")]));
    const { container } = render(<CrmLeads />);
    await screen.findAllByText("ליד a");

    const row = container.querySelector("tbody tr") as HTMLElement;
    act(() => row.focus());
    fireEvent.keyDown(row, { key: "/" });
    expect(screen.getByLabelText("חיפוש לידים")).toHaveFocus();
  });
});
