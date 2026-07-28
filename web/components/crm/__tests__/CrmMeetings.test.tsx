// Component tests for <CrmMeetings> — the Zoom-booking pipeline as a filterable
// list. Almost nothing on this screen is decorative: every row is a real person
// with a real appointment, and every control either narrows what the rep is
// allowed to conclude from the view or exports it. These pin the defects that
// still LOOK right on screen:
//
//  · The six lifecycle labels. MEETING_STATUS_META maps raw enum keys
//    (pending/confirmed/no_rep/cancelled/expired/completed) to Hebrew, and the
//    SAME map drives both the filter chips and the per-row pill. A regression
//    that rendered the raw key, dropped a stage from the chip row, or hardcoded
//    one pill's status would leave a rep reading "no_rep" — or, worse, quietly
//    unable to reach a whole stage. Asserting the chips as an ordered array and
//    each pill against its own row pins label-per-status, not "some Hebrew".
//  · The filter reaching the SERVER with the right value. `listMeetings` is
//    filtered server-side; the argument is the whole assertion, because a
//    handler that sends the wrong status (or none) still repaints a plausible
//    list. "Was called" passes for that bug. "הכול" must send `undefined`, not
//    the literal "all" (which the server would match against zero rows).
//  · Re-clicking the ACTIVE chip must be inert. Without the early return the
//    click flips `loading` back on while the memoised `load` identity never
//    changes, so the effect never refires — a permanent skeleton over rows that
//    were already correct.
//  · The stale-response guard. Rapid filter switches overlap; without the
//    loadSeq check a slower earlier response repaints the newer filter's view
//    with another stage's bookings, and the count line vouches for it.
//  · Search is CLIENT-side over the loaded window (the list action has no
//    search param) and must match phone as well as name — a rep pasting a
//    caller's number is the common case, and dropping that branch reads as
//    "this person has no meeting".
//  · The two "nothing here" states are different claims. "אין פגישות בסטטוס
//    הזה." is about the stage; "לא נמצאו פגישות תואמות לחיפוש." is about the
//    query. Collapsing them tells a rep whose search missed that the stage is
//    empty.
//  · Loading / error / list must stay three distinct states. Seeding `loading`
//    false would flash the failure card at every mount, because `meetings` is
//    null until the first response lands.
//  · The drawer must open on THAT row's id. The selected id is what the drawer
//    fetches and then writes status against — an off-by-one closure opens the
//    wrong booking and the panel looks entirely normal.
//  · The two truncation claims come from DIFFERENT signals on purpose: the
//    count line's "(מוצגות 200 האחרונות)" off the rendered length, and the
//    CSV's "-partial" suffix off the server's `hasMore`. Wiring the export to
//    `length >= 200` mislabels a full window with nothing behind it as partial,
//    and — the direction that matters — exports a searched 3-row view sitting on
//    a truncated table as if it were the complete pipeline.
//
// crm-admin is mocked at the module boundary (importOriginal spread, so the real
// MEETING_STATUSES / isMeetingStatus survive) and only the download side-effect
// of @/lib/csv is stubbed — buildCsv stays REAL, so the asserted bytes are the
// real file. `when()` is imported from the real ui module so the expected date
// string is produced by the same formatter the component uses. No network, no
// global fetch, real component logic throughout.
//
// NOT COVERED because the component does not do it: there is no pagination /
// "load more" (it renders one server window), no bulk action, no status write —
// the lifecycle changer lives in <CrmMeetingDrawer> and is covered there; here
// the drawer is stubbed and only its wiring (id in, onChanged out) is pinned.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmMeeting } from "@/lib/crm-admin";
import { when } from "@/components/crm/ui";

const mocks = vi.hoisted(() => ({
  fetchCrmMeetings: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return { ...actual, fetchCrmMeetings: mocks.fetchCrmMeetings };
});

vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, downloadCsv: mocks.downloadCsv };
});

// The component seeds filter + search from the URL and mirrors changes back with
// history.replaceState — read the live location so both halves are real.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

