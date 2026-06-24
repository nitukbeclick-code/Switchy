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
// real canvas, so compressImage() falls back to the original data-URL (covered).
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
// pre-selected category, without pulling in LeadForm's multi-step internals.
vi.mock("@/components/LeadForm", () => ({
  default: ({ source, defaultCategory }: { source: string; defaultCategory?: string }) => (
    <div data-testid="lead-form" data-source={source} data-category={defaultCategory ?? ""}>
      lead form stub
    </div>
  ),
}));

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
// microtask after `src` is assigned. compressImage then runs its real path —
// canvas.getContext("2d") is null in jsdom, so it falls back to the original
// data-URL (exactly the path the suite intends to exercise).
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
    // No hand-off lead form on an unreadable read.
    expect(screen.queryByTestId("lead-form")).not.toBeInTheDocument();
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
