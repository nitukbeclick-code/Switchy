// Component tests for <CrmLeadDrawer> — the aria-modal focus contract (initial
// focus + Escape-to-close), the won-flow input validation (no write on a bad
// amount), the main-note draft surviving an unrelated reload, the danger tone on
// failed writes and typed load failures (no retry on 403), the timeline's
// old→new status pills, and prev/next paging. crm-admin is mocked at the module
// boundary; the focus trap and auth fallback are the REAL shared modules.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CrmFetch, CrmLeadDetail, CrmLeadEvent } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({
  fetchCrmLeadDetail: vi.fn(),
  setCrmLeadStatus: vi.fn(),
  addCrmNote: vi.fn(),
  setCrmLeadNote: vi.fn(),
  setCrmLeadWorkflow: vi.fn(),
  recordCrmSaving: vi.fn(),
  claimCrmLead: vi.fn(),
  releaseCrmLead: vi.fn(),
  assignCrmLead: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchCrmLeadDetail: mocks.fetchCrmLeadDetail,
    setCrmLeadStatus: mocks.setCrmLeadStatus,
    addCrmNote: mocks.addCrmNote,
    setCrmLeadNote: mocks.setCrmLeadNote,
    setCrmLeadWorkflow: mocks.setCrmLeadWorkflow,
    recordCrmSaving: mocks.recordCrmSaving,
    claimCrmLead: mocks.claimCrmLead,
    releaseCrmLead: mocks.releaseCrmLead,
    assignCrmLead: mocks.assignCrmLead,
  };
});

import CrmLeadDrawer from "@/components/crm/CrmLeadDrawer";

type Detail = { lead: CrmLeadDetail; events: CrmLeadEvent[] };

function detail(over: Partial<CrmLeadDetail> = {}, events: CrmLeadEvent[] = []): CrmFetch<Detail> {
  return {
    data: {
      lead: {
        id: "L1",
        name: "דנה כהן",
        phone: "0501234567",
        email: null,
        provider: null,
        planId: null,
        source: null,
        callbackTime: null,
        city: null,
        status: "new",
        createdAt: "2026-07-10T08:00:00Z",
        claimedBy: null,
        claimedAt: null,
        contactedAt: null,
        actualSaving: null,
        priority: "normal",
        followUpAt: null,
        followUpNote: null,
        lostReason: null,
        notes: "הערה מהשרת",
        referrerCode: null,
        consent: { sms: true, email: false, whatsapp: true },
        ...over,
      },
      events,
    },
    failure: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchCrmLeadDetail.mockResolvedValue(detail());
  mocks.setCrmLeadStatus.mockResolvedValue(true);
  mocks.recordCrmSaving.mockResolvedValue(true);
  mocks.addCrmNote.mockResolvedValue(true);
  mocks.setCrmLeadNote.mockResolvedValue(true);
  mocks.setCrmLeadWorkflow.mockResolvedValue(true);
  mocks.claimCrmLead.mockResolvedValue(true);
  mocks.releaseCrmLead.mockResolvedValue({ data: { ok: true, releasedFrom: "דנה" }, failure: null });
  mocks.assignCrmLead.mockResolvedValue({ data: { ok: true, previousOwner: "דנה" }, failure: null });
});

// ── Release / reassign: the admin-only exit from a permanent claim ───────────
// claimLead is guarded `claimed_by=is.null`, which made a claim a ONE-WAY DOOR:
// a rep who left held their book forever. These controls are the way back, and
// because they take a lead away from a colleague they are gated twice — server
// (ACTION_CAP → admin_only) and here.

