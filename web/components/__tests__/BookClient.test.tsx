// ────────────────────────────────────────────────────────────────────────────
// <BookClient> — the email-verified self-serve Zoom booking card. We assert the
// BEHAVIOUR through the public surface (the 4 steps, the consent gate, the
// surfaced server errors) and mock the network at the global-fetch boundary, so a
// green run proves the contract without a real edge-function call.
//
// The most important assertions:
//   • The MANDATORY, default-OFF consent checkbox keeps "שלח קוד אימות למייל"
//     disabled until ticked (a booking can never start without consent).
//   • The flow calls the `meeting-book` edge function with the right action +
//     body shape at each step: request-code → verify-code (wrong → error, right →
//     advance) → book → success.
//   • A server { ok:false, error } is surfaced verbatim (rate-limited / slot taken).
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BookClient from "@/components/BookClient";
import { availableSlots } from "@/lib/slots";

// A real, valid future day+slot from the same generator the component uses, so
// the picker always has the option we select (deterministic per run).
const DAY = availableSlots(new Date())[0];
const FIRST_SLOT = DAY.slots[0];

/** Fill step 1 with valid details + a real day/time. Does NOT tick consent. */
async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("שם מלא"), "ישראל ישראלי");
  await user.type(screen.getByLabelText("מספר טלפון"), "050-123-4567");
  await user.type(screen.getByLabelText("כתובת מייל"), "test@example.com");
  await user.selectOptions(screen.getByLabelText("על איזה שירות נדבר?"), "cellular");
  await user.selectOptions(screen.getByLabelText("עם איזו חברה תרצו להיפגש?"), "HOT");
  await user.selectOptions(screen.getByLabelText("יום הפגישה"), DAY.date);
  await user.selectOptions(screen.getByLabelText("שעת הפגישה"), FIRST_SLOT);
}

/** The single submit button on the details step. */
function requestBtn() {
  return screen.getByRole("button", { name: "שלח קוד אימות למייל" });
}

/** Parse the JSON body of the Nth fetch call. */
function bodyOf(fetchMock: ReturnType<typeof vi.fn>, n: number) {
  return JSON.parse((fetchMock.mock.calls[n][1] as RequestInit).body as string);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("BookClient — mandatory consent gate", () => {
  it("keeps the request-code button disabled until consent is ticked", async () => {
    const user = userEvent.setup();
    render(<BookClient />);

    // Disabled with an empty form.
    expect(requestBtn()).toBeDisabled();

    // Still disabled with everything filled EXCEPT consent.
    await fillDetails(user);
    expect(requestBtn()).toBeDisabled();

    // Consent is default-OFF; ticking it enables the button.
    const consent = screen.getByRole("checkbox");
    expect(consent).not.toBeChecked();
    await user.click(consent);
    expect(requestBtn()).toBeEnabled();
  });

  it("shows the §7b commission disclosure on the details step", () => {
    render(<BookClient />);
    // The free-service lead phrase from legal.ts proves the disclosure is present.
    expect(screen.getByText(/השירות חינמי עבורכם\./)).toBeInTheDocument();
  });
});

describe("BookClient — request → verify → book happy path", () => {
  it("walks the full flow, calling meeting-book with the right action/body each step", async () => {
    const fetchMock = vi
      .fn()
      // 1) request-code → always {ok:true}
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      // 2) verify-code (wrong) → {ok:false,error}
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false, error: "קוד לא תקין" }),
      })
      // 3) verify-code (right) → {ok:true}
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      // 4) book → {ok:true}
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BookClient />);

    // Step 1 → request a code.
    await fillDetails(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(requestBtn());

    // request-code body shape.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = fetchMock.mock.calls[0][0];
    expect(String(url)).toContain("/functions/v1/meeting-book");
    const reqBody = bodyOf(fetchMock, 0);
    expect(reqBody.action).toBe("request-code");
    expect(reqBody.email).toBe("test@example.com");
    expect(reqBody.name).toBe("ישראל ישראלי");

    // Step 2 appears with the masked-email confirmation copy.
    expect(
      await screen.findByText(/שלחנו קוד בן 6 ספרות ל-/),
    ).toBeInTheDocument();

    // A WRONG code surfaces the server error and does NOT advance.
    await user.type(screen.getByLabelText("קוד אימות (6 ספרות)"), "000000");
    await user.click(screen.getByRole("button", { name: "אימות" }));
    expect(await screen.findByText("קוד לא תקין")).toBeInTheDocument();
    const verifyWrong = bodyOf(fetchMock, 1);
    expect(verifyWrong.action).toBe("verify-code");
    expect(verifyWrong.code).toBe("000000");

    // A RIGHT code advances to the confirm step.
    const codeInput = screen.getByLabelText("קוד אימות (6 ספרות)");
    await user.clear(codeInput);
    await user.type(codeInput, "123456");
    await user.click(screen.getByRole("button", { name: "אימות" }));

    // Step 3 (confirm) → book.
    const bookBtn = await screen.findByRole("button", { name: "קבע פגישה" });
    await user.click(bookBtn);

    // book body shape — the edge-function contract.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const bookBody = bodyOf(fetchMock, 3);
    expect(bookBody.action).toBe("book");
    expect(bookBody.name).toBe("ישראל ישראלי");
    expect(bookBody.email).toBe("test@example.com");
    expect(bookBody.meeting_date).toBe(DAY.date);
    expect(bookBody.slot).toBe(FIRST_SLOT);
    expect(bookBody.category).toBe("cellular");
    expect(bookBody.provider).toBe("HOT");
    expect(bookBody.consent).toBe(true);

    // Success state.
    expect(await screen.findByText("הבקשה נשלחה!")).toBeInTheDocument();
    expect(
      screen.getByText(/נציג יאשר ויחזור אליכם עם קישור Zoom/),
    ).toBeInTheDocument();
  });
});

describe("BookClient — server errors are surfaced", () => {
  it("surfaces the Hebrew error from a rate-limited / slot-taken book response", async () => {
    const fetchMock = vi
      .fn()
      // request-code
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      // verify-code (right)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      // book → 429 rate-limited
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: "יותר מדי בקשות. נסו שוב מאוחר יותר.",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<BookClient />);

    await fillDetails(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(requestBtn());

    await screen.findByLabelText("קוד אימות (6 ספרות)");
    await user.type(screen.getByLabelText("קוד אימות (6 ספרות)"), "123456");
    await user.click(screen.getByRole("button", { name: "אימות" }));

    const bookBtn = await screen.findByRole("button", { name: "קבע פגישה" });
    await user.click(bookBtn);

    // The server's Hebrew error is shown verbatim; we stay on the confirm step.
    expect(
      await screen.findByText("יותר מדי בקשות. נסו שוב מאוחר יותר."),
    ).toBeInTheDocument();
    expect(screen.queryByText("הבקשה נשלחה!")).not.toBeInTheDocument();
  });
});

describe("BookClient — a11y", () => {
  it("labels every input on the details step", () => {
    render(<BookClient />);
    // Each control is reachable by its accessible <label> name.
    for (const labelText of [
      "שם מלא",
      "מספר טלפון",
      "כתובת מייל",
      "על איזה שירות נדבר?",
      "יום הפגישה",
      "שעת הפגישה",
    ]) {
      expect(screen.getByLabelText(labelText)).toBeInTheDocument();
    }
    // The booking card exposes its heading for assistive tech.
    const card = screen.getByText("קביעת שיחת ייעוץ בזום");
    expect(card).toBeInTheDocument();
    // sanity: within the card the consent checkbox exists.
    expect(within(document.body).getByRole("checkbox")).toBeInTheDocument();
  });
});
