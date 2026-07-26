// ────────────────────────────────────────────────────────────────────────────
// <SmartTimer> — the pure client-side contract calculator. We pin the date math
// (end date = start + months, dd/mm/yyyy) and the two result branches, which now
// differ in DESTINATION and not just in button fill: the FINISHED-commitment
// branch is the strongest intent signal the app can observe, so it deep-links
// into the lead section of a real comparison page (/compare/{service}#lead) with
// the "worth switching now" line; the still-active branch shows a save-the-date
// hint carrying the derived end date + a SECONDARY plain compare link — honestly
// framed ("penalty-free switch is at the END; compare now to be ready") and
// WITHOUT the "worth switching now" claim. No network, no AppState — fully
// deterministic.
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
  it("computes the end date and flags a finished commitment WITH a lead-deep-link CTA", () => {
    render(<SmartTimer />);
    setDates("2000-01-01", "12"); // ended long ago
    // End date = start + 12 months, rendered dd/mm/yyyy.
    expect(screen.getByText("01/01/2001")).toBeInTheDocument();
    // The "ended" branch encourages switching…
    expect(screen.getByText(/כדאי לעבור עכשיו/)).toBeInTheDocument();
    // …and lands the user ON the request form of a real comparison page, not at
    // the top of /compare (which has no #lead section to scroll to).
    const cta = screen.getByRole("link", { name: /שנמצא לכם מסלול זול יותר/ });
    expect(cta).toHaveAttribute("href", "/compare/cellular#lead");
  });

  it("deep-links the finished branch into the service the caller names", () => {
    render(<SmartTimer service="internet" />);
    setDates("2000-01-01", "12");
    expect(
      screen.getByRole("link", { name: /שנמצא לכם מסלול זול יותר/ }),
    ).toHaveAttribute("href", "/compare/internet#lead");
  });

  it("shows the derived end date + a SECONDARY compare CTA while the commitment is still active", () => {
    render(<SmartTimer />);
    setDates("2099-01-01", "12"); // ends far in the future → not ended
    // Honest under-commitment copy, carrying the derived date in the sentence
    // that says what to do with it (01/01/2100 = start + 12 months).
    expect(screen.getAllByText("01/01/2100").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/תוכלו לעבור ספק ללא קנס יציאה/)).toBeInTheDocument();
    // HONESTY GUARD: the "worth switching now" line belongs ONLY to the finished
    // branch — it must NOT appear while the user is still committed (a switch now
    // could incur an exit penalty), and neither may the lead deep-link.
    expect(screen.queryByText(/כדאי לעבור עכשיו/)).toBeNull();
    expect(screen.queryByRole("link", { name: /שנמצא לכם מסלול זול יותר/ })).toBeNull();
    // Not a dead-end: a SECONDARY compare CTA is offered (→ /compare) so the user
    // can prepare, with no penalty-free claim attached.
    const cta = screen.getByRole("link", { name: /השוואת מסלולים/ });
    expect(cta).toHaveAttribute("href", "/compare");
  });

  it("honours a custom ctaHref/ctaLabel on BOTH branches", () => {
    render(<SmartTimer ctaHref="/quiz" ctaLabel="מצאו מסלול" />);
    setDates("2000-06-15", "24"); // end 15/06/2002, ended
    expect(screen.getByText("15/06/2002")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "מצאו מסלול" });
    expect(cta).toHaveAttribute("href", "/quiz");

    setDates("2099-01-01", "12"); // still active
    expect(screen.getByRole("link", { name: "מצאו מסלול" })).toHaveAttribute(
      "href",
      "/quiz",
    );
  });
});
