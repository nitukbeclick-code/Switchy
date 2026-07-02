// ────────────────────────────────────────────────────────────────────────────
// <SiteHeader> — the global, sticky masthead rendered on every route. Contract:
//   • a real <header> landmark with a labelled primary <nav>,
//   • the brand wordmark links home (no dead-end),
//   • the four primary internal hubs link to their real routes,
//   • exactly one green ACTION CTA → the Zoom consultation scheduler (/book),
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
    // The brand link contains the wordmark text 'Switchy'.
    const brand = screen.getByRole("link", { name: /Switchy/ });
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
  it("renders the consultation CTA(s) pointing at the Zoom scheduler", () => {
    render(<SiteHeader />);
    // Two DOM nodes exist by design: the md+ masthead CTA (hidden md:inline-flex)
    // and the mobile <details> menu row. jsdom applies no responsive CSS, so both
    // render — assert every one targets /book (only one is visible per breakpoint).
    const ctas = screen.getAllByRole("link", { name: "שיחת ייעוץ בזום" });
    expect(ctas.length).toBeGreaterThanOrEqual(1);
    for (const cta of ctas) expect(cta).toHaveAttribute("href", "/book");
  });

  it("renders the accessible light/dark toggle button", () => {
    render(<SiteHeader />);
    expect(
      screen.getByRole("button", { name: "מעבר בין מצב בהיר למצב כהה" }),
    ).toBeInTheDocument();
  });
});
