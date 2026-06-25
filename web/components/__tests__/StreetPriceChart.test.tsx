// ────────────────────────────────────────────────────────────────────────────
// <StreetPriceChart> — the honest street-price visualization. Properties under
// test:
//   • Every render carries the mandatory provenance label
//     ("מבוסס דיווחי משתמשים, לא מחירון רשמי").
//   • A PUBLISHED category renders its median figure + a screen-reader data table.
//   • A BELOW-THRESHOLD category renders an honest empty-state note and NO
//     fabricated price — the chart never parades a tiny sample.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StreetPriceChart from "@/components/StreetPriceChart";
import {
  normalizeAggregate,
  STREET_PRICE_DISCLAIMER,
  type StreetPriceAggregate,
} from "@/lib/street-price";

function published(): StreetPriceAggregate {
  return normalizeAggregate("cellular", {
    category: "cellular",
    report_count: 14,
    median_price: 49,
    avg_price: 55,
    min_price: 25,
    max_price: 120,
  });
}

function belowThreshold(): StreetPriceAggregate {
  return normalizeAggregate("internet", {
    category: "internet",
    report_count: 2,
    median_price: null,
  });
}

describe("<StreetPriceChart>", () => {
  it("always shows the mandatory provenance disclaimer", () => {
    render(<StreetPriceChart aggregates={[published()]} />);
    expect(screen.getByText(STREET_PRICE_DISCLAIMER)).toBeInTheDocument();
  });

  it("renders the median figure for a published category", () => {
    render(<StreetPriceChart aggregates={[published()]} />);
    // The median ₪49 appears in the visible card text.
    expect(screen.getAllByText(/₪49/).length).toBeGreaterThan(0);
    // A screen-reader data table mirrors the published figures.
    expect(
      screen.getByRole("table", { name: /מחיר הרחוב לפי דיווחי משתמשים/ }),
    ).toBeInTheDocument();
  });

  it("renders an honest empty-state for a below-threshold category, no median", () => {
    render(<StreetPriceChart aggregates={[belowThreshold()]} />);
    // The category label is present as the card heading...
    expect(
      screen.getByRole("heading", { name: "אינטרנט" }),
    ).toBeInTheDocument();
    // ...the honest "need more reports" note is shown...
    expect(screen.getByText(/צריך עוד|היו הראשונים/)).toBeInTheDocument();
    // ...and NO data table (nothing published) is rendered.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows published cards AND empty-state cards together", () => {
    render(
      <StreetPriceChart aggregates={[published(), belowThreshold()]} />,
    );
    // Each category appears as a visible card heading (the sr-only table also
    // lists published rows, so scope to the heading role to be unambiguous).
    expect(screen.getByRole("heading", { name: "סלולר" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "אינטרנט" })).toBeInTheDocument();
    // The published one still drives the data table.
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