describe("CrmLeadDrawer claim management", () => {
  const claimed = () => detail({ claimedBy: "דנה", claimedAt: "2026-07-11T09:00:00Z" });

  it("hides the controls from a non-admin even on a claimed lead", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />); // canAdmin defaults false
    await screen.findByRole("heading", { name: "דנה כהן" });
    expect(screen.queryByRole("button", { name: "שחרור למאגר" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "העברה" })).not.toBeInTheDocument();
  });

  it("hides them from an admin when nobody holds the lead", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(detail({ claimedBy: null }));
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });
    // Nothing to release — the claim button is the right control here instead.
    expect(screen.queryByRole("button", { name: "שחרור למאגר" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /שייך אליי/ })).toBeInTheDocument();
  });

  it("releases with the typed reason and names who held it", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    const onChanged = vi.fn();
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} onChanged={onChanged} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    fireEvent.change(screen.getByLabelText(/סיבת שחרור/), { target: { value: "בחופשה" } });
    fireEvent.click(screen.getByRole("button", { name: "שחרור למאגר" }));

    await waitFor(() => expect(mocks.releaseCrmLead).toHaveBeenCalledWith("L1", "בחופשה"));
    expect(await screen.findByText("הליד שוחרר מדנה וחזר למאגר.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("omits an empty reason rather than sending a blank string", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });
    fireEvent.click(screen.getByRole("button", { name: "שחרור למאגר" }));
    await waitFor(() => expect(mocks.releaseCrmLead).toHaveBeenCalledWith("L1", undefined));
  });

  it("surfaces the SERVER's message on a failure, not a generic one", async () => {
    // The whole reason these two use the typed CrmFetch path: a rep must be able
    // to tell "you are not an admin" from "nobody holds this lead" from a network
    // blip. A boolean-returning action renders all three identically.
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    mocks.releaseCrmLead.mockResolvedValue({
      data: null,
      failure: { status: 403, message: "אין לך הרשאה לפעולה הזו.", retryable: false },
    });
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });
    fireEvent.click(screen.getByRole("button", { name: "שחרור למאגר" }));
    expect(await screen.findByText("אין לך הרשאה לפעולה הזו.")).toBeInTheDocument();
    expect(screen.queryByText("הפעולה נכשלה. נסו שוב.")).not.toBeInTheDocument();
  });

  it("reassigns and reports who the lead came from", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    fireEvent.change(screen.getByLabelText("העברה לנציג אחר"), { target: { value: "רון" } });
    fireEvent.click(screen.getByRole("button", { name: "העברה" }));

    await waitFor(() => expect(mocks.assignCrmLead).toHaveBeenCalledWith("L1", "רון"));
    expect(await screen.findByText("הליד הועבר מדנה לרון.")).toBeInTheDocument();
  });

  it("will not send a whitespace-only rep name", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });
    fireEvent.change(screen.getByLabelText("העברה לנציג אחר"), { target: { value: "   " } });
    // The button is disabled on a blank name, so nothing is dispatched at all.
    expect(screen.getByRole("button", { name: "העברה" })).toBeDisabled();
    expect(mocks.assignCrmLead).not.toHaveBeenCalled();
  });

  it("reports a no-op reassignment honestly instead of claiming a move", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(claimed());
    mocks.assignCrmLead.mockResolvedValue({ data: { ok: true, unchanged: true }, failure: null });
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} canAdmin />);
    await screen.findByRole("heading", { name: "דנה כהן" });
    fireEvent.change(screen.getByLabelText("העברה לנציג אחר"), { target: { value: "דנה" } });
    fireEvent.click(screen.getByRole("button", { name: "העברה" }));
    expect(await screen.findByText("הליד כבר משויך לדנה.")).toBeInTheDocument();
  });
});

describe("CrmLeadDrawer focus contract", () => {
  it("moves focus to the close button on open and closes on Escape", async () => {
    const onClose = vi.fn();
    render(<CrmLeadDrawer leadId="L1" onClose={onClose} />);
    expect(screen.getByRole("button", { name: "סגור" })).toHaveFocus();
    await screen.findByRole("heading", { name: "דנה כהן" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CrmLeadDrawer won-flow validation", () => {
  it("rejects a non-positive amount client-side — no write is sent", async () => {
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    const input = screen.getByLabelText(/רישום חיסכון שנתי/);
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "רשום וסגור" }));
    expect(await screen.findByText("הזינו סכום חיסכון שנתי תקין.")).toBeInTheDocument();
    expect(mocks.recordCrmSaving).not.toHaveBeenCalled();
  });

  it("records a valid annual saving and reports success", async () => {
    const onChanged = vi.fn();
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} onChanged={onChanged} />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    fireEvent.change(screen.getByLabelText(/רישום חיסכון שנתי/), { target: { value: "1200" } });
    fireEvent.click(screen.getByRole("button", { name: "רשום וסגור" }));
    await screen.findByText("החיסכון נרשם והליד נסגר בהצלחה.");
    expect(mocks.recordCrmSaving).toHaveBeenCalledWith("L1", 1200);
    expect(onChanged).toHaveBeenCalled();
  });
});

