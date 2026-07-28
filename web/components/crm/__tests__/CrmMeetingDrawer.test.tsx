// Component tests for <CrmMeetingDrawer> — the Zoom-booking detail panel and
// the ONE mutation it owns, `setMeetingStatus`.
//
// THE DEFECTS THESE PIN (none of which a type-check or a lint can catch):
//
//  1. WRONG ARGUMENTS ON THE WRITE. `changeStatus` closes over BOTH `meetingId`
//     (the prop) and `data.meeting`, and the drawer is mounted per-meeting from
//     a list. A write that sends the previously-open meeting's id, or the
//     button's label instead of its enum value, still "works" — it just moves
//     the wrong booking, and the server audits it as a legitimate rep action.
//     So every mutation assertion here is toHaveBeenCalledWith(id, status);
//     "was called" would pass on exactly the bug that matters.
//  2. A FAILED WRITE READING AS A SUCCESS. `setCrmMeetingStatus` returns a bare
//     boolean, so a dropped/403'd write is indistinguishable from a no-op
//     unless the notice flips to the danger token AND the success text stays
//     off screen AND the stale detail is NOT re-read (a reload after a failure
//     would repaint the OLD status under a green "עודכן" line).
//  3. THE DOUBLE-WRITE / REDUNDANT-WRITE GUARD. The current status must be
//     un-clickable (it would audit a no-op transition) and an in-flight write
//     must lock the whole row (two statuses racing = last-writer-wins on a
//     lifecycle field). Both are `disabled` computations, invisible to types.
//  4. LOAD FAILURES COLLAPSING INTO ONE STRING. A 403 must show the server's
//     own message with NO "try again" (it can never succeed); a network blip
//     must keep the retry. Reversed, a rep either retries forever or is told a
//     blip is a permission wall.
//  5. THE UNREACHABLE MODAL. Overlay click, the סגור button and Escape are the
//     only three ways out of a fixed-inset aria-modal dialog.
//
// crm-admin is mocked at the MODULE BOUNDARY (never global fetch) with
// importOriginal spread, so the real types, the real ui.tsx pills/labels and
// the real useFocusTrap hook all run.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmFetch, CrmMeetingDetail, CrmMeetingEvent } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({
  fetchCrmMeetingDetail: vi.fn(),
  setCrmMeetingStatus: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchCrmMeetingDetail: mocks.fetchCrmMeetingDetail,
    setCrmMeetingStatus: mocks.setCrmMeetingStatus,
  };
});

import CrmMeetingDrawer from "@/components/crm/CrmMeetingDrawer";

type Detail = { meeting: CrmMeetingDetail; events: CrmMeetingEvent[] };

function detail(over: Partial<CrmMeetingDetail> = {}, events: CrmMeetingEvent[] = []): CrmFetch<Detail> {
  return {
    data: {
      meeting: {
        id: "M1",
        name: "רון לוי",
        phone: "0521112233",
        email: null,
        provider: null,
        planId: null,
        // startsAt is null on purpose in the default fixture: the drawer must
        // fall back to meetingDate + slot, and that join is deterministic under
        // any host timezone (unlike a formatted UTC timestamp).
        meetingDate: "2026-08-03",
        slot: "10:00",
        startsAt: null,
        status: "pending",
        joinUrl: null,
        zoomMeetingId: null,
        notes: null,
        source: null,
        claimedBy: null,
        claimedAt: null,
        confirmedAt: null,
        createdAt: null,
        ...over,
      },
      events,
    },
    failure: null,
  };
}

/** A promise the test resolves by hand — for asserting the states that exist
 *  only WHILE a request is in flight (loading, saving). */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchCrmMeetingDetail.mockResolvedValue(detail());
  mocks.setCrmMeetingStatus.mockResolvedValue(true);
});

