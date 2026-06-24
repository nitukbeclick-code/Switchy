// ────────────────────────────────────────────────────────────────────────────
// <BillForensics> — the itemized anomaly report. We assert BEHAVIOUR + HONESTY:
//   • a confirmed overpay shows the real ₪ figure WITHOUT a "הערכה" pill;
//   • an inferred (low-confidence / expired-promo / unused-line) finding carries
//     the "ייתכן" framing AND a visible "הערכה" pill;
//   • the total-overpay headline announces the real summed ₪ (role="status");
//   • when no overpay is found it says so plainly (no invented problem);
//   • the standing caveat (automatic read, verify, we never auto-act) is present;
//   • an unreadable report renders nothing.
//
// The report is built from the REAL analyzer (analyzeBill) so the component test
// also exercises the lib → view contract end to end. No network is touched.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BillForensics from "@/components/BillForensics";
import {
  analyzeBill,
  type ForensicsInput,
  type ForensicsPlan,
} from "@/lib/bill-forensics";

function input(over: Partial<ForensicsInput> = {}): ForensicsInput {
  return {
    provider: "סלקום",
    currentSpend: 90,
    category: "cellular",
    suggestions: [],
    confidence: 0.9,
    ...over,
  };
}

describe("BillForensics — confirmed overpay", () => {
  it("shows the real ₪ overpay headline + a confirmed flag WITHOUT a 'הערכה' pill", () => {
    const report = analyzeBill(
      input({
        currentSpend: 90,
        suggestions: [
          { name: "מסלול חסכוני", provider: "גולן טלקום", price: 49, annualSaving: (90 - 49) * 12 },
        ],
      }),
    );
    render(<BillForensics report={report} />);

    // The labelled region exists (a11y).
    expect(
      screen.getByRole("region", { name: /ניתוח החשבון/ }),
    ).toBeInTheDocument();

    // Total-overpay headline announces the real summed ₪ (₪41/mo, ₪492/yr).
    const statuses = screen.getAllByRole("status");
    const headline = statuses.map((n) => n.textContent ?? "").join(" ");
    expect(headline).toContain("₪41");
    expect(headline).toContain("₪492");
    // Confirmed → asserted, not hedged.
    expect(headline).toContain("אתה משלם");
    expect(headline).not.toContain("ייתכן");

    // The confirmed overpay flag carries NO "הערכה" pill.
    expect(screen.queryByText("הערכה")).not.toBeInTheDocument();

    // The best alternative is surfaced for the hand-off.
    expect(screen.getByText(/החלופה הזולה ביותר/)).toBeInTheDocument();
  });
});

describe("BillForensics — inferred findings carry 'ייתכן' + a 'הערכה' pill", () => {
  it("marks a low-confidence overpay as an estimate", () => {
    const report = analyzeBill(
      input({
        confidence: 0.4,
        currentSpend: 90,
        suggestions: [
          { name: "זול", provider: "גולן טלקום", price: 49, annualSaving: 492 },
        ],
      }),
    );
    render(<BillForensics report={report} />);
    // At least one visible "הערכה" pill for the inferred finding.
    expect(screen.getAllByText("הערכה").length).toBeGreaterThan(0);
    // The headline hedges.
    const headline = screen
      .getAllByRole("status")
      .map((n) => n.textContent ?? "")
      .join(" ");
    expect(headline).toContain("ייתכן");
  });

  it("renders an expired-promo flag with the 'ייתכן' title", () => {
    const promoPlans: ForensicsPlan[] = [
      { cat: "cellular", provider: "פרטנר", plan: "מבצע", price: 30, after: 60, kind: "regular" },
    ];
    const report = analyzeBill(input({ currentSpend: 60, suggestions: [] }), promoPlans);
    render(<BillForensics report={report} />);
    expect(screen.getByText(/תקופת המבצע שלך הסתיימה/)).toBeInTheDocument();
  });

  it("renders an unused-line flag for an optional add-on", () => {
    const report = analyzeBill(
      input({ currentSpend: 120, lineItems: [{ label: "ביטוח מכשיר", amount: 19 }] }),
    );
    render(<BillForensics report={report} />);
    // The unused-line flag title names the add-on (matched on the "ייתכן…" title,
    // which is unique vs the detail line that also mentions the label).
    expect(
      screen.getByText(/תוספת שאינך צריך: "ביטוח מכשיר"/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("הערכה").length).toBeGreaterThan(0);
  });
});

describe("BillForensics — honest empty state + caveat", () => {
  it("says plainly there is no overpay when none is found (no invented problem)", () => {
    const report = analyzeBill(input({ currentSpend: 40, suggestions: [] }));
    render(<BillForensics report={report} />);
    expect(screen.getByText(/לא מצאנו חיוב מיותר ברור/)).toBeInTheDocument();
    // No fabricated ₪ overpay anywhere in the headline.
    const headline = screen
      .getAllByRole("status")
      .map((n) => n.textContent ?? "")
      .join(" ");
    expect(headline).not.toMatch(/מיותר בחודש/);
  });

  it("always shows the standing caveat (automatic, verify, we never auto-act)", () => {
    const report = analyzeBill(
      input({ suggestions: [{ name: "זול", provider: "גולן טלקום", price: 49, annualSaving: 492 }] }),
    );
    render(<BillForensics report={report} />);
    expect(screen.getByText(/הניתוח אוטומטי/)).toBeInTheDocument();
    expect(screen.getByText(/ההחלטה והפעולה בידיכם/)).toBeInTheDocument();
  });

  it("renders nothing for an unreadable / ₪0 bill", () => {
    const report = analyzeBill(input({ currentSpend: 0, suggestions: [] }));
    const { container } = render(<BillForensics report={report} />);
    expect(container).toBeEmptyDOMElement();
  });
});
