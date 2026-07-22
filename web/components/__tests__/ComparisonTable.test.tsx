// ────────────────────────────────────────────────────────────────────────────
// <ComparisonTable> — the RICH, category-aware comparison view. MOBILE-FIRST:
// a card per plan; lg+ a native semantic <table> whose columns adapt to the
// plans' category. Tests cover the a11y structure (region label, caption, the
// always-present base column headers + category-derived rich columns), the ₪
// price + honest post-promo rendering ("מחיר קבוע" when there is no jump, never
// a bare dash), the rich category fields, the perks line, and the HONESTY
// requirement: a featured/sponsored row is ALWAYS visibly labeled.
//
// NOTE: both the mobile cards and the desktop table render in the DOM under jsdom
// (the `lg:hidden` / `hidden lg:block` split is CSS-only, which jsdom does not
// apply), so a given plan's text appears TWICE. Assertions use getAllBy* /
// queryAllBy* where duplication across the two views is expected.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("exposes a labeled region, a caption, and the base column headers", () => {
    const caption = "השוואת סלולר — מחירים בשקלים";
    render(<ComparisonTable plans={[plan()]} caption={caption} />);

    // The desktop scroll wrapper is a region labeled by the caption text.
    const regions = screen.getAllByRole("region", { name: caption });
    expect(regions.length).toBeGreaterThanOrEqual(1);

    // The caption text is shown (mobile heading + sr-only table caption).
    expect(screen.getAllByText(caption).length).toBeGreaterThanOrEqual(1);

    // The base columns are always present in the desktop table head.
    for (const col of ["ספק", "מסלול", "מחיר", "מחיר אחרי תקופה", "עלות שירות ל־12 ח׳"]) {
      expect(
        screen.getByRole("columnheader", { name: col }),
      ).toBeInTheDocument();
    }
  });

  it("uses the provider name as the desktop row header (scope=row)", () => {
    render(
      <ComparisonTable plans={[plan({ provider: "פרטנר" })]} caption="cap" />,
    );
    expect(
      screen.getByRole("rowheader", { name: /פרטנר/ }),
    ).toBeInTheDocument();
  });
});

describe("ComparisonTable — category-aware rich columns", () => {
  it("derives the rich columns from the plans' category (cellular)", () => {
    render(
      <ComparisonTable
        plans={[
          plan({
            specs: { נתונים: "100GB", דקות: "ללא הגבלה" },
            fees: { "דמי חיבור": "אין" },
          }),
        ]}
        caption="cap"
      />,
    );
    // Cellular fields that have a value show as columns; absent ones do not.
    expect(screen.getByRole("columnheader", { name: "נפח" })).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "דקות/SMS" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "דמי חיבור" }),
    ).toBeInTheDocument();
  });

  it("shows internet fields (מהירות / נתב) and the value appears in the table", () => {
    render(
      <ComparisonTable
        plans={[
          plan({
            cat: "internet",
            specs: { מהירות: "עד 300/100" },
            fees: { נתב: "+₪19.9/ח׳" },
          }),
        ]}
        caption="cap"
      />,
    );
    expect(
      screen.getByRole("columnheader", { name: "מהירות" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "נתב" })).toBeInTheDocument();
    // Values render in both views → at least one occurrence each.
    expect(screen.getAllByText("עד 300/100").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("+₪19.9/ח׳").length).toBeGreaterThanOrEqual(1);
  });

  it("omits a rich column that is empty for every plan", () => {
    render(<ComparisonTable plans={[plan({ specs: {}, fees: {} })]} caption="cap" />);
    // No specs/fees → no rich columns at all, only the base ones.
    expect(screen.queryByRole("columnheader", { name: "נפח" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "מהירות" })).toBeNull();
  });
});

describe("ComparisonTable — price + honest post-promo rendering", () => {
  it("formats the price (exact-aware) and shows a real post-promo JUMP", () => {
    render(
      <ComparisonTable
        plans={[plan({ cat: "internet", price: 109, after: 196 })]}
        caption="cap"
      />,
    );
    // Price appears in both views.
    expect(screen.getAllByText("₪109").length).toBeGreaterThanOrEqual(1);
    // The jump price + suffix is shown (desktop table cell + mobile line).
    expect(screen.getAllByText("₪196/ח׳").length).toBeGreaterThanOrEqual(1);
  });

  it('shows "מחיר קבוע" (NOT a bare dash) when there is no after-promo jump', () => {
    render(<ComparisonTable plans={[plan({ after: null })]} caption="cap" />);
    // Honest fixed-price marker, present in both views.
    expect(screen.getAllByText("מחיר קבוע").length).toBeGreaterThanOrEqual(1);
  });

  it("prefers the exact advertised price", () => {
    render(
      <ComparisonTable plans={[plan({ price: 70, priceExact: 69.9 })]} caption="cap" />,
    );
    expect(screen.getAllByText("₪69.90").length).toBeGreaterThanOrEqual(1);
  });
});