describe("CrmMeetingDrawer detail", () => {
  it("renders the meeting the server returned, for the id it was asked about", async () => {
    mocks.fetchCrmMeetingDetail.mockResolvedValue(
      detail({
        email: "ron@example.com",
        provider: "פרטנר",
        source: "אתר",
        claimedBy: "דנה",
        notes: "הלקוח ביקש לחזור אחרי 18:00",
      }),
    );
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);

    expect(await screen.findByRole("heading", { name: "רון לוי" })).toBeInTheDocument();
    expect(mocks.fetchCrmMeetingDetail).toHaveBeenCalledWith("M1");
    // The fallback slot rendering (no startsAt) — date and slot joined, not one
    // of them silently dropped.
    expect(screen.getByText("2026-08-03 10:00")).toBeInTheDocument();
    // The raw enum never reaches the rep — "pending" renders as its Hebrew label
    // in the current-status field (read off the <dt>'s own <dd>, so an unrelated
    // control carrying the same label can't stand in for it).
    expect(screen.getByText("סטטוס נוכחי").nextElementSibling).toHaveTextContent("ממתין לאישור");
    expect(screen.queryByText("pending")).toBeNull();
    expect(screen.getByRole("link", { name: "ron@example.com" })).toHaveAttribute(
      "href",
      "mailto:ron@example.com",
    );
    expect(screen.getByRole("link", { name: "0521112233" })).toHaveAttribute("href", "tel:0521112233");
    expect(screen.getByText("פרטנר")).toBeInTheDocument();
    expect(screen.getByText("דנה")).toBeInTheDocument();
    expect(screen.getByText("הלקוח ביקש לחזור אחרי 18:00")).toBeInTheDocument();
  });

  it("offers the Zoom link only when the booking actually has one", async () => {
    mocks.fetchCrmMeetingDetail.mockResolvedValue(detail({ joinUrl: "https://zoom.us/j/123" }));
    const { unmount } = render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);
    const link = await screen.findByRole("link", { name: "הצטרף לפגישת Zoom" });
    expect(link).toHaveAttribute("href", "https://zoom.us/j/123");
    unmount();

    // A meeting with no joinUrl must not render a dead button the rep can click.
    mocks.fetchCrmMeetingDetail.mockResolvedValue(detail({ joinUrl: null }));
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);
    await screen.findByRole("button", { name: "בוטל" });
    expect(screen.queryByRole("link", { name: "הצטרף לפגישת Zoom" })).toBeNull();
  });

  it("renders the timeline with Hebrew event labels and old→new status pills", async () => {
    mocks.fetchCrmMeetingDetail.mockResolvedValue(
      detail({}, [
        {
          id: "e1",
          event: "status_change",
          oldStatus: "confirmed",
          newStatus: "completed",
          actorName: "רון",
          note: "התקיימה בזום",
          createdAt: "2026-07-20T09:00:00Z",
        },
      ]),
    );
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);

    expect(await screen.findByText("שינוי סטטוס")).toBeInTheDocument();
    expect(screen.queryByText("status_change")).toBeNull();
    // Pills, not raw enums: each label appears both as a status button and as a
    // pill inside the event row.
    expect(screen.getAllByText("מאושר").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("הושלם").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("התקיימה בזום")).toBeInTheDocument();
    expect(screen.getByText("— רון")).toBeInTheDocument();
  });
});

describe("CrmMeetingDrawer status change", () => {
  it("sends the EXACT meeting id and status enum of the button pressed", async () => {
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "הושלם" }));

    // Not "was called": the id identifies WHICH booking moves, and the enum —
    // not the Hebrew label — is what the server stores and audits.
    await waitFor(() => expect(mocks.setCrmMeetingStatus).toHaveBeenCalledWith("M1", "completed"));
    expect(mocks.setCrmMeetingStatus).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("הסטטוס עודכן.")).toBeInTheDocument();
  });

  it("reads and writes the id it was mounted for, and the pressed button's own status", async () => {
    // The whole test file's default fixture answers with meeting id "M1", so
    // this is the ONE test mounted on a different id — it is what separates
    // "uses the meetingId prop" from "uses whatever id the last payload had"
    // (or a hardcoded one) on BOTH the read and the write. Every other test
    // would pass on either.
    render(<CrmMeetingDrawer meetingId="M7" onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "ללא נציג" }));

    expect(mocks.fetchCrmMeetingDetail).toHaveBeenCalledWith("M7");
    await waitFor(() => expect(mocks.setCrmMeetingStatus).toHaveBeenCalledWith("M7", "no_rep"));
    // …and the re-read after the write goes to M7 too, not back to the fixture's id.
    await waitFor(() => expect(mocks.fetchCrmMeetingDetail).toHaveBeenCalledTimes(2));
    for (const call of mocks.fetchCrmMeetingDetail.mock.calls) expect(call).toEqual(["M7"]);
  });

  it("re-reads the detail and notifies the parent after a successful write", async () => {
    const onChanged = vi.fn();
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} onChanged={onChanged} />);
    await screen.findByRole("button", { name: "בוטל" });
    expect(mocks.fetchCrmMeetingDetail).toHaveBeenCalledTimes(1);

    // The server writes the timeline entry, so the panel must re-read rather
    // than patch its local copy — otherwise the new event never shows up.
    mocks.fetchCrmMeetingDetail.mockResolvedValue(detail({ status: "confirmed" }));
    await userEvent.click(screen.getByRole("button", { name: "מאושר" }));

    await waitFor(() => expect(mocks.fetchCrmMeetingDetail).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("a FAILED write is shown in the danger tone and never as a success", async () => {
    mocks.setCrmMeetingStatus.mockResolvedValue(false);
    const onChanged = vi.fn();
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} onChanged={onChanged} />);
    await userEvent.click(await screen.findByRole("button", { name: "מאושר" }));

    const notice = await screen.findByText("עדכון הסטטוס נכשל. נסו שוב.");
    expect(notice.className).toContain("text-danger-text");
    expect(screen.queryByText("הסטטוס עודכן.")).toBeNull();
    // No reload, no parent refresh: nothing changed server-side, and repainting
    // the unchanged status under a green line is how a rep misses the failure.
    expect(mocks.fetchCrmMeetingDetail).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
    // The status the rep tried is still offered — the write can be retried.
    expect(screen.getByRole("button", { name: "מאושר" })).toBeEnabled();
  });

  it("locks the whole status row while a write is in flight", async () => {
    const gate = deferred<boolean>();
    mocks.setCrmMeetingStatus.mockReturnValue(gate.promise);
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);
    await userEvent.click(await screen.findByRole("button", { name: "מאושר" }));

    // Two lifecycle writes racing = last-writer-wins on the booking's status.
    await waitFor(() => expect(screen.getByRole("button", { name: "בוטל" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "הושלם" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "בוטל" }));
    expect(mocks.setCrmMeetingStatus).toHaveBeenCalledTimes(1);

    gate.resolve(true);
    await screen.findByText("הסטטוס עודכן.");
  });

  it("never offers a redundant write of the status the meeting already has", async () => {
    mocks.fetchCrmMeetingDetail.mockResolvedValue(detail({ status: "confirmed" }));
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);

    const current = await screen.findByRole("button", { name: "מאושר" });
    expect(current).toBeDisabled();
    expect(current).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "בוטל" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(current);
    expect(mocks.setCrmMeetingStatus).not.toHaveBeenCalled();
  });

  it("offers only the statuses a rep sets by hand — never the system ones", async () => {
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);
    await screen.findByRole("button", { name: "מאושר" });
    for (const label of ["הושלם", "ללא נציג", "בוטל"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // pending/expired are server-owned; a hand-set "ממתין לאישור" or "פג תוקף"
    // would fight the booking flow that owns them.
    expect(screen.queryByRole("button", { name: "ממתין לאישור" })).toBeNull();
    expect(screen.queryByRole("button", { name: "פג תוקף" })).toBeNull();
  });
});

