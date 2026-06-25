"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ConsentBanner> — GA4 cookie-consent gate (Consent Mode v2).
//
// Mirrors the static site (site/script.js + site/build.js): the layout's gtag
// snippet sets consent DEFAULT = denied for every storage type, so GA4 loads but
// stays cookieless until the user opts in. This banner is the opt-in surface.
//
// Behavior (identical to the static site):
//   • localStorage key `cookieConsent`, values "granted" | "denied".
//   • On mount: a stored "granted" replays gtag('consent','update', granted) so a
//     returning consenter is tracked again. A stored "granted"/"denied" keeps the
//     banner hidden — no flash for returning users (the server snapshot is "no
//     choice → hidden", so SSR + first client paint match; useSyncExternalStore
//     then reads the real localStorage choice without a setState-in-effect).
//   • No stored choice → banner shows. "אישור" → granted; "רק חיוני" → denied.
//   • Granting updates ad_* + analytics to "granted"; denying just records the
//     refusal (defaults stay denied → GA4 stays cookieless).
//
// RTL Hebrew, design-system tokens (glass surface, ink text, green action CTA).
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

const STORAGE_KEY = "cookieConsent";

type Choice = "granted" | "denied";

/** Safe localStorage read — private mode / blocked storage must never throw. */
function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

// ── External store: the persisted consent choice ─────────────────────────────
// useSyncExternalStore lets us render from localStorage with a stable SSR
// snapshot (no choice → hidden) and no setState-in-effect. Our own button clicks
// write the choice and notify subscribers, which re-renders the banner closed.
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): Choice | "" {
  return readChoice() ?? "";
}

/** Server snapshot: never reveal during SSR (avoids hydration flash). */
function getServerSnapshot(): Choice | "" {
  return "";
}

/** Persist the choice and notify subscribers so the banner re-renders closed. */
function persistChoice(choice: Choice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* ignore — best-effort; the click handler still applies the gtag update */
  }
  for (const cb of listeners) cb();
}

/** Push a Consent Mode v2 update into the dataLayer (best-effort). */
function updateConsent(choice: Choice): void {
  try {
    const state: Choice = choice === "granted" ? "granted" : "denied";
    window.gtag?.("consent", "update", {
      analytics_storage: state,
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
    });
  } catch {
    /* analytics is best-effort — never block the UI on it */
  }
}

export default function ConsentBanner() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Drawer enter: a one-frame `mounted` flip drives an INTERRUPTIBLE CSS transition
  // (Emil rule 9 — transitions, not keyframes, so a dismiss mid-enter doesn't jump).
  // Resting OFF-screen at translateY(100%); flips to 0 on the next frame.
  const [mounted, setMounted] = useState(false);
  // Graceful EXIT: when the user chooses, we don't unmount instantly — we keep the
  // element in the DOM and reverse the SAME interruptible transition (slide back
  // DOWN + fade), then unmount on transitionend (timeout fallback for browsers /
  // reduced-motion that don't fire it). `closing` is the exit driver; a re-render
  // that re-shows the banner (mid-exit re-open) cancels it cleanly. The persisted
  // choice still hides the banner from the store — `closing` only keeps the
  // *visual* element alive a beat longer, and we DROP the dialog role + a11y
  // presence the instant we start closing (the choice has been made, so it is no
  // longer an active dialog) — preserving the "hidden after grant/deny" contract.
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldShow = stored === "";

  useEffect(() => {
    if (!shouldShow) return;
    // Re-opening (store cleared back to "") cancels any in-flight exit. We do this
    // inside the rAF callback (not synchronously in the effect body) so the enter
    // flip stays a single, clean external sync.
    const id = requestAnimationFrame(() => {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setClosing(false);
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [shouldShow]);

  // Replay an existing grant so GA4 gets the green light on every load. This is a
  // sync-to-external-system effect (pushing React state into gtag), not a render
  // driver — it sets no React state.
  useEffect(() => {
    if (stored === "granted") updateConsent("granted");
  }, [stored]);

  // Clear any pending exit timer on unmount.
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  function choose(choice: Choice) {
    updateConsent(choice);
    // Begin the EXIT: flip to the closing state (reverses the slide/fade) and
    // persist immediately so the store-driven `shouldShow` goes false. We keep the
    // element mounted via `closing` until the transition settles.
    setClosing(true);
    setMounted(false);
    persistChoice(choice);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    // Fallback in case transitionend never fires (reduced-motion, no layout, etc.).
    exitTimer.current = setTimeout(() => {
      setClosing(false);
      exitTimer.current = null;
    }, 360);
  }

  function onExited() {
    // Only finalize when we're actually closing (ignore the enter transition end).
    if (!shouldShow) {
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setClosing(false);
    }
  }

  // Render while a choice is pending (enter) OR while exiting (closing). A stored
  // choice with no in-flight exit hides the banner entirely.
  if (!shouldShow && !closing) return null;

  // During the exit the choice has been made: the surface is no longer an active
  // dialog, so we strip the dialog role / label / live region and hide it from a11y
  // + pointer input. queryByRole("dialog") therefore finds nothing the moment a
  // choice is made — the tested "hidden after grant/deny" contract holds — while
  // the element lingers purely to play its slide-down exit.
  const isExiting = !shouldShow;

  return (
    <div
      {...(isExiting
        ? { "aria-hidden": true }
        : { role: "dialog", "aria-label": "הסכמה לעוגיות", "aria-live": "polite" })}
      onTransitionEnd={onExited}
      className={[
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur-sm",
        "shadow-[0_-4px_24px_rgba(2,6,23,0.10)]",
        // Drawer slide: GPU-only (transform+opacity), drawer easing. Interruptible
        // transition off the `mounted`/`closing` flips — not a keyframe — so the
        // SAME curve runs in reverse on exit and a mid-exit re-open reverses cleanly.
        // Enter ease settles over 300ms; exit is a touch faster (250ms) per Emil.
        "transition-[transform,opacity] ease-[var(--ease-drawer)]",
        isExiting ? "duration-[250ms]" : "duration-300",
        "motion-reduce:transition-opacity",
        // Closing/exiting → off-screen down + transparent (and inert); never blocks.
        isExiting ? "pointer-events-none" : "",
        mounted && !isExiting
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0",
      ].join(" ")}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm leading-relaxed text-foreground">
          אנחנו משתמשים ב-cookies כדי לנתח שימוש ולשפר את האתר.{" "}
          <Link
            href="/privacy"
            className="rounded text-accent-text underline transition-colors duration-150 ease-[var(--ease-out)] hover:text-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            מדיניות הפרטיות
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose("denied")}
            className="rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-ink transition-[color,background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-background active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            רק חיוני
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-contrast transition-[color,background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-accent-hover active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  );
}