describe("ComparisonTable — perks", () => {
  it("renders the qualitative perks line (filtered of raw spec tokens)", () => {
    render(
      <ComparisonTable
        plans={[plan({ feats: ["5G", "100GB גלישה", "נתיב מהיר"] })]}
        caption="cap"
      />,
    );
    // "נתיב מהיר" survives; the raw "100GB גלישה" / "5G" tokens are filtered out.
    expect(screen.getAllByText(/נתיב מהיר/).length).toBeGreaterThanOrEqual(1);
  });

  it("exposes full fine-print behind a 'פרטים מלאים' disclosure", () => {
    render(
      <ComparisonTable
        plans={[
          plan({
            feats: ["נתיב מהיר"],
            fineLines: ["חריגה 49 אג׳/דק׳", "מחיר רשמי: ₪69.9"],
          }),
        ]}
        caption="cap"
      />,
    );
    expect(screen.getByText("פרטים מלאים")).toBeInTheDocument();
    // The extra fine-line (not already in perks) is present in the disclosure.
    expect(screen.getByText("חריגה 49 אג׳/דק׳")).toBeInTheDocument();
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
    // The label appears in both the mobile card header and the desktop rowheader.
    expect(screen.getAllByText("מקודם").length).toBeGreaterThanOrEqual(1);
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

describe("ComparisonTable — shareable shortlist", () => {
  it("selects up to three plans and mirrors the choice into the URL", async () => {
    window.history.replaceState({}, "", "/compare/cellular");
    window.localStorage.clear();
    const user = userEvent.setup({ delay: null });
    render(
      <ComparisonTable
        plans={[
          plan({ id: "a", plan: "מסלול א" }),
          plan({ id: "b", provider: "פרטנר", plan: "מסלול ב" }),
        ]}
        caption="cap"
        interactiveFilters
        groupByProvider
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: /הוספת מסלול א של סלקום להשוואה/ })[0],
    );
    expect(screen.getByText("ההשוואה האישית שלכם")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("plans")).toBe("a");

    await user.click(
      screen.getAllByRole("button", { name: /הוספת מסלול ב של פרטנר להשוואה/ })[0],
    );
    expect(new URLSearchParams(window.location.search).get("plans")).toBe("a,b");
    expect(screen.getByRole("link", { name: "קבלת המלצה על הבחירה" })).toHaveAttribute(
      "href",
      "#lead",
    );
  });
});

describe("ComparisonTable — always a clean semantic table (pillar-3)", () => {
  it("renders a real <table> with <caption>, <thead> and <tbody> in SSR even with no plans", () => {
    const html = renderToStaticMarkup(
      <ComparisonTable plans={[]} caption="השוואת סלולר" />,
    );
    expect(html).toContain("<table");
    expect(html).toContain("<caption");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    // The body carries a spanning placeholder row (the base columns = 5).
    expect(html).toContain("<td");
    expect(html).toMatch(/colspan="5"/i);
  });

  it("shows a branded empty-state spanning all base columns when there are no plans", () => {
    render(<ComparisonTable plans={[]} caption="cap" />);

    // The base column headers are still present (the header is the LLM schema).
    for (const col of ["ספק", "מסלול", "מחיר", "מחיר אחרי תקופה"]) {
      expect(
        screen.getByRole("columnheader", { name: col }),
      ).toBeInTheDocument();
    }

    // The branded empty state renders (once per view → at least one).
    expect(
      screen.getAllByText("אין התאמות כרגע").length,
    ).toBeGreaterThanOrEqual(1);
    // The desktop empty cell spans the base columns.
    const cell = screen
      .getAllByText("אין התאמות כרגע")
      .map((el) => el.closest("td"))
      .find((td) => td != null);
    expect(cell).toHaveAttribute("colspan", "5");
    // A useful escape hatch (back-home link) is offered.
    expect(
      screen.getAllByRole("link", { name: "חזרה לדף הבית" })[0],
    ).toHaveAttribute("href", "/");
  });

  it("emits exactly one tbody <tr> per plan (no empty-state row when populated)", () => {
    render(
      <ComparisonTable
        plans={[plan({ id: "a" }), plan({ id: "b", provider: "פרטנר" })]}
        caption="cap"
      />,
    );
    // Two data rows in the body + one header row in the thead = 3 <tr> total.
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.queryByText("אין התאמות כרגע")).not.toBeInTheDocument();
  });

  it("renders a pulsing skeleton (not an empty state) while loading", () => {
    const { container } = render(
      <ComparisonTable plans={[]} caption="cap" loading loadingRows={3} />,
    );

    // The base column headers stay (stable table shape, zero CLS).
    for (const col of ["ספק", "מסלול", "מחיר", "מחיר אחרי תקופה"]) {
      expect(
        screen.getByRole("columnheader", { name: col }),
      ).toBeInTheDocument();
    }
    // The empty state is suppressed while loading.
    expect(screen.queryByText("אין התאמות כרגע")).not.toBeInTheDocument();
    // Exactly `loadingRows` decorative skeleton rows in the table body.
    const skeletonRows = container.querySelectorAll(
      'tbody tr[aria-hidden="true"]',
    );
    expect(skeletonRows).toHaveLength(3);
  });

  it("ignores `loading` once real plans have arrived", () => {
    render(<ComparisonTable plans={[plan({ id: "a" })]} caption="cap" loading />);
    expect(
      screen.getByRole("rowheader", { name: /סלקום/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("אין התאמות כרגע")).not.toBeInTheDocument();
  });
});
