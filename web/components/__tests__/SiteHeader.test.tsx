// ────────────────────────────────────────────────────────────────────────────
// <SiteHeader> — the global, sticky masthead rendered on every route. Contract:
//   • a real <header> landmark with a labelled primary <nav>,
//   • the brand wordmark links home (no dead-end),
//   • the four primary internal hubs link to their real routes,
//   • exactly one green ACTION CTA → /#lead,
//   • the light/dark toggle is present (accessible <button>).
//
// SiteHeader embeds two "use client" children (TrackedCtaLink, ThemeToggle).
// TrackedCtaLink's trackEvent() no-ops without gtag/fbq; ThemeToggle reads
// matchMedia (stubbed in vitest.setup.ts) — so the tree renders under jsdom
// without mocking. next/link renders a plain <a> in tests.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SiteHeader from "@/components/SiteHeader";

describe("SiteHeader — landmarks & brand", () => {
  it("renders a banner <header> containing the labelled primary nav", () => {
    render(<SiteHeader />);
    const header = screen.getByRole("banner");
    expect(header).toBeInTheDocument();
    expect(
      within(header).getByRole("navigation", { name: "ניווט ראשי" }),
    ).toBeInTheDocument();
  });

  it("links the brand wordmark home", () => {
    render(<SiteHeader />);
    // The brand link contains the wordmark text 'חוסך'.
    const brand = screen.getByRole("link", { name: /חוסך/ });
    expect(brand).toHaveAttribute("href", "/");
  });
});

describe("SiteHeader — primary nav links resolve to real routes", () => {
  it("renders the four primary hubs pointing at their canonical paths", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "ניווט ראשי" });
    const scoped = within(nav);

    expect(scoped.getByRole("link", { name: "השוואה" })).toHaveAttribute(
      "href",
      "/compare/cellular",
    );
    expect(scoped.getByRole("link", { name: "ספקים" })).toHaveAttribute(
      "href",
      "/providers",
    );
    expect(scoped.getByRole("link", { name: "דופק השוק" })).toHaveAttribute(
      "href",
      "/market-pulse",
    );
    expect(scoped.getByRole("link", { name: "מעבר ספק" })).toHaveAttribute(
      "href",
      "/switch",
    );
  });
});

describe("SiteHeader — the single ACTION CTA + theme toggle", () => {
  it("renders one consultation CTA pointing at the lead anchor", () => {
    render(<SiteHeader />);
    const cta = screen.getByRole("link", { name: "שיחת ייעוץ חינם" });
    expect(cta).toHaveAttribute("href", "/#lead");
  });

  it("renders the accessible light/dark toggle button", () => {
    render(<SiteHeader />);
    expect(
      screen.getByRole("button", { name: "מעבר בין מצב בהיר למצב כהה" }),
    ).toBeInTheDocument();
  });
});
