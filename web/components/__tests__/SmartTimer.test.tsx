// ────────────────────────────────────────────────────────────────────────────
// <SmartTimer> — the pure client-side contract calculator. We pin the date math
// (end date = start + months, dd/mm/yyyy) and the two result branches, including
// that the FINISHED-commitment branch now surfaces a compare-plans CTA at peak
// intent instead of dead-ending, while the still-active branch shows only a
// save-the-date hint (no CTA). No network, no AppState — fully deterministic.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SmartTimer from "@/components/SmartTimer";

function setDates(start: string, months = "12") {
  fireEvent.change(screen.getByLabelText("תאריך תחילת ההתחייבות"), {
    target: { value: start },
  });
  fireEvent.change(screen.getByLabelText("אורך ההתחייבות (חודשים)"), {
    target: { value: months },
  });
}

describe("SmartTimer — contract calculator", () => {
  it("computes the end date and flags a finished commitment WITH a compare CTA", () => {
    render(<SmartTimer />);
    setDates("2000-01-01", "12"); // ended long ago
    // End date = start + 12 months, rendered dd/mm/yyyy.
    expect(screen.getByText("01/01/2001")).toBeInTheDocument();
    // The "ended" branch encourages switching…
    expect(screen.getByText(/כדאי לעבור עכשיו/)).toBeInTheDocument();
    // …and no longer dead-ends: a compare CTA is surfaced at peak intent.
    const cta = screen.getByRole("link", { name: /השוואת מסלולים/ });
    expect(cta).toHaveAttribute("href", "/compare");
  });

  it("shows a save-the-date hint with NO CTA while the commitment is still active", () => {
    render(<SmartTimer />);
    setDates("2099-01-01", "12"); // ends far in the future → not ended
    expect(screen.getByText(/כשתסתיים ההתחייבות/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("honours a custom ctaHref/ctaLabel on the finished branch", () => {
    render(<SmartTimer ctaHref="/quiz" ctaLabel="מצאו מסלול" />);
    setDates("2000-06-15", "24"); // end 15/06/2002, ended
    expect(screen.getByText("15/06/2002")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "מצאו מסלול" });
    expect(cta).toHaveAttribute("href", "/quiz");
  });
});
