// ────────────────────────────────────────────────────────────────────────────
// Vitest setup for the jsdom (component) test project.
//
// - Registers @testing-library/jest-dom custom matchers (toBeInTheDocument,
//   toHaveAttribute, toBeDisabled, …) on Vitest's expect.
// - Auto-cleans the rendered React tree between tests so test order can't leak
//   DOM/state across cases.
// - jsdom doesn't implement matchMedia; ThemeToggle subscribes to it, so we
//   provide a minimal, no-op-listener stub (defaults to light / not-dark).
// ────────────────────────────────────────────────────────────────────────────

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom only exposes a working Storage for a non-opaque origin, and even then
// the methods can be missing depending on the runner. Components under test
// (ThemeToggle, ConsentBanner) read/write localStorage and already guard with
// try/catch, so a simple, deterministic in-memory Storage polyfill is the most
// robust setup — tests control the values, not the host environment.
function makeStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      store = {};
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    key(i: number) {
      return Object.keys(store)[i] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  } as Storage;
}

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: makeStorage(),
});
Object.defineProperty(window, "sessionStorage", {
  configurable: true,
  value: makeStorage(),
});

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom ships HTMLCanvasElement but no drawing backend: getContext()/toDataURL()
// log a noisy "Error: Not implemented … (without installed canvas package)"
// stack into the suite output (BillUploader's compressImage() hits both). Stub
// the minimal 2D surface the code under test touches so the output stays clean
// and the canvas compress path genuinely runs: getContext("2d") returns a
// context whose drawImage is a no-op, and toDataURL returns a tiny valid JPEG
// data-URL (so "compressed output smaller than source" guards behave normally).
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = (() =>
    ({
      drawImage: () => {},
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = () =>
    "data:image/jpeg;base64,c3R1Yg==";
}
