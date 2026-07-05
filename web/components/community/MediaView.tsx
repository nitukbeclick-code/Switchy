"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MediaView> — renders a single post/reply attachment (image | video | audio).
//
// The Media object comes from the data layer (lib/community.ts): { type, url,
// durationMs? }, where `url` is a public storage URL for UNTRUSTED user content.
// SECURITY: the URL is used ONLY as the `src` of a plain media element — never
// interpolated into markup, never injected as raw HTML. next/image is
// deliberately avoided (arbitrary storage hosts aren't in the image allow-list),
// so a plain <img> is used with the required eslint-disable above it.
//
// Design: premium-2026 tokens only, rounded-2xl, hairline border, capped height,
// RTL-safe (logical properties), dark-mode via tokens, reduced-motion neutral
// (no motion here). Audio (and video, when known) shows a formatted duration.
// ────────────────────────────────────────────────────────────────────────────

import type { Media } from "@/lib/community";

/** mm:ss from a millisecond duration (e.g. 5200 → "0:05"). */
function formatDuration(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function MediaView({ media }: { media: Media }) {
  const duration = formatDuration(media.durationMs);

  if (media.type === "image") {
    return (
      <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-background">
        {/* Plain <img>: URL used only as src; next/image can't serve arbitrary
            storage hosts. eslint-disable is required per project convention. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.url}
          alt="תמונה שצורפה לפוסט בקהילה"
          loading="lazy"
          decoding="async"
          className="block max-h-[32rem] w-full object-contain"
        />
      </div>
    );
  }

  if (media.type === "video") {
    return (
      <div className="mt-2 overflow-hidden rounded-2xl border border-border bg-background">
        <video
          controls
          preload="metadata"
          playsInline
          aria-label="וידאו שצורף לפוסט בקהילה"
          className="block max-h-[32rem] w-full bg-black"
          src={media.url}
        />
        {duration && (
          <p className="px-3 py-1.5 text-start text-xs text-muted" dir="ltr">
            {duration}
          </p>
        )}
      </div>
    );
  }

  // audio
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2">
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-text"
      >
        🎤
      </span>
      <audio
        controls
        preload="metadata"
        aria-label="הקלטה קולית שצורפה לפוסט בקהילה"
        className="min-w-0 flex-1"
        src={media.url}
      />
      {duration && (
        <span className="shrink-0 text-xs text-muted" dir="ltr">
          {duration}
        </span>
      )}
    </div>
  );
}
