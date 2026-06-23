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

/** Remembers the user's choice so we don't nag on every visit. */
const DISMISS_KEY = "chosech-push-prompt";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) != null;
  } catch {
    return false;
  }
}

function persistDismissed(value: "subscribed" | "dismissed"): void {
  try {
    localStorage.setItem(DISMISS_KEY, value);
  } catch {
    /* ignore — best-effort */
  }
}

export default function PwaInstaller() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  // Register the SW unconditionally (powers offline + push handlers), then decide
  // whether to surface the push opt-in. All branches fail soft.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await registerServiceWorker();

      // Only consider the push prompt if the full stack is supported + a VAPID
      // key is configured, and the user hasn't already decided this session.
      if (!isPushSupported() || readDismissed()) return;

      // Don't prompt if they're already subscribed (e.g. on another tab).
      const existing = await getExistingSubscription();
      if (cancelled) return;
      if (existing) {
        persistDismissed("subscribed");
        return;
      }

      // Don't prompt if notifications are already blocked at the browser level —
      // we can't recover from that here and a prompt would be a dead end.
      try {
        if (Notification.permission === "denied") return;
      } catch {
        return;
      }

      setShowPrompt(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    trackEvent("push_optin_click", { source: "installer" });
    const sub = await subscribeToPush();
    setBusy(false);
    // Either way we stop prompting; record the outcome.
    persistDismissed(sub ? "subscribed" : "dismissed");
    setShowPrompt(false);
    trackEvent(sub ? "push_subscribed" : "push_optin_failed", {
      source: "installer",
    });
  }, []);

  const dismiss = useCallback(() => {
    persistDismissed("dismissed");
    setShowPrompt(false);
    trackEvent("push_optin_dismiss", { source: "installer" });
  }, []);

  if (!showPrompt) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="push-prompt-title"
      className={[
        "fixed bottom-4 end-4 z-30 w-[min(20rem,calc(100vw-2rem))]",
        "rounded-2xl border border-border bg-surface p-4 shadow-float",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2",
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