// The drawer pulls its own detail load + focus trap; its behaviour is covered in
// its own file. Here it only has to report which meeting it was opened for and
// give us a handle on the onChanged callback.
vi.mock("@/components/crm/CrmMeetingDrawer", () => ({
  default: ({ meetingId, onChanged }: { meetingId: string; onChanged?: () => void }) => (
    <div data-testid="meeting-drawer">
      <span>{meetingId}</span>
      <button type="button" onClick={onChanged}>
        עדכון מהמגירה
      </button>
    </div>
  ),
}));

import CrmMeetings from "@/components/crm/CrmMeetings";

// An exact-timestamp booking (startsAt wins over date+slot).
const DANA: CrmMeeting = {
  id: "m-1",
  name: "דנה כהן",
  phone: "0501111111",
  provider: "פרטנר",
  meetingDate: "2026-07-30",
  slot: "14:30",
  startsAt: "2026-07-30T11:30:00Z",
  status: "confirmed",
  source: "web",
  claimedBy: "אורי",
};

// A booking with no exact timestamp — the date + slot fallback.
const YOSSI: CrmMeeting = {
  id: "m-2",
  name: "יוסי לוי",
  phone: "0522222222",
  provider: null,
  meetingDate: "2026-08-02",
  slot: "10:00",
  startsAt: null,
  status: "pending",
  source: null,
  claimedBy: null,
};

function ok(meetings: CrmMeeting[], hasMore = false) {
  return { meetings, hasMore };
}

