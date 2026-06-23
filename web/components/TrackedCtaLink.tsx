"use client";

// ────────────────────────────────────────────────────────────────────────────
// <TrackedCtaLink> — a thin "use client" wrapper around next/link that fires a
// non-PII "cta_click" analytics event on click, then navigates normally. Lets a
// Server Component (header / home hero) instrument its primary CTAs without
// becoming a client component itself.
//
// Tracking is best-effort and fire-and-forget: trackEvent() no-ops safely when
// gtag/fbq are absent and never throws, so navigation is never blocked. Pass only
// non-PII labels (location / label) — never user data.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackEvent } from "@/lib/tracking";

type TrackedCtaLinkProps = ComponentProps<typeof Link> & {
  /** Where the CTA lives, e.g. "header" / "hero". */
  location: string;
  /** Which CTA it is, e.g. "consult" / "compare". */
  label: string;
};

export default function TrackedCtaLink({
  location,
  label,
  onClick,
  ...linkProps
}: TrackedCtaLinkProps) {
  return (
    <Link
      {...linkProps}
      onClick={(e) => {
        trackEvent("cta_click", { location, label });
        onClick?.(e);
      }}
    />
  );
}
