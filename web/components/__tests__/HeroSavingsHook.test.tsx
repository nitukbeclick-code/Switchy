// ────────────────────────────────────────────────────────────────────────────
// <HeroSavingsHook> — the homepage fold's one bold moment. What has to be true
// here is HONESTY, not layout: the component may show a ₪ figure ONLY when the
// visitor typed a real number AND the arithmetic against the REAL catalogue floor
// yields a positive difference. These tests pin all three states — empty, ≤ 0,
// and a real difference — plus the arithmetic itself, which must stay identical
// to WalletClient's annualSaving (`max(0, round((bill − price) × 12))`) so the
// two surfaces can never quote the same visitor two different numbers.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import HeroSavingsHook, { annualDifference } from "@/components/HeroSavingsHook";

/** The REAL-catalogue-shaped props the server page passes down. */
const PROPS = {
  categoryLabel: "סלולר",
  cheapestPrice: 39,
  cheapestPlan: "Talk 100GB",
  cheapestProvider: "סלקום",
  cheapestPriceText: "38.90",
  compareHref: "/compare/cellular",
};

/** Type a bill and commit it the way a phone user does — by leaving the field. */
function enterBill(value: string) {
  const field = screen.getByLabelText(/כמה אתם משלמים היום/);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe("HeroSavingsHook — truth-only annual difference", () => {
  it("shows nothing but the input until a number is entered", () => {
    const { container } = render(<HeroSavingsHook {...PROPS} />);
    expect(screen.getByLabelText(/כמה אתם משלמים היום/)).toBeInTheDocument();
    // No figure, no estimate wording, no ask — nothing has been claimed yet.
    expect(container.querySelector(".price-hero")).toBeNull();
    expect(screen.queryByText(/הפרש שנתי משוער/)).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("renders ONE amber figure from (bill − cheapest) × 12 with the real plan named", () => {
    const { container } = render(<HeroSavingsHook {...PROPS} />);
    enterBill("240"); // (240 − 39) × 12 = 2,412

    // Exactly one money moment on the fold, carrying the amber VALUE token.
    const figures = container.querySelectorAll(".price-hero");
    expect(figures).toHaveLength(1);
    expect(figures[0]).toHaveTextContent("₪2,412");
    expect(figures[0].className).toContain("text-value-text");
    // …and it is spelled out as one phrase for assistive tech.
    expect(screen.getByText("הפרש שנתי משוער: ₪2,412 בשנה.")).toBeInTheDocument();

    // Labelled an ESTIMATE based on the amount entered, never a promise.
    expect(
      screen.getByText(/הפרש שנתי משוער לפי הסכום שהזנתם/),
    ).toBeInTheDocument();
    // The comparison is named, and quotes the EXACT advertised price (₪38.90),
    // never a rounded-up figure.
    expect(screen.getByText(/סלקום — Talk 100GB/)).toBeInTheDocument();
    expect(screen.getByText(/₪38\.90 לחודש/)).toBeInTheDocument();

    // The ask that comes with the figure: the on-page consent-gated lead form.
    expect(
      screen.getByRole("link", { name: /בדקו לי את החיסכון בפועל/ }),
    ).toHaveAttribute("href", "#lead");
    expect(
      screen.getByRole("link", { name: /או ראו את המסלולים עצמם/ }),
    ).toHaveAttribute("href", "/compare/cellular");
  });

  it("renders NO figure when the difference is ≤ 0 — only the honest line", () => {
    const { container } = render(<HeroSavingsHook {...PROPS} />);
    enterBill("30"); // already below the ₪39 catalogue floor → difference 0

    expect(container.querySelector(".price-hero")).toBeNull();
    expect(screen.queryByText(/הפרש שנתי משוער/)).toBeNull();
    expect(
      screen.getByText(/אתם כבר משלמים פחות מהמסלול הזול ביותר/),
    ).toBeInTheDocument();
    // No fabricated win means no ask attached to one.
    expect(screen.queryByRole("link", { name: /החיסכון בפועל/ })).toBeNull();
  });

  it("dresses the figure in the SHARED money classes, never a local one-off", () => {
    // The flagship has to eat the design system it exists to showcase. It once
    // hardcoded `align-super text-[0.42em]` (no colour → an amber ₪ where every
    // other ₪ on the site is muted) and `tracking-[0.18em]` (a third value for
    // the one micro-label role). Both are now the shared classes from
    // globals.css, so a tier tweak reaches the hero and the table together.
    const { container } = render(<HeroSavingsHook {...PROPS} />);
    enterBill("240");

    const figure = container.querySelector(".price-hero") as HTMLElement;
    expect(within(figure).getByText("₪")).toHaveClass("price-sign");
    expect(container.querySelectorAll(".price-unit")).toHaveLength(1);
    expect(screen.getByText("לשנה")).toHaveClass("price-unit");

    // No arbitrary-value type utilities anywhere in the money block.
    expect(figure.outerHTML).not.toMatch(/text-\[|tracking-\[|align-super/);
    expect(
      (screen.getByText("לשנה") as HTMLElement).className,
    ).not.toMatch(/text-\[|tracking-\[/);
  });

  it("never uses the repeated ROW rank — the fold is the one hero figure", () => {
    // .price-row is for figures that repeat (table rows, plan cards). If the
    // hero ever downgraded to it, the page would have no money moment at all.
    const { container } = render(<HeroSavingsHook {...PROPS} />);
    enterBill("240");
    expect(container.querySelector(".price-row")).toBeNull();
  });

  it("clamps at zero and mirrors WalletClient's annualSaving arithmetic", () => {
    // Positive gap, rounded like the shipped contract.
    expect(annualDifference(100, 39)).toBe(732);
    // Equal / lower bill → clamped to 0, never negative.
    expect(annualDifference(39, 39)).toBe(0);
    expect(annualDifference(10, 39)).toBe(0);
    // No bill (or a non-finite one) is not a saving of anything.
    expect(annualDifference(0, 39)).toBe(0);
    expect(annualDifference(Number.NaN, 39)).toBe(0);
    // A decimal catalogue floor rounds on the ANNUAL figure, as WalletClient does.
    expect(annualDifference(100, 38.9)).toBe(733);
  });
});
