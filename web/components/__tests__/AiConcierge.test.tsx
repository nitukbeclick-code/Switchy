// ────────────────────────────────────────────────────────────────────────────
// <AiConcierge> — the floating grounded chat widget. We assert BEHAVIOUR through
// the public surface (the panel, the transcript, the consent-gated lead step) and
// mock the network + tracking at the module boundary, so a green run proves the
// contract without a real fetch or GA4 call.
//
// HONESTY/LEGAL anchor: the most important test is the in-chat lead consent gate —
// when the agent offers lead capture, the "send details" button MUST stay disabled
// until the default-unchecked consent box is ticked, and the §7b commission
// disclosure must be present. If that regresses, a lead could be captured without
// consent / without the disclosure shown.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AiConcierge from "@/components/AiConcierge";

// Mock tracking so no GA4 / Meta Pixel side effects fire.
const fireLeadConversion = vi.fn();
const trackEvent = vi.fn();
vi.mock("@/lib/tracking", () => ({
  fireLeadConversion: (...a: unknown[]) => fireLeadConversion(...a),
  trackEvent: (...a: unknown[]) => trackEvent(...a),
}));

beforeEach(() => {
  fireLeadConversion.mockReset();
  trackEvent.mockReset();
  vi.unstubAllGlobals();
});

describe("AiConcierge — launcher + panel", () => {
  it("is collapsed by default and opens the dialog on launcher click", async () => {
    const user = userEvent.setup();
    render(<AiConcierge />);

    // No dialog until opened.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "פתיחת צ׳אט עם חוסך AI" }),
    );

    expect(screen.getByRole("dialog", { name: "חוסך AI" })).toBeInTheDocument();
    // Greeting bot message is present.
    expect(screen.getByText(/אני חוסך AI/)).toBeInTheDocument();
  });
});

describe("AiConcierge — messaging", () => {
  it("sends the user message to /api/ai-chat and renders the bot reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "מצאתי כמה מסלולים שמתאימים [S1]." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AiConcierge />);
    await user.click(
      screen.getByRole("button", { name: "פתיחת צ׳אט עם חוסך AI" }),
    );

    await user.type(
      screen.getByLabelText("כתבו הודעה לחוסך AI"),
      "מה המסלול הזול ביותר?",
    );
    await user.click(screen.getByRole("button", { name: "שליחה" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai-chat");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.message).toBe("מה המסלול הזול ביותר?");
    expect(typeof body.sessionId).toBe("string");

    // The user's message + the bot reply both appear in the transcript.
    expect(screen.getByText("מה המסלול הזול ביותר?")).toBeInTheDocument();
    expect(
      await screen.findByText("מצאתי כמה מסלולים שמתאימים [S1]."),
    ).toBeInTheDocument();
  });

  it("shows a friendly error and no bot reply when the endpoint fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "השירות עמוס כרגע, נסו שוב בעוד רגע." }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AiConcierge />);
    await user.click(
      screen.getByRole("button", { name: "פתיחת צ׳אט עם חוסך AI" }),
    );
    await user.type(screen.getByLabelText("כתבו הודעה לחוסך AI"), "שלום");
    await user.click(screen.getByRole("button", { name: "שליחה" }));

    expect(
      await screen.findByText("השירות עמוס כרגע, נסו שוב בעוד רגע."),
    ).toBeInTheDocument();
  });
});

describe("AiConcierge — in-chat lead capture consent gate", () => {
  it("offers the lead step with the §7b disclosure and keeps submit disabled until consent is ticked", async () => {
    // First call: the agent answers AND offers lead capture.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "בשמחה אעזור!", offerLead: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AiConcierge />);
    await user.click(
      screen.getByRole("button", { name: "פתיחת צ׳אט עם חוסך AI" }),
    );
    await user.type(
      screen.getByLabelText("כתבו הודעה לחוסך AI"),
      "אני רוצה לעבור ספק",
    );
    await user.click(screen.getByRole("button", { name: "שליחה" }));

    // The lead sub-form appears.
    const leadForm = await screen.findByRole("form", {
      name: "השארת פרטים ליצירת קשר",
    });
    expect(leadForm).toBeInTheDocument();

    // §7b commission disclosure is present (free-service lead phrase from legal.ts).
    expect(screen.getByText(/השירות חינמי עבורכם\./)).toBeInTheDocument();

    // The submit ("send details") button is disabled until consent is checked.
    const submit = screen.getByRole("button", { name: "שלחו פרטים" });
    expect(submit).toBeDisabled();

    // Fill name + phone, tick consent → enabled.
    await user.type(screen.getByPlaceholderText("שם מלא"), "ישראל ישראלי");
    await user.type(screen.getByPlaceholderText("מספר טלפון"), "050-123-4567");
    expect(submit).toBeDisabled(); // still disabled without consent

    const consent = screen.getByRole("checkbox");
    expect(consent).not.toBeChecked();
    await user.click(consent);
    expect(submit).toBeEnabled();
  });

  it("captures the lead with consent=true and fires the conversion once on success", async () => {
    const fetchMock = vi
      .fn()
      // 1) the chat turn that offers the lead
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: "בשמחה!", offerLead: true }),
      })
      // 2) the lead capture call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: "תודה!", leadCaptured: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AiConcierge />);
    await user.click(
      screen.getByRole("button", { name: "פתיחת צ׳אט עם חוסך AI" }),
    );
    await user.type(screen.getByLabelText("כתבו הודעה לחוסך AI"), "לעבור ספק");
    await user.click(screen.getByRole("button", { name: "שליחה" }));

    await screen.findByRole("form", { name: "השארת פרטים ליצירת קשר" });
    await user.type(screen.getByPlaceholderText("שם מלא"), "דנה כהן");
    await user.type(screen.getByPlaceholderText("מספר טלפון"), "0521234567");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "שלחו פרטים" }));

    // The lead capture call sent consent=true + the structured lead.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(
      (fetchMock.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(body.lead.consent).toBe(true);
    expect(body.lead.name).toBe("דנה כהן");

    // Conversion fires exactly once; confirmation appears; the form collapses.
    await waitFor(() => expect(fireLeadConversion).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/קיבלנו את הפרטים/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "השארת פרטים ליצירת קשר" }),
    ).not.toBeInTheDocument();
  });
});