function bulk(n: number): CrmMeeting[] {
  return Array.from({ length: n }, (_, i) => ({ ...YOSSI, id: `b-${i}`, name: `פגישה ${i}` }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** The desktop table (the mobile cards mirror it — both live in the JSDOM tree). */
function table() {
  return screen.getByRole("table");
}

/** That booking's desktop row. */
function row(name: string): HTMLElement {
  return within(table()).getByText(name).closest("tr") as HTMLElement;
}

/** The status-filter chip row (its labels collide with the pills'). */
function chips() {
  return within(screen.getByRole("group", { name: "סינון לפי סטטוס פגישה" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/crm");
  mocks.fetchCrmMeetings.mockResolvedValue(ok([DANA, YOSSI]));
});

describe("CrmMeetings list", () => {
  it("renders each booking's row and an honest count", async () => {
    render(<CrmMeetings />);
    const r = within(await screen.findByRole("table")).getByText("דנה כהן").closest("tr") as HTMLElement;

    expect(within(r).getByText("0501111111")).toBeInTheDocument();
    // startsAt wins over meetingDate+slot when both exist.
    expect(within(r).getByText(when(DANA.startsAt))).toBeInTheDocument();
    expect(within(r).getByText("פרטנר")).toBeInTheDocument();
    expect(within(r).getByText("אורי")).toBeInTheDocument();
    expect(within(r).getByText("מאושר")).toBeInTheDocument();

    expect(screen.getByText(/^2 פגישות$/)).toBeInTheDocument();
    // Two rows is not a full window — nothing may claim truncation.
    expect(screen.queryByText(/מוצגות 200 האחרונות/)).toBeNull();
  });

  it("falls back to date + slot when the booking has no exact timestamp", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");
    expect(within(row("יוסי לוי")).getByText("2026-08-02 10:00")).toBeInTheDocument();
  });
});

describe("CrmMeetings status filter", () => {
  it("offers every lifecycle stage, in order, labelled in Hebrew", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");

    const labels = chips()
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual([
      "הכול",
      "ממתין לאישור",
      "מאושר",
      "ללא נציג",
      "בוטל",
      "פג תוקף",
      "הושלם",
    ]);
  });

  it("narrows on the SERVER with that exact status, and 'הכול' sends none", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");
    // The mount load is the unfiltered one — `undefined`, never the string "all".
    expect(mocks.fetchCrmMeetings.mock.calls[0]).toEqual([{ status: undefined }]);

    mocks.fetchCrmMeetings.mockResolvedValue(ok([{ ...DANA, status: "no_rep", name: "רון גל" }]));
    await userEvent.click(chips().getByRole("button", { name: "ללא נציג" }));

    await waitFor(() =>
      expect(mocks.fetchCrmMeetings.mock.calls[1]).toEqual([{ status: "no_rep" }]),
    );
    expect((await screen.findAllByText("רון גל")).length).toBeGreaterThan(0);
  });

  it("re-clicking the ACTIVE chip is inert — no refetch, no skeleton over good rows", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");
    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(1);

    await userEvent.click(chips().getByRole("button", { name: "הכול" }));

    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(1);
    // The rep is still looking at the list, not a permanent loading skeleton.
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("דנה כהן").length).toBeGreaterThan(0);
  });

  it("mirrors the stage to the URL and seeds itself back from it", async () => {
    const { unmount } = render(<CrmMeetings />);
    await screen.findByRole("table");

    await userEvent.click(chips().getByRole("button", { name: "מאושר" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("meeting_status")).toBe("confirmed"),
    );

    // Back to the default: the key is DELETED, not written as "all".
    await userEvent.click(chips().getByRole("button", { name: "הכול" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).has("meeting_status")).toBe(false),
    );

    // A fresh mount on a deep link restores the same view.
    unmount();
    window.history.replaceState(null, "", "/crm?meeting_status=cancelled&meeting_q=דנה");
    render(<CrmMeetings />);
    await waitFor(() =>
      expect(chips().getByRole("button", { name: "בוטל" })).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.getByLabelText("חיפוש פגישות")).toHaveValue("דנה");
  });

  it("never lets a slower earlier load repaint the newer stage's rows", async () => {
    const all = deferred<{ meetings: CrmMeeting[]; hasMore: boolean }>();
    const confirmed = deferred<{ meetings: CrmMeeting[]; hasMore: boolean }>();
    mocks.fetchCrmMeetings.mockReturnValueOnce(all.promise).mockReturnValueOnce(confirmed.promise);

    render(<CrmMeetings />);
    await userEvent.click(chips().getByRole("button", { name: "מאושר" }));

    // The newer filter answers first…
    await act(async () => {
      confirmed.resolve(ok([{ ...DANA, name: "רון גל" }]));
    });
    expect((await screen.findAllByText("רון גל")).length).toBeGreaterThan(0);

    // …and the unfiltered load still in flight must be DROPPED, not painted over
    // the "מאושר" view the rep is now reading (and counting).
    await act(async () => {
      all.resolve(ok([DANA, YOSSI]));
    });
    expect(screen.queryByText("יוסי לוי")).toBeNull();
    expect(screen.getAllByText("רון גל").length).toBeGreaterThan(0);
    expect(screen.getByText(/^1 פגישות$/)).toBeInTheDocument();
  });
});

describe("CrmMeetings status pills", () => {
  it("renders each lifecycle status as its own Hebrew pill on its own row", async () => {
    const statuses = ["pending", "confirmed", "no_rep", "cancelled", "expired", "completed"];
    mocks.fetchCrmMeetings.mockResolvedValue(
      ok(statuses.map((s, i) => ({ ...YOSSI, id: `s-${i}`, name: `פגישה ${s}`, status: s }))),
    );
    render(<CrmMeetings />);
    await screen.findByRole("table");

    const expected: Record<string, string> = {
      pending: "ממתין לאישור",
      confirmed: "מאושר",
      no_rep: "ללא נציג",
      cancelled: "בוטל",
      expired: "פג תוקף",
      completed: "הושלם",
    };
    for (const s of statuses) {
      // Scoped to the row, so a pill hardcoded to one status can't be covered by
      // a sibling row (or by the identically-labelled filter chip).
      expect(within(row(`פגישה ${s}`)).getByText(expected[s])).toBeInTheDocument();
    }
    // …and never the raw enum key.
    expect(within(table()).queryByText("no_rep")).toBeNull();
  });
});

describe("CrmMeetings search", () => {
  it("filters the loaded window by name OR phone, without a round-trip", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("חיפוש פגישות"), { target: { value: "דנה" } });
    expect(within(table()).getByText("דנה כהן")).toBeInTheDocument();
    expect(within(table()).queryByText("יוסי לוי")).toBeNull();

    // A pasted caller number must find the booking too.
    fireEvent.change(screen.getByLabelText("חיפוש פגישות"), { target: { value: "0522222222" } });
    expect(within(table()).getByText("יוסי לוי")).toBeInTheDocument();
    expect(within(table()).queryByText("דנה כהן")).toBeNull();

    // Client-side: the server was asked exactly once, at mount.
    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get("meeting_q")).toBe("0522222222");
  });

  it("says 'no search matches' — not 'this stage is empty' — when the query misses", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");

    fireEvent.change(screen.getByLabelText("חיפוש פגישות"), { target: { value: "אין־כזה" } });
    expect(screen.getByText("לא נמצאו פגישות תואמות לחיפוש.")).toBeInTheDocument();
    expect(screen.queryByText("אין פגישות בסטטוס הזה.")).toBeNull();
  });
});

