// Component tests for the <CrmConsole> ACCESS GATE.
//
// THE DEFECT THIS PINS: crm_roles.ts has modelled viewer/rep/admin all along —
// a `rep` holds read + write_leads + converse and crm-api enforces that per
// action — but this shell gated on profiles.is_admin, so a rep granted a role
// could never open the console the role was designed for. It now asks crm-api
// `whoami` (the SAME gate the mutations go through).
//
// The second thing pinned here is the risk that introduced: resolving the role
// over the network means a blip could tell a legitimate admin they've lost
// access. Only 401/403 is a denial; anything else must offer a retry.
//
// The data layer is mocked at the module boundary — no network involved.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmAccess, CrmFetch } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({ fetchCrmAccess: vi.fn() }));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return { ...actual, fetchCrmAccess: mocks.fetchCrmAccess };
});

// Every section is an on-demand chunk with its own data layer — stub them all so
// these tests exercise the shell and nothing else.
vi.mock("@/components/crm/CrmDashboard", () => ({ default: () => <div>לוח בקרה</div> }));
vi.mock("@/components/crm/CrmLeads", () => ({ default: () => <div>רשימת לידים</div> }));
vi.mock("@/components/crm/CrmMeetings", () => ({ default: () => null }));
vi.mock("@/components/crm/CrmInbox", () => ({ default: () => null }));
vi.mock("@/components/crm/CrmContacts", () => ({ default: () => null }));
vi.mock("@/components/crm/CrmSellableLeads", () => ({ default: () => <div>פיד לשיתוף</div> }));
vi.mock("@/components/crm/CrmTeam", () => ({ default: () => null }));
vi.mock("@/components/crm/CrmAnalytics", () => ({ default: () => null }));

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

import CrmConsole from "@/components/crm/CrmConsole";

function access(over: Partial<CrmAccess> = {}): CrmFetch<CrmAccess> {
  return {
    data: {
      role: "rep",
      isAdmin: false,
      can: { read: true, writeLeads: true, converse: true, adminOnly: false },
      ...over,
    },
    failure: null,
  };
}

const ADMIN = access({
  role: "admin",
  isAdmin: true,
  can: { read: true, writeLeads: true, converse: true, adminOnly: true },
});

beforeEach(() => {
  vi.clearAllMocks();
  search = "";
  window.history.replaceState({}, "", "/crm");
});

describe("CrmConsole access gate", () => {
  it("opens the console for a granted rep — not just for admins", async () => {
    mocks.fetchCrmAccess.mockResolvedValue(access());
    render(<CrmConsole />);
    expect(await screen.findByRole("tab", { name: "לידים" })).toBeTruthy();
    // The two admin_only surfaces (consented-PII feed + role management) stay out.
    expect(screen.queryByRole("tab", { name: "לידים לשיתוף" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "צוות והרשאות" })).toBeNull();
  });

  it("shows an admin every tab", async () => {
    mocks.fetchCrmAccess.mockResolvedValue(ADMIN);
    render(<CrmConsole />);
    expect(await screen.findByRole("tab", { name: "לידים לשיתוף" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "צוות והרשאות" })).toBeTruthy();
  });

  it("refuses someone with no CRM role at all (403)", async () => {
    mocks.fetchCrmAccess.mockResolvedValue({
      data: null,
      failure: { status: 403, message: "אין הרשאת גישה למערכת", retryable: false },
    });
    render(<CrmConsole />);
    expect(await screen.findByText(/אין לך הרשאת גישה לקונסולה/)).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("a NETWORK failure is not a denial — it offers a retry", async () => {
    mocks.fetchCrmAccess
      .mockResolvedValueOnce({
        data: null,
        failure: { status: 0, message: "שגיאת רשת — לא הצלחנו להגיע לשרת.", retryable: true },
      })
      .mockResolvedValue(ADMIN);
    render(<CrmConsole />);
    // Never tell a legitimate admin they've lost access because of a blip.
    expect(await screen.findByText(/שגיאת רשת/)).toBeTruthy();
    expect(screen.queryByText(/אין לך הרשאת גישה/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(await screen.findByRole("tab", { name: "לידים" })).toBeTruthy();
  });

  it("a deep link to a tab this role can't open falls back to the dashboard", async () => {
    search = "tab=sellable";
    mocks.fetchCrmAccess.mockResolvedValue(access());
    render(<CrmConsole />);
    // The section itself must never mount — every request it makes would 403.
    expect(await screen.findByText("לוח בקרה")).toBeTruthy();
    expect(screen.queryByText("פיד לשיתוף")).toBeNull();
  });

  it("an admin's deep link to that same tab DOES open it", async () => {
    search = "tab=sellable";
    mocks.fetchCrmAccess.mockResolvedValue(ADMIN);
    render(<CrmConsole />);
    expect(await screen.findByText("פיד לשיתוף")).toBeTruthy();
  });

  it("resolves access through the server gate, not a client-side is_admin flag", async () => {
    mocks.fetchCrmAccess.mockResolvedValue(access());
    render(<CrmConsole />);
    await waitFor(() => expect(mocks.fetchCrmAccess).toHaveBeenCalled());
  });
});
