// ────────────────────────────────────────────────────────────────────────────
// <ThemeToggle> — the masthead light/dark switch. The component's contract:
//   • DOM is truth: it reads <html data-theme> and reflects it via aria-pressed.
//   • Clicking flips the attribute AND persists the explicit choice to
//     localStorage under `chosech-theme`.
// We assert that behaviour against the real jsdom <html> + localStorage; the
// matchMedia stub from vitest.setup.ts keeps useSyncExternalStore's subscribe
// path from throwing.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle, { THEME_STORAGE_KEY } from "@/components/ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  // Start from the server-rendered default the head-guard would produce.
  document.documentElement.setAttribute("data-theme", "light");
});

describe("ThemeToggle", () => {
  it("renders an accessible button reflecting the light default (not pressed)", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", {
      name: "מעבר בין מצב בהיר למצב כהה",
    });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("toggling to dark sets <html data-theme>, persists to localStorage, and flips aria-pressed", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");

    await user.click(btn);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("toggling back to light updates the attribute, storage, and aria-pressed", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");

    await user.click(btn); // → dark
    await user.click(btn); // → light

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("reads an existing dark attribute on mount as pressed", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
