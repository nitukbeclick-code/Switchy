// Component tests for <CrmContacts> — the WhatsApp-contact lifecycle board.
// Everything on this screen is either a claim about the data (how many rows,
// which stage each contact sits in, whether the export is complete) or a write
// that moves a real person through that lifecycle. Both are easy to get subtly
// wrong in a way that still LOOKS right, so these pin:
//
//  · The stage labels. CONTACT_STATUS_META maps seven raw enum keys
//    (new/active/qualified/handed_off/won/lost/blocked) to Hebrew. The picker is
//    a native <select> whose options ARE the lifecycle, so a regression that
//    rendered the raw key — or reordered the map — would show an admin
//    "handed_off" and, worse, let them pick a stage whose label doesn't match
//    the value that gets written. Asserting the option list as an ordered array
//    pins label-per-status, not merely "some Hebrew is present".
//  · The status write's ARGUMENTS. setCrmContactStatus(contactId, status) is
//    audited server-side; a handler that closes over the wrong row, or hardcodes
//    a stage, is invisible on screen (the list reloads and looks fine) and moves
//    the wrong person. "Was called" passes for both bugs — the id/stage pair is
//    the whole assertion.
//  · A refused write must SAY so. The <select> is controlled off c.status, so a
//    failed change snaps the dropdown back by itself; without the live-region
//    notice that reads as "nothing happened / it worked".
//  · The filter reaching the SERVER. Narrowing by stage is a fetch argument, not
//    a client-side filter over an already-truncated 200-row window — a
//    regression to local filtering would quietly show a subset of one stage
//    while the count line claims it is the stage.
//  · The two truncation claims, which are deliberately driven by DIFFERENT
//    signals: the count line's "(מוצגים 200 האחרונים)" off the rendered length,
//    and the CSV's "-partial" filename off the server's `hasMore`. Wiring the
//    export to `length >= 200` (the obvious "simplification") mislabels an
//    exactly-200-row window that has nothing beyond it, and — the direction that
//    matters — a searched/filtered 12-row view sitting on top of a truncated
//    table would export as complete.
//  · The stale-response guard. Filter and search both refetch; without the
//    loadSeq check a slower earlier response repaints the newer filter's view
//    with the wrong stage's rows.
//  · Loading / error / empty must stay three distinct states, and "no contacts
//    in this stage" must not be shown as "no search matches" (or vice versa).
//
// crm-admin is mocked at the module boundary (importOriginal spread, so the real
// types/CONTACT_STATUSES survive) and only the download side-effect of @/lib/csv
// is stubbed — buildCsv stays REAL, so the asserted file content is the real
// file. No network, no global fetch, real component logic throughout.
//
// NOT COVERED because the component does not do it: there is no pagination or
// "load more" here — the server returns one 200-row window and the component
// renders all of it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CrmContact } from "@/lib/crm-admin";
import { when } from "@/components/crm/ui";

const mocks = vi.hoisted(() => ({
  fetchCrmContacts: vi.fn(),
  setCrmContactStatus: vi.fn(),
  downloadCsv: vi.fn(),
}));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return {
    ...actual,
    fetchCrmContacts: mocks.fetchCrmContacts,
    setCrmContactStatus: mocks.setCrmContactStatus,
  };
});

vi.mock("@/lib/csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/csv")>();
  return { ...actual, downloadCsv: mocks.downloadCsv };
});

// The component seeds its filter/search from the URL and mirrors changes back
// with history.replaceState — read the live location so both halves are real.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import CrmContacts from "@/components/crm/CrmContacts";

const LAST_MSG = "2026-07-20T09:15:00Z";

const DANA: CrmContact = {
  id: "c-1",
  name: "דנה כהן",
  phone: "050-1111111",
  status: "qualified",
  leadId: "lead-9",
  lastMessageAt: LAST_MSG,
};

const YOSSI: CrmContact = {
  id: "c-2",
  name: "יוסי לוי",
  phone: "050-2222222",
  status: "new",
  leadId: null,
  lastMessageAt: null,
};

/** The seven lifecycle stages, in the order CONTACT_STATUSES declares them. */
const STAGE_LABELS = ["חדש", "פעיל", "מוכשר", "הועבר לנציג", "נסגר בהצלחה", "אבוד", "חסום"];

function ok(contacts: CrmContact[], hasMore = false) {
  return { contacts, hasMore };
}

