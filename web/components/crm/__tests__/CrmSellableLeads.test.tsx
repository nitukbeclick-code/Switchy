// Component tests for <CrmSellableLeads> — the CRM's ONLY surface that renders
// consented customer PII (name / phone / email), and therefore the one whose
// contract is legal rather than cosmetic.
//
// THE DEFECTS THESE PIN:
//
//  1. The legal boundary going missing in a state nobody looked at. The notice
//     ("כולל אך ורק לידים שאישרו… תצוגה זו לקריאה בלבד ואינה שולחת דבר לרוכש",
//     §7b + DPA) sits OUTSIDE the loading/error/empty/populated branch by
//     construction — one stray move inside the `) : (` and the disclaimer
//     silently disappears from three of the four states while the PII keeps
//     rendering. Nothing but a test that renders all four states catches that,
//     because the populated state — the one a developer actually looks at — is
//     the state that would still look right.
//  2. The read-only guarantee. This screen must NEVER write: no stage change, no
//     claim, no assignment, no push to a buyer (the secret-gated export cron is
//     the only path allowed to move data outward). crm-admin is mocked at the
//     module boundary, so every mutation the module exports is a spy here and a
//     regression that "helpfully" wires up a write is caught by construction.
//  3. The retry that doesn't re-fetch. The feed's error branch is the whole
//     recovery path (fetchSellableLeads resolves `null` on any failure — there is
//     no typed CrmFetch here), so a retry button that re-renders without calling
//     the fetcher again strands the admin on a dead screen.
//  4. The CSV export silently dropping the consent column, or being offered when
//     there is nothing to export. The exported file is the artefact that leaves
//     the browser; its consent timestamp is the audit trail.
//  5. The ">= 500" truncation note. The server caps the window; a count line that
//     reads "500 לידים בהסכמת שיתוף" with no admission of truncation tells an
//     auditor the feed is complete when it is not.
//
// The data layer (@/lib/crm-admin) and the download side-effect (@/lib/csv
// downloadCsv) are mocked at the module boundary — no network, no jsdom
// navigation. buildCsv stays REAL so the asserted file content is the real file.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmSellableLead } from "@/lib/crm-admin";
import { when } from "@/components/crm/ui";

const mocks = vi.hoisted(() => ({
  fetchSellableLeads: vi.fn(),
  downloadCsv: vi.fn(),
  // Every write crm-admin exposes. None of them may ever fire from this screen.
  setCrmLeadStatus: vi.fn(),
  setCrmLeadWorkflow: vi.fn(),
  claimCrmLead: vi.fn(),
  assignCrmLead: vi.fn(),
  releaseCrmLead: vi.fn(),
  addCrmNote: vi.fn(),
  setCrmLeadNote: vi.fn(),
  recordCrmSaving: vi.fn(),
  sendCrmReply: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchSellableLeads: mocks.fetchSellableLeads,
    setCrmLeadStatus: mocks.setCrmLeadStatus,
    setCrmLeadWorkflow: mocks.setCrmLeadWorkflow,
    claimCrmLead: mocks.claimCrmLead,
    assignCrmLead: mocks.assignCrmLead,
    releaseCrmLead: mocks.releaseCrmLead,
    addCrmNote: mocks.addCrmNote,
    setCrmLeadNote: mocks.setCrmLeadNote,
    recordCrmSaving: mocks.recordCrmSaving,
    sendCrmReply: mocks.sendCrmReply,
  };
});

vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, downloadCsv: mocks.downloadCsv };
});

import CrmSellableLeads from "@/components/crm/CrmSellableLeads";

const CONSENT_A = "2026-07-01T09:00:00Z";
const CONSENT_B = "2026-07-02T09:00:00Z";

const DANA: CrmSellableLead = {
  id: "lead-a",
  name: "דנה כהן",
  phone: "050-1111111",
  email: "dana@example.com",
  provider: "פרטנר",
  source: "web",
  status: "new",
  consentShareAt: CONSENT_A,
  createdAt: "2026-06-30T09:00:00Z",
};

const YOSSI: CrmSellableLead = {
  id: "lead-b",
  name: "יוסי לוי",
  phone: "050-2222222",
  email: null,
  provider: null,
  source: null,
  status: "contacted",
  consentShareAt: CONSENT_B,
  createdAt: null,
};

