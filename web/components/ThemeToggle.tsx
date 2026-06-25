"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ThemeToggle> — light/dark switch for the site masthead.
//
// Mirrors the static site (site/build.js #themeToggle + site/styles.css): the
// chosen theme lives in localStorage under `chosech-theme` ("light" | "dark"),
// and is reflected as `data-theme` on <html>. A no-flash inline guard in
// app/layout.tsx sets that attribute from storage (or the system preference)
// BEFORE first paint, so this component only needs to read/flip it at runtime.
//
// Hydration safety: the resolved theme is client-only state. We read it through
// useSyncExternalStore with a stable SERVER snapshot ("light" — matches the
// `data-theme="light"` the server renders on <html>), so SSR and the first
// client render agree and React never warns. After hydration the real value is
// read from the DOM attribute the head-guard already set, with no flash and no
// setState-in-effect.
//
// a11y: a real <button> (keyboard + screen-reader native). `aria-pressed`
// reflects dark = on; `aria-label` is a Hebrew description; the sun/moon glyphs
// are aria-hidden decorative SVGs.
// ────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "chosech-theme";

type Theme = "light" | "dark";

/** Resolve the active theme from the <html data-theme> attribute (DOM = truth). */
function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

// ── External store: the <html data-theme> attribute ──────────────────────────
// Our own toggle mutates the attribute + storage and notifies subscribers; we
// also listen for the OS preference changing so a system-default user follows it
// live (until they make an explicit choice, which persists and wins).
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);

  // Follow the OS preference while the user hasn't made an explicit choice.
  const mql =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  const onSystemChange = () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* storage blocked — fall through to following the system */
    }
    if (stored !== "light" && stored !== "dark") {
      applyTheme(mql?.matches ? "dark" : "light", { persist: false });
    }
  };
  mql?.addEventListener?.("change", onSystemChange);

  return () => {
    listeners.delete(cb);
    mql?.removeEventListener?.("change", onSystemChange);
  };
}

function getSnapshot(): Theme {
  return readTheme();
}

/** Server snapshot — must match the `data-theme="light"` the server renders. */
function getServerSnapshot(): Theme {
  return "light";
}

/** Reflect a theme onto <html> (and optionally persist the explicit choice). */
function applyTheme(theme: Theme, opts: { persist: boolean }): void {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  if (opts.persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* best-effort — the in-DOM attribute change still applies for this session */
    }
  }
  notify();
}

export interface ThemeToggleProps {
  /** Optional extra classes on the <button>. */
  className?: string;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(isDark ? "light" : "dark", { persist: true })}
      aria-label="מעבר בין מצב בהיר למצב כהה"
      aria-pressed={isDark}
      title={isDark ? "עבור למצב בהיר" : "עבור למצב כהה"}
      className={[
        // A square icon control that sits on the glass masthead. Tokens only, so
        // it re-skins in dark mode automatically. ≥44px target via padding.
        "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-foreground transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] hover:border-accent/40 hover:bg-accent/[0.06] hover:text-accent active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      {/* Sun (shown in dark mode → "switch to light") */}
      {isDark ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        /* Moon (shown in light mode → "switch to dark") */
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
