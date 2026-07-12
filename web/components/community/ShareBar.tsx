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

  // Native share sheet FIRST when the platform offers one (mobile), falling back
  // to a clipboard copy. The capability check happens at CLICK time only — never
  // at render — so the server-rendered markup can't mismatch on hydration.
  const onCopy = useCallback(async () => {
    const url = absoluteUrl();
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url });
        trackEvent("post_shared", { method: "native" });
        return;
      } catch (err) {
        // The user closed the sheet — respect the cancel, don't surprise-copy.
        if (err instanceof DOMException && err.name === "AbortError") return;
        /* share failed for another reason — fall through to the clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
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
          aria-label={copied ? "הקישור הועתק" : "שיתוף או העתקת קישור לפוסט"}
        >
          {copied ? "הועתק ✓" : "העתק קישור"}
        </button>
      )}
      {/* Screen readers hear the copy confirmation even though the visual is just
          the button's text swap. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "הקישור הועתק" : ""}
      </span>
    </span>
  );
}
