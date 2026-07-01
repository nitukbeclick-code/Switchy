"use client";

// ────────────────────────────────────────────────────────────────────────────
// <PwaInstaller> — registers the service worker and (optionally) manages web-push
// opt-in. Mounted once in the root layout.
//
// Two responsibilities, both progressive enhancements that fail soft:
//
//   1. SERVICE WORKER — register /service-worker.js on mount so the offline shell
//      + cache-busting + push handlers are live. This is unconditional (it powers
//      offline support even without push) and silent; it renders no UI.
//
//   2. WEB-PUSH OPT-IN — a small, dismissible prompt offering price-drop / renewal
//      alerts. Shown ONLY when push is supported AND a VAPID key is configured AND
//      the user hasn't already chosen. Subscribing requires an explicit click
//      (browser permission rules). Everything is fail-soft: no support / no key /
//      denied permission ⇒ the prompt simply doesn't appear or quietly closes.
//
// PRIVACY: subscribing sends only the opaque PushSubscription to /api/push (no
// PII). The user can decline; nothing is stored without the click.
//
// Dark-mode + premium-2026 tokens, RTL Hebrew, a11y. Pinned bottom-END so it does
// NOT collide with the <AiConcierge> launcher (bottom-START) or the mobile sticky
// lead bar.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  isPushSupported,
  registerServiceWorker,
  getExistingSubscription,
  subscribeToPush,
} from "@/lib/push";
import { trackEvent } from "@/lib/tracking";

// ── Re-prompt policy ─────────────────────────────────────────────────────────
// We store the push-opt-in decision as a small JSON record (not a bare flag) so
// the prompt can be CONTEXT-AWARE rather than "ask once, then never / nag every
// load". Rules:
//   • "subscribed"  → terminal: never ask again.
//   • "dismissed"   → backs off: re-ask only after a cool-off that grows with the
//                     number of prior dismissals, and at most MAX_DISMISSALS times
//                     total. After that we stop asking for good.
// Everything is best-effort localStorage and fails soft (storage blocked ⇒ we
// simply don't re-prompt, never throw).
const DISMISS_KEY = "chosech-push-prompt";
const DAY_MS = 24 * 60 * 60 * 1000;
// Cool-off before re-asking after the Nth dismissal: NEVER within 7 days of a
// dismissal (Google intrusive-interstitial guidance), then 14d, then 30d.
const COOLOFF_DAYS = [7, 14, 30];
const MAX_DISMISSALS = COOLOFF_DAYS.length;
// ── Engagement gate ──────────────────────────────────────────────────────────
// The prompt must NEVER pop on first paint / cover the primary CTA. It surfaces
// only after a real engagement signal — whichever comes FIRST of:
//   • the visitor's 2nd in-app page navigation (route change), or
//   • >25s of dwell time on the site, or
//   • a first meaningful interaction (tap/click on a link/button/control, or
//     scrolling meaningfully into the page).
const DWELL_MS = 25_000;
const SCROLL_ENGAGE_PX = 400;

type PromptRecord =
  | { state: "subscribed" }
  | { state: "dismissed"; count: number; at: number };

function readRecord(): PromptRecord | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    // Back-compat: the previous version stored the bare strings
    // "subscribed" | "dismissed". Map a legacy dismissal to a first-dismissal
    // record dated NOW (not the epoch) so the cool-off starts fresh — a returning
    // user who once said "no" isn't immediately re-nagged on this load.
    if (raw === "subscribed") return { state: "subscribed" };
    if (raw === "dismissed") return { state: "dismissed", count: 1, at: Date.now() };
    const parsed = JSON.parse(raw) as PromptRecord;
    if (parsed && (parsed.state === "subscribed" || parsed.state === "dismissed")) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function persistSubscribed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify({ state: "subscribed" }));
  } catch {
    /* ignore — best-effort */
  }
}

function persistDismissed(prevCount: number): void {
  try {
    const record: PromptRecord = {
      state: "dismissed",
      count: prevCount + 1,
      at: Date.now(),
    };
    localStorage.setItem(DISMISS_KEY, JSON.stringify(record));
  } catch {
    /* ignore — best-effort */
  }
}

/**
 * Decide whether the opt-in may be shown given the stored decision.
 * `true` only when: never asked, OR previously dismissed, still within the
 * dismissal budget, and past the (escalating) cool-off window.
 */
