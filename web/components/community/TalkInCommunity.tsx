// ────────────────────────────────────────────────────────────────────────────
// <TalkInCommunity> — a "דברו על זה בקהילה" CTA for catalogue pages (provider /
// compare / vs). Deep-links into /community with a pre-selected channel + an
// optional provider tag + a draft, which the composer picks up (useComposerPrefill).
// Plain server-safe component (no client hooks) so it drops into RSC catalogue pages.
//
// Design: premium-2026 tokens only, RTL logical props, dark-mode via tokens, a real
// next/link with a visible focus ring. Organic UGC — no incentive/coupon language.
// ────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import type { Channel } from "@/lib/community";

export interface TalkInCommunityProps {
  /** The community channel the deep-link opens (already a valid CHANNELS value). */
  channel: Channel;
  /** Optional catalogue provider this is about (tags the resulting post). */
  providerSlug?: string;
  providerName?: string;
  /** Optional prefilled composer text. */
  draft?: string;
  /** Optional CTA label override. */
  label?: string;
}

export default function TalkInCommunity({
  channel,
  providerSlug,
  providerName,
  draft,
  label,
}: TalkInCommunityProps) {
  const params = new URLSearchParams({ channel });
  if (providerSlug) params.set("provider", providerSlug);
  if (draft) params.set("draft", draft);
  const href = `/community?${params.toString()}`;

  return (
    <Link
      href={href}
      className="press inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-soft transition-colors [@media(hover:hover)_and_(pointer:fine)]:hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      aria-label={
        providerName ? `דברו על ${providerName} בקהילת חוסך` : "דברו על זה בקהילת חוסך"
      }
    >
      <span aria-hidden="true">💬</span>
      <span>{label ?? "דברו על זה בקהילה"}</span>
    </Link>
  );
}
