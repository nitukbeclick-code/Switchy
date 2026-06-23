import { describe, it, expect } from "vitest";
import { pageMetadata } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/schema";

// ────────────────────────────────────────────────────────────────────────────
// lib/seo.ts — per-page Metadata builder. Invariants: canonical mirrors the path,
// og:url is the ABSOLUTE canonical, og/twitter title is brand-normalised exactly
// once, and the page title/description pass through verbatim (honest — no claims
// are added). The image is intentionally left to Next's file-based convention.
// ────────────────────────────────────────────────────────────────────────────

describe("pageMetadata", () => {
  it("sets canonical to the relative path and og:url to the absolute URL", () => {
    const m = pageMetadata({
      title: "השוואת סלולר",
      description: "תיאור",
      path: "/compare/cellular",
    });
    expect(m.alternates?.canonical).toBe("/compare/cellular");
    expect(m.openGraph && "url" in m.openGraph ? m.openGraph.url : undefined).toBe(
      `${SITE_URL}/compare/cellular`,
    );
  });

  it("passes the bare title/description through verbatim", () => {
    const m = pageMetadata({
      title: "מילון מונחים",
      description: "מילון תקשורת",
      path: "/glossary",
    });
    expect(m.title).toBe("מילון מונחים");
    expect(m.description).toBe("מילון תקשורת");
  });

  it("brand-normalises the OG/Twitter title exactly once", () => {
    const m = pageMetadata({
      title: "השוואת סלולר",
      description: "תיאור",
      path: "/compare/cellular",
    });
    const expected = `השוואת סלולר | ${SITE_NAME}`;
    const ogTitle =
      m.openGraph && "title" in m.openGraph ? m.openGraph.title : undefined;
    const twTitle =
      m.twitter && "title" in m.twitter ? m.twitter.title : undefined;
    expect(ogTitle).toBe(expected);
    expect(twTitle).toBe(expected);
  });

  it("does NOT double-brand a title that already carries the suffix", () => {
    const titled = `מצב שוק התקשורת | ${SITE_NAME}`;
    const m = pageMetadata({
      title: titled,
      description: "תיאור",
      path: "/market-pulse",
    });
    const ogTitle =
      m.openGraph && "title" in m.openGraph ? m.openGraph.title : undefined;
    // exactly one brand suffix, not two
    expect(ogTitle).toBe(titled);
    expect(String(ogTitle).match(new RegExp(`\\| ${SITE_NAME}`, "g"))?.length).toBe(1);
  });

  it("emits a summary_large_image twitter card", () => {
    const m = pageMetadata({
      title: "כותרת",
      description: "תיאור",
      path: "/providers",
    });
    expect(m.twitter && "card" in m.twitter ? m.twitter.card : undefined).toBe(
      "summary_large_image",
    );
  });

  it("re-declares the shared OG + Twitter share image (so the shallow merge keeps it)", () => {
    const m = pageMetadata({
      title: "כותרת",
      description: "תיאור",
      path: "/providers",
    });
    // og:image points at the file-convention asset (resolved absolute via metadataBase)
    const og = m.openGraph as Record<string, unknown> | undefined;
    expect(JSON.stringify(og?.images)).toContain("/opengraph-image.png");
    const tw = m.twitter as Record<string, unknown> | undefined;
    expect(JSON.stringify(tw?.images)).toContain("/twitter-image.png");
  });

  it("sets og locale + siteName for the Hebrew RTL site", () => {
    const m = pageMetadata({ title: "כ", description: "ת", path: "/" });
    const og = m.openGraph as Record<string, unknown> | undefined;
    expect(og?.locale).toBe("he_IL");
    expect(og?.siteName).toBe(SITE_NAME);
    expect(og?.type).toBe("website");
  });

  it("forwards a robots override when provided (national city pages)", () => {
    const m = pageMetadata({
      title: "כ",
      description: "ת",
      path: "/compare/cellular/tel-aviv",
      robots: { index: false, follow: true },
    });
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it("omits robots entirely when not provided", () => {
    const m = pageMetadata({ title: "כ", description: "ת", path: "/" });
    expect(m.robots).toBeUndefined();
  });

  it("accepts an already-absolute path for og:url", () => {
    const m = pageMetadata({
      title: "כ",
      description: "ת",
      path: `${SITE_URL}/vs/a-vs-b`,
    });
    expect(m.openGraph && "url" in m.openGraph ? m.openGraph.url : undefined).toBe(
      `${SITE_URL}/vs/a-vs-b`,
    );
  });
});
