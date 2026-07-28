// Component tests for <CrmCallBrief> — the pre-call brief a rep reads in the
// seconds before dialling a real person. Whatever this card renders is spoken
// aloud to a customer, so "renders something" is not the bar: it has to render
// the RIGHT lead's facts, and it has to render NOTHING where a fact is absent.
//
// THE DEFECTS THESE PIN (none of which a type-check or a lint can catch):
//
//  1. THE BRIEF OF THE WRONG LEAD. The card is mounted per-lead from a drawer
//     and takes `leadId` as a prop; `fetchRepBrief` is called inside a
//     useCallback closed over it. Passing the previously-open lead's id (or a
//     stale one captured before a re-key) still renders a perfectly plausible
//     brief — the rep then reads another customer's budget, current provider
//     and recommended plans down the phone. So the fetch assertions here are
//     toHaveBeenCalledWith(leadId); "was called" passes on exactly that bug.
//     The retry path is asserted the same way, because `reload` re-enters the
//     same closure and a retry that re-asks for a different id is the same bug
//     with a click in front of it.
//
//  2. ABSENT FACTS RENDERED AS FACTS. Every optional field here is falsy-not-
//     missing: `budget: 0` means "no budget stated", `provider: ""` means "we
//     don't know who they're with", `annualSaving: 0` means "no saving to
//     claim". Each is behind an explicit `> 0` / truthiness test whose only
//     visible failure mode is a rendered "תקציב ₪0", "ספק נוכחי: " or a
//     "חיסכון ₪0/שנה" clause — a rep reading "you'd save ₪0 a year" or
//     inventing a budget of zero is worse than saying nothing. The empty
//     arrays are guarded the same way, and a dropped guard leaves a bare
//     heading ("מסלולים מומלצים" with nothing under it) that reads, to a rep
//     skimming, as "no plans matched" rather than "the section is broken".
//     One test also sweeps the whole rendered card for the literal strings
//     undefined / null / NaN, which is what a missing guard actually prints.
//
//  3. AN UNBUILT BRIEF READING AS AN EMPTY ONE. `fetchRepBrief` collapses
//     auth failure, a non-ok response, a bad shape and a thrown fetch into a
//     single `null`. If the card treated that as "no data yet" the rep would
//     stare at a blank panel; if it treated it as data the sections would map
//     over undefined. It must say so in Hebrew AND offer a retry, and the
//     loading line must be gone by then (and vice-versa: while in flight the
//     card must NOT already show the failure copy).
//
//  4. A COPY BUTTON THAT LIES. The copy control puts the deterministic brief
//     on the clipboard — the exact text the rep pastes into a CRM note or a
//     WhatsApp. Copying anything other than `data.brief` (a summary, a stale
//     value) is undetectable by eye, so the clipboard assertion is on the
//     exact string. And `setCopied(true)` sits AFTER the awaited write inside
//     a try/catch: if it ever moves before/outside it, a denied clipboard
//     permission shows "הועתק ✓" and announces "התדריך הועתק ללוח" over a
//     clipboard that still holds whatever was there before.
//
// crm-admin is mocked at the MODULE BOUNDARY (never global fetch) with
// importOriginal spread, so the real types and the real ui.tsx tokens survive.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RepBriefResult } from "@/lib/crm-admin";

const mocks = vi.hoisted(() => ({ fetchRepBrief: vi.fn() }));

vi.mock("@/lib/crm-admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm-admin")>();
  return { ...actual, fetchRepBrief: mocks.fetchRepBrief };
});

import CrmCallBrief from "@/components/crm/CrmCallBrief";

const LEAD = "lead-7f3c";

function brief(over: Partial<RepBriefResult> = {}): RepBriefResult {
  return {
    need: { category: "cellular", categoryHe: "סלולר", budget: 60, provider: "פרטנר", abroad: true },
    plans: [
      {
        provider: "רמי לוי",
        name: "אנלימיטד 5G",
        price: 39,
        unitLabel: "/חודש",
        annualSaving: 1200,
        abroad: false,
        is5G: true,
        noCommit: true,
      },
    ],
    talkingPoints: ["הלקוח משלם 60 ₪ ומקבל פחות גיגה"],
    objections: [{ objection: "אני בהתחייבות", answer: "אין קנס יציאה בחוק" }],
    compliance: [{ law: "§7ב", mustSay: "השיחה מוקלטת" }],
    brief: "תדריך מלא ללקוח — סלולר, תקציב ₪60.",
    narrative: null,
    ...over,
  };
}

