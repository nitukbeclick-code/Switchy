// ────────────────────────────────────────────────────────────────────────────
// <LeadForm> — validation, step navigation, the MANDATORY consent gate, and the
// a11y wiring (label↔input, aria-invalid, aria-describedby↔error). We assert
// BEHAVIOUR only and never reach into form internals: tracking + the network are
// mocked at the module boundary so a green run proves the contract without a
// real fetch or a real GA4 call.
//
// HONESTY/LEGAL anchor: the most important test here is the consent gate — an
// unticked, default-unchecked consent box MUST prevent the POST. The button is
// deliberately NOT `disabled` (a disabled control swallows the tap and reports
// nothing — a silent dead end at the last step of the funnel); instead a click
// must surface the required error, move focus to the box, and send nothing. If
// that regresses, a lead could be sent without consent.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeadForm, { callbackConfirmation } from "@/components/LeadForm";
import {
  COMMISSION_DISCLOSURE_FEE_SENTENCE,
  CTA_OBJECTIONS,
  CTA_OBJECTIONS_LABEL,
  PRICE_ACCURACY_CAVEAT,
} from "@/lib/legal";

// Mock tracking so no GA4 / Meta Pixel side effects fire during the test.
const fireLeadConversion = vi.fn();
const trackEvent = vi.fn();
vi.mock("@/lib/tracking", () => ({
  fireLeadConversion: (...a: unknown[]) => fireLeadConversion(...a),
  trackEvent: (...a: unknown[]) => trackEvent(...a),
}));

/**
 * The MANDATORY consent checkbox — uniquely identified by aria-required="true"
 * (the optional marketing checkboxes don't carry it, and their labels share the
 * "אני מאשר/ת" prefix, so a label substring match is ambiguous).
 */
function getConsentCheckbox(): HTMLInputElement {
  const box = screen
    .getAllByRole("checkbox")
    .find((el) => el.getAttribute("aria-required") === "true");
  if (!box) throw new Error("consent checkbox not found");
  return box as HTMLInputElement;
}

/**
 * Run `run` with the local wall clock pinned to `hour` o'clock.
 *
 * The callback confirmation is clock-dependent BY DESIGN (a window that has
 * already passed must never be promised), so any test asserting the promised
 * copy has to own the clock — otherwise it passes at 10:00 and fails at 23:00.
 * The instant is built from LOCAL date parts, so the pinned hour is that hour in
 * every runner timezone. `shouldAdvanceTime` + `advanceTimers` keep user-event's
 * own timers ticking while the clock is frozen (the BookClient cooldown idiom).
 */
async function withLocalHour(
  hour: number,
  run: (user: ReturnType<typeof userEvent.setup>) => Promise<void>,
) {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    now: new Date(2026, 0, 15, hour, 0, 0),
  });
  try {
    await run(
      userEvent.setup({
        delay: null,
        advanceTimers: vi.advanceTimersByTime.bind(vi),
      }),
    );
  } finally {
    vi.useRealTimers();
  }
}

/**
 * Walk the TWO steps: (name + phone) → (city + service + consent), filling valid
 * values on the way. Name and phone deliberately share one step so a phone's
 * keychain fills both in a single autofill invocation.
 */
async function advanceToFinalStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("שם מלא"), "ישראל ישראלי");
  await user.type(screen.getByLabelText("מספר טלפון"), "050-123-4567");
  await user.click(screen.getByRole("button", { name: "המשך" }));

  await user.type(await screen.findByLabelText("עיר מגורים"), "תל אביב");

  // Final step: the service <select> is present.
  await screen.findByLabelText("איזה שירות מעניין אתכם?");
}

