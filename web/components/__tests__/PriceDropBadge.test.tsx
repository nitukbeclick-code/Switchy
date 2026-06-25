// ────────────────────────────────────────────────────────────────────────────
// <PriceDropBadge> — the honest "ירד ₪X השבוע" pill. Tests cover the HONESTY
// contract (renders NOTHING without a real drop, including the "known: no drop"
// null prop), the pre-resolved `drop` prop path (no fetch), the self-fetch path
// against a mocked /api/price-history, the fail-soft (fetch rejects → no badge),
// the a11y label, and the optional sparkline.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PriceDropBadge from "@/components/PriceDropBadge";
import type { PriceDrop, PricePoint } from "@/lib/price-history";

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString();

function drop(over: Partial<PriceDrop> = {}): PriceDrop {
  return {
    from: 120,
    to: 100,
    amount: 20,
    pct: 17,
    baselineAt: iso(7),
    latestAt: iso(0),
    ...over,
  };
}

describe("PriceDropBadge — honesty gate (pre-resolved prop)", () => {
  it("renders the honest weekly-drop pill when a real drop is provided", () => {
    render(<PriceDropBadge planId="cel_x" drop={drop()} />);
    expect(screen.getByText("ירד ₪20 השבוע")).toBeInTheDocument();
    expect(
      screen.getByLabelText("המחיר ירד ב-₪20 (17%) בשבוע האחרון"),
    ).toBeInTheDocument();
  });

  it("renders NOTHING when the drop prop is null (known: no drop)", () => {
    const { container } = render(<PriceDropBadge planId="cel_x" drop={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not fetch when a drop (or null) is provided", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<PriceDropBadge planId="cel_x" drop={null} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("PriceDropBadge — self-fetch path", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches /api/price-history and shows the badge for a real drop", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        plans: { cel_x: { planId: "cel_x", points: [], drop: drop() } },
        thresholds: { minAbs: 5, minPct: 10 },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PriceDropBadge planId="cel_x" />);

    await waitFor(() =>
      expect(screen.getByText("ירד ₪20 השבוע")).toBeInTheDocument(),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/price-history?plan_id=cel_x",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("shows nothing when the API reports no qualifying drop", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        plans: { cel_y: { planId: "cel_y", points: [], drop: null } },
        thresholds: { minAbs: 5, minPct: 10 },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<PriceDropBadge planId="cel_y" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(container.querySelector("[data-price-drop]")).toBeNull();
  });

  it("fails soft (renders nothing) when the fetch rejects", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchSpy);

    const { container } = render(<PriceDropBadge planId="cel_z" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(container.querySelector("[data-price-drop]")).toBeNull();
  });
});

describe("PriceDropBadge — sparkline", () => {
  it("renders a sparkline path when enabled with ≥2 points", () => {
    const points: PricePoint[] = [
      { price: 120, capturedAt: iso(7) },
      { price: 110, capturedAt: iso(3) },
      { price: 100, capturedAt: iso(0) },
    ];
    const { container } = render(
      <PriceDropBadge
        planId="cel_x"
        drop={drop()}
        points={points}
        sparkline
      />,
    );
    // Caret (always) + sparkline (extra) → at least two <path>s.
    const paths = container.querySelectorAll("svg path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("omits the sparkline when there are fewer than two points", () => {
    const { container } = render(
      <PriceDropBadge
        planId="cel_x"
        drop={drop()}
        points={[{ price: 100, capturedAt: iso(0) }]}
        sparkline
      />,
    );
    // Only the decorative caret path remains.
    expect(container.querySelectorAll("svg").length).toBe(1);
  });
});
