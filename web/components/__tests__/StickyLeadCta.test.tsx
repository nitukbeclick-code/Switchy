// ────────────────────────────────────────────────────────────────────────────
// <StickyLeadCta> — the persistent ask, and the breakpoint that must not drift.
//
// WHY THIS FILE EXISTS. The product's persistent lead CTA is handed off between
// two components at one breakpoint:
//
//     below it → <StickyLeadCta>            (this component, `lg:hidden`)
//     above it → <SiteHeader>'s /book pill  (`lg:inline-flex`)
//
// Nothing in the type system, the linter or `next build` connects those two
// strings. They lived out of sync — the bar was `sm:hidden` (640px) while the
// pill was `lg:inline-flex` (1024px) — so 640–1023px had NEITHER. That band is
// not hypothetical: proxy.ts routes `tablet|ipad|kindle|silk|playbook` to this
// app on purpose, so it was the band every tablet landed in.
//
// Measured in Chromium on an iPad UA before the fix, /compare/cellular at
// 768x1024: no sticky bar, no header CTA, first in-page ask at 1391px — more
// than a full screen height below the fold on the highest-intent route.
//
// Two CSS rules are keyed to the same number (the body padding that pays for the
// opaque bar, and the PWA toast's clearance above it). Four encodings, three
// files, two languages. These tests assert they are all the SAME breakpoint, so
// moving one alone fails here instead of silently reopening the gap.
// ────────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StickyLeadCta from "@/components/StickyLeadCta";

vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..", "..");
const read = (rel: string) => readFileSync(path.join(webRoot, rel), "utf8");

/** Tailwind's `lg`. The single number this whole file is about. */
const HANDOFF_PX = 1024;

// jsdom has no IntersectionObserver; the component constructs one on mount.
class FakeIO {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() {
    // Report the lead form as OUT of view, which is when the bar shows.
    this.cb([{ isIntersecting: false } as IntersectionObserverEntry], this as never);
  }
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIO as unknown as typeof IntersectionObserver);
  document.documentElement.removeAttribute("data-sticky-lead");
});

describe("the bar hides exactly where the masthead CTA takes over", () => {
  it("is lg:hidden, not sm:hidden", () => {
    document.body.innerHTML = '<div id="lead"></div>';
    const { container } = render(<StickyLeadCta source="test" />);
    const bar = container.querySelector("[data-sticky-lead-cta]");
    expect(bar, "the sticky bar did not render").toBeTruthy();

    const cls = bar!.className;
    expect(cls, `sticky bar classes: ${cls}`).toContain("lg:hidden");
    // The specific regression: a `sm:hidden` bar opens the 640–1023px dead band.
    expect(cls).not.toContain("sm:hidden");
    expect(cls).not.toContain("md:hidden");
  });

  it("hands off to a masthead CTA gated at the SAME breakpoint", () => {
    // Read SiteHeader as source: the pill is server-rendered inside a component
    // tree this test does not mount, and the assertion is about the literal
    // breakpoint token either way.
    const header = read("components/SiteHeader.tsx");
    const bookCtas = header.match(/className="[^"]*\blg:inline-flex[^"]*"/g) ?? [];
    expect(
      bookCtas.length,
      "no lg:inline-flex CTA found in SiteHeader — if the masthead pill moved to " +
        "another breakpoint, StickyLeadCta's lg:hidden must move with it",
    ).toBeGreaterThan(0);

    // And it must not have quietly become xl/2xl, which would reopen the gap at
    // a wider band instead.
    expect(header).not.toMatch(/\bxl:inline-flex\b/);
  });
});

describe("the CSS keyed to that breakpoint moves with it", () => {
  const css = read("app/globals.css");

  it("ends the body reservation at the handoff breakpoint", () => {
    // The bar is `position: fixed` over an OPAQUE surface, so while it is on
    // screen the document must be padded to scroll clear of it — including past
    // SiteFooter's נגישות link, which ת"י 5568 requires to be reachable. If the
    // reservation ends BEFORE the bar hides, that link sits under the bar.
    const m = /@media \(min-width: (\d+)px\) \{\s*:root\[data-sticky-lead\] body \{/.exec(css);
    expect(m, "the body-reservation media query was not found in globals.css").toBeTruthy();
    expect(
      Number(m![1]),
      `body reservation ends at ${m![1]}px but the bar hides at ${HANDOFF_PX}px — ` +
        "between those widths an opaque fixed bar covers the footer's last 7rem",
    ).toBe(HANDOFF_PX);
  });

  it("drops the PWA toast's clearance at the handoff breakpoint", () => {
    const m = /@media \(min-width: (\d+)px\) \{\s*:root\[data-sticky-lead\] \[data-pwa-toast\] \{/.exec(css);
    expect(m, "the PWA-toast media query was not found in globals.css").toBeTruthy();
    expect(
      Number(m![1]),
      `toast clearance drops at ${m![1]}px but the bar hides at ${HANDOFF_PX}px`,
    ).toBe(HANDOFF_PX);
  });

  it("describes the bar as lg:hidden in the stacking contract", () => {
    // The contract comment is what the next reader trusts before they touch any
    // of this; a stale one is how the drift survived review last time.
    expect(css).toContain("lead CTA (z-40, opaque, lg:hidden)");
  });
});

describe("the reservation flag still behaves", () => {
  it("sets data-sticky-lead only when a lead target exists", () => {
    document.body.innerHTML = "";
    const { unmount } = render(<StickyLeadCta source="test" />);
    expect(document.documentElement.hasAttribute("data-sticky-lead")).toBe(false);
    unmount();

    document.body.innerHTML = '<div id="lead"></div>';
    const second = render(<StickyLeadCta source="test" />);
    expect(document.documentElement.hasAttribute("data-sticky-lead")).toBe(true);
    second.unmount();
    // Cleaned up, so a route without a form never inherits the padding.
    expect(document.documentElement.hasAttribute("data-sticky-lead")).toBe(false);
  });

  it("keeps the hidden bar out of the tab order and the a11y tree", () => {
    document.body.innerHTML = '<div id="lead"></div>';
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe() {
          // Lead form IS in view → the bar hides.
          this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
        }
        disconnect() {}
        unobserve() {}
      } as unknown as typeof IntersectionObserver,
    );
    const { container } = render(<StickyLeadCta source="test" />);
    const bar = container.querySelector("[data-sticky-lead-cta]")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { hidden: true }).getAttribute("tabindex")).toBe("-1");
  });
});
