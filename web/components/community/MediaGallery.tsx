"use client";

// ────────────────────────────────────────────────────────────────────────────
// <MediaGallery> — a responsive grid of a post's images (the primary image +
// gallery extras from post_media). Images only; a video/audio primary is rendered
// by <MediaView> separately. Each tile opens the full-size image in a new tab (a
// dependency-free "lightbox"). URLs are UNTRUSTED — used only as an <img> src / an
// <a> href, never interpolated into markup.
//
// Design: premium-2026 tokens, RTL-safe (grid is direction-agnostic), rounded tiles,
// hairline borders, focus-visible rings, lazy images.
// ────────────────────────────────────────────────────────────────────────────

import type { Media } from "@/lib/community";

export default function MediaGallery({ images }: { images: Media[] }) {
  const imgs = images.filter((m) => m.type === "image").slice(0, 5);
  if (imgs.length === 0) return null;
  if (imgs.length === 1) {
    const m = imgs[0];
    return (
      <a
        href={m.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="פתיחת התמונה בגודל מלא"
        className="mt-3 block overflow-hidden rounded-xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.url} alt="" loading="lazy" decoding="async" className="max-h-96 w-full object-cover" />
      </a>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5">
      {imgs.map((m, i) => (
        <a
          key={`${m.url}-${i}`}
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`פתיחת תמונה ${i + 1} מתוך ${imgs.length} בגודל מלא`}
          className={`block overflow-hidden rounded-xl border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            imgs.length === 3 && i === 0 ? "col-span-2" : ""
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.url} alt="" loading="lazy" decoding="async" className="h-44 w-full object-cover" />
        </a>
      ))}
    </div>
  );
}