function maySurface(record: PromptRecord | null): boolean {
  if (!record) return true; // never asked
  if (record.state === "subscribed") return false; // terminal
  if (record.count >= MAX_DISMISSALS) return false; // budget spent → stop nagging
  const coolOffDays = COOLOFF_DAYS[record.count - 1] ?? COOLOFF_DAYS[MAX_DISMISSALS - 1];
  return Date.now() - record.at >= coolOffDays * DAY_MS;
}

export default function PwaInstaller() {
  const [showPrompt, setShowPrompt] = useState(false);
  // Engagement gate: `eligible` = the push-policy checks passed (support, VAPID,
  // not subscribed, cool-off elapsed, permission not denied); `engaged` = the
  // visitor produced a real engagement signal (2nd navigation / 25s dwell /
  // first meaningful interaction). The prompt surfaces only when BOTH are true.
  const [eligible, setEligible] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const surfacedRef = useRef(false);
  // One-frame `mounted` flip drives the INTERRUPTIBLE enter transition (Emil rule
  // 9). Reset whenever the prompt is (re)shown so the slide-up replays cleanly.
  const [mounted, setMounted] = useState(false);
  // Graceful EXIT: enable()/dismiss() set `showPrompt=false`, but we keep the
  // toast mounted via `closing` and reverse the SAME interruptible transition
  // (slide back DOWN + fade), then unmount on transitionend (timeout fallback).
  // A re-surface mid-exit cancels `closing` and the enter transition replays.
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  // The prior dismissal count, captured when we decide to surface, so enable()/
  // dismiss() can persist the next record with the right escalating cool-off.
  const [priorDismissals, setPriorDismissals] = useState(0);

  // Register the SW unconditionally (powers offline + push handlers), then decide
  // whether the push opt-in is ELIGIBLE (policy checks). All branches fail soft.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await registerServiceWorker();

      // Only consider the push prompt if the full stack is supported.
      if (!isPushSupported()) return;

      const record = readRecord();

      // Already subscribed (this or another tab) → record it and never ask again.
      const existing = await getExistingSubscription();
      if (cancelled) return;
      if (existing) {
        persistSubscribed();
        return;
      }

      // Respect the re-prompt policy: terminal subscribe, dismissal budget, and
      // the escalating cool-off window (≥7 days after any dismissal).
      if (!maySurface(record)) return;

      // Don't prompt if notifications are already blocked at the browser level —
      // we can't recover from that here and a prompt would be a dead end.
      try {
        if (Notification.permission === "denied") return;
      } catch {
        return;
      }

      setPriorDismissals(record?.state === "dismissed" ? record.count : 0);
      setEligible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Engagement signals (whichever fires FIRST flips `engaged`) ─────────────
  // 1) 2nd in-app page navigation — count route changes via Next's usePathname
  //    (this component lives in the root layout, so it survives client navs).
  const pathname = usePathname();
  const navCountRef = useRef(-1); // first run is the landing render, not a nav
  useEffect(() => {
    navCountRef.current += 1;
    if (navCountRef.current >= 2) setEngaged(true);
  }, [pathname]);

  // 2) >25s dwell  ·  3) first meaningful interaction (pointer on an interactive
  // element, a keyboard activation, or a meaningful scroll). Listeners are
  // passive and removed as soon as one fires.
  useEffect(() => {
    if (engaged) return;
    const arm = () => setEngaged(true);

    const timer = setTimeout(arm, DWELL_MS);

    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      // "Meaningful" = an actual control, not a stray tap on empty page.
      if (el?.closest?.("a,button,input,select,textarea,summary,[role='button']")) {
        arm();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") arm();
    };
    const onScroll = () => {
      if (window.scrollY > SCROLL_ENGAGE_PX) arm();
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [engaged]);

  // Surface the prompt only when BOTH eligible and engaged — and only while the
  // tab is actually visible (never interrupt a backgrounded tab). Once per mount.
  useEffect(() => {
    if (!eligible || !engaged || surfacedRef.current) return;
    surfacedRef.current = true;

    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      const onVisible = () => {
        if (document.visibilityState === "visible") {
          document.removeEventListener("visibilitychange", onVisible);
          setShowPrompt(true);
        }
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => document.removeEventListener("visibilitychange", onVisible);
    }
    setShowPrompt(true);
  }, [eligible, engaged]);

  // Begin the graceful exit: flip the prompt closed but keep it MOUNTED via
  // `closing` so the reverse transition (slide back down + fade) can play; finalize
  // on transitionend, with a timeout fallback for reduced-motion / no-layout.
  const beginExit = useCallback(() => {
    setShowPrompt(false);
    setClosing(true);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setClosing(false);
      exitTimer.current = null;
    }, 320);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    trackEvent("push_optin_click", { source: "installer" });
    const sub = await subscribeToPush();
    setBusy(false);
    beginExit();
    if (sub) {
      persistSubscribed();
      trackEvent("push_subscribed", { source: "installer" });
    } else {
      // Subscribe failed/denied → count it as a dismissal so the cool-off applies.
      persistDismissed(priorDismissals);
      trackEvent("push_optin_failed", { source: "installer" });
    }
  }, [priorDismissals, beginExit]);

  const dismiss = useCallback(() => {
    persistDismissed(priorDismissals);
    beginExit();
    trackEvent("push_optin_dismiss", {
      source: "installer",
      dismissals: priorDismissals + 1,
    });
  }, [priorDismissals, beginExit]);

  // Flip `mounted` one frame after the prompt mounts so the resting
  // translateY(.75rem)/opacity:0 transitions UP into place (interruptible). All
  // state writes happen INSIDE the rAF callback (not synchronously in the effect
  // body) so the enter/exit reset is a single clean external sync. When the prompt
  // is hidden the visible state is already governed by `mounted && !isExiting` in
  // the className, so we reset `mounted` for the next surface from here too; a
  // re-surface cancels any in-flight exit and replays the enter from rest.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!showPrompt) {
        setMounted(false);
        return;
      }
      if (exitTimer.current) {
        clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setClosing(false);
      setMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, [showPrompt]);

  // Clear any pending exit timer on unmount.
  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    },
    [],
  );

  // Render while the prompt is open OR while it's exiting (kept mounted for the
  // slide-down). Once both are false the toast leaves the DOM.
  if (!showPrompt && !closing) return null;

  // Exiting → strip the dialog role / label and make it inert so a closing toast
  // is never an active dialog and never blocks pointer input.
  const isExiting = !showPrompt;

  return (
    <div
      {...(isExiting
        ? { "aria-hidden": true }
        : { role: "dialog", "aria-labelledby": "push-prompt-title" })}
      onTransitionEnd={() => {
        if (!showPrompt) {
          if (exitTimer.current) {
            clearTimeout(exitTimer.current);
            exitTimer.current = null;
          }
          setClosing(false);
        }
      }}
      className={[
        "fixed bottom-4 end-4 z-30 w-[min(20rem,calc(100vw-2rem))]",
        "rounded-2xl border border-border bg-surface p-4 shadow-float",
        // Toast-style slide: GPU-only (transform+opacity), drawer easing. Interruptible
        // CSS transition off `mounted` — not a keyframe — so the SAME curve reverses on
        // exit and a quick re-surface reverses cleanly. Enter 250ms; exit a touch
        // faster (200ms) per Emil. Reduced-motion keeps only the fade.
        "transition-[transform,opacity] ease-[var(--ease-drawer)]",
        isExiting ? "duration-200" : "duration-[250ms]",
        "motion-reduce:transition-opacity",
        isExiting ? "pointer-events-none" : "",
        mounted && !isExiting
          ? "translate-y-0 opacity-100"
          : "translate-y-3 opacity-0",
        "mb-[env(safe-area-inset-bottom)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg text-accent-text"
        >
          🔔
        </span>
        <div className="min-w-0">
          <h2
            id="push-prompt-title"
            className="font-display text-sm font-bold leading-tight text-ink"
          >
            התראות על ירידות מחיר
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            רוצים שנעדכן אתכם כשמתפרסם מסלול משתלם יותר או כשמתקרב מועד חידוש?
            אפשר לבטל בכל עת.
          </p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          aria-disabled={busy}
          className="interactive press flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast shadow-soft hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {busy ? "מפעיל…" : "כן, עדכנו אותי"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="interactive press rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          לא תודה
        </button>
      </div>
    </div>
  );
}
