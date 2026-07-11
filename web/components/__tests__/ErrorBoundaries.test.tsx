// ────────────────────────────────────────────────────────────────────────────
// app/error.tsx + app/global-error.tsx — the two error boundaries were the only
// untested UI on the public surface. We assert the RECOVERY CONTRACT verified
// against the bundled Next docs (node_modules/next/dist/docs/01-app/
// 03-api-reference/03-file-conventions/error.md):
//   • the boundary receives `unstable_retry()` (re-fetch + re-render — the
//     documented first choice) and the older `reset()` (re-render only);
//   • "נסו שוב" must PREFER unstable_retry and FALL BACK to reset when the
//     runtime doesn't provide it (unstable_retry is typed optional for exactly
//     that reason);
//   • the non-sensitive `digest` is surfaced for support, the raw error message
//     is NEVER rendered (it can leak internals), and the error is logged.
//
// global-error replaces the entire root layout, so it renders its own
// <html>/<body> (per the docs) and offers a HARD <a href="/"> escape (a soft
// next/link could re-enter the crashed tree).
//
// These files live under app/, but the jsdom test project only includes
// components/**/__tests__ — hence this file's location.
// ────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ErrorBoundary from "@/app/error";
import GlobalError from "@/app/global-error";

// Both boundaries deliberately console.error(error) on mount (client-side
// debugging hook). Spy + silence it so the suite output stays clean — this also
// swallows React's expected "<html> cannot be a child of <div>" nesting warning
// when GlobalError's own <html>/<body> render inside the test container.
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

/** A server-style error carrying the non-sensitive digest hash. */
function digestError(): Error & { digest?: string } {
  return Object.assign(new Error("internal secret detail"), {
    digest: "d1g3st42",
  });
}

describe("app/error.tsx — segment error boundary", () => {
  it("prefers unstable_retry() (re-fetch + re-render) for נסו שוב", async () => {
    const reset = vi.fn();
    const retry = vi.fn();
    const user = userEvent.setup();
    render(
      <ErrorBoundary error={digestError()} reset={reset} unstable_retry={retry} />,
    );

    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("falls back to reset() on runtimes without unstable_retry", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<ErrorBoundary error={digestError()} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("shows the heading, a real home link, and logs the error", () => {
    const err = digestError();
    render(<ErrorBoundary error={err} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "משהו השתבש" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "חזרה לדף הבית" }),
    ).toHaveAttribute("href", "/");
    expect(consoleError).toHaveBeenCalledWith(err);
  });

  it("surfaces the digest for support but never the raw error message", () => {
    render(<ErrorBoundary error={digestError()} reset={vi.fn()} />);

    expect(screen.getByText("d1g3st42")).toBeInTheDocument();
    expect(screen.getByText(/קוד שגיאה לפנייה לתמיכה/)).toBeInTheDocument();
    // The raw message can leak internals — it must NOT render.
    expect(screen.queryByText(/internal secret detail/)).not.toBeInTheDocument();
  });

  it("omits the digest block when the error carries none", () => {
    render(<ErrorBoundary error={new Error("boom")} reset={vi.fn()} />);
    expect(
      screen.queryByText(/קוד שגיאה לפנייה לתמיכה/),
    ).not.toBeInTheDocument();
  });
});

describe("app/global-error.tsx — root-layout replacement boundary", () => {
  it("prefers unstable_retry() and falls back to reset()", async () => {
    const reset = vi.fn();
    const retry = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <GlobalError error={digestError()} reset={reset} unstable_retry={retry} />,
    );

    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
    unmount();

    render(<GlobalError error={digestError()} reset={reset} />);
    await user.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("renders the heading, digest, and a HARD <a href='/'> escape hatch", () => {
    const err = digestError();
    render(<GlobalError error={err} reset={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "משהו השתבש" }),
    ).toBeInTheDocument();
    // The whole SPA shell is broken here — the home link must be a plain anchor
    // (full reload), which is exactly what an <a> without a router renders.
    expect(
      screen.getByRole("link", { name: "חזרה לדף הבית" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByText("d1g3st42")).toBeInTheDocument();
    expect(screen.queryByText(/internal secret detail/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(err);
  });
});
