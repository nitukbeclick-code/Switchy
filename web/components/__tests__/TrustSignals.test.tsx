// ────────────────────────────────────────────────────────────────────────────
// <TrustSignals> — the HONEST E-E-A-T block. The single most important property
// to lock down is honesty: it renders ONLY the real, catalogue-derived counts it
// is given (localized he-IL) and NO fabricated user counts / ratings / "saved ₪X
// on average". These tests assert the real numbers render and that the optional
// category stat appears only when provided.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import TrustSignals from "@/components/TrustSignals";

describe("TrustSignals — full variant", () => {
  it("renders the real catalogue counts (he-IL localized) and the free-cost stat", () => {
    render(<TrustSignals planCount={1234} providerCount={12} categoryCount={5} />);

    const section = screen.getByRole("region", {
      name: "למה אפשר לסמוך עלינו",
    });
    const scoped = within(section);

    // 1234 → "1,234" under he-IL grouping; the count is real, not invented.
    expect(scoped.getByText("1,234")).toBeInTheDocument();
    expect(scoped.getByText("מסלולים בהשוואה")).toBeInTheDocument();
    expect(scoped.getByText("12")).toBeInTheDocument();
    expect(scoped.getByText("ספקים")).toBeInTheDocument();
    expect(scoped.getByText("5")).toBeInTheDocument();
    expect(scoped.getByText("קטגוריות תקשורת")).toBeInTheDocument();

    // The only "claim" figure allowed: the site is free.
    expect(scoped.getByText("₪0")).toBeInTheDocument();
    expect(scoped.getByText("עלות השימוש באתר")).toBeInTheDocument();
  });

  it("omits the category stat when categoryCount is not provided", () => {
    render(<TrustSignals planCount={100} providerCount={8} />);
    expect(screen.queryByText("קטגוריות תקשורת")).not.toBeInTheDocument();
  });
});

describe("TrustSignals — compact variant", () => {
  it("renders the real counts inline with the methodology link, no fabricated numbers", () => {
    render(
      <TrustSignals variant="compact" planCount={250} providerCount={9} />,
    );

    const aside = screen.getByRole("complementary", { name: "נתוני אמון" });
    const scoped = within(aside);

    expect(scoped.getByText("250")).toBeInTheDocument();
    expect(scoped.getByText("9")).toBeInTheDocument();

    // Methodology link is present and points to /transparency (no dead-end).
    const link = scoped.getByRole("link", { name: /איך אנחנו מדרגים/ });
    expect(link).toHaveAttribute("href", "/transparency");
  });
});
