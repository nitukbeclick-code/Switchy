"use client";

// ────────────────────────────────────────────────────────────────────────────
// <StickyLeadCta> — a MOBILE-ONLY sticky bar that pins one primary CTA to the
// bottom of the viewport and scrolls to the EXISTING lead form (the `#lead`
// section already rendered on the page). It does NOT duplicate the form or any of
// its logic, consent, or API — it is purely a navigation affordance into it.
//
// UX / funnel discipline:
//   • Hidden on sm+ (the in-page CTAs are visible there; one primary CTA per view).
//   • Auto-hides once the real lead form scrolls into view, so the page never
//     shows two competing lead CTAs at once.
//   • Smooth-scrolls to #lead and respects prefers-reduced-motion.
//   • Fires a non-PII "cta_click" event (reuses lib/tracking), fire-and-forget.
//
// HONESTY: the label is the same free / no-commitment promise used elsewhere —
// no fake urgency, no countdown, no invented social proof.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { trackEvent } from "@/lib/tracking";

export interface StickyLeadCtaProps {
  /**
   * Non-PII source label for analytics (e.g. "home" / "compare" / "service" /
   * "city"), so the sticky CTA's clicks are attributable per page type.
   */
  source: string;
  /** CTA label. Defaults to the standard free-offer copy. */
  label?: string;
  /** The in-page anchor to scroll to. Defaults to the shared "#lead" section. */
  targetId?: string;
}

export default function StickyLeadCta({
  source,
  label = "קבלת הצעה חינם",
  targetId = "lead",
}: StickyLeadCtaProps) {
  // Hidden until we know the lead section exists AND is not currently on screen.
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return; // No lead form on this page → never show the bar.

    // Show the bar only while the lead form is OUT of view; hide it once the
    // user reaches the form (avoids two competing CTAs stacking up).
    const io = new IntersectionObserver(
      ([entry]) => {
        // Show the bar only while the lead form is OUT of view.
        setVisible(!entry.isIntersecting);
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );
    io.observe(target);
    observerRef.current = io;
    return () => {
      io.disconnect();
    };
  }, [targetId]);

  function handleClick() {
    trackEvent("cta_click", { location: "sticky", label: "lead", source });
    const target = document.getElementById(targetId);
    if (!target) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <div
      // Mobile-only: the in-page CTAs cover sm+; this keeps one primary CTA/view.
      className={[
        "fixed inset-x-0 bottom-0 z-40 sm:hidden",
        "border-t border-border bg-surface/95 backdrop-blur",
        "px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]",
        "transition-transform duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-none",
        visible ? "translate-y-0" : "translate-y-full",
      ].join(" ")}
      // Keep it out of the a11y tree + tab order while hidden off-screen.
      aria-hidden={!visible}
    >
      <button
        type="button"
        onClick={handleClick}
        tabIndex={visible ? 0 : -1}
        className="interactive press flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 font-semibold text-accent-contrast shadow-float hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {label}
        {/* Page is always dir="rtl"; flip the end-pointing arrow so it points to
            the logical "forward" (left) like the prior ← — direction-aware, never
            a hardcoded glyph. */}
        <Icon name="arrow" size={18} aria-hidden="true" className="-scale-x-100" />
      </button>
      <p className="mt-1.5 text-center text-[11px] leading-snug text-muted">
        השוואה חינמית · ללא התחייבות · פנייה רק באישורכם
      </p>
    </div>
  );
}