function bulk(n: number): CrmSellableLead[] {
  return Array.from({ length: n }, (_, i) => ({ ...DANA, id: `bulk-${i}`, name: `ליד ${i}` }));
}

/** Every mutation crm-admin exports, as spies — the read-only assertion set. */
const WRITES = [
  mocks.setCrmLeadStatus,
  mocks.setCrmLeadWorkflow,
  mocks.claimCrmLead,
  mocks.assignCrmLead,
  mocks.releaseCrmLead,
  mocks.addCrmNote,
  mocks.setCrmLeadNote,
  mocks.recordCrmSaving,
  mocks.sendCrmReply,
];

type State = "loading" | "error" | "empty" | "populated";

/** Render the feed in one of its four states and hand back the element that
 *  represents THAT state's data region (for DOM-order assertions). */
async function renderState(state: State) {
  if (state === "loading") mocks.fetchSellableLeads.mockReturnValue(new Promise(() => {}));
  else if (state === "error") mocks.fetchSellableLeads.mockResolvedValue(null);
  else if (state === "empty") mocks.fetchSellableLeads.mockResolvedValue({ leads: [] });
  else mocks.fetchSellableLeads.mockResolvedValue({ leads: [DANA, YOSSI] });

  const utils = render(<CrmSellableLeads />);
  // Let the fetch settle so the branch under test is the one on screen.
  if (state !== "loading") {
    await waitFor(() => expect(utils.container.querySelector(".animate-pulse")).toBeNull());
  }
  // Whatever this branch rendered, anchored STRUCTURALLY (the region after the
  // notice) — so the DOM-order check below stays a pure ordering assertion and
  // does not double as a second assertion about that branch's content, which
  // each state's own test owns.
  const data = utils.container.firstElementChild?.children[1] as HTMLElement;
  return { ...utils, data };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CrmSellableLeads legal boundary", () => {
  it("renders the consent/read-only notice BEFORE the data, in all four states", async () => {
    for (const state of ["loading", "error", "empty", "populated"] as State[]) {
      const { data, unmount } = await renderState(state);

      const heading = screen.getByText("פיד לידים בהסכמת שיתוף");
      // The two clauses that make this screen legal: the consent-only gate and
      // the promise that nothing is pushed to a buyer.
      const body = screen.getByText(/consent_share_at/);
      expect(body.textContent).toContain("אך ורק");
      expect(body.textContent).toContain("לקריאה בלבד");
      expect(body.textContent).toContain("אינה שולחת דבר לרוכש");
      expect(body.textContent).toContain("§7b");
      expect(body.textContent).toContain("DPA");

      // …and it precedes the data region in the document, not merely exists.
      expect(data).toBeTruthy();
      expect(heading.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING)
        .toBeTruthy();

      unmount();
    }
  });

  it("never calls a crm-admin mutation — the feed is read-only end to end", async () => {
    await renderState("populated");
    // Exercise the only interactive control the populated view has.
    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));

    for (const write of WRITES) expect(write).not.toHaveBeenCalled();
    // The one call it is allowed to make: the audited, consent-gated read.
    expect(mocks.fetchSellableLeads.mock.calls).toEqual([[]]);
  });
});