describe("CrmMeetings loading / error / empty", () => {
  it("shows the skeleton while the first load is in flight — no failure card", async () => {
    const first = deferred<{ meetings: CrmMeeting[]; hasMore: boolean }>();
    mocks.fetchCrmMeetings.mockReturnValueOnce(first.promise);
    const { container } = render(<CrmMeetings />);

    // `meetings` is null until the response lands; a mount that starts out of
    // the loading state renders the failure card at every page load.
    expect(screen.queryByText("לא הצלחנו לטעון את הפגישות.")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    // The skeleton must actually BE there. It is decorative (aria-hidden), so no
    // role/text query reaches it — and asserting only the two absences above
    // passes just as happily for a loading branch that renders nothing at all,
    // leaving the rep on a blank panel with no sign the page is working.
    const skeleton = container.querySelector('[aria-hidden="true"]');
    expect(skeleton).not.toBeNull();
    expect(skeleton?.childElementCount).toBeGreaterThan(0);

    await act(async () => {
      first.resolve(ok([DANA]));
    });
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("a failed load offers a retry that actually re-fetches", async () => {
    mocks.fetchCrmMeetings.mockResolvedValueOnce(null).mockResolvedValue(ok([DANA]));
    render(<CrmMeetings />);

    await screen.findByText("לא הצלחנו לטעון את הפגישות.");
    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("דנה כהן").length).toBeGreaterThan(0);
    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(2);
  });

  it("an empty stage says so, and offers no retry", async () => {
    mocks.fetchCrmMeetings.mockResolvedValue(ok([]));
    render(<CrmMeetings />);

    expect(await screen.findByText("אין פגישות בסטטוס הזה.")).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו לטעון את הפגישות.")).toBeNull();
    expect(screen.queryByRole("button", { name: "נסו שוב" })).toBeNull();
  });
});

describe("CrmMeetings drawer", () => {
  it("opens the drawer for THAT row's meeting id", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");
    expect(screen.queryByTestId("meeting-drawer")).toBeNull();

    // Clicking the name button also bubbles to the <tr>, whose handler runs
    // SECOND and therefore wins — so the row handler is the authoritative one
    // for all pointer input, and the button's own onClick is unobservable here
    // (breaking it alone changes nothing on screen). Both entry points are
    // exercised below; both must resolve to the row under the pointer.
    await userEvent.click(within(row("יוסי לוי")).getByRole("button", { name: "פרטי הפגישה של יוסי לוי" }));

    // m-2, not m-1 — a closure over the wrong row opens a plausible-looking
    // panel for someone else's booking.
    expect(within(screen.getByTestId("meeting-drawer")).getByText("m-2")).toBeInTheDocument();

    // Clicking dead space in the row (no button under the pointer) must resolve
    // to the same booking, not to whatever the list happens to start with.
    await userEvent.click(within(row("דנה כהן")).getByText("פרטנר"));
    expect(within(screen.getByTestId("meeting-drawer")).getByText("m-1")).toBeInTheDocument();
  });

  it("a change made in the drawer reloads the list", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");
    await userEvent.click(within(row("דנה כהן")).getByRole("button", { name: "פרטי הפגישה של דנה כהן" }));
    expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "עדכון מהמגירה" }));

    // Same filter, refetched — a status moved in the drawer must not leave the
    // list showing the stage the booking just left.
    await waitFor(() => expect(mocks.fetchCrmMeetings).toHaveBeenCalledTimes(2));
    expect(mocks.fetchCrmMeetings.mock.calls[1]).toEqual([{ status: undefined }]);
  });
});