describe("LeadForm — a11y wiring", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
  });

  it("associates the name <label> with its <input> and marks it required", () => {
    render(<LeadForm source="test" />);
    const input = screen.getByLabelText("שם מלא");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-required", "true");
    // No error yet → not invalid, no describedby.
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("on an invalid field, sets aria-invalid and links the error via aria-describedby", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);

    // Try to advance with the step empty → both fields on this step report.
    await user.click(screen.getByRole("button", { name: "המשך" }));

    await screen.findByText("נא להזין שם");

    const input = screen.getByLabelText("שם מלא");
    expect(input).toHaveAttribute("aria-invalid", "true");
    // The describedby target must be the actual error element, announced live.
    const describedBy = input.getAttribute("aria-describedby");
    const error = describedBy ? document.getElementById(describedBy) : null;
    expect(error).toHaveAttribute("role", "alert");
    expect(error).toHaveTextContent("נא להזין שם");
  });
});

describe("LeadForm — step validation gate", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
  });

  it("blocks advancing past the contact step on an invalid Israeli number", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);

    await user.type(screen.getByLabelText("שם מלא"), "ישראל");
    await user.type(screen.getByLabelText("מספר טלפון"), "123"); // not a valid IL phone
    await user.click(screen.getByRole("button", { name: "המשך" }));

    expect(await screen.findByText("מספר הטלפון אינו תקין")).toBeInTheDocument();
    // Still on the contact step (city field not yet rendered).
    expect(screen.queryByLabelText("עיר מגורים")).not.toBeInTheDocument();
  });

  it("offers the real catalogue cities as datalist suggestions on the city field", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);

    // The field stays free text (a datalist only suggests) and REQUIRED.
    const city = screen.getByLabelText("עיר מגורים");
    expect(city).toHaveAttribute("list", "lead-cities");
    expect(city).toHaveAttribute("aria-required", "true");
    // Suggestions come from web/data/cities.json — real cities, not invented.
    const options = document.querySelectorAll("#lead-cities option");
    expect(options.length).toBeGreaterThan(20);
    expect(
      Array.from(options).map((o) => o.getAttribute("value")),
    ).toContain("תל אביב-יפו");
  });
});

describe("LeadForm — mandatory consent gate", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
    vi.restoreAllMocks();
  });

  it("blocks the POST without consent, but ANSWERS the tap: error surfaced + checkbox focused", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);
    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "cellular",
    );

    const consent = getConsentCheckbox();
    expect(consent).not.toBeChecked();

    // The button is NOT a dead control: it stays clickable (only aria-disabled +
    // data-blocked mark it as not-yet-actionable) so the tap produces an answer.
    const submit = screen.getByRole("button", { name: "קבלת הצעה חינם" });
    expect(submit).toBeEnabled();
    expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(submit).toHaveAttribute("data-blocked", "true");

    await user.click(submit);

    // The gate itself is unchanged — nothing was sent.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fireLeadConversion).not.toHaveBeenCalled();
    // …and the user is told why, at the field that needs them.
    expect(
      await screen.findByText(
        "יש לאשר את תנאי השימוש והסכמה ליצירת קשר כדי להמשיך",
      ),
    ).toBeInTheDocument();
    expect(consent).toHaveFocus();

    // Ticking it clears the blocked affordance.
    await user.click(consent);
    expect(consent).toBeChecked();
    expect(submit).toHaveAttribute("aria-disabled", "false");
    expect(submit).not.toHaveAttribute("data-blocked");
  });

  it("submits to /api/lead with consent=true and fires the conversion exactly once on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="compare" />);
    await advanceToFinalStep(user);

    // Pick a service + tick consent, then submit.
    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "cellular",
    );
    await user.click(getConsentCheckbox());
    await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/lead");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.consent).toBe(true);
    expect(body.source).toBe("compare");
    expect(body.category).toBe("cellular");

    // Success path → conversion fires once, and the thank-you state renders.
    await waitFor(() => expect(fireLeadConversion).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("הפרטים התקבלו, תודה!")).toBeInTheDocument();
  });

  it("carries the selected comparison plan into the CRM payload", async () => {
    window.history.replaceState({}, "", "/compare/cellular?plans=p2,p1");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup({ delay: null });
    render(
      <LeadForm
        source="compare"
        planOptions={[
          { id: "p1", provider: "סלקום", name: "מסלול ראשון" },
          { id: "p2", provider: "פרטנר", name: "מסלול שני" },
        ]}
      />,
    );

    expect(await screen.findByText("הבחירה שלכם מחוברת לבקשה")).toBeInTheDocument();
    await advanceToFinalStep(user);
    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "cellular",
    );
    await user.click(getConsentCheckbox());
    await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.provider).toBe("פרטנר");
    expect(body.plan_id).toBe("p2");
    expect(body.notes).toContain("פרטנר — מסלול שני (p2)");
    expect(body.notes).toContain("סלקום — מסלול ראשון (p1)");
  });

  it("shows a server error and does NOT fire the conversion when /api/lead fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "שגיאת שרת לבדיקה" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);

    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "internet",
    );
    await user.click(getConsentCheckbox());
    await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

    expect(await screen.findByText("שגיאת שרת לבדיקה")).toBeInTheDocument();
    expect(fireLeadConversion).not.toHaveBeenCalled();
    // Form is still shown (no thank-you state).
    expect(screen.queryByText("הפרטים התקבלו, תודה!")).not.toBeInTheDocument();
  });
});

