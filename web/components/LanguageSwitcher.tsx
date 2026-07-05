"use client";

// ────────────────────────────────────────────────────────────────────────────
// <LanguageSwitcher> — the header globe that opens the site-language menu.
//
// The heavy lifting (collecting page text, calling the `translate` edge function,
// caching, swapping strings, dir-flip, the menu UI) lives in ONE framework-agnostic
// runtime — /translate-runtime.js — shipped byte-identical to the static desktop
// site and here (public/translate-runtime.js). This component only:
//   • renders the globe trigger button (styled to match the header icon cluster),
//   • lazy-loads that runtime after mount (never blocks first paint / hydration),
//   • hands it the Supabase endpoint + anon key and mounts the menu on the button.
//
// Fail-soft: if the runtime can't load, the button is inert and the site stays
// Hebrew — nothing else is affected. data-no-translate keeps the runtime from
// translating its own control.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

declare global {
  interface Window {
    SwitchyI18n?: {
      init: (o?: { supabaseUrl?: string; anonKey?: string }) => void;
      mountMenu: (el: Element) => void;
      getLang: () => string;
    };
  }
}

// Module-level guard so the <script> is injected at most once even if several
// instances mount (there is only one, but this keeps it robust).
let runtimeLoad: Promise<void> | null = null;
function loadRuntime(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.SwitchyI18n) return Promise.resolve();
  if (runtimeLoad) return runtimeLoad;
  runtimeLoad = new Promise<void>((resolve) => {
    const s = document.createElement("script");
    s.src = "/translate-runtime.js";
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => resolve(); // fail-soft — the header just stays Hebrew
    document.head.appendChild(s);
  });
  return runtimeLoad;
}

export default function LanguageSwitcher() {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadRuntime().then(() => {
      if (cancelled || !window.SwitchyI18n || !btnRef.current) return;
      try {
        window.SwitchyI18n.init({ supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY });
        window.SwitchyI18n.mountMenu(btnRef.current);
      } catch {
        /* ignore — inert button, site stays Hebrew */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      data-no-translate
      aria-haspopup="true"
      aria-expanded={false}
      aria-label="בחירת שפה / Language"
      className="interactive press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-[var(--ease-out)] hover:bg-accent/[0.1] hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* Globe mark — inherits currentColor so it tints on hover / adapts to dark. */}
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.6 2.7 3.9 5.9 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.9-3.9-9s1.3-6.3 3.9-9z" />
      </svg>
    </button>
  );
}
