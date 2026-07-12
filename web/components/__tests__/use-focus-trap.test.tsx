// ────────────────────────────────────────────────────────────────────────────
// useFocusTrap (lib/use-focus-trap.ts) — the ONE shared modal/popover focus
// hook used by CrmLeadDrawer, CrmMeetingDrawer, AuthModal and AiConcierge.
// The test lives here (not lib/__tests__) because the "component" vitest
// project is the jsdom one, and a hook exercising the DOM needs jsdom + React.
//
// jsdom implements no native Tab navigation, so every focus move we observe is
// the hook's own doing — which is exactly the contract we want to pin:
// initial focus, Escape → onEscape, Tab/Shift-Tab clamped at the edges,
// restore-to-opener on deactivation, and the two opt-outs
// (restoreFocus:false, clampOutsideFocus:false) that AiConcierge/AuthModal use.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap, type FocusTrapOptions } from "@/lib/use-focus-trap";

function Harness({ options = {} }: { options?: Omit<FocusTrapOptions, "initialFocusRef"> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(containerRef, { initialFocusRef: firstRef, ...options });
  return (
    <div>
      <button type="button">opener</button>
      <div ref={containerRef}>
        <button ref={firstRef} type="button">
          first
        </button>
        <button type="button">middle</button>
        <button type="button">last</button>
      </div>
    </div>
  );
}

const btn = (name: string) => screen.getByRole("button", { name });

afterEach(() => {
  vi.useRealTimers();
});

describe("useFocusTrap — activation focus + restore", () => {
  it("focuses the initial target synchronously and restores the opener on deactivation", () => {
    const { rerender } = render(<Harness options={{ active: false }} />);
    btn("opener").focus();

    rerender(<Harness options={{ active: true }} />);
    expect(btn("first")).toHaveFocus();

    rerender(<Harness options={{ active: false }} />);
    expect(btn("opener")).toHaveFocus();
  });

  it("defers the initial focus by initialFocusDelay", () => {
    vi.useFakeTimers();
    render(<Harness options={{ initialFocusDelay: 40 }} />);
    expect(btn("first")).not.toHaveFocus();
    vi.advanceTimersByTime(40);
    expect(btn("first")).toHaveFocus();
  });

  it("does not restore the opener when restoreFocus is false", () => {
    const { rerender } = render(<Harness options={{ active: false, restoreFocus: false }} />);
    btn("opener").focus();
    rerender(<Harness options={{ active: true, restoreFocus: false }} />);
    expect(btn("first")).toHaveFocus();
    rerender(<Harness options={{ active: false, restoreFocus: false }} />);
    expect(btn("opener")).not.toHaveFocus();
  });
});

describe("useFocusTrap — Escape", () => {
  it("calls onEscape while active, and not when inactive", () => {
    const onEscape = vi.fn();
    const { rerender } = render(<Harness options={{ onEscape }} />);
    fireEvent.keyDown(btn("middle"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);

    rerender(<Harness options={{ onEscape, active: false }} />);
    fireEvent.keyDown(btn("middle"), { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("prevents the default only when preventDefaultOnEscape is set", () => {
    const { rerender } = render(<Harness options={{ onEscape: () => {} }} />);
    expect(fireEvent.keyDown(btn("middle"), { key: "Escape" })).toBe(true); // not cancelled

    rerender(<Harness options={{ onEscape: () => {}, preventDefaultOnEscape: true }} />);
    expect(fireEvent.keyDown(btn("middle"), { key: "Escape" })).toBe(false); // cancelled
  });
});

describe("useFocusTrap — Tab clamp", () => {
  it("wraps Tab from the last control to the first, and Shift-Tab from first to last", () => {
    render(<Harness />);

    btn("last").focus();
    fireEvent.keyDown(btn("last"), { key: "Tab" });
    expect(btn("first")).toHaveFocus();

    fireEvent.keyDown(btn("first"), { key: "Tab", shiftKey: true });
    expect(btn("last")).toHaveFocus();
  });

  it("leaves Tab alone in the middle of the container", () => {
    render(<Harness />);
    btn("middle").focus();
    // Not cancelled → the (native) tab order would proceed normally.
    expect(fireEvent.keyDown(btn("middle"), { key: "Tab" })).toBe(true);
    expect(btn("middle")).toHaveFocus();
  });

  it("pulls focus back inside when it drifted out (default), unless clampOutsideFocus is false", () => {
    const { rerender } = render(<Harness />);

    btn("opener").focus();
    fireEvent.keyDown(btn("opener"), { key: "Tab" });
    expect(btn("first")).toHaveFocus();

    rerender(<Harness options={{ clampOutsideFocus: false }} />);
    btn("opener").focus();
    expect(fireEvent.keyDown(btn("opener"), { key: "Tab" })).toBe(true); // untouched
    expect(btn("opener")).toHaveFocus();
  });

  it("skips disabled controls when picking the clamp edges", () => {
    function DisabledEdge() {
      const containerRef = useRef<HTMLDivElement>(null);
      useFocusTrap(containerRef);
      return (
        <div ref={containerRef}>
          <button type="button">first</button>
          <button type="button" disabled>
            disabled-last
          </button>
        </div>
      );
    }
    render(<DisabledEdge />);
    // "first" is also the last ENABLED control → Tab wraps back onto it.
    btn("first").focus();
    fireEvent.keyDown(btn("first"), { key: "Tab" });
    expect(btn("first")).toHaveFocus();
  });
});