function bulk(n: number): CrmContact[] {
  return Array.from({ length: n }, (_, i) => ({ ...YOSSI, id: `b-${i}`, name: `איש קשר ${i}` }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** The desktop table row for a contact (the mobile cards mirror it). */
function row(name: string): HTMLElement {
  const table = screen.getByRole("table");
  return within(table).getByText(name).closest("tr") as HTMLElement;
}

/** That row's lifecycle picker. */
function picker(name: string): HTMLSelectElement {
  return within(row(name)).getByLabelText("שינוי סטטוס איש קשר") as HTMLSelectElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/crm");
  mocks.fetchCrmContacts.mockResolvedValue(ok([DANA, YOSSI]));
  mocks.setCrmContactStatus.mockResolvedValue(true);
});

describe("CrmContacts list", () => {
  it("renders every contact in both the desktop table and the mobile cards", async () => {
    render(<CrmContacts />);

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "טלפון" })).toBeTruthy();

    const dana = row("דנה כהן");
    expect(within(dana).getByText("050-1111111").getAttribute("dir")).toBe("ltr");
    // The timestamp is shown as a he-IL date, never a raw ISO string.
    expect(within(dana).getByText(when(LAST_MSG))).toBeTruthy();
    expect(within(dana).queryByText(LAST_MSG)).toBeNull();
    // A linked lead is marked; a contact without one degrades to an em dash.
    expect(within(dana).getByText("✓")).toBeTruthy();
    const yossi = row("יוסי לוי");
    expect(within(yossi).queryByText("✓")).toBeNull();
    expect(within(yossi).getAllByText("—")).toHaveLength(2); // last message + lead

    // Mobile: the same contacts again as cards (both layouts live in the DOM).
    const cards = screen.getByRole("list");
    expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
    expect(within(cards).getByText("דנה כהן")).toBeTruthy();
    expect(within(cards).getByText(`הודעה אחרונה: ${when(LAST_MSG)}`)).toBeTruthy();
    expect(within(cards).getByText("מקושר לליד")).toBeTruthy();

    expect(screen.getByText("2 אנשי קשר")).toBeTruthy();
  });

  it('admits "(מוצגים 200 האחרונים)" only once the window is actually full', async () => {
    // 199 rows: the whole stage — claiming truncation would be its own lie.
    mocks.fetchCrmContacts.mockResolvedValue(ok(bulk(199)));
    const first = render(<CrmContacts />);
    expect(await screen.findByText("199 אנשי קשר")).toBeTruthy();
    expect(screen.queryByText(/מוצגים 200 האחרונים/)).toBeNull();
    first.unmount();

    mocks.fetchCrmContacts.mockResolvedValue(ok(bulk(200)));
    render(<CrmContacts />);
    expect(await screen.findByText(/מוצגים 200 האחרונים/)).toBeTruthy();
  });
});

describe("CrmContacts lifecycle labels", () => {
  it("offers all seven stages in Hebrew, in every picker and in the filter bar", async () => {
    render(<CrmContacts />);
    await screen.findByRole("table");

    // The filter bar: "הכול" plus one chip per stage, labelled from the meta map.
    const bar = screen.getByRole("group", { name: "סינון לפי סטטוס איש קשר" });
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "הכול",
      ...STAGE_LABELS,
    ]);

    // The per-row picker: the same seven, in the same order — so the Hebrew an
    // admin picks always belongs to the raw status that gets written.
    const select = picker("דנה כהן");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(STAGE_LABELS);
    // …and it opens on the contact's OWN stage, not the first option.
    expect(select.value).toBe("qualified");
    expect(picker("יוסי לוי").value).toBe("new");
  });

  it("keeps an unrecognised status visible instead of snapping it to a stage", async () => {
    // A status the client doesn't model yet (server added one) must not be
    // silently rendered as "חדש" — that would misreport where the contact is.
    mocks.fetchCrmContacts.mockResolvedValue(ok([{ ...DANA, status: "archived" }]));
    render(<CrmContacts />);
    await screen.findByRole("table");

    const select = picker("דנה כהן");
    // The raw value leads the list as an inert placeholder (empty value, so it
    // can't be re-submitted), with the seven real stages still selectable after
    // it — the labels themselves are the previous test's assertion.
    const options = within(select).getAllByRole("option") as HTMLOptionElement[];
    expect(options).toHaveLength(1 + STAGE_LABELS.length);
    expect(options[0].textContent).toBe("archived");
    expect(options[0].value).toBe("");
    expect(select.value).toBe("");
  });
});

