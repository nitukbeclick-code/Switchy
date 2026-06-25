// ────────────────────────────────────────────────────────────────────────────
// <SiteFooter> — the global footer rendered on every route. Contract:
//   • a real <footer> landmark with the brand + tagline,
//   • a deep internal-nav grid (no dead-ends) including the authority hubs
//     /transparency and /glossary,
//   • a TRUTHFUL service line (free comparison, contact only with consent),
//   • the legal/accessibility bottom row links (privacy/terms/accessibility),
//   • the columns are overridable via the `columns` prop.
// next/link renders a plain <a> under jsdom — no mocking needed.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SiteFooter from "@/components/SiteFooter";

describe("SiteFooter — landmark, brand & honesty", () => {
  it("renders a contentinfo <footer> landmark", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("states the truthful service promise (free comparison, contact only with consent)", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("השוואה חינמית");
    // Contact happens only AFTER the user's approval — no covert outreach claim.
    expect(footer).toHaveTextContent("רק לאחר");
    expect(footer).toHaveTextContent("אישורכם");
  });
});

describe("SiteFooter — internal nav has no dead-ends", () => {
  it("links the compare-category hubs to their real routes", () => {
    render(<SiteFooter />);
    const nav = screen.getByRole("navigation", { name: "השוואת מסלולים" });
    const scoped = within(nav);

    expect(scoped.getByRole("link", { name: "סלולר" })).toHaveAttribute(
      "href",
      "/compare/cellular",
    );
    expect(scoped.getByRole("link", { name: "חבילות חו״ל" })).toHaveAttribute(
      "href",
      "/compare/abroad",
    );
  });

  it("surfaces the authority hubs /transparency and /glossary", () => {
    render(<SiteFooter />);
    const nav = screen.getByRole("navigation", { name: "ידע ושקיפות" });
    const scoped = within(nav);

    expect(
      scoped.getByRole("link", { name: "שקיפות ומתודולוגיה" }),
    ).toHaveAttribute("href", "/transparency");
    expect(scoped.getByRole("link", { name: "מילון מונחים" })).toHaveAttribute(
      "href",
      "/glossary",
    );
  });
});

describe("SiteFooter — legal/accessibility bottom row", () => {
  it("renders the labelled legal nav with the required compliance links", () => {
    render(<SiteFooter />);
    const legalNav = screen.getByRole("navigation", {
      name: "קישורים משפטיים ונגישות",
    });
    const scoped = within(legalNav);

    expect(scoped.getByRole("link", { name: "פרטיות" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(scoped.getByRole("link", { name: "תנאי שימוש" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(scoped.getByRole("link", { name: "נגישות" })).toHaveAttribute(
      "href",
      "/accessibility",
    );
  });

  it("shows the current year in the copyright line", () => {
    render(<SiteFooter />);
    const year = String(new Date().getFullYear());
    expect(screen.getByRole("contentinfo")).toHaveTextContent(year);
  });
});

describe("SiteFooter — customizable columns", () => {
  it("renders caller-supplied columns instead of the defaults", () => {
    render(
      <SiteFooter
        columns={[
          {
            title: "עמודה מותאמת",
            links: [{ href: "/custom", label: "קישור מותאם" }],
          },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "עמודה מותאמת" });
    expect(
      within(nav).getByRole("link", { name: "קישור מותאם" }),
    ).toHaveAttribute("href", "/custom");

    // A default column heading should no longer be present.
    expect(
      screen.queryByRole("navigation", { name: "השוואת מסלולים" }),
    ).not.toBeInTheDocument();
  });
});