/** The plan <li> whose text mentions this provider (a listitem has no a11y name). */
function planRow(provider: string): HTMLElement {
  const row = screen.getAllByRole("listitem").find((li) => li.textContent?.includes(provider));
  if (!row) throw new Error(`no plan row for ${provider}`);
  return row;
}

/** jsdom has no clipboard; install a controllable one per test. */
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

describe("CrmCallBrief — the facts a rep reads aloud", () => {
  it("renders the grounded brief: need, real plans, talking points, objections and compliance", async () => {
    mocks.fetchRepBrief.mockResolvedValue(brief());
    const { container } = render(<CrmCallBrief leadId={LEAD} />);

    // The need line is one paragraph — assert the whole composed string so a
    // dropped separator or a reordered clause is caught, not just the words.
    expect(await screen.findByText("סלולר · תקציב ₪60 · ספק נוכחי: פרטנר · מתעניין בחו״ל")).toBeInTheDocument();

    expect(screen.getByText("מסלולים מומלצים")).toBeInTheDocument();
    // Price, unit label and the saving all live in the same <li>.
    const plan = planRow("רמי לוי");
    expect(plan.textContent).toContain("רמי לוי · אנלימיטד 5G — ₪39/חודש");
    expect(plan.textContent).toContain("חיסכון ₪1,200/שנה");

    expect(screen.getByText("נקודות לשיחה")).toBeInTheDocument();
    expect(screen.getByText("הלקוח משלם 60 ₪ ומקבל פחות גיגה")).toBeInTheDocument();

    expect(screen.getByText("התנגדויות ותשובות")).toBeInTheDocument();
    expect(screen.getByText("”אני בהתחייבות“")).toBeInTheDocument();
    expect(screen.getByText("→ אין קנס יציאה בחוק")).toBeInTheDocument();

    // The §7b/§30A reminders are the part the rep is legally required to say.
    expect(screen.getByText("חובה לומר (ציות)")).toBeInTheDocument();
    expect(screen.getByText("§7ב:")).toBeInTheDocument();
    expect(screen.getByText(/השיחה מוקלטת/)).toBeInTheDocument();

    // The same sweep the empty-sections test does, but over the FULLY populated
    // card — the one a rep actually reads down the phone. A stringified null or
    // a NaN price leaks here and no per-element query above would ever see it,
    // because each of those asserts one element's own text.
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
  });

  it("asks the edge function for THIS lead's brief, once", async () => {
    mocks.fetchRepBrief.mockResolvedValue(brief());
    render(<CrmCallBrief leadId={LEAD} />);
    await screen.findByText("מסלולים מומלצים");
    // A brief for the wrong lead renders just as convincingly as the right one.
    expect(mocks.fetchRepBrief).toHaveBeenCalledWith(LEAD);
    expect(mocks.fetchRepBrief).toHaveBeenCalledTimes(1);
  });

  it("shows the loading line while the brief is in flight — and no failure copy", async () => {
    let settle: (v: RepBriefResult) => void = () => {};
    mocks.fetchRepBrief.mockReturnValue(
      new Promise<RepBriefResult>((res) => {
        settle = res;
      }),
    );
    render(<CrmCallBrief leadId={LEAD} />);

    expect(screen.getByText("מכין תדריך…")).toBeInTheDocument();
    // "Still working" must never be dressed up as "we failed" or as content.
    expect(screen.queryByText("לא הצלחנו להכין תדריך.")).toBeNull();
    expect(screen.queryByText("מסלולים מומלצים")).toBeNull();

    settle(brief());
    expect(await screen.findByText("מסלולים מומלצים")).toBeInTheDocument();
    expect(screen.queryByText("מכין תדריך…")).toBeNull();
  });

  it("a brief that could not be built says so and offers a retry — never a blank card", async () => {
    mocks.fetchRepBrief.mockResolvedValue(null);
    render(<CrmCallBrief leadId={LEAD} />);

    expect(await screen.findByText("לא הצלחנו להכין תדריך.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "נסו שוב" })).toBeInTheDocument();
    // Nothing half-rendered underneath it.
    expect(screen.queryByText("מכין תדריך…")).toBeNull();
    expect(screen.queryByText("חובה לומר (ציות)")).toBeNull();
    expect(screen.queryByRole("button", { name: "העתק תדריך מלא" })).toBeNull();
  });

  it("the retry re-asks for the SAME lead and clears the failure", async () => {
    mocks.fetchRepBrief.mockResolvedValueOnce(null).mockResolvedValue(brief());
    render(<CrmCallBrief leadId={LEAD} />);

    fireEvent.click(await screen.findByRole("button", { name: "נסו שוב" }));

    expect(await screen.findByText("מסלולים מומלצים")).toBeInTheDocument();
    expect(screen.queryByText("לא הצלחנו להכין תדריך.")).toBeNull();
    expect(mocks.fetchRepBrief).toHaveBeenCalledTimes(2);
    // Both attempts must be for the lead on screen — a retry that drifts to
    // another id is the wrong-lead bug with a click in front of it.
    expect(mocks.fetchRepBrief.mock.calls).toEqual([[LEAD], [LEAD]]);
  });

  it("omits the need facts we do not have instead of printing ₪0 / an empty provider", async () => {
    mocks.fetchRepBrief.mockResolvedValue(
      brief({ need: { category: "tv", categoryHe: "טלוויזיה", budget: 0, provider: "", abroad: false } }),
    );
    render(<CrmCallBrief leadId={LEAD} />);

    // The whole line is the category and nothing else — no dangling separators.
    expect(await screen.findByText("טלוויזיה")).toBeInTheDocument();
    expect(screen.queryByText(/תקציב/)).toBeNull();
    expect(screen.queryByText(/ספק נוכחי/)).toBeNull();
    expect(screen.queryByText(/מתעניין בחו״ל/)).toBeNull();
  });

  it("claims a saving only for the plan that has one", async () => {
    mocks.fetchRepBrief.mockResolvedValue(
      brief({
        plans: [
          { provider: "רמי לוי", name: "אנלימיטד", price: 39, unitLabel: "/חודש", annualSaving: 1200, abroad: false, is5G: true, noCommit: true },
          { provider: "סלקום", name: "בסיסי", price: 75, unitLabel: "/חודש", annualSaving: 0, abroad: false, is5G: false, noCommit: false },
        ],
      }),
    );
    render(<CrmCallBrief leadId={LEAD} />);

    await screen.findByText("מסלולים מומלצים");
    const cheap = planRow("רמי לוי");
    expect(cheap.textContent).toContain("חיסכון ₪1,200/שנה");
    // "you would save ₪0 a year" is a sentence no rep should ever be handed.
    const dearer = planRow("סלקום");
    expect(dearer.textContent).toContain("סלקום · בסיסי — ₪75/חודש");
    expect(dearer.textContent).not.toContain("חיסכון");
  });

  it("drops empty sections whole — no bare headings, and no undefined/null on screen", async () => {
    mocks.fetchRepBrief.mockResolvedValue(
      brief({ plans: [], talkingPoints: [], objections: [], compliance: [] }),
    );
    const { container } = render(<CrmCallBrief leadId={LEAD} />);

    expect(await screen.findByText(/סלולר/)).toBeInTheDocument();
    expect(screen.queryByText("מסלולים מומלצים")).toBeNull();
    expect(screen.queryByText("נקודות לשיחה")).toBeNull();
    expect(screen.queryByText("התנגדויות ותשובות")).toBeNull();
    expect(screen.queryByText("חובה לומר (ציות)")).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
    // What a missing guard actually prints, in a card that is read aloud.
    expect(container.textContent).not.toMatch(/undefined|null|NaN/);
  });

  it("copies the deterministic brief verbatim and announces it", async () => {
    const b = brief();
    mocks.fetchRepBrief.mockResolvedValue(b);
    render(<CrmCallBrief leadId={LEAD} />);

    fireEvent.click(await screen.findByRole("button", { name: "העתק תדריך מלא" }));

    // The exact text — a summary or a stale value on the clipboard is invisible.
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(b.brief));
    expect(await screen.findByRole("button", { name: "הועתק ✓" })).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toBe("התדריך הועתק ללוח");
  });

  it("a refused clipboard is not reported as a successful copy", async () => {
    writeText.mockRejectedValue(new Error("NotAllowedError"));
    mocks.fetchRepBrief.mockResolvedValue(brief());
    render(<CrmCallBrief leadId={LEAD} />);

    fireEvent.click(await screen.findByRole("button", { name: "העתק תדריך מלא" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    // The rep must not walk away believing the brief is on their clipboard.
    expect(screen.getByRole("button", { name: "העתק תדריך מלא" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "הועתק ✓" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("does not announce a copy when there is no brief text to copy", async () => {
    mocks.fetchRepBrief.mockResolvedValue(brief({ brief: "" }));
    render(<CrmCallBrief leadId={LEAD} />);

    fireEvent.click(await screen.findByRole("button", { name: "העתק תדריך מלא" }));

    // Writing "" would silently wipe whatever the rep had on their clipboard.
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(""));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "הועתק ✓" })).toBeNull();
  });
});
