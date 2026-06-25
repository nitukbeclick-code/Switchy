// ────────────────────────────────────────────────────────────────────────────
// <SkeletonCard> — the loading placeholder that mirrors the `.card` shape. Locked
// properties: it carries the `.card` class (so it matches the real card), the
// pulse is `animate-pulse` but reduced-motion-safe (`motion-reduce:animate-none`),
// the whole block is decorative (aria-hidden — the host announces loading), and
// the body-line count is configurable.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SkeletonCard from "@/components/SkeletonCard";

describe("SkeletonCard", () => {
  it("renders a card-shaped wrapper that is hidden from assistive tech", () => {
    const { container } = render(<SkeletonCard />);
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveClass("card");
    expect(card).toHaveAttribute("aria-hidden", "true");
  });

  it("pulses but respects reduced motion", () => {
    const { container } = render(<SkeletonCard />);
    const pulse = container.querySelector(".animate-pulse");
    expect(pulse).not.toBeNull();
    expect(pulse).toHaveClass("motion-reduce:animate-none");
  });

  it("renders the requested number of body lines (plus the title bar)", () => {
    const { container } = render(<SkeletonCard lines={4} />);
    // Title bar (1) + 4 body lines = 5 grey bars.
    const bars = container.querySelectorAll(".bg-border");
    expect(bars.length).toBe(5);
  });

  it("clamps to at least one body line", () => {
    const { container } = render(<SkeletonCard lines={0} />);
    // Title bar (1) + 1 clamped body line = 2 grey bars.
    const bars = container.querySelectorAll(".bg-border");
    expect(bars.length).toBe(2);
  });

  it("applies a caller-supplied className to the card wrapper", () => {
    const { container } = render(<SkeletonCard className="mt-8" />);
    expect(container.firstElementChild).toHaveClass("mt-8");
  });
});
