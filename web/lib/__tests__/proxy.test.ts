import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";

// ────────────────────────────────────────────────────────────────────────────
// The device-split proxy (web/proxy.ts). Two contracts, both load-bearing:
//
//  1. ROUTING — unchanged by the Vary work below and pinned here so it stays
//     that way: static root assets and every *.html come from the static origin
//     for EVERY device; a clean path with a static twin splits (phone → the Next
//     app, desktop → the twin); a Next-only route renders here on both.
//
//  2. CACHEABILITY — `Vary: User-Agent` appears ONLY on the responses that
//     genuinely differ by device class. User-agent strings are near-unique, so a
//     response carrying that header misses the CDN on nearly every request and is
//     re-fetched from the origin (billed as Fast Origin Transfer). Marking a
//     device-INDEPENDENT response with it buys nothing and costs the transfer.
//     See docs/vercel-isr-budget.md.
//
// A rewrite is identified by the `x-middleware-rewrite` header Next sets, and a
// pass-through by `x-middleware-next` — the observable output of
// NextResponse.rewrite() / NextResponse.next().
// ────────────────────────────────────────────────────────────────────────────

import { proxy } from "@/proxy";

const STATIC_ORIGIN = "https://switchy-phi.vercel.app";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36";

function run(pathname: string, ua: string) {
  const req = new NextRequest(`https://switchy-ai.com${pathname}`, {
    headers: { "user-agent": ua },
  });
  const res = proxy(req);
  return {
    status: res.status,
    vary: res.headers.get("Vary"),
    rewrittenTo: res.headers.get("x-middleware-rewrite"),
    passedThrough: res.headers.get("x-middleware-next") !== null,
    location: res.headers.get("location"),
  };
}

describe("proxy — routing (unchanged contract)", () => {
  it("308s the one legacy directory-style provider URL", () => {
    const res = run("/providers/index.html", DESKTOP_UA);
    expect(res.status).toBe(308);
    expect(res.location).toBe("https://switchy-ai.com/providers");
  });

  it("serves the static site's root assets from the static origin, on any device", () => {
    for (const ua of [MOBILE_UA, DESKTOP_UA]) {
      expect(run("/styles.css", ua).rewrittenTo).toBe(
        `${STATIC_ORIGIN}/styles.css`,
      );
      expect(run("/script.min.js", ua).rewrittenTo).toBe(
        `${STATIC_ORIGIN}/script.min.js`,
      );
    }
  });

  it("serves every *.html from the static origin, on any device", () => {
    for (const ua of [MOBILE_UA, DESKTOP_UA]) {
      expect(run("/app.html", ua).rewrittenTo).toBe(`${STATIC_ORIGIN}/app.html`);
    }
  });

  it("splits a clean marketing path with a static twin", () => {
    // Phone → the Next app.
    expect(run("/cellular", MOBILE_UA).passedThrough).toBe(true);
    // Desktop → the twin.
    expect(run("/cellular", DESKTOP_UA).rewrittenTo).toBe(
      `${STATIC_ORIGIN}/cellular.html`,
    );
  });

  it("renders a Next-only route from this app on both device classes", () => {
    // /community has no static twin on purpose (authenticated React surface).
    expect(run("/community", MOBILE_UA).passedThrough).toBe(true);
    expect(run("/community", DESKTOP_UA).passedThrough).toBe(true);
  });

  it("carries the query string across a rewrite", () => {
    const req = new NextRequest("https://switchy-ai.com/cellular?utm_source=x", {
      headers: { "user-agent": DESKTOP_UA },
    });
    expect(proxy(req).headers.get("x-middleware-rewrite")).toBe(
      `${STATIC_ORIGIN}/cellular.html?utm_source=x`,
    );
  });
});

describe("proxy — Vary is only on device-dependent responses", () => {
  it("marks the paths where phone and desktop really differ", () => {
    // Same URL, two different surfaces → the CDN must key them apart.
    expect(run("/cellular", MOBILE_UA).vary).toContain("User-Agent");
    expect(run("/cellular", DESKTOP_UA).vary).toContain("User-Agent");
    expect(run("/providers/cellcom", DESKTOP_UA).vary).toContain("User-Agent");
  });

  it("leaves the static root assets cacheable", () => {
    expect(run("/styles.css", DESKTOP_UA).vary).toBeNull();
    expect(run("/styles.css", MOBILE_UA).vary).toBeNull();
  });

  it("leaves *.html documents cacheable", () => {
    // The bulk of desktop pageviews. Identical bytes for every device.
    expect(run("/app.html", DESKTOP_UA).vary).toBeNull();
    expect(run("/cellular.html", MOBILE_UA).vary).toBeNull();
  });

  it("leaves Next-only routes cacheable", () => {
    expect(run("/community", DESKTOP_UA).vary).toBeNull();
    expect(run("/community", MOBILE_UA).vary).toBeNull();
    expect(run("/quiz", DESKTOP_UA).vary).toBeNull();
  });

  it("treats an unknown user-agent as desktop, as the routing comment promises", () => {
    // Empty UA → desktop (a crawler without a Mobile token indexes the static
    // canonical), so a path with a twin still rewrites and still varies.
    const res = run("/cellular", "");
    expect(res.rewrittenTo).toBe(`${STATIC_ORIGIN}/cellular.html`);
    expect(res.vary).toContain("User-Agent");
  });
});
