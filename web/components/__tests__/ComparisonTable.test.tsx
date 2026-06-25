// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — a native semantic comparison <table>. Tests cover the a11y
// structure (region label, <caption>, column + row headers), the ₪ price + after-
// promo rendering, and the HONESTY requirement: a featured/sponsored row is always
// VISIBLY labeled ("מקודם" / "בחירת העורך"), never covert.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
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

describe("ComparisonTable — always a clean semantic table (pillar-3)", () => {
  it("renders a real <table> with <caption>, <thead> and <tbody> in SSR even with no plans", () => {
    // Server-render to the raw HTML a crawler/LLM receives (no client JS).
    const html = renderToStaticMarkup(
      <ComparisonTable plans={[]} caption="השוואת סלולר" />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("<caption");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    // The body is never an empty skeleton — it carries a spanning placeholder row
    // (case-insensitive: the serializer may emit colSpan or colspan).
    expect(html).toContain("<td");
    expect(html).toMatch(/colspan="5"/i);
  });

  it("shows a branded empty-state row that spans all five columns when there are no plans", () => {
    render(<ComparisonTable plans={[]} caption="cap" />);

    // Five column headers are still present (the header is the schema for LLMs).
    for (const col of ["ספק", "מסלול", "מחיר", "מחיר אחרי מבצע", "מאפיינים"]) {
      expect(
        screen.getByRole("columnheader", { name: col }),
      ).toBeInTheDocument();
    }

    // The branded empty state (headline + broaden link) lives inside a single
    // spanning body cell, so the table stays well-formed for crawlers/LLMs.
    const headline = screen.getByText("אין התאמות כרגע");
    expect(headline).toBeInTheDocument();
    const cell = headline.closest("td");
    expect(cell).not.toBeNull();
    expect(cell).toHaveAttribute("colspan", "5");
    // A useful escape hatch (broaden / back-home link) is offered.
    expect(
      screen.getByRole("link", { name: "חזרה לדף הבית" }),
    ).toHaveAttribute("href", "/");
  });

  it("emits exactly one tbody row per plan (no empty-state row when populated)", () => {
    render(
      <ComparisonTable
        plans={[plan({ id: "a" }), plan({ id: "b", provider: "פרטנר" })]}
        caption="cap"
      />,
    );
    // Two data rows in the body + one header row in the thead = 3 total rows.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.queryByText("אין התאמות כרגע")).not.toBeInTheDocument();
  });

  it("renders a pulsing skeleton row grid (not an empty state) while loading", () => {
    const { container } = render(
      <ComparisonTable plans={[]} caption="cap" loading loadingRows={3} />,
    );

    // The five column headers stay (the table shape is stable, zero CLS).
    for (const col of ["ספק", "מסלול", "מחיר", "מחיר אחרי מבצע", "מאפיינים"]) {
      expect(
        screen.getByRole("columnheader", { name: col }),
      ).toBeInTheDocument();
    }
    // The empty state is suppressed while loading (no premature "no matches").
    expect(screen.queryByText("אין התאמות כרגע")).not.toBeInTheDocument();
    // Exactly `loadingRows` decorative skeleton rows in the body (aria-hidden so
    // screen-readers don't read placeholder noise; the host announces "loading").
    const skeletonRows = container.querySelectorAll(
      'tbody tr[aria-hidden="true"]',
    );
    expect(skeletonRows).toHaveLength(3);
    // Each skeleton mirrors the real layout: 5 body cells per row.
    expect(skeletonRows[0].querySelectorAll("td")).toHaveLength(5);
  });

  it("ignores `loading` once real plans have arrived", () => {
    render(
      <ComparisonTable plans={[plan({ id: "a" })]} caption="cap" loading />,
    );
    expect(
      screen.getByRole("rowheader", { name: /סלקום/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("אין התאמות כרגע")).not.toBeInTheDocument();
  });
});
