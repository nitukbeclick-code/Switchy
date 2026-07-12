import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { clip, heDate, initial, relativeTime, renderBody } from "@/lib/community-render";

// ────────────────────────────────────────────────────────────────────────────
// lib/community-render.tsx — the shared community presentation helpers, hoisted
// out of PostCard / Replies / ProfileView so timestamps, monograms and mention
// rendering can't drift between components. These tests pin the extracted
// behavior byte-for-byte (Hebrew copy included).
// NOTE: NotificationsBell keeps its own deliberately different relativeTime
// ("ממש עכשיו", floor rounding) — it is NOT covered by this module.
// ────────────────────────────────────────────────────────────────────────────

const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("relativeTime", () => {
  it("returns empty string for an unparseable timestamp", () => {
    expect(relativeTime("not-a-date")).toBe("");
  });

  it("buckets from 'just now' through years (round-based)", () => {
    expect(relativeTime(isoAgo(10_000))).toBe("לפני רגע");
    expect(relativeTime(isoAgo(60_000))).toBe("לפני דקה");
    expect(relativeTime(isoAgo(5 * 60_000))).toBe("לפני 5 דקות");
    expect(relativeTime(isoAgo(60 * 60_000))).toBe("לפני שעה");
    expect(relativeTime(isoAgo(24 * 3_600_000))).toBe("אתמול");
    expect(relativeTime(isoAgo(3 * 24 * 3_600_000))).toBe("לפני 3 ימים");
    expect(relativeTime(isoAgo(7 * 24 * 3_600_000))).toBe("לפני שבוע");
    expect(relativeTime(isoAgo(60 * 24 * 3_600_000))).toBe("לפני 2 חודשים");
    expect(relativeTime(isoAgo(365 * 24 * 3_600_000))).toBe("לפני שנה");
  });

  it("clamps a future (clock-skewed) timestamp to 'just now'", () => {
    expect(relativeTime(isoAgo(-60_000))).toBe("לפני רגע");
  });
});

describe("clip", () => {
  it("returns short strings untouched (after whitespace normalisation)", () => {
    expect(clip("שאלה קצרה", 60)).toBe("שאלה קצרה");
  });

  it("collapses runs of whitespace (incl. newlines) to single spaces and trims", () => {
    expect(clip("  שורה\nראשונה\t\tושנייה  ", 60)).toBe("שורה ראשונה ושנייה");
  });

  it("clips to n chars with an ellipsis — total length never exceeds n", () => {
    const out = clip("א".repeat(100), 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toBe("א".repeat(9) + "…");
  });

  it("does NOT clip a string of exactly n chars (no gratuitous ellipsis)", () => {
    const exact = "ב".repeat(10);
    expect(clip(exact, 10)).toBe(exact);
  });

  it("trims a trailing space left at the cut point before appending the ellipsis", () => {
    // cut lands right after "אב " → the dangling space is trimmed, not kept.
    expect(clip("אב גדהוזחט", 4)).toBe("אב…");
  });

  it("returns an empty string for empty/whitespace-only input", () => {
    expect(clip("", 10)).toBe("");
    expect(clip("   \n ", 10)).toBe("");
  });
});

describe("heDate", () => {
  it("formats an ISO timestamp as an absolute Hebrew date", () => {
    expect(heDate("2026-07-06T12:00:00Z")).toBe("6 ביולי 2026");
  });

  it("returns an empty string for an unparseable timestamp (never 'Invalid Date')", () => {
    expect(heDate("not-a-date")).toBe("");
    expect(heDate("")).toBe("");
  });
});

describe("initial", () => {
  it("returns the first rendered char, uppercased", () => {
    expect(initial("dana")).toBe("D");
    expect(initial("  משה")).toBe("מ");
  });

  it("falls back to מ for an empty name", () => {
    expect(initial("   ")).toBe("מ");
  });
});

describe("renderBody", () => {
  it("returns plain text untouched", () => {
    expect(renderBody("שלום לכולם")).toEqual(["שלום לכולם"]);
  });

  it("bolds @mentions as spans (default: mentions only)", () => {
    const nodes = renderBody("תודה @dana על הטיפ") as ReactNode[];
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toBe("תודה ");
    const mention = nodes[1] as ReactElement<{ children: string; className: string }>;
    expect(isValidElement(mention)).toBe(true);
    expect(mention.type).toBe("span");
    expect(mention.props.children).toBe("@dana");
    expect(mention.props.className).toContain("font-semibold");
    expect(nodes[2]).toBe(" על הטיפ");
  });

  it("does not linkify provider names unless linkProviders is set", () => {
    const body = "עברתי אל פרטנר החודש";
    const plain = renderBody(body) as ReactNode[];
    expect(plain).toEqual([body]);
    const linked = renderBody(body, { linkProviders: true }) as ReactNode[];
    const link = linked.find((n) => isValidElement(n)) as
      | ReactElement<{ href: string; children: string }>
      | undefined;
    expect(link).toBeDefined();
    expect(link!.props.href).toBe("/providers/partner");
    expect(link!.props.children).toBe("פרטנר");
  });

  it("styles provider links with the feed default when linkClassName is omitted", () => {
    const linked = renderBody("עברתי אל פרטנר החודש", { linkProviders: true }) as ReactNode[];
    const link = linked.find((n) => isValidElement(n)) as ReactElement<{ className: string }>;
    expect(link.props.className).toBe(
      "font-medium text-accent-text underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    );
  });

  it("linkClassName overrides the provider-link classes (the SEO permalink styling)", () => {
    const cls = "font-medium text-accent-text underline-offset-2 hover:underline";
    const linked = renderBody("עברתי אל פרטנר החודש", {
      linkProviders: true,
      linkClassName: cls,
    }) as ReactNode[];
    const link = linked.find((n) => isValidElement(n)) as ReactElement<{
      href: string;
      children: string;
      className: string;
    }>;
    expect(link.props.className).toBe(cls);
    expect(link.props.href).toBe("/providers/partner");
    expect(link.props.children).toBe("פרטנר");
  });

  it("linkClassName never touches @mention spans", () => {
    const nodes = renderBody("תודה @dana ופרטנר", {
      linkProviders: true,
      linkClassName: "custom-class",
    }) as ReactNode[];
    const mention = nodes.find(
      (n) => isValidElement(n) && n.type === "span",
    ) as ReactElement<{ className: string; children: string }>;
    expect(mention.props.children).toBe("@dana");
    expect(mention.props.className).toBe("font-semibold text-accent-text");
  });
});
