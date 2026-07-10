"use client";

// ────────────────────────────────────────────────────────────────────────────
// <ShareBar> — share a community post to WhatsApp (the Israeli audience's default)
// or copy its permalink. Used in the feed <PostCard> (WhatsApp only, to keep the
// meta row light) and on the public /community/post/[id] permalink (both buttons).
//
// The absolute URL is built at click time from window.location.origin + the given
// path, so it's correct on both app.switchy-ai.com and any preview host. The share
// text is truth-only (the post's own clipped words + the link) via lib/share.ts.
//
// Design: premium-2026 tokens, small text buttons matching the card meta row, real
// <button>s with aria-labels + visible focus rings, RTL-safe.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import { communityShareText, whatsappShareUrl } from "@/lib/share";
import { trackEvent } from "@/lib/tracking";

const BTN =
  "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-muted underline-offset-2 transition-colors hover:text-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export default function ShareBar({
  path,
  body = "",
  showCopy = true,
}: {
  /** App-relative path to the post permalink, e.g. "/community/post/<id>". */
  path: string;
  /** The post body — clipped into the share teaser (truth-only). */
  body?: string;
  /** Show the "copy link" button (permalink page); off in the compact feed row. */
  showCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const absoluteUrl = useCallback(() => {
    const origin = typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://app.switchy-ai.com";
    return `${origin}${path}`;
  }, [path]);

  const onWhatsApp = useCallback(() => {
    const url = whatsappShareUrl(communityShareText(body, absoluteUrl()));
    window.open(url, "_blank", "noopener,noreferrer");
    trackEvent("post_shared", { method: "whatsapp" });
  }, [body, absoluteUrl]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setCopied(true);
      trackEvent("post_shared", { method: "copy" });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked / unavailable — silently no-op */
    }
  }, [absoluteUrl]);

  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={onWhatsApp} className={BTN} aria-label="שיתוף הפוסט בוואטסאפ">
        <span aria-hidden="true">💬</span>
        וואטסאפ
      </button>
      {showCopy && (
        <button
          type="button"
          onClick={onCopy}
          className={BTN}
          aria-label={copied ? "הקישור הועתק" : "העתקת קישור לפוסט"}
        >
          {copied ? "הועתק ✓" : "העתק קישור"}
        </button>
      )}
    </span>
  );
}
