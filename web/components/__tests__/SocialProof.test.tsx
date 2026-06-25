// ────────────────────────────────────────────────────────────────────────────
// <SocialProof> — the HONEST aggregate social-proof block. The single most
// important property to lock down is honesty: it renders NOTHING below the publish
// threshold (or a neutral, claim-free fallback when opted in), and when published
// it shows ONLY the real aggregate it was given. These tests cover the
// pre-resolved `summary` prop path (no fetch), the self-fetch path against a
// mocked /api/wallet-stats, the fail-soft, and the neutral fallback.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SocialProof from "@/components/SocialProof";
import {
  summarizeStats,
  EMPTY_RAW_STATS,
  SOCIAL_PROOF_MIN_MEMBERS,
  type RawSavingsStats,
} from "@/lib/wallet-stats";

function summary(over: Partial<RawSavingsStats> = {}) {
  return summarizeStats({ ...EMPTY_RAW_STATS, ...over });
}

const PUBLISHED = summary({
  members: SOCIAL_PROOF_MIN_MEMBERS + 95, // 120
  totalSaving: 100800,
  avgSaving: 900,
  medianSaving: 840,
});

describe("SocialProof — honesty gate (pre-resolved prop)", () => {
  it("renders the real aggregate when a published summary is provided", () => {
    render(<SocialProof summary={PUBLISHED} />);
    const section = screen.getByRole("region", { name: "חיסכון אמיתי שדווח" });
    expect(section).toBeInTheDocument();
    // Real figures, never fabricated.
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("₪840")).toBeInTheDocument();
    expect(screen.getByText("₪100,800")).toBeInTheDocument();
    // Framed as based-on-report, not a promise.
    expect(screen.getByText(/מבוסס דיווח/)).toBeInTheDocument();
  });

  it("renders NOTHING below the threshold (default fallback)", () => {
    const { container } = render(
      <SocialProof summary={summary({ members: 3, medianSaving: 800 })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("does not fetch when a summary is provided", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<SocialProof summary={summary({ members: 1 })} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("renders the neutral, claim-free fallback below threshold when opted in", () => {
    render(<SocialProof summary={summary({ members: 2 })} fallback="neutral" />);
    const region = screen.getByRole("region", { name: "על השירות" });
    expect(region).toBeInTheDocument();
    // The fallback must carry NO fabricated number.
    expect(region.textContent ?? "").not.toMatch(/\d/);
    expect(
      screen.getByRole("link", { name: /איך אנחנו מודדים/ }),
    ).toHaveAttribute("href", "/transparency");
  });
});

describe("SocialProof — self-fetch path", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches /api/wallet-stats and renders a published aggregate", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, summary: PUBLISHED }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<SocialProof />);
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "חיסכון אמיתי שדווח" }),
      ).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/wallet-stats",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("renders nothing when the API reports an unpublished summary", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, summary: summary({ members: 4 }) }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<SocialProof />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(container.querySelector("[data-social-proof]")).toBeNull();
  });

  it("fails soft (renders nothing) when the fetch rejects", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<SocialProof />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(container.querySelector("[data-social-proof]")).toBeNull();
  });
});
