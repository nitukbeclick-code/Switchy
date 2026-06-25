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

import { useCallback, useEffect, useState } from "react";
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
// Cool-off before re-asking after the Nth dismissal: 3d, then 10d, then 30d.
const COOLOFF_DAYS = [3, 10, 30];
const MAX_DISMISSALS = COOLOFF_DAYS.length;
// Don't interrupt first paint / the LCP — wait for the visitor to settle in
// before surfacing the prompt (context: they've stuck around past initial load).
const ENGAGE_DELAY_MS = 12_000;

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
  // One-frame `mounted` flip drives the INTERRUPTIBLE enter transition (Emil rule
  // 9). Reset whenever the prompt is (re)shown so the slide-up replays cleanly.
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  // The prior dismissal count, captured when we decide to surface, so enable()/
  // dismiss() can persist the next record with the right escalating cool-off.
  const [priorDismissals, setPriorDismissals] = useState(0);

  // Register the SW unconditionally (powers offline + push handlers), then decide
  // whether to surface the push opt-in. All branches fail soft.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

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
      // the escalating cool-off window.
      if (!maySurface(record)) return;

      // Don't prompt if notifications are already blocked at the browser level —
      // we can't recover from that here and a prompt would be a dead end.
      try {
        if (Notification.permission === "denied") return;
      } catch {
        return;
      }

      setPriorDismissals(record?.state === "dismissed" ? record.count : 0);

      // CONTEXT-AWARE: don't pop during initial load. Wait until the visitor has
      // stuck around (a soft engagement signal) before surfacing, and only while
      // the tab is actually visible — never interrupt a backgrounded tab.
      const surface = () => {
        if (!cancelled) setShowPrompt(true);
      };
      timer = setTimeout(() => {
        if (cancelled) return;
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          // Defer until the tab is foregrounded again.
          const onVisible = () => {
            if (document.visibilityState === "visible") {
              document.removeEventListener("visibilitychange", onVisible);
              surface();
            }
          };
          document.addEventListener("visibilitychange", onVisible);
          return;
        }
        surface();
      }, ENGAGE_DELAY_MS);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    trackEvent("push_optin_click", { source: "installer" });
    const sub = await subscribeToPush();
    setBusy(false);
    setShowPrompt(false);
    if (sub) {
      persistSubscribed();
      trackEvent("push_subscribed", { source: "installer" });
    } else {
      // Subscribe failed/denied → count it as a dismissal so the cool-off applies.
      persistDismissed(priorDismissals);
      trackEvent("push_optin_failed", { source: "installer" });
    }
  }, [priorDismissals]);

  const dismiss = useCallback(() => {
    persistDismissed(priorDismissals);
    setShowPrompt(false);
    trackEvent("push_optin_dismiss", {
      source: "installer",
      dismissals: priorDismissals + 1,
    });
  }, [priorDismissals]);

  // Flip `mounted` one frame after the prompt mounts so the resting
  // translateY(.75rem)/opacity:0 transitions UP into place (interruptible).
  useEffect(() => {
    if (!showPrompt) {
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, [showPrompt]);

  if (!showPrompt) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="push-prompt-title"
      className={[
        "fixed bottom-4 end-4 z-30 w-[min(20rem,calc(100vw-2rem))]",
        "rounded-2xl border border-border bg-surface p-4 shadow-float",
        // Toast-style slide-up: GPU-only (transform+opacity), drawer easing, dropdown
        // band (250ms). Interruptible CSS transition off `mounted` — not a keyframe —
        // so a quick dismiss reverses cleanly. Reduced-motion keeps only the fade.
        "transition-[transform,opacity] duration-[250ms] ease-[var(--ease-drawer)]",
        "motion-reduce:transition-opacity",
        mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
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