describe("LeadForm — the ask: objections, callback window, escape hatches", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
    vi.restoreAllMocks();
  });

  it("answers the two objections that peak before the phone number, above the submit", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);

    // Verbatim, shared with the desktop build via lib/legal (CTA_OBJECTIONS).
    for (const line of CTA_OBJECTIONS) {
      expect(screen.getByText(line.text)).toBeInTheDocument();
    }
    expect(
      screen.getByRole("list", { name: CTA_OBJECTIONS_LABEL }),
    ).toBeInTheDocument();
  });

  // ── §7b / §17 are the FORM's job, not the host page's ────────────────────
  // <CommissionDisclosure> and <PriceCaveat> are siblings a page has to remember
  // to render, so an omission is invisible — and six lead-capturing routes
  // shipped missing one or both. The form now carries both itself, which is only
  // true as long as these pass: they render a BARE <LeadForm> with no page around
  // it, so nothing but the component can be supplying the copy.
  it("renders the §7b commission disclosure and the §17 price caveat itself, with no host page", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);

    // Read from lib/legal, so a reworded constant is caught here too.
    const disclosure = screen.getByText(
      `${COMMISSION_DISCLOSURE_FEE_SENTENCE} ${PRICE_ACCURACY_CAVEAT}`,
    );

    // …and asserted as the load-bearing CLAIMS, so the guard survives a
    // reformatting of the constants but not the loss of a required fact.
    // §7b — a fee is taken from the providers, and it does not move the price.
    expect(disclosure).toHaveTextContent("דמי תיווך/הפניה מהספקים");
    expect(disclosure).toHaveTextContent("אינו משפיע על המחיר שתשלמו");
    // §17 — VAT-inclusive, as of the update date, verify before signing.
    expect(disclosure).toHaveTextContent("המחירים כוללים מע״מ");
    expect(disclosure).toHaveTextContent("יש לאמת מול הספק לפני התקשרות");
  });

  it("places the disclosure at the point of commitment: final step, above the submit", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);

    // The contact step asks for a name and a phone, not for a decision — the
    // disclosure belongs where the lead is actually sent.
    expect(
      screen.queryByText(
        `${COMMISSION_DISCLOSURE_FEE_SENTENCE} ${PRICE_ACCURACY_CAVEAT}`,
      ),
    ).not.toBeInTheDocument();

    await advanceToFinalStep(user);

    const disclosure = screen.getByText(
      `${COMMISSION_DISCLOSURE_FEE_SENTENCE} ${PRICE_ACCURACY_CAVEAT}`,
    );
    const submit = screen.getByRole("button", { name: "קבלת הצעה חינם" });
    // Node.DOCUMENT_POSITION_FOLLOWING — the submit button comes AFTER the
    // disclosure in document order, i.e. nobody reaches the button first.
    expect(
      disclosure.compareDocumentPosition(submit) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("sends the chosen callback window and promises it back verbatim on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    // 10:00 — the ערב window is still ahead, so "היום" is a promise we can keep.
    await withLocalHour(10, async (user) => {
      render(<LeadForm source="test" />);
      await advanceToFinalStep(user);
      await user.selectOptions(
        screen.getByLabelText("איזה שירות מעניין אתכם?"),
        "internet",
      );

      // Nothing is pre-selected — an optional field must not answer for the user.
      for (const label of ["עכשיו", "צהריים", "ערב", "מחר"]) {
        expect(screen.getByLabelText(label)).not.toBeChecked();
      }

      await user.click(screen.getByLabelText("ערב"));
      await user.click(getConsentCheckbox());
      await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string,
      );
      // Exactly the value /api/lead validates against and stores.
      expect(body.callback_time).toBe("evening");

      // The success copy promises the window the user actually chose.
      expect(await screen.findByText(/היום בשעות הערב/)).toBeInTheDocument();
    });
  });

  it("never confirms a window that has already passed: a 23:00 צהריים request is promised for tomorrow", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    // 23:00 — "היום בשעות הצהריים" would be a callback in the past. The chosen
    // window still reaches the CRM unchanged; only the PROMISE moves on.
    await withLocalHour(23, async (user) => {
      render(<LeadForm source="test" />);
      await advanceToFinalStep(user);
      await user.selectOptions(
        screen.getByLabelText("איזה שירות מעניין אתכם?"),
        "internet",
      );
      await user.click(screen.getByLabelText("צהריים"));

      // The pre-submit "what happens next" line makes the same promise as the
      // confirmation will — it must not say "היום" either.
      expect(
        await screen.findByText(/מחר בשעות הצהריים/),
      ).toBeInTheDocument();

      await user.click(getConsentCheckbox());
      await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body.callback_time).toBe("noon");

      // The confirmation names the next occurrence and says why it moved.
      expect(await screen.findByText("הפרטים התקבלו, תודה!")).toBeInTheDocument();
      expect(screen.getByText(/מחר בשעות הצהריים/)).toBeInTheDocument();
      expect(screen.getByText(/החלון שביקשתם כבר חלף היום/)).toBeInTheDocument();
      expect(screen.queryByText(/היום בשעות הצהריים/)).not.toBeInTheDocument();
    });
  });

  it("keeps the honest default SLA when no callback window was chosen", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);
    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "internet",
    );
    await user.click(getConsentCheckbox());
    await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.callback_time).toBeUndefined();
    expect(
      await screen.findByText(/בדרך כלל תוך יום עסקים אחד/),
    ).toBeInTheDocument();
  });

  it("gives the success state somewhere to go (WhatsApp + the Zoom booking)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);
    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "tv",
    );
    await user.click(getConsentCheckbox());
    await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

    const wa = await screen.findByRole("link", {
      name: /וואטסאפ/,
    });
    expect(wa.getAttribute("href")).toContain("https://wa.me/972505037537");
    expect(wa.getAttribute("href")).toContain(
      encodeURIComponent("היי, השארתי פרטים באתר"),
    );
    expect(
      screen.getByRole("link", { name: /שיחת ייעוץ/ }).getAttribute("href"),
    ).toBe("/book");

    // The already-wired whatsappClick product event fires via outbound_click.
    await user.click(wa);
    expect(trackEvent).toHaveBeenCalledWith(
      "outbound_click",
      expect.objectContaining({ dest: "whatsapp" }),
    );
  });
});

