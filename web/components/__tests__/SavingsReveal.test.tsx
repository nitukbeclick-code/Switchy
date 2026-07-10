// ────────────────────────────────────────────────────────────────────────────
// <SavingsReveal> — the /bills before/after scrubber. We pin the HONEST money
// math (annual today = spend×12; after = today − saving; both from the SAME
// figures, nothing invented) and that every ₪ figure renders with he-IL thousands
// grouping — the single lib/format.ils the W3 consolidation unified on. No drag
// needed: the committed resting state is fully revealed, so the full saving shows.
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