describe("CrmLeadDrawer main-note draft", () => {
  it("an unrelated reload never clobbers an unsaved draft", async () => {
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    const mainNote = screen.getByLabelText("הערה ראשית");
    expect(mainNote).toHaveValue("הערה מהשרת");
    fireEvent.change(mainNote, { target: { value: "טיוטה שלי" } });

    // A status change triggers a full reload; the SERVER notes are unchanged,
    // so the local draft must survive.
    fireEvent.click(screen.getByRole("button", { name: "יצרנו קשר" }));
    await screen.findByText("הסטטוס עודכן.");
    await waitFor(() => expect(screen.getByLabelText("הערה ראשית")).toHaveValue("טיוטה שלי"));
  });

  it("a CHANGED server note re-seeds the field (save round-trip)", async () => {
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    fireEvent.change(screen.getByLabelText("הערה ראשית"), { target: { value: "נוסח חדש" } });
    mocks.fetchCrmLeadDetail.mockResolvedValue(detail({ notes: "נוסח חדש" }));
    fireEvent.click(screen.getByRole("button", { name: "שמור הערה ראשית" }));
    await screen.findByText("ההערה נשמרה.");
    expect(mocks.setCrmLeadNote).toHaveBeenCalledWith("L1", "נוסח חדש");
    expect(screen.getByLabelText("הערה ראשית")).toHaveValue("נוסח חדש");
  });
});

describe("CrmLeadDrawer failure tones", () => {
  it("a failed write is announced in the danger tone", async () => {
    mocks.setCrmLeadStatus.mockResolvedValue(false);
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "דנה כהן" });

    fireEvent.click(screen.getByRole("button", { name: "יצרנו קשר" }));
    const notice = await screen.findByText("עדכון הסטטוס נכשל. נסו שוב.");
    expect(notice.className).toContain("text-danger-text");
  });

  it("a 403 load failure shows the server message WITHOUT a retry button", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue({
      data: null,
      failure: { status: 403, message: "אין לך הרשאה לפעולה הזו.", retryable: false },
    });
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    const msg = await screen.findByText("אין לך הרשאה לפעולה הזו.");
    expect(msg.className).toContain("text-danger-text");
    expect(screen.queryByRole("button", { name: "נסו שוב" })).toBeNull();
  });

  it("a retryable load failure keeps the retry button", async () => {
    mocks.fetchCrmLeadDetail
      .mockResolvedValueOnce({
        data: null,
        failure: { status: 0, message: "שגיאת רשת — לא הצלחנו להגיע לשרת. בדקו את החיבור ונסו שוב.", retryable: true },
      })
      .mockResolvedValue(detail());
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByText(/שגיאת רשת/);
    fireEvent.click(screen.getByRole("button", { name: "נסו שוב" }));
    await screen.findByRole("heading", { name: "דנה כהן" });
  });
});

describe("CrmLeadDrawer timeline", () => {
  it("renders an old→new status-pill pair per stage-change event", async () => {
    mocks.fetchCrmLeadDetail.mockResolvedValue(
      detail({}, [
        {
          id: "e1",
          event: "status_change",
          oldStatus: "new",
          newStatus: "lost",
          actorName: "רון",
          note: null,
          createdAt: "2026-07-11T09:00:00Z",
        },
      ]),
    );
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByText("שינוי סטטוס");
    // Pills, not raw enum values: the Hebrew stage labels appear in the event.
    expect(screen.getAllByText("חדש").length).toBeGreaterThanOrEqual(2); // stage chip + old pill
    expect(screen.getAllByText("אבוד").length).toBeGreaterThanOrEqual(2); // stage chip + new pill
    expect(screen.getByText("— רון")).toBeInTheDocument();
  });
});

describe("CrmLeadDrawer prev/next paging", () => {
  it("pages via onNavigate and disables the edge button", async () => {
    const onNavigate = vi.fn();
    render(
      <CrmLeadDrawer leadId="L1" onClose={() => {}} prevId={null} nextId="L2" onNavigate={onNavigate} />,
    );
    await screen.findByRole("heading", { name: "דנה כהן" });

    expect(screen.getByRole("button", { name: "הליד הקודם" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "הליד הבא" }));
    expect(onNavigate).toHaveBeenCalledWith("L2");
  });

  it("hides the pager entirely when the parent passes no navigation", async () => {
    render(<CrmLeadDrawer leadId="L1" onClose={() => {}} />);
    await screen.findByRole("heading", { name: "דנה כהן" });
    expect(screen.queryByRole("button", { name: "הליד הבא" })).toBeNull();
  });
});