describe("callbackConfirmation — a promise may never point at the past", () => {
  // The clock is an argument, so the boundary is asserted directly instead of
  // through the DOM. Hours are built from LOCAL parts (Israel is one timezone,
  // the client clock is the right clock) so the assertions hold in any runner.
  const at = (hour: number, minute = 0) => new Date(2026, 0, 15, hour, minute);

  it("keeps the same-day wording while the window is still ahead", () => {
    expect(callbackConfirmation("noon", at(9))).toEqual({
      text: "היום בשעות הצהריים",
      shifted: false,
    });
    // 15:59 — the last minute the צהריים window is still today's.
    expect(callbackConfirmation("noon", at(15, 59))).toEqual({
      text: "היום בשעות הצהריים",
      shifted: false,
    });
    expect(callbackConfirmation("evening", at(20, 59))).toEqual({
      text: "היום בשעות הערב",
      shifted: false,
    });
  });

  it("moves a passed window to the next occurrence, on the hour it passes", () => {
    // 16:00 exactly — the boundary the defect lived on.
    expect(callbackConfirmation("noon", at(16))).toEqual({
      text: "מחר בשעות הצהריים",
      shifted: true,
    });
    expect(callbackConfirmation("noon", at(23))).toEqual({
      text: "מחר בשעות הצהריים",
      shifted: true,
    });
    expect(callbackConfirmation("evening", at(21))).toEqual({
      text: "מחר בשעות הערב",
      shifted: true,
    });
  });

  it("leaves the windows that cannot point backwards untouched, at any hour", () => {
    // "בהקדם האפשרי" and "מחר" name no past instant, so neither ever shifts.
    for (const hour of [0, 12, 23]) {
      expect(callbackConfirmation("now", at(hour))).toEqual({
        text: "בהקדם האפשרי",
        shifted: false,
      });
      expect(callbackConfirmation("tomorrow", at(hour))).toEqual({
        text: "מחר",
        shifted: false,
      });
    }
  });

  it("returns null when no window was chosen, so the honest SLA stands", () => {
    expect(callbackConfirmation("", at(23))).toBeNull();
  });
});

