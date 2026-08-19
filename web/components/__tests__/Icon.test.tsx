import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

// ────────────────────────────────────────────────────────────────────────────
// <Icon> mirrors its DIRECTIONAL glyphs with the document direction.
//
// This is load-bearing on a Hebrew site: `arrow` and `chevron` mean
// "forward"/"next", and forward is leftward in RTL, but their SVG paths are
// drawn pointing right. `direction: rtl` reorders inline boxes and does nothing
// to path geometry, so without an explicit flip ~91 forward affordances point
// backwards. Two call sites used to hand-patch `-scale-x-100` around it; the
// flip now lives in the component, and these tests keep it there — and keep it
// off the direction-neutral glyphs, which must NOT mirror.
// ────────────────────────────────────────────────────────────────────────────

import Icon from "../Icon";

const FLIP = "rtl:-scale-x-100";

function classesOf(ui: React.ReactElement): string {
  const { container } = render(ui);
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  return svg!.getAttribute("class") ?? "";
}

describe("Icon — directional mirroring", () => {
  it("mirrors the glyphs whose meaning is a direction", () => {
    expect(classesOf(<Icon name="arrow" />)).toContain(FLIP);
    expect(classesOf(<Icon name="chevron" />)).toContain(FLIP);
  });

  it("leaves direction-neutral glyphs alone", () => {
    // A mirrored checkmark or magnifier is just a wrong-looking icon.
    for (const name of ["check", "close", "search"] as const) {
      expect(classesOf(<Icon name={name} />)).not.toContain(FLIP);
    }
  });

  it("keeps the caller's own className alongside the flip", () => {
    const cls = classesOf(<Icon name="arrow" className="text-accent" />);
    expect(cls).toContain(FLIP);
    expect(cls).toContain("text-accent");
  });

  it("emits no class attribute noise for a plain neutral glyph", () => {
    // Guards the `|| undefined` fallback: a bare icon should not ship class="".
    const { container } = render(<Icon name="check" />);
    expect(container.querySelector("svg")!.hasAttribute("class")).toBe(false);
  });

  it("stays decorative unless given a label", () => {
    const { container, rerender } = render(<Icon name="arrow" />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe(
      "true",
    );

    rerender(<Icon name="arrow" label="המשך" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("המשך");
    expect(svg.hasAttribute("aria-hidden")).toBe(false);
  });
});
