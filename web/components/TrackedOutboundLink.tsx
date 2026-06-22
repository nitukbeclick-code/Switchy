"use client";

// ────────────────────────────────────────────────────────────────────────────
// <TrackedOutboundLink> — a thin "use client" wrapper around a plain external
// <a> that fires a non-PII "outbound_click" analytics event on click. Lets a
// Server Component instrument a genuine exit-intent link (e.g. a provider's
// official site) without becoming a client component itself.
//
// Best-effort and fire-and-forget: trackEvent() no-ops safely when gtag/fbq are
// absent and never throws, so the navigation is never blocked. Renders a normal
// anchor (caller supplies href/target/rel/className) — semantics are unchanged.
// ────────────────────────────────────────────────────────────────────────────

import type { AnchorHTMLAttributes } from "react";
import { trackEvent } from "@/lib/tracking";

type TrackedOutboundLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Stable label for the destination, e.g. the provider slug. */
  provider: string;
  /** What the link points at, e.g. "official". */
  dest: string;
};

export default function TrackedOutboundLink({
  provider,
  dest,
  onClick,
  children,
  ...anchorProps
}: TrackedOutboundLinkProps) {
  return (
    <a
      {...anchorProps}
      onClick={(e) => {
        trackEvent("outbound_click", { provider, dest });
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
