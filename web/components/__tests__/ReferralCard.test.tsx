// ────────────────────────────────────────────────────────────────────────────
// <ReferralCard> — the share-the-tool referral surface. The properties under test:
//   • It mints a code only ON DEMAND (a button press → POST /api/referral), then
//     renders the REAL SW-XXXXXX code + a shareable link.
//   • It never shows a fabricated reward — the copy is share-the-tool only.
//   • Copy + native-share use the platform APIs and announce success (aria-live).
//   • It fails soft: a bad/empty response shows an honest, retryable error.
// We mock fetch + navigator.clipboard so no network/DB is touched.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReferralCard from "@/components/ReferralCard";

const OK_BODY = {
  ok: true,
  code: "SW-7KQ4M9",
  link: "https://switchy-ai.com/?ref=SW-7KQ4M9",
  shareText: "מצאתי כלי חינמי… SW-7KQ4M9",
  persisted: true,
};

function mockFetchOk(body: unknown = OK_BODY) {
  const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReferralCard — issue + render", () => {
  it("renders share-the-tool framing with NO reward promise before issuing", () => {
    render(<ReferralCard />);
    const region = screen.getByRole("region", { name: "הזמינו חבר לחסוך" });
    expect(region).toBeInTheDocument();
    const text = region.textContent ?? "";
    // Honesty: no shekel figure / cash bonus offered anywhere in the card.
    expect(text).not.toMatch(/₪|בונוס/);
    // The disclaimer EXPLICITLY denies a reward program (the only place the words
    // "תגמול"/"תשלום" may appear is inside this negation).
    expect(screen.getByText(/לא תוכנית תגמול כספי/)).toBeInTheDocument();
    expect(screen.getByText(/לא מבטיחים תשלום/)).toBeInTheDocument();
  });

  it("issues a real code on click and shows it + the link", async () => {
    const fetchSpy = mockFetchOk();
    const user = userEvent.setup();
    render(<ReferralCard />);

    await user.click(screen.getByRole("button", { name: /קבלו קוד הזמנה/ }));

    await waitFor(() => expect(screen.getByText("SW-7KQ4M9")).toBeInTheDocument());
    // POSTed to the right endpoint with a JSON body.
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/referral",
      expect.objectContaining({ method: "POST" }),
    );
    // The shareable link is visible.
    expect(
      screen.getByText("https://switchy-ai.com/?ref=SW-7KQ4M9"),
    ).toBeInTheDocument();
    // The code is exposed with an accessible label.
    expect(
      screen.getByLabelText(/קוד ההזמנה שלכם: SW-7KQ4M9/),
    ).toBeInTheDocument();
  });

  it("copies the code to the clipboard and announces it", async () => {
    mockFetchOk();
    // userEvent.setup() installs its own in-memory clipboard on navigator; we read
    // it back to assert the copy, rather than spying on a stub it would overwrite.
    const user = userEvent.setup();
    render(<ReferralCard />);

    await user.click(screen.getByRole("button", { name: /קבלו קוד הזמנה/ }));
    await waitFor(() => screen.getByText("SW-7KQ4M9"));

    await user.click(screen.getByRole("button", { name: "העתקת הקוד" }));
    await waitFor(() =>
      expect(screen.getByText(/הקוד הועתק ללוח/)).toBeInTheDocument(),
    );
    expect(await navigator.clipboard.readText()).toBe("SW-7KQ4M9");
  });
});

describe("ReferralCard — fail-soft", () => {
  it("shows an honest, retryable error when the response is not ok", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => OK_BODY });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<ReferralCard />);

    await user.click(screen.getByRole("button", { name: /קבלו קוד הזמנה/ }));
    await waitFor(() =>
      expect(screen.getByText(/לא הצלחנו ליצור קוד/)).toBeInTheDocument(),
    );

    // Retry succeeds → the code appears.
    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    await waitFor(() => expect(screen.getByText("SW-7KQ4M9")).toBeInTheDocument());
  });

  it("rejects a malformed code in the response (treated as error)", async () => {
    mockFetchOk({ ok: true, code: "NOPE", link: "x", shareText: "y", persisted: false });
    const user = userEvent.setup();
    render(<ReferralCard />);

    await user.click(screen.getByRole("button", { name: /קבלו קוד הזמנה/ }));
    await waitFor(() =>
      expect(screen.getByText(/לא הצלחנו ליצור קוד/)).toBeInTheDocument(),
    );
  });
});
