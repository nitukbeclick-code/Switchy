// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — a native semantic comparison <table>. Tests cover the a11y
// structure (region label, <caption>, column + row headers), the ₪ price + after-
// promo rendering, and the HONESTY requirement: a featured/sponsored row is always
// VISIBLY labeled ("מקודם" / "בחירת העורך"), never covert.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ComparisonTable from "@/components/ComparisonTable";
import type { Plan } from "@/lib/types";

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    cat: "cellular",
    provider: "סלקום",
    plan: "מסלול בסיס",
    price: 50,
    after: null,
    is5G: false,
    noCommit: false,
    hasAbroad: false,
    ...overrides,
  };
}

describe("ComparisonTable — semantics & a11y", () => {
  it("exposes a labeled scroll region, a caption, and the five column headers", () => {
    const caption = "השוואת סלולר — מחירים בשקלים";
    render(<ComparisonTable plans={[plan()]} caption={caption} />);

    // The focusable scroll wrapper is a region labeled by the caption text.
    const region = screen.getByRole("region", { name: caption });
    expect(region).toHaveAttribute("tabindex", "0");

    // Visible <caption> with the same text.
    expect(screen.getByText(caption)).toBeInTheDocument();

    for (const col of ["ספק", "מסלול", "מחיר", "מחיר אחרי מבצע", "מאפיינים"]) {
      expect(screen.getByRole("columnheader", { name: col })).toBeInTheDocument();
    }
  });

  it("uses the provider name as the row header (scope=row)", () => {
    render(
      <ComparisonTable
        plans={[plan({ provider: "פרטנר" })]}
        caption="cap"
      />,
    );
    expect(
      screen.getByRole("rowheader", { name: /פרטנר/ }),
    ).toBeInTheDocument();
  });
});

describe("ComparisonTable — price rendering", () => {
  it("formats integer and fractional prices and shows the after-promo price", () => {
    render(
      <ComparisonTable
        plans={[plan({ price: 69.9, after: 99 })]}
        caption="cap"
      />,
    );
    expect(screen.getByText("₪69.9")).toBeInTheDocument();
    expect(screen.getByText("₪99")).toBeInTheDocument();
  });

  it("renders a dash with an accessible label when there is no after-promo price", () => {
    render(<ComparisonTable plans={[plan({ after: null })]} caption="cap" />);
    expect(screen.getByLabelText("ללא שינוי מחיר")).toBeInTheDocument();
  });
});

describe("ComparisonTable — honesty labels", () => {
  it("renders a visible 'מקודם' badge on a promoted row", () => {
    render(
      <ComparisonTable
        plans={[plan({ id: "promo1" })]}
        caption="cap"
        featured={{ promo1: "promoted" }}
      />,
    );
    const rowHeader = screen.getByRole("rowheader");
    expect(within(rowHeader).getByText("מקודם")).toBeInTheDocument();
  });

  it("renders a visible 'בחירת העורך' badge on an editor's-pick row", () => {
    render(
      <ComparisonTable
        plans={[plan({ id: "ed1" })]}
        caption="cap"
        featured={{ ed1: "editor" }}
      />,
    );
    const rowHeader = screen.getByRole("rowheader");
    expect(within(rowHeader).getByText("בחירת העורך")).toBeInTheDocument();
  });

  it("shows NO editorial badge when the plan is not in the featured map", () => {
    render(<ComparisonTable plans={[plan({ id: "plain" })]} caption="cap" />);
    expect(screen.queryByText("מקודם")).not.toBeInTheDocument();
    expect(screen.queryByText("בחירת העורך")).not.toBeInTheDocument();
  });
});

describe("ComparisonTable — feature tags", () => {
  it("renders 5G / ללא התחייבות / כולל חו״ל chips only for the matching flags", () => {
    render(
      <ComparisonTable
        plans={[plan({ is5G: true, noCommit: true, hasAbroad: false })]}
        caption="cap"
      />,
    );
    expect(screen.getByText("5G")).toBeInTheDocument();
    expect(screen.getByText("ללא התחייבות")).toBeInTheDocument();
    expect(screen.queryByText("כולל חו״ל")).not.toBeInTheDocument();
  });
});