describe("CrmContacts load states", () => {
  it("shows a decorative skeleton while loading — no table, no rows", async () => {
    mocks.fetchCrmContacts.mockReturnValue(new Promise(() => {}));
    const { container } = render(<CrmContacts />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(container.querySelector(".animate-pulse")?.closest("[aria-hidden='true']")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("דנה כהן")).toBeNull();
  });

  it("a failed load says so and offers a retry that really re-fetches", async () => {
    mocks.fetchCrmContacts.mockResolvedValueOnce(null).mockResolvedValue(ok([DANA]));
    render(<CrmContacts />);

    await screen.findByText("לא הצלחנו לטעון את אנשי הקשר.");
    expect(screen.queryByRole("table")).toBeNull();
    // A failure is not an empty stage — never claim there are no contacts.
    expect(screen.queryByText("אין אנשי קשר בסטטוס הזה.")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByText("לא הצלחנו לטעון את אנשי הקשר.")).toBeNull();
    expect(mocks.fetchCrmContacts.mock.calls).toEqual([
      [{ status: undefined, search: undefined }],
      [{ status: undefined, search: undefined }],
    ]);
  });

  it("distinguishes an empty stage from a search that found nothing", async () => {
    mocks.fetchCrmContacts.mockResolvedValue(ok([]));
    const first = render(<CrmContacts />);

    expect(await screen.findByText("אין אנשי קשר בסטטוס הזה.")).toBeTruthy();
    expect(screen.queryByText("לא נמצאו אנשי קשר תואמים.")).toBeNull();
    // Nothing to export ⇒ the export control is offered but inert.
    expect(screen.getByRole("button", { name: "ייצוא CSV" })).toBeDisabled();
    first.unmount();

    // Same zero rows, but a query is active — the reason is different.
    window.history.replaceState(null, "", "/crm?contact_q=זזז");
    render(<CrmContacts />);
    expect(await screen.findByText("לא נמצאו אנשי קשר תואמים.")).toBeTruthy();
    expect(screen.queryByText("אין אנשי קשר בסטטוס הזה.")).toBeNull();
  });
});

describe("CrmContacts filtering", () => {
  it("narrows on the SERVER when a stage chip is picked, and mirrors it to the URL", async () => {
    render(<CrmContacts />);
    await screen.findByRole("table");
    mocks.fetchCrmContacts.mockResolvedValue(ok([{ ...DANA, status: "won" }]));

    await userEvent.click(screen.getByRole("button", { name: "נסגר בהצלחה" }));

    await waitFor(() => expect(mocks.fetchCrmContacts).toHaveBeenCalledTimes(2));
    // The stage goes on the wire — the 200-row window is the server's to narrow.
    expect(mocks.fetchCrmContacts.mock.calls).toEqual([
      [{ status: undefined, search: undefined }],
      [{ status: "won", search: undefined }],
    ]);
    expect(screen.getByRole("button", { name: "נסגר בהצלחה" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "הכול" })).toHaveAttribute("aria-pressed", "false");
    // …and survives a refresh / tab switch.
    expect(new URLSearchParams(window.location.search).get("contact_status")).toBe("won");
  });

  it("seeds the stage and the query from the URL on mount", async () => {
    window.history.replaceState(null, "", "/crm?contact_status=qualified&contact_q=%20%D7%93%D7%A0%D7%94%20");
    mocks.fetchCrmContacts.mockResolvedValue(ok([DANA]));
    render(<CrmContacts />);

    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "מוכשר" })).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByLabelText("חיפוש אנשי קשר") as HTMLInputElement).value).toBe(" דנה ");
    // The deep-linked query reaches the FIRST fetch already trimmed — the box is
    // not left to re-issue it. The stage's own trip to the wire is the previous
    // test's assertion.
    expect(mocks.fetchCrmContacts.mock.calls[0][0].search).toBe("דנה");

    // …and the 300ms debounce, firing on a box nobody touched, must settle on
    // that same trimmed value and cost NO second round-trip. Asserting the call
    // count before the timer fires would pass even if the debounce re-issued the
    // query untrimmed (" דנה " !== "דנה"), so wait the debounce out first.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(mocks.fetchCrmContacts).toHaveBeenCalledTimes(1);
  });

  it("searches on the trimmed query after the debounce, and mirrors it to the URL", async () => {
    render(<CrmContacts />);
    await screen.findByRole("table");
    mocks.fetchCrmContacts.mockResolvedValue(ok([DANA]));

    fireEvent.change(screen.getByLabelText("חיפוש אנשי קשר"), { target: { value: "  דנה  " } });

    await waitFor(() =>
      expect(mocks.fetchCrmContacts.mock.calls[1]).toEqual([{ status: undefined, search: "דנה" }]),
    );
    expect(new URLSearchParams(window.location.search).get("contact_q")).toBe("דנה");
  });

  it("never lets a slower earlier load repaint the newer stage's rows", async () => {
    const all = deferred<{ contacts: CrmContact[]; hasMore: boolean }>();
    const won = deferred<{ contacts: CrmContact[]; hasMore: boolean }>();
    mocks.fetchCrmContacts.mockReturnValueOnce(all.promise).mockReturnValueOnce(won.promise);

    render(<CrmContacts />);
    await userEvent.click(screen.getByRole("button", { name: "נסגר בהצלחה" }));

    // The newer filter answers first…
    await act(async () => {
      won.resolve(ok([{ ...YOSSI, name: "רון גל", status: "won" }]));
    });
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getAllByText("רון גל").length).toBeGreaterThan(0);

    // …and the unfiltered load that was still in flight must be dropped, not
    // painted over the "won" view the admin is now looking at.
    await act(async () => {
      all.resolve(ok([DANA, YOSSI]));
    });
    expect(screen.queryByText("דנה כהן")).toBeNull();
    expect(screen.getAllByText("רון גל").length).toBeGreaterThan(0);
  });
});