describe("CrmMeetingDrawer load states", () => {
  it("shows the loading line — not an error — while the read is in flight", async () => {
    const gate = deferred<CrmFetch<Detail>>();
    mocks.fetchCrmMeetingDetail.mockReturnValue(gate.promise);
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);

    expect(screen.getByText("טוען…")).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את הפגישה.")).toBeNull();
    expect(screen.queryByRole("button", { name: "מאושר" })).toBeNull();

    gate.resolve(detail());
    expect(await screen.findByRole("button", { name: "מאושר" })).toBeInTheDocument();
    expect(screen.queryByText("טוען…")).toBeNull();
  });

  it("a retryable failure keeps a working retry", async () => {
    mocks.fetchCrmMeetingDetail
      .mockResolvedValueOnce({
        data: null,
        failure: { status: 0, message: "שגיאת רשת — לא הצלחנו להגיע לשרת.", retryable: true },
      })
      .mockResolvedValue(detail());
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);

    expect(await screen.findByText("שגיאת רשת — לא הצלחנו להגיע לשרת.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(await screen.findByRole("button", { name: "מאושר" })).toBeInTheDocument();
    expect(screen.queryByText("שגיאת רשת — לא הצלחנו להגיע לשרת.")).toBeNull();
  });

  it("a 403 shows the server's message WITHOUT inviting a retry that can't work", async () => {
    mocks.fetchCrmMeetingDetail.mockResolvedValue({
      data: null,
      failure: { status: 403, message: "אין לך הרשאה לפעולה הזו.", retryable: false },
    });
    render(<CrmMeetingDrawer meetingId="M1" onClose={() => {}} />);

    const msg = await screen.findByText("אין לך הרשאה לפעולה הזו.");
    expect(msg.className).toContain("text-danger-text");
    expect(screen.queryByRole("button", { name: "נסו שוב" })).toBeNull();
    expect(screen.queryByText("לא הצלחנו לטעון את הפגישה.")).toBeNull();
  });
});

describe("CrmMeetingDrawer close contract", () => {
  it("closes from the סגור button and from the overlay behind it", async () => {
    const onClose = vi.fn();
    render(<CrmMeetingDrawer meetingId="M1" onClose={onClose} />);
    await screen.findByRole("button", { name: "בוטל" });

    await userEvent.click(screen.getByRole("button", { name: "סגור" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // The overlay covers the page; without its own handler the dialog is a trap.
    await userEvent.click(screen.getByRole("button", { name: "סגירת הפרטים" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("takes focus on open and closes on Escape (aria-modal contract)", async () => {
    const onClose = vi.fn();
    render(<CrmMeetingDrawer meetingId="M1" onClose={onClose} />);
    expect(screen.getByRole("button", { name: "סגור" })).toHaveFocus();
    await screen.findByRole("button", { name: "בוטל" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