describe("LeadForm — optional CRM context props", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
    vi.restoreAllMocks();
  });

  it("appends contextNote to notes and forwards provider/planId", async () => {
    // No ?plans= shortlist here, so the page-level context is what reaches CRM.
    window.history.replaceState({}, "", "/plans/abc");
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ delay: null });
    render(
      <LeadForm
        source="plan"
        contextNote="הגיע ממסלול X"
        provider="סלקום"
        planId="plan-1"
      />,
    );
    await advanceToFinalStep(user);
    await user.selectOptions(
      screen.getByLabelText("איזה שירות מעניין אתכם?"),
      "cellular",
    );
    await user.click(getConsentCheckbox());
    await user.click(screen.getByRole("button", { name: "קבלת הצעה חינם" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.notes).toBe("הגיע ממסלול X");
    expect(body.provider).toBe("סלקום");
    expect(body.plan_id).toBe("plan-1");
  });

  it("SHOWS the contextNote above the submit — the summary travels with a name and a phone", async () => {
    // The note is stored in the same record as name/phone/city, so the visitor
    // must be able to read it before deciding to send. If this regresses, the
    // hand-off is invisible again and the callers' privacy copy becomes false.
    const user = userEvent.setup({ delay: null });
    render(
      <LeadForm
        source="bill-analyzer"
        contextNote="ספק נוכחי: סלקום · תשלום היום: ₪120 לחודש"
      />,
    );

    // Not on the contact step — the receipt belongs where the decision is made.
    expect(screen.queryByText("מה שיישלח עם הפנייה:")).not.toBeInTheDocument();

    await advanceToFinalStep(user);

    expect(screen.getByText("מה שיישלח עם הפנייה:")).toBeInTheDocument();
    expect(
      screen.getByText("ספק נוכחי: סלקום · תשלום היום: ₪120 לחודש"),
    ).toBeInTheDocument();
  });

  it("renders no receipt when the host page attaches nothing", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);
    expect(screen.queryByText("מה שיישלח עם הפנייה:")).not.toBeInTheDocument();
  });
});

describe("LeadForm — marketing opt-ins are off by default (Spam Law)", () => {
  it("renders the three per-channel marketing checkboxes unchecked", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);

    for (const label of [
      "אני מאשר/ת קבלת דיוור שיווקי ב-SMS",
      "אני מאשר/ת קבלת דיוור שיווקי ב-אימייל",
      "אני מאשר/ת קבלת דיוור שיווקי ב-וואטסאפ",
    ]) {
      const box = screen.getByLabelText(label);
      expect(box).toBeInTheDocument();
      expect(box).not.toBeChecked();
    }
  });
});
