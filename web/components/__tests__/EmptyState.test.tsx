// ────────────────────────────────────────────────────────────────────────────
// <EmptyState> — the reusable centered "nothing here yet" pattern (mirrors the
// Flutter app's EmptyState). Locked-down properties: the title + description
// render, the badge glyph is decorative (aria-hidden, never announced), and the
// optional CTA renders as a real link to the given destination only when given.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EmptyState from "@/components/EmptyState";

describe("EmptyState", () => {
  it("renders the title (as a heading) and the description", () => {
    render(
      <EmptyState
        icon="📷"
        title="עדיין לא העליתם חשבון"
        description="צלמו או העלו תמונה ברורה של החשבון החודשי."
      />,
    );
    expect(
      screen.getByRole("heading", { name: "עדיין לא העליתם חשבון" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("צלמו או העלו תמונה ברורה של החשבון החודשי."),
    ).toBeInTheDocument();
  });

  it("marks the badge glyph decorative (aria-hidden — not announced)", () => {
    const { container } = render(
      <EmptyState icon="📷" title="כותרת" description="תיאור" />,
    );
    const badge = container.querySelector('[aria-hidden="true"]');
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("📷");
  });

  it("renders an internal CTA as a link to the given route", () => {
    render(
      <EmptyState
        icon="🔍"
        title="אין תוצאות"
        description="נסו שוב"
        cta={{ label: "להשוואה ידנית", href: "/compare" }}
      />,
    );
    const link = screen.getByRole("link", { name: "להשוואה ידנית" });
    expect(link).toHaveAttribute("href", "/compare");
  });

  it("renders no CTA when none is provided", () => {
    render(<EmptyState icon="🔍" title="כותרת" description="תיאור" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("applies a caller-supplied className to the wrapper", () => {
    const { container } = render(
      <EmptyState icon="🔍" title="כותרת" description="תיאור" className="mt-8" />,
    );
    expect(container.firstElementChild).toHaveClass("mt-8");
  });
});
