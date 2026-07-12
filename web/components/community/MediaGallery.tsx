"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MediaGallery> — a responsive grid of a post's images (the primary image +
// gallery extras from post_media). Images only; a video/audio primary is rendered
// by <MediaView> separately. Each tile opens the full-size image in a new tab (a
// dependency-free "lightbox"). URLs are UNTRUSTED — used only as an <img> src / an
// <a> href, never interpolated into markup.
//
// HONESTY/CLS: every slot has fixed dimensions (aspect-ratio for the single image,
// fixed tile heights for the grid) so nothing shifts while bytes arrive, and an
// image that fails to load shows an explicit "המדיה אינה זמינה" tile instead of a
// broken-image glyph.
//
// Design: premium-2026 tokens, RTL-safe (grid is direction-agnostic), rounded tiles,
// hairline borders, focus-visible rings, lazy images.
// ────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import type { Media } from "@/lib/community";

function FailedTile({ className = "" }: { className?: string }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 rounded-xl border border-border bg-background text-xs text-muted ${className}`}
    >
      <span aria-hidden="true">🖼️</span>
      המדיה אינה זמינה
    </div>
  );
}

export default function MediaGallery({ images }: { images: Media[] }) {
  // URLs whose <img> errored — rendered as an honest fallback tile.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const markFailed = (url: string) =>
    setFailed((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });

  const imgs = images.filter((m) => m.type === "image").slice(0, 5);
  if (imgs.length === 0) return null;
  if (imgs.length === 1) {
    const m = imgs[0];
    if (failed.has(m.url)) return <FailedTile className="mt-3 h-44 w-full" />;
    return (
      <a
        href={m.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="פתיחת התמונה בגודל מלא"
        className="mt-3 block overflow-hidden rounded-xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => markFailed(m.url)}
          className="aspect-[16/9] w-full object-cover"
        />
      </a>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5">
      {imgs.map((m, i) => {
        const wide = imgs.length === 3 && i === 0 ? "col-span-2" : "";
        if (failed.has(m.url)) {
          return <FailedTile key={`${m.url}-${i}`} className={`h-44 w-full ${wide}`} />;
        }
        return (
          <a
            key={`${m.url}-${i}`}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`פתיחת תמונה ${i + 1} מתוך ${imgs.length} בגודל מלא`}
            className={`block overflow-hidden rounded-xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${wide}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.url}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => markFailed(m.url)}
              className="h-44 w-full object-cover"
            />
          </a>
        );
      })}
    </div>
  );
}
