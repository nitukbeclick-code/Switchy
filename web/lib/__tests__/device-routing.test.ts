import { describe, it, expect } from "vitest";
import { staticDesktopPath } from "@/lib/device-routing";

// The device-split middleware rewrites DESKTOP requests through staticDesktopPath.
// These tests pin the contract that keeps an indexed clean apex URL from 404-ing
// on desktop: clean marketing path → static .html twin; static pages/assets pass
// through; Next-only routes → null (render from the Next app on desktop).

describe("staticDesktopPath — desktop device-split routing", () => {
  it("maps the homepage to the static index", () => {
    expect(staticDesktopPath("/")).toBe("/");
    expect(staticDesktopPath("")).toBe("/");
  });

  it("maps clean marketing paths to their static .html twin", () => {
    expect(staticDesktopPath("/cellular")).toBe("/cellular.html");
    expect(staticDesktopPath("/internet")).toBe("/internet.html");
    expect(staticDesktopPath("/tv")).toBe("/tv.html");
    expect(staticDesktopPath("/triple")).toBe("/triple.html");
    expect(staticDesktopPath("/abroad")).toBe("/abroad.html");
    expect(staticDesktopPath("/providers")).toBe("/providers.html");
    expect(staticDesktopPath("/compare")).toBe("/compare.html");
    expect(staticDesktopPath("/guides")).toBe("/guides.html");
    expect(staticDesktopPath("/book")).toBe("/book.html");
    expect(staticDesktopPath("/plans")).toBe("/plans.html");
  });

  it("normalizes a trailing slash before mapping", () => {
    expect(staticDesktopPath("/cellular/")).toBe("/cellular.html");
    expect(staticDesktopPath("/providers/")).toBe("/providers.html");
  });

  it("maps the dynamic compare + provider families to confirmed static twins", () => {
    expect(staticDesktopPath("/compare/cellular")).toBe("/compare.html");
    expect(staticDesktopPath("/compare/internet")).toBe("/compare.html");
    expect(staticDesktopPath("/providers/cellcom")).toBe("/provider-cellcom.html");
    expect(staticDesktopPath("/providers/hot-mobile")).toBe("/provider-hot-mobile.html");
    expect(staticDesktopPath("/providers/019mobile")).toBe("/provider-019mobile.html");
  });

  it("passes the static site's own .html pages + assets through unchanged", () => {
    expect(staticDesktopPath("/cellular.html")).toBe("/cellular.html");
    expect(staticDesktopPath("/guide-esim.html")).toBe("/guide-esim.html");
    expect(staticDesktopPath("/styles.css")).toBe("/styles.css");
    expect(staticDesktopPath("/script.js")).toBe("/script.js");
    expect(staticDesktopPath("/assets/logos/cellcom.webp")).toBe("/assets/logos/cellcom.webp");
    expect(staticDesktopPath("/favicon.ico")).toBe("/favicon.ico");
    expect(staticDesktopPath("/og-card.png")).toBe("/og-card.png");
  });

  it("returns null for Next-only routes (served by the Next app on desktop, never 404)", () => {
    for (
      const p of [
        "/quiz",
        "/referral",
        "/negotiate",
        "/bills",
        "/switch",
        "/switch-kit",
        "/market-pulse",
        "/plans/some-plan-id",
        "/vs/cellcom-vs-partner",
        "/guides/how-to-switch",
      ]
    ) {
      expect(staticDesktopPath(p), `expected null for Next-only ${p}`).toBeNull();
    }
  });
});
