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
import LeadForm from "@/components/LeadForm";
import { CTA_OBJECTIONS, CTA_OBJECTIONS_LABEL } from "@/lib/legal";

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

  it("sends the chosen callback window and promises it back verbatim on success", async () => {
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
    expect(
      await screen.findByText(/היום בשעות הערב/),
    ).toBeInTheDocument();
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
