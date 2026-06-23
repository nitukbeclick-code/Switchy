// ────────────────────────────────────────────────────────────────────────────
// <PriceCaveat> — Consumer Protection Law §17 price-accuracy caveat shown beside
// any comparison price/table. The load-bearing property: the visible note states
// prices are VAT-inclusive, accurate as of the update date, and must be verified
// with the provider before signing — sourced verbatim from lib/legal.ts (single
// source of truth), with the decorative ℹ️ glyph hidden from assistive tech.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PriceCaveat from "@/components/PriceCaveat";
import { PRICE_ACCURACY_CAVEAT } from "@/lib/legal";

describe("PriceCaveat", () => {
  it("renders the full §17 price-accuracy caveat copy verbatim", () => {
    const { container } = render(<PriceCaveat />);
    // The whole legal sentence must survive (VAT-inclusive + dated + verify).
    expect(container).toHaveTextContent(PRICE_ACCURACY_CAVEAT);

    // The three honest sub-claims, asserted individually so a partial drop fails.
    expect(container).toHaveTextContent("כוללים מע״מ");
    expect(container).toHaveTextContent("מדויקים נכון לתאריך העדכון");
    expect(container).toHaveTextContent("יש לאמת מול הספק לפני התקשרות");
  });

  it("marks the decorative info glyph aria-hidden (a11y — not announced)", () => {
    const { container } = render(<PriceCaveat />);
    const glyph = container.querySelector('[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveTextContent("ℹ️");
  });

  it("applies a caller-supplied className to the wrapper", () => {
    const { container } = render(<PriceCaveat className="mt-2" />);
    expect(container.firstElementChild).toHaveClass("mt-2");
  });
});
