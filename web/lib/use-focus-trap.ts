"use client";

// ────────────────────────────────────────────────────────────────────────────
// useFocusTrap — the ONE shared focus-management hook for modal dialogs and
// popover panels (CrmLeadDrawer, CrmMeetingDrawer, AuthModal, AiConcierge).
//
// It owns the full aria-modal focus contract that used to be hand-copied per
// component (with small drifts):
//
//   1. INITIAL FOCUS — on activation, move focus to `initialFocusRef` (or the
//      container as a fallback), optionally after a small delay so an open
//      animation / conditional render doesn't eat the focus.
//   2. TAB CLAMP — Tab / Shift-Tab cycle within the container's focusable
//      elements so the covered page stays unreachable. By default the clamp
//      also PULLS focus back in when it has drifted outside the container
//      (`clampOutsideFocus`); non-modal popovers that keep the page behind
//      interactive should pass `clampOutsideFocus: false` so deliberate
//      interaction outside isn't hijacked.
//   3. ESCAPE — calls `onEscape` (the close callback). `preventDefaultOnEscape`
//      is opt-in for dialogs that must also stop the browser's default Escape
//      behaviour.
//   4. RESTORE — on deactivation, focus returns to the element that was focused
//      when the trap activated (the opener), if it's still in the document.
//      Components that manage their own restoration (e.g. AiConcierge, which
//      must NOT restore on a sibling-popover force-close) pass
//      `restoreFocus: false`.
//
// Two separate effects on purpose: the keydown listener re-subscribes when
// `onEscape` changes identity, while initial-focus/restore runs only on
// activation — exactly matching the previous per-component behaviour.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, type RefObject } from "react";

/** Everything Tab can land on inside the trap (disabled controls excluded). */
const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface FocusTrapOptions {
  /**
   * Gate for the whole trap (default `true`). Components that stay mounted
   * while closed (AuthModal, AiConcierge) pass their `open` flag; components
   * that mount only while open (the CRM drawers) can omit it.
   */
  active?: boolean;
  /** Called when Escape is pressed while the trap is active. */
  onEscape?: () => void;
  /** Also `preventDefault()` the Escape keydown (default `false`). */
  preventDefaultOnEscape?: boolean;
  /** Element to focus on activation; falls back to the container itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Delay (ms) before moving the initial focus — for dialogs whose target
   * renders/animates in. Omit to focus synchronously on activation.
   */
  initialFocusDelay?: number;
  /** Restore focus to the opener on deactivation (default `true`). */
  restoreFocus?: boolean;
  /**
   * When focus is OUTSIDE the container, snap Tab back inside (default `true`,
   * the aria-modal behaviour). Pass `false` for non-modal popovers.
   */
  clampOutsideFocus?: boolean;
}

/**
 * Trap keyboard focus inside `containerRef` while active. See the header
 * comment for the exact contract.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  {
    active = true,
    onEscape,
    preventDefaultOnEscape = false,
    initialFocusRef,
    initialFocusDelay,
    restoreFocus = true,
    clampOutsideFocus = true,
  }: FocusTrapOptions = {},
): void {
  // 1 + 4: initial focus on activation, restore-to-opener on deactivation.
  useEffect(() => {
    if (!active) return;
    const restore = restoreFocus ? (document.activeElement as HTMLElement | null) : null;
    const focusInitial = () => (initialFocusRef?.current ?? containerRef.current)?.focus();
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (initialFocusDelay === undefined) focusInitial();
    else timer = setTimeout(focusInitial, initialFocusDelay);
    return () => {
      if (timer) clearTimeout(timer);
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [active, containerRef, initialFocusRef, initialFocusDelay, restoreFocus]);

  // 2 + 3: Escape closes; Tab is clamped to the container.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (preventDefaultOnEscape) e.preventDefault();
        onEscape?.();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;
      const focusables = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      const inside = containerRef.current.contains(current);
      if (!inside && !clampOutsideFocus) return;
      if (e.shiftKey && (!inside || current === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || current === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, containerRef, onEscape, preventDefaultOnEscape, clampOutsideFocus]);
}
