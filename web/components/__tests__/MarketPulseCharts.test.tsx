// ────────────────────────────────────────────────────────────────────────────
// <MarketPulseCharts> — the SSR inline-SVG current-state market chart. Contract:
//   • HONESTY: it shows ONLY the real current snapshot ("מצב שוק נוכחי"), with an
//     explicit "no historical trend lines yet" note — never fabricated history.
//   • a11y (WCAG 1.1.1): the SVG is mirrored by a real sr-only data <table>
//     (caption + col headers + a row per category), and — because the chart has
//     focusable per-category bar-groups (role="button") — the SVG itself carries
//     role="group" with an aria-labelledby title/description (role="img" would
//     wrongly hide those interactive children).
//   • Every figure is the server-passed value (avg + min per category), and the
//     "cheapest deal" list links to the real category compare page.
//
// Pure server component (no client JS) — renders directly under jsdom.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MarketPulseCharts, {
  type MarketPulseCategory,
} from "@/components/MarketPulseCharts";

const DATA: MarketPulseCategory[] = [
  {
    category: "cellular",
    label: "סלולר",
    avg: 48,
    min: 19,
    max: 120,
    count: 64,
    cheapest: {
      plan: "מסלול חיסכון",
      provider: "סלקום",
      price: 19,
      href: "/compare/cellular",
    },
  },
  {
    category: "internet",
    label: "אינטרנט",
    avg: 99,
    min: 70,
    max: 160,
    count: 22,
    cheapest: {
      plan: "סיב 100",
      provider: "בזק",
      price: 70,
      href: "/compare/internet",
    },
  },
];

describe("MarketPulseCharts — honesty (current state, no fabricated history)", () => {
  it("labels the snapshot as current and states there are no historical trend lines", () => {
    render(<MarketPulseCharts data={DATA} />);
    expect(screen.getByText("מצב שוק נוכחי")).toBeInTheDocument();
    // The honest disclaimer: no price-history trend lines have been accrued yet.
    expect(
      screen.getByText(/ללא קווי מגמה היסטוריים/),
    ).toBeInTheDocument();
  });
});

describe("MarketPulseCharts — a11y data table mirrors the SVG", () => {
  it("exposes a captioned data table with the three column headers", () => {
    render(<MarketPulseCharts data={DATA} />);
    const table = screen.getByRole("table", {
      name: "מחיר ממוצע והמחיר הזול ביותר בכל קטגוריה, בשקלים",
    });
    const scoped = within(table);

    expect(
      scoped.getByRole("columnheader", { name: "קטגוריה" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("columnheader", { name: "מחיר ממוצע" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("columnheader", { name: "המחיר הזול ביותר" }),
    ).toBeInTheDocument();
  });

  it("renders a real row per category carrying the server-passed avg + min", () => {
    render(<MarketPulseCharts data={DATA} />);
    const table = screen.getByRole("table", {
      name: "מחיר ממוצע והמחיר הזול ביותר בכל קטגוריה, בשקלים",
    });

    // Each category is a row header (scope="row").
    const cellularRow = within(table)
      .getByRole("rowheader", { name: "סלולר" })
      .closest("tr") as HTMLTableRowElement;
    expect(within(cellularRow).getByText("₪48")).toBeInTheDocument(); // avg
    expect(within(cellularRow).getByText("₪19")).toBeInTheDocument(); // min

    const internetRow = within(table)
      .getByRole("rowheader", { name: "אינטרנט" })
      .closest("tr") as HTMLTableRowElement;
    expect(within(internetRow).getByText("₪99")).toBeInTheDocument(); // avg
    expect(within(internetRow).getByText("₪70")).toBeInTheDocument(); // min
  });

  it("gives the chart an accessible group role with a name + description", () => {
    render(<MarketPulseCharts data={DATA} />);
    // role="group" (not "img"): the chart contains focusable role="button" bar-
    // groups, so it must expose — not hide — its interactive children.
    const chart = screen.getByRole("group", {
      name: /מחיר ממוצע מול המחיר הזול ביותר בכל קטגוריה/,
    });
    expect(chart.tagName.toLowerCase()).toBe("svg");
    // aria-labelledby points at BOTH the title and the longer description node.
    expect(chart).toHaveAttribute(
      "aria-labelledby",
      "market-pulse-chart-title market-pulse-chart-desc",
    );
  });
});

describe("MarketPulseCharts — cheapest deal per category", () => {
  it("links each cheapest deal to its real category compare page", () => {
    render(<MarketPulseCharts data={DATA} />);

    const cellularDeal = screen.getByRole("link", {
      name: /סלקום — מסלול חיסכון/,
    });
    expect(cellularDeal).toHaveAttribute("href", "/compare/cellular");
    expect(within(cellularDeal).getByText("₪19")).toBeInTheDocument();

    const internetDeal = screen.getByRole("link", { name: /בזק — סיב 100/ });
    expect(internetDeal).toHaveAttribute("href", "/compare/internet");
  });

  it("omits a category from the cheapest-deal list when it has no deal", () => {
    render(
      <MarketPulseCharts
        data={[
          {
            category: "tv",
            label: "טלוויזיה",
            avg: 40,
            min: 30,
            max: 60,
            count: 5,
            cheapest: null,
          },
        ]}
      />,
    );
    // No deal link should be rendered for the null-cheapest category.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
