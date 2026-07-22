// ────────────────────────────────────────────────────────────────────────────
// <LeadForm> — validation, step navigation, the MANDATORY consent gate, and the
// a11y wiring (label↔input, aria-invalid, aria-describedby↔error). We assert
// BEHAVIOUR only and never reach into form internals: tracking + the network are
// mocked at the module boundary so a green run proves the contract without a
// real fetch or a real GA4 call.
//
// HONESTY/LEGAL anchor: the most important test here is the consent gate — the
// submit button MUST stay disabled until the unchecked-by-default consent box is
// ticked, and a never-ticked consent must surface its required error. If those
// regress, a lead could be sent without consent.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LeadForm from "@/components/LeadForm";

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

/** Walk Name → Phone → City → service step, filling valid values each step. */
async function advanceToFinalStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("שם מלא"), "ישראל ישראלי");
  await user.click(screen.getByRole("button", { name: "המשך" }));

  await user.type(await screen.findByLabelText("מספר טלפון"), "050-123-4567");
  await user.click(screen.getByRole("button", { name: "המשך" }));

  await user.type(await screen.findByLabelText("עיר מגורים"), "תל אביב");
  await user.click(screen.getByRole("button", { name: "המשך" }));

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

    // Try to advance with an empty required name → validation error appears.
    await user.click(screen.getByRole("button", { name: "המשך" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("נא להזין שם");

    const input = screen.getByLabelText("שם מלא");
    expect(input).toHaveAttribute("aria-invalid", "true");
    // The describedby target must be the actual error element's id.
    expect(input).toHaveAttribute("aria-describedby", error.id);
  });
});

describe("LeadForm — step validation gate", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
  });

  it("blocks advancing past the phone step on an invalid Israeli number", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);

    await user.type(screen.getByLabelText("שם מלא"), "ישראל");
    await user.click(screen.getByRole("button", { name: "המשך" }));

    const phone = await screen.findByLabelText("מספר טלפון");
    await user.type(phone, "123"); // not a valid IL phone
    await user.click(screen.getByRole("button", { name: "המשך" }));

    expect(await screen.findByText("מספר הטלפון אינו תקין")).toBeInTheDocument();
    // Still on the phone step (city field not yet rendered).
    expect(screen.queryByLabelText("עיר מגורים")).not.toBeInTheDocument();
  });
});

describe("LeadForm — mandatory consent gate", () => {
  beforeEach(() => {
    fireLeadConversion.mockReset();
    trackEvent.mockReset();
    vi.restoreAllMocks();
  });

  it("keeps submit disabled until the (default-unchecked) consent box is ticked", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LeadForm source="test" />);
    await advanceToFinalStep(user);

    const consent = getConsentCheckbox();
    expect(consent).not.toBeChecked();

    const submit = screen.getByRole("button", { name: "קבלת הצעה חינם" });
    expect(submit).toBeDisabled();

    await user.click(consent);
    expect(consent).toBeChecked();
    expect(submit).toBeEnabled();
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
