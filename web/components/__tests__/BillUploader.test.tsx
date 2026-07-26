// ────────────────────────────────────────────────────────────────────────────
// <BillUploader> — the /bills client surface. We assert BEHAVIOUR + HONESTY:
//   • the privacy note ("נשלחת ל…Google … ואינה נשמרת") is always present,
//   • picking a file POSTs to /api/analyze-bill and, on a readable result,
//     renders the extracted provider/spend/category, the REAL cheaper plans with
//     their saving, the OCR-confidence + verify disclaimer, and the hand-off,
//   • an UNREADABLE 200 result shows the friendly "could not read" state, not a
//     fabricated saving,
//   • a hard error surfaces a retry affordance.
//
// fetch + tracking are mocked at the module boundary. <LeadForm> is stubbed so the
// test focuses on the uploader contract (LeadForm has its own test). jsdom has no
// drawing backend, so vitest.setup.ts stubs canvas getContext/toDataURL and the
// compress path runs for real (no "Not implemented" noise).
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BillUploader from "@/components/BillUploader";

// Mock tracking so no GA4 / Meta Pixel side effects fire.
vi.mock("@/lib/tracking", () => ({
  trackEvent: vi.fn(),
  fireLeadConversion: vi.fn(),
}));

// Stub LeadForm to a marker so we can assert the hand-off renders + carries the
// pre-selected category, the real catalogue counts and the factual context note,
// without pulling in LeadForm's multi-step internals.
vi.mock("@/components/LeadForm", () => ({
  default: ({
    source,
    defaultCategory,
    trustStats,
    contextNote,
  }: {
    source: string;
    defaultCategory?: string;
    trustStats?: { planCount: number; providerCount: number };
    contextNote?: string;
  }) => (
    <div
      data-testid="lead-form"
      data-source={source}
      data-category={defaultCategory ?? ""}
      data-plan-count={trustStats?.planCount ?? ""}
      data-context-note={contextNote ?? ""}
    >
      lead form stub
    </div>
  ),
}));

// <SocialProof> fetches /api/wallet-stats on mount; the uploader's tests stub a
// single global fetch for /api/analyze-bill, so stub the component out and let its
// own test own the honesty gate.
vi.mock("@/components/SocialProof", () => ({ default: () => null }));

/** Build a fake image File. */
function imageFile(name = "bill.jpg", type = "image/jpeg"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type });
}

