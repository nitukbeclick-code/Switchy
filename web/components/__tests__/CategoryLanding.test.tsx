// ────────────────────────────────────────────────────────────────────────────
// <CategoryLanding> — the shared section behind all 23 category landings. These
// tests pin the FUNNEL properties added by the guide/category conversion wave:
// every category landing must carry an in-page lead capture (id="lead") right
// under the prices, pre-scoped to its own category, plus the mobile sticky bar
// back to it. Before that wave these pages' only exits were links away from the
// sale, so a silent regression here re-opens the biggest hole in the funnel.
//
// Also pinned: the trust line's counts are RENDERED ONLY when the host page
// supplies real catalogue totals — the component must never invent a number.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CategoryLanding from "@/components/CategoryLanding";
import type { Plan } from "@/lib/types";

// LeadFormLazy pulls in react-hook-form behind a dynamic import; stub it to a
// marker that echoes the props we care about, so these assertions stay about
// CategoryLanding's wiring rather than the form's internals (covered by
// LeadForm.test.tsx).
vi.mock("@/components/LeadFormLazy", () => ({
  default: (props: {
    source: string;
    defaultCategory?: string;
    trustStats?: { planCount: number; providerCount: number };
  }) => (
    <div
      data-testid="lead-form"
      data-source={props.source}
      data-category={props.defaultCategory ?? ""}
      data-plan-count={props.trustStats?.planCount ?? ""}
    />
  ),
}));

vi.mock("@/components/StickyLeadCta", () => ({
  default: (props: { source: string }) => (
    <div data-testid="sticky-cta" data-source={props.source} />
  ),
}));

const PLANS: Plan[] = [
  {
    id: "p1",
    cat: "cellular",
    provider: "סלקום",
    plan: "מסלול בדיקה",
    price: 29,
    after: null,
    is5G: false,
    noCommit: true,
    hasAbroad: false,
  },
];

function renderLanding(extra: Record<string, unknown> = {}) {
  return render(
    <CategoryLanding
      category="cellular"
      titleHe="מסלולי סלולר"
      intro="אינטרו בדיקה."
      plans={PLANS}
      {...extra}
    />,
  );
}

describe("CategoryLanding — conversion path", () => {
  it("renders an in-page lead section anchored at #lead", () => {
    const { container } = renderLanding();
    const lead = container.querySelector("#lead");
    expect(lead).not.toBeNull();
    // The sticky bar scrolls to this exact id — a rename would silently break it.
    expect(screen.getByTestId("lead-form")).toBeInTheDocument();
  });

  it("pre-scopes the form to this landing's own category", () => {
    expect(screen.queryByTestId("lead-form")).toBeNull();
    renderLanding();
    expect(screen.getByTestId("lead-form")).toHaveAttribute(
      "data-category",
      "cellular",
    );
    expect(screen.getByTestId("lead-form")).toHaveAttribute(
      "data-source",
      "category",
    );
  });

  it("falls back to no pre-selected category for a non-lead bucket", () => {
    renderLanding({ category: "electricity", titleHe: "מסלולי חשמל" });
    // leadCategory() narrows to the five real lead categories; anything else
    // must come through empty rather than mis-scoped.
    expect(screen.getByTestId("lead-form")).toHaveAttribute("data-category", "");
  });

  it("renders the mobile sticky CTA pointing at the same source", () => {
    renderLanding();
    expect(screen.getByTestId("sticky-cta")).toHaveAttribute(
      "data-source",
      "category",
    );
  });
});

describe("CategoryLanding — trust stats are host-supplied, never invented", () => {
  it("passes through real counts when the host page supplies them", () => {
    renderLanding({ trustStats: { planCount: 120, providerCount: 18 } });
    expect(screen.getByTestId("lead-form")).toHaveAttribute(
      "data-plan-count",
      "120",
    );
  });

  it("omits the counts entirely when the host supplies none", () => {
    renderLanding();
    // Empty — NOT a fabricated stand-in number.
    expect(screen.getByTestId("lead-form")).toHaveAttribute(
      "data-plan-count",
      "",
    );
  });
});
