// ────────────────────────────────────────────────────────────────────────────
// <SavingsReveal> — the /bills before/after scrubber. We pin the HONEST money
// math (annual today = spend×12; after = today − saving; both from the SAME
// figures, nothing invented) and that every ₪ figure renders with he-IL thousands
// grouping — the single lib/format.ils the W3 consolidation unified on. No drag
// needed: the committed resting state is fully revealed, so the full saving shows.
//
// The `cta` slot gets its own coverage because its two invariants are structural
// and easy to break silently: it must sit OUTSIDE the role="slider" element (a
// button inside it would swallow the scrubber's pointer capture and arrow keys),
// and it must inherit the component's honesty gate — no real gap, no CTA.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SavingsReveal from "@/components/SavingsReveal";

describe("SavingsReveal — honest money math + grouped ₪", () => {
  it("derives annual now/after/saved from the same figures, grouped (he-IL)", () => {
    // spend 100 → annual today 1,200; saving 1,068 → after 132; saved 1,068.
    render(<SavingsReveal currentSpend={100} annualSaving={1068} />);
    expect(screen.getByText("₪1,200")).toBeInTheDocument(); // annual today, grouped
    expect(screen.getByText("₪132")).toBeInTheDocument(); //   annual after
    // Fully-revealed at rest → the full saving shows, grouped (guards the ils unify).
    expect(screen.getByText("₪1,068")).toBeInTheDocument();
  });
});

describe("SavingsReveal — the cta slot", () => {
  it("renders the CTA outside the slider so it cannot swallow scrub input", () => {
    render(
      <SavingsReveal
        currentSpend={100}
        annualSaving={1068}
        cta={<button type="button">סגרו לי את הפער</button>}
      />,
    );
    const cta = screen.getByRole("button", { name: "סגרו לי את הפער" });
    expect(cta).toBeInTheDocument();
    // Inside the same bento section, but NOT inside the ARIA slider.
    expect(screen.getByRole("slider")).not.toContainElement(cta);
  });

  it("renders no CTA when there is no real gap (the honesty gate wins)", () => {
    // annualSaving 0 → the whole component returns null, CTA included: an ask can
    // never end up next to a fabricated or absent figure.
    const { container } = render(
      <SavingsReveal
        currentSpend={100}
        annualSaving={0}
        cta={<button type="button">סגרו לי את הפער</button>}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole("button", { name: "סגרו לי את הפער" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing extra when no CTA is passed", () => {
    render(<SavingsReveal currentSpend={100} annualSaving={1068} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
