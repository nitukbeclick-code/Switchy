// ────────────────────────────────────────────────────────────────────────────
// <CommissionDisclosure> — Consumer Protection Law §7b / §17 referral-fee
// disclosure. The load-bearing property is HONESTY: the component must render the
// full, prominent paid-relationship disclosure (free to the user, we are paid a
// referral fee by the provider, it does NOT affect the price) sourced verbatim
// from lib/legal.ts, with a /transparency methodology link — never a watered-down
// "consumer advocate" claim and never drifting from the single source of truth.
//
// These tests assert the real legal copy is present (banner + inline variants),
// the /transparency link is wired, and the banner exposes a labelled landmark.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import CommissionDisclosure from "@/components/CommissionDisclosure";
import {
  COMMISSION_DISCLOSURE_LEAD,
  COMMISSION_DISCLOSURE_BODY,
  COMMISSION_DISCLOSURE_LINK_TEXT,
} from "@/lib/legal";

// The disclosure renders its body split around the link anchor, so a single
// textContent check on the wrapper is the robust way to assert the full sentence
// survived the slice() without dropping/duplicating any characters.
function fullDisclosureText(): string {
  return `${COMMISSION_DISCLOSURE_LEAD} ${COMMISSION_DISCLOSURE_BODY}`;
}

describe("CommissionDisclosure — banner variant (default)", () => {
  it("renders inside a labelled disclosure landmark", () => {
    render(<CommissionDisclosure />);
    // aria-label marks this as a גילוי נאות (disclosure), not generic content.
    expect(
      screen.getByRole("complementary", { name: "גילוי נאות — דמי תיווך" }),
    ).toBeInTheDocument();
  });

  it("shows the full §7b paid-relationship disclosure copy verbatim", () => {
    render(<CommissionDisclosure />);
    const aside = screen.getByRole("complementary", {
      name: "גילוי נאות — דמי תיווך",
    });

    // The lead emphasis + the full honest body must both be present (no drift).
    expect(within(aside).getByText(COMMISSION_DISCLOSURE_LEAD)).toBeInTheDocument();
    // textContent of the whole paragraph reconstructs lead + body + link anchor.
    expect(aside).toHaveTextContent(fullDisclosureText());

    // The honest, non-negotiable substance: a PAID relationship that does NOT
    // change the user's price (never positioned as a neutral advocate).
    expect(aside).toHaveTextContent("דמי תיווך");
    expect(aside).toHaveTextContent("אינו משפיע");
  });

  it("links the methodology anchor to /transparency", () => {
    render(<CommissionDisclosure />);
    const link = screen.getByRole("link", {
      name: COMMISSION_DISCLOSURE_LINK_TEXT,
    });
    expect(link).toHaveAttribute("href", "/transparency");
  });
});

describe("CommissionDisclosure — inline variant", () => {
  it("renders the same honest disclosure copy + /transparency link without the landmark", () => {
    const { container } = render(<CommissionDisclosure variant="inline" />);

    // Inline is a muted line, not a bordered <aside> landmark.
    expect(
      screen.queryByRole("complementary", { name: "גילוי נאות — דמי תיווך" }),
    ).not.toBeInTheDocument();

    // The full disclosure text and the methodology link are still present.
    expect(container).toHaveTextContent(fullDisclosureText());
    expect(
      screen.getByRole("link", { name: COMMISSION_DISCLOSURE_LINK_TEXT }),
    ).toHaveAttribute("href", "/transparency");
  });
});

describe("CommissionDisclosure — styling hook", () => {
  it("applies a caller-supplied className to the wrapper", () => {
    const { container } = render(
      <CommissionDisclosure className="mt-8" />,
    );
    expect(container.firstElementChild).toHaveClass("mt-8");
  });
});