function mockFetchJson(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// jsdom's HTMLImageElement never fires load/error when `src` is set, so
// compressImage()'s `await loadImage(...)` would hang forever and the upload
// would never reach fetch. Stub Image with one that fires `onload` on the next
// microtask after `src` is assigned. compressImage then runs its real canvas
// path end-to-end: vitest.setup.ts stubs getContext("2d")/toDataURL (jsdom has
// no drawing backend), so the scaled-draw + JPEG-encode branch executes without
// the "Not implemented" console noise.
let OriginalImage: typeof Image;
beforeEach(() => {
  OriginalImage = globalThis.Image;
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = 100;
    height = 100;
    #src = "";
    get src() {
      return this.#src;
    }
    set src(value: string) {
      this.#src = value;
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", MockImage as unknown as typeof Image);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.Image = OriginalImage;
});

describe("BillUploader — privacy + a11y baseline", () => {
  it("always shows the privacy note (photo sent to Google, not stored)", () => {
    render(<BillUploader />);
    expect(
      screen.getByText(/אינה נשמרת/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Google/)).toBeInTheDocument();
  });

  it("tells the truth about the hand-off: the read's summary is attached to a lead", () => {
    render(<BillUploader />);
    // The summary is passed to <LeadForm> as `contextNote` and stored beside the
    // visitor's name, phone and city — so it must not be described as anonymous…
    expect(screen.queryByText(/סיכום אנונימי/)).not.toBeInTheDocument();
    // …and the note must say where it goes, conditionally on the visitor's own
    // choice to leave details.
    expect(
      screen.getByText(/הסיכום הזה יצורף לפנייה שלכם/),
    ).toBeInTheDocument();
    expect(screen.getByText(/מניעת שימוש לרעה/)).toBeInTheDocument();
  });

  it("labels the file input", () => {
    render(<BillUploader />);
    // The label text is associated with the input via htmlFor/id.
    expect(screen.getByText("צלמו או העלו את החשבון")).toBeInTheDocument();
    const input = document.getElementById("bill-file") as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.type).toBe("file");
  });
});

describe("BillUploader — readable result", () => {
  it("renders the extracted summary, real cheaper plans, the disclaimer, and the hand-off", async () => {
    const fetchMock = mockFetchJson({
      provider: "סלקום",
      currentSpend: 120,
      category: "cellular",
      confidence: 0.9,
      warnings: [],
      annualSaving: 852,
      note: "מצאנו 1 מסלולים זולים יותר.",
      suggestions: [
        { id: "a", name: "מסלול חוסך", provider: "פרטנר", price: 49, annualSaving: 852 },
      ],
    });

    const user = userEvent.setup();
    render(<BillUploader />);

    const input = document.getElementById("bill-file") as HTMLInputElement;
    await user.upload(input, imageFile());

    // The route is called exactly once with our endpoint.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/analyze-bill");

    // Extracted facts.
    expect(await screen.findByText("מה קראנו מהחשבון")).toBeInTheDocument();
    expect(screen.getByText("סלקום")).toBeInTheDocument();
    expect(screen.getByText("₪120")).toBeInTheDocument();
    expect(screen.getByText("סלולר")).toBeInTheDocument();

    // Real cheaper plan + its saving. The figure now appears in BOTH the deepened
    // forensics "best alternative" card and the cheaper-plans list, so assert it is
    // present (≥1) rather than uniquely once.
    expect(screen.getByText("מסלול חוסך")).toBeInTheDocument();
    expect(screen.getAllByText("פרטנר").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/חיסכון ₪852 בשנה/).length).toBeGreaterThan(0);

    // Honest OCR disclaimer.
    expect(screen.getByText(/הקריאה אוטומטית ועשויה לטעות/)).toBeInTheDocument();

    // Hand-off LeadForm, with the category pre-selected from the read.
    const lead = screen.getByTestId("lead-form");
    expect(lead).toHaveAttribute("data-source", "bill-analyzer");
    expect(lead).toHaveAttribute("data-category", "cellular");

    // The CRM note carries ONLY figures already on screen — the read provider,
    // what they pay today, the real annual gap and the surfaced plan.
    const note = lead.getAttribute("data-context-note") ?? "";
    expect(note).toContain("סלקום");
    expect(note).toContain("₪120");
    expect(note).toContain("₪852");
    expect(note).toContain("מסלול חוסך");

    // The hand-off is the shared #lead anchor: the scrubber CTA and StickyLeadCta
    // both scroll here, so losing the id silently breaks both.
    expect(document.getElementById("lead")).toContainElement(lead);
  });

  it("scrolls the scrubber's CTA to the lead form, honouring reduced-motion", async () => {
    mockFetchJson({
      provider: "סלקום",
      currentSpend: 120,
      category: "cellular",
      confidence: 0.9,
      warnings: [],
      annualSaving: 852,
      suggestions: [
        { id: "a", name: "מסלול חוסך", provider: "פרטנר", price: 49, annualSaving: 852 },
      ],
    });
    // jsdom implements neither scrollIntoView nor a real matchMedia result.
    // Restore the prototype by hand — vi.restoreAllMocks() does not undo a direct
    // prototype assignment, and leaking it would poison later tests in this file.
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia,
    );

    const user = userEvent.setup();
    render(<BillUploader />);
    await user.upload(document.getElementById("bill-file") as HTMLInputElement, imageFile());

    const cta = await screen.findByRole("button", {
      name: /רוצים שנסגור לכם את הפער/,
    });
    await user.click(cta);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // prefers-reduced-motion: reduce ⇒ jump, never a smooth travel.
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ behavior: "auto" });

    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("passes the REAL catalogue counts through to the hand-off form", async () => {
    mockFetchJson({
      provider: "סלקום",
      currentSpend: 120,
      category: "cellular",
      confidence: 0.9,
      warnings: [],
      annualSaving: 852,
      suggestions: [
        { id: "a", name: "מסלול חוסך", provider: "פרטנר", price: 49, annualSaving: 852 },
      ],
    });

    const user = userEvent.setup();
    render(<BillUploader trustStats={{ planCount: 240, providerCount: 17 }} />);
    await user.upload(document.getElementById("bill-file") as HTMLInputElement, imageFile());

    expect(await screen.findByTestId("lead-form")).toHaveAttribute(
      "data-plan-count",
      "240",
    );
  });

  it("shows an honest 'no cheaper plan' note when there are no suggestions", async () => {
    mockFetchJson({
      provider: "HOT",
      currentSpend: 35,
      category: "tv",
      confidence: 0.8,
      warnings: [],
      annualSaving: 0,
      note: "לא מצאנו מסלול זול יותר באותה קטגוריה — נראה שאתם משלמים מחיר טוב.",
      suggestions: [],
    });

    const user = userEvent.setup();
    render(<BillUploader />);
    await user.upload(document.getElementById("bill-file") as HTMLInputElement, imageFile());

    expect(
      await screen.findByText(/לא מצאנו מסלול זול יותר/),
    ).toBeInTheDocument();
    // No fabricated saving figure.
    expect(screen.queryByText(/חיסכון שנתי של עד/)).not.toBeInTheDocument();
  });
});

describe("BillUploader — unreadable + error", () => {
  it("shows the friendly 'could not read' state on an unreadable 200 result", async () => {
    mockFetchJson({
      provider: "",
      currentSpend: 0,
      category: "",
      confidence: 0.1,
      warnings: ["התמונה מטושטשת"],
      annualSaving: 0,
      suggestions: [],
      error: "לא הצלחנו לקרוא את החשבון מהתמונה.",
    });

    const user = userEvent.setup();
    render(<BillUploader />);
    await user.upload(document.getElementById("bill-file") as HTMLInputElement, imageFile());

    expect(await screen.findByText("לא הצלחנו לקרוא את החשבון")).toBeInTheDocument();
    expect(screen.getByText("התמונה מטושטשת")).toBeInTheDocument();
    // A failed OCR must NOT dead-end: a manual lead hand-off is offered so the
    // user can still leave details and get help switching.
    expect(screen.getByTestId("lead-form")).toBeInTheDocument();
  });

  it("surfaces a retry affordance on a hard error response", async () => {
    mockFetchJson({ error: "אירעה שגיאה בניתוח החשבון. נסו שוב בעוד רגע." }, 500);

    const user = userEvent.setup();
    render(<BillUploader />);
    await user.upload(document.getElementById("bill-file") as HTMLInputElement, imageFile());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "נסו שוב" })).toBeInTheDocument();
  });
});
