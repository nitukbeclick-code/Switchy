import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { initial, relativeTime, renderBody } from "@/lib/community-render";

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
});
