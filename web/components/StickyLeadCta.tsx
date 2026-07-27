"use client";

// ────────────────────────────────────────────────────────────────────────────
// <StickyLeadCta> — a MOBILE-ONLY sticky bar that pins one primary CTA to the
// bottom of the viewport and scrolls to the EXISTING lead form (the `#lead`
// section already rendered on the page). It does NOT duplicate the form or any of
// its logic, consent, or API — it is purely a navigation affordance into it.
//
// UX / funnel discipline:
//   • Hidden on lg+ — the breakpoint where <SiteHeader>'s /book CTA appears
//     (`lg:inline-flex`). These two MUST name the same breakpoint: the bar is the
//     persistent ask below it, the masthead pill is the persistent ask above it,
//     and any gap between them is a width with NO ask in the page chrome.
//
//     It used to be `sm:hidden`, which opened exactly that gap across 640–1023px
//     — and proxy.ts:34 routes `tablet|ipad|kindle|silk|playbook` to THIS app on
//     purpose ("Phones AND tablets count as mobile so touch devices get the
//     touch-first app"), so every tablet landed in it. Measured in Chromium on
//     an iPad UA, before this change:
//
//         route              width      sticky  hdr CTA  first in-page ask
//         /compare/cellular  768x1024   no      no       1391px (fold 1024)
//         /plans             768x1024   no      no       1192px (fold 1024)
//         /                  768x1024   no      no        797px (above fold)
//
//     i.e. on the highest-intent route a tablet visitor had to scroll past a
//     full screen height before the product asked for anything. The "in-page
//     CTAs cover sm+" rationale was a desktop intuition; it does not survive
//     contact with the mobile layout at a tablet width.
//   • The reservation in globals.css (`:root[data-sticky-lead] body`) is keyed to
//     the SAME breakpoint and moves with it — see the stacking contract there.
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

    // The bar is `fixed` over an OPAQUE surface, so it covers the last ~7rem of
    // the document — which on every route that mounts it is <SiteFooter>'s legal
    // row, including the נגישות link that ת"י 5568 requires to be reachable.
    // Flag <html> so the one global rule in globals.css can reserve real page
    // padding for it (`:root[data-sticky-lead] body`). The flag lives here, next
    // to the code that decides the bar exists at all, so no page has to know.
    const root = document.documentElement;
    root.setAttribute("data-sticky-lead", "");

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
      root.removeAttribute("data-sticky-lead");
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
      // Hook for the bottom-of-viewport stacking contract in globals.css: while
      // <ConsentBanner> is asking for a cookie choice it parks this bar off-screen,
      // so the visitor is never asked two questions at once (the banner is z-50 and
      // was covering the only conversion action on a first visit). The bar slides
      // back up on its own drawer transition the moment the choice is made.
      data-sticky-lead-cta=""
      // Hidden at lg+, where <SiteHeader>'s /book pill takes over as the
      // persistent ask. Keep this breakpoint and that one identical — see the
      // header comment; a mismatch is a band of widths with no ask at all.
      className={[
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
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
      <p className="mt-1.5 text-center text-[12px] leading-snug text-muted">
        השוואה חינמית · ללא התחייבות · פנייה רק באישורכם
      </p>
    </div>
  );
}