describe("CrmSellableLeads states", () => {
  it("shows a skeleton while loading — and no PII before the fetch resolves", async () => {
    const { container } = await renderState("loading");

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    // The placeholder is decorative: hidden from assistive tech.
    expect(container.querySelector(".animate-pulse")?.closest("[aria-hidden='true']")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(DANA.phone)).toBeNull();
  });

  it("a failed load offers a retry that actually re-fetches the feed", async () => {
    mocks.fetchSellableLeads.mockResolvedValueOnce(null).mockResolvedValue({ leads: [DANA] });
    render(<CrmSellableLeads />);

    await screen.findByText("לא הצלחנו לטעון את הפיד.");
    expect(screen.queryByRole("table")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByText("לא הצלחנו לטעון את הפיד.")).toBeNull();
    // Re-fetched — twice, and neither call narrows the feed with a filter.
    expect(mocks.fetchSellableLeads.mock.calls).toEqual([[], []]);
  });

  it("an empty feed says so and offers nothing to export", async () => {
    await renderState("empty");

    expect(screen.getByText("אין כרגע לידים בהסכמת שיתוף.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    // Nothing to export ⇒ the export control is not offered at all.
    expect(screen.queryByRole("button", { name: "ייצוא CSV" })).toBeNull();
    expect(mocks.downloadCsv).not.toHaveBeenCalled();
  });

  it("renders the consented PII in BOTH the desktop table and the mobile cards", async () => {
    await renderState("populated");

    // Desktop: a semantic table with the PII columns.
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "טלפון" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "אימייל" })).toBeTruthy();
    expect(within(table).getByText("דנה כהן")).toBeTruthy();
    expect(within(table).getByText("050-1111111")).toBeTruthy();
    expect(within(table).getByText("dana@example.com")).toBeTruthy();
    expect(within(table).getByText("פרטנר")).toBeTruthy();
    // Latin/numeric PII is forced LTR inside the RTL page.
    expect(within(table).getByText("050-1111111").getAttribute("dir")).toBe("ltr");
    // The consent timestamp is shown as a he-IL date, never a raw ISO string.
    expect(within(table).getByText(when(CONSENT_A))).toBeTruthy();
    expect(within(table).queryByText(CONSENT_A)).toBeNull();
    // A lead with no email/provider degrades to an em dash, not "null".
    const yossiRow = within(table).getByText("יוסי לוי").closest("tr") as HTMLElement;
    expect(within(yossiRow).getAllByText("—").length).toBe(2);

    // Mobile: the same PII again as cards (both layouts live in the DOM; CSS
    // hides one), so a phone-only admin sees the same feed.
    const cards = screen.getByRole("list");
    expect(within(cards).getByText("דנה כהן")).toBeTruthy();
    expect(within(cards).getByText("050-1111111")).toBeTruthy();
    expect(within(cards).getByText("dana@example.com")).toBeTruthy();
    expect(within(cards).getByText("ספק: פרטנר")).toBeTruthy();
    expect(within(cards).getByText(`הסכמת שיתוף: ${when(CONSENT_A)}`)).toBeTruthy();
    // …and the lead without an email simply omits the line.
    expect(within(cards).getByText("יוסי לוי")).toBeTruthy();
    expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("CrmSellableLeads CSV export", () => {
  it("exports every rendered lead, consent timestamp included", async () => {
    await renderState("populated");

    const button = screen.getByRole("button", { name: "ייצוא CSV" });
    expect(button).toBeEnabled();
    await userEvent.click(button);

    expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
    const [name, content] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("sellable-leads.csv");

    const lines = content.slice(1).split("\r\n"); // strip the UTF-8 BOM
    expect(lines[0]).toBe("שם,טלפון,אימייל,ספק,מקור,שלב,הסכמת שיתוף,נוצר");
    // The consent timestamp is the audit trail — it must survive into the file.
    expect(lines[1]).toBe(
      `דנה כהן,050-1111111,dana@example.com,פרטנר,web,new,${CONSENT_A},2026-06-30T09:00:00Z`,
    );
    // Nulls become empty cells, never the string "null" (columns stay aligned).
    expect(lines[2]).toBe(`יוסי לוי,050-2222222,,,,contacted,${CONSENT_B},`);
    expect(lines).toHaveLength(3);
  });
});

describe("CrmSellableLeads window truncation", () => {
  it('admits "(מוצגים 500 האחרונים)" only once the server window is full', async () => {
    // 499 rows: the whole feed — claiming truncation would be its own lie.
    mocks.fetchSellableLeads.mockResolvedValue({ leads: bulk(499) });
    const first = render(<CrmSellableLeads />);
    expect(await screen.findByText("499 לידים בהסכמת שיתוף")).toBeTruthy();
    expect(screen.queryByText(/מוצגים 500 האחרונים/)).toBeNull();
    first.unmount();

    // 500 rows: the window is full, so older consented leads exist off-screen.
    mocks.fetchSellableLeads.mockResolvedValue({ leads: bulk(500) });
    render(<CrmSellableLeads />);
    expect(await screen.findByText(/מוצגים 500 האחרונים/)).toBeTruthy();
  });
});