describe("CrmContacts status change", () => {
  it("writes THAT contact's id and THAT stage, then reloads the view", async () => {
    render(<CrmContacts />);
    await screen.findByRole("table");

    await userEvent.selectOptions(picker("יוסי לוי"), "lost");

    // The audited pair on the wire — the wrong id moves the wrong person, and a
    // hardcoded stage moves them to the wrong place; both look fine on screen.
    expect(mocks.setCrmContactStatus).toHaveBeenCalledTimes(1);
    expect(mocks.setCrmContactStatus).toHaveBeenCalledWith("c-2", "lost");
    // A successful write re-reads the list (the row's new stage comes from the
    // server, not from local optimism) — with the SAME view arguments.
    await waitFor(() => expect(mocks.fetchCrmContacts).toHaveBeenCalledTimes(2));
    expect(mocks.fetchCrmContacts.mock.calls[1]).toEqual([{ status: undefined, search: undefined }]);
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("announces a refused change instead of letting the picker snap back silently", async () => {
    mocks.setCrmContactStatus.mockResolvedValue(false);
    render(<CrmContacts />);
    await screen.findByRole("table");

    await userEvent.selectOptions(picker("דנה כהן"), "blocked");

    const live = await screen.findByRole("status");
    await waitFor(() => expect(live.textContent).toBe("עדכון הסטטוס נכשל. נסו שוב."));
    expect(live).toHaveAttribute("aria-live", "polite");
    // The picker is controlled off the server's value, so it is back on the old
    // stage — the notice is the only thing telling the admin the write failed.
    expect(picker("דנה כהן").value).toBe("qualified");
    // A refused write must not be followed by a reload that reads as success.
    expect(mocks.fetchCrmContacts).toHaveBeenCalledTimes(1);
  });
});

describe("CrmContacts CSV export", () => {
  it("exports the current view with ids and Hebrew stage labels", async () => {
    render(<CrmContacts />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));

    expect(mocks.downloadCsv).toHaveBeenCalledTimes(1);
    const [name, content] = mocks.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("contacts-all.csv");

    const lines = content.slice(1).split("\r\n"); // strip the UTF-8 BOM
    expect(lines[0]).toBe("id,שם,טלפון,סטטוס,ליד מקושר,הודעה אחרונה");
    expect(lines[1]).toBe(`c-1,דנה כהן,050-1111111,מוכשר,lead-9,${LAST_MSG}`);
    // Nulls become empty cells, never the string "null" (columns stay aligned).
    expect(lines[2]).toBe("c-2,יוסי לוי,050-2222222,חדש,,");
    expect(lines).toHaveLength(3);
  });

  it('marks the file "-partial" from the server\'s hasMore, not from the row count', async () => {
    // Twelve rows, but the server says the table continues past this window —
    // the file is NOT the whole stage and its name must admit it.
    mocks.fetchCrmContacts.mockResolvedValue(ok(bulk(12), true));
    const first = render(<CrmContacts />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    expect((mocks.downloadCsv.mock.calls[0] as [string, string])[0]).toBe("contacts-all-partial.csv");
    first.unmount();

    // Exactly 200 rows with nothing beyond them: a full window is not a partial
    // export, so `length >= 200` is the wrong signal here.
    mocks.fetchCrmContacts.mockResolvedValue(ok(bulk(200), false));
    render(<CrmContacts />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));
    expect((mocks.downloadCsv.mock.calls[1] as [string, string])[0]).toBe("contacts-all.csv");
  });

  it("names the file after the stage being exported", async () => {
    render(<CrmContacts />);
    await screen.findByRole("table");
    mocks.fetchCrmContacts.mockResolvedValue(ok([{ ...DANA, status: "blocked" }]));

    await userEvent.click(screen.getByRole("button", { name: "חסום" }));
    await waitFor(() => expect(mocks.fetchCrmContacts).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));

    expect((mocks.downloadCsv.mock.calls[0] as [string, string])[0]).toBe("contacts-blocked.csv");
  });
});