describe("CrmMeetings CSV export", () => {
  it("exports the current view with an id column and Hebrew status labels", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));

    expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
    const [name, content] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("meetings-all.csv");

    const lines = content.slice(1).split("\r\n"); // strip the BOM
    expect(lines[0]).toBe("id,שם,טלפון,מועד,ספק,סטטוס,נציג,מקור");
    // The id column is what makes an exported row traceable back to the booking.
    expect(lines[1].startsWith("m-1,דנה כהן,0501111111,")).toBe(true);
    expect(lines[1]).toContain("מאושר");
    expect(lines[1]).not.toContain("confirmed"); // the label, never the raw enum
    expect(lines[1].endsWith(",אורי,web")).toBe(true);
  });

  it("names the file for the ACTIVE stage and exports only the searched rows", async () => {
    mocks.fetchCrmMeetings.mockResolvedValue(ok([DANA, YOSSI]));
    render(<CrmMeetings />);
    await screen.findByRole("table");

    await userEvent.click(chips().getByRole("button", { name: "מאושר" }));
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("חיפוש פגישות"), { target: { value: "יוסי" } });

    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    const [name, content] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("meetings-confirmed.csv");
    // The file is the VIEW, so the searched-out booking must not be in it.
    const lines = content.slice(1).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith("m-2,יוסי לוי,")).toBe(true);
  });

  it("takes '-partial' from the server's hasMore, not from the rendered row count", async () => {
    // A FULL 200-row window with nothing behind it: the count line admits the
    // window, but the export is complete and must not be smeared as partial.
    mocks.fetchCrmMeetings.mockResolvedValue(ok(bulk(200), false));
    render(<CrmMeetings />);
    await screen.findByRole("table");
    expect(screen.getByText(/מוצגות 200 האחרונות/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    expect((mocks.downloadCsv.mock.calls[0] as [string, string])[0]).toBe("meetings-all.csv");

    // And the direction that actually misleads: a SHORT view sitting on top of a
    // truncated table is still an incomplete export of the pipeline.
    mocks.downloadCsv.mockClear();
    mocks.fetchCrmMeetings.mockResolvedValue(ok([DANA, YOSSI, { ...DANA, id: "m-3" }], true));
    render(<CrmMeetings key="short" />);
    await waitFor(() => expect(screen.getAllByRole("table").length).toBe(2));

    await userEvent.click(screen.getAllByRole("button", { name: "ייצוא CSV" })[1]);
    expect((mocks.downloadCsv.mock.calls[0] as [string, string])[0]).toBe("meetings-all-partial.csv");
  });

  it("cannot export an empty view", async () => {
    render(<CrmMeetings />);
    await screen.findByRole("table");
    // The stage has rows, but the VIEW the button exports has none.
    fireEvent.change(screen.getByLabelText("חיפוש פגישות"), { target: { value: "אין־כזה" } });

    const btn = screen.getByRole("button", { name: "ייצוא CSV" });
    expect(btn).toBeDisabled();
    await userEvent.click(btn, { pointerEventsCheck: 0 });
    expect(mocks.downloadCsv).not.toHaveBeenCalled();
  });
});
