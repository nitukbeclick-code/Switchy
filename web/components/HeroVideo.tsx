"use client";

// ────────────────────────────────────────────────────────────────────────────
// <HeroVideo> — the homepage hero's full-bleed background: a short, looping clip
// of Switchy, the AI agent, feathered borderlessly into the page so it reads as
// a seamless backdrop (NOT a framed card) with the headline/CTAs overlaid on
// top. Mirrors the verified static-site treatment.
//
// Layout: an absolutely-positioned wrapper fills the hero <section> (which is
// `relative isolate overflow-hidden`). The <video> covers it with object-fit,
// and a radial mask feathers the white-background robot into the page so it has
// no hard rectangular edge. A sibling "scrim" gradient (theme-aware via the page
// --background token) darkens/clears the right side (the RTL start edge) so the
// overlaid Hebrew text stays legible while the robot shows on the left.
//
// Responsive: on desktop the robot sits on the left and text on the right
// (object-position 32% 50%, horizontal scrim); on narrow screens the robot moves
// to the top and the text reads below it on a bottom-anchored scrim (media query
// at <=760px).
//
// Playback is JS-controlled (no `autoPlay` attribute) so we can honour
// prefers-reduced-motion correctly: reduced-motion users see the poster still +
// a focusable "נגן" button and motion only starts if THEY ask. Everyone else
// gets a muted, looping, inline autoplay that pauses when scrolled offscreen
// (perf + battery). The poster is a real frame (.jpg) for an instant, on-brand
// LCP; the video itself is ~3.25 MB H.264. Muted throughout, so no captions are
// needed; if a narrated cut is ever used, add a <track kind="captions">.
// RTL + dark are inherited from the brand tokens.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  // `reduced` = the user prefers reduced motion; `optedIn` = they tapped "נגן".
  const [reduced, setReduced] = useState(false);
  const [optedIn, setOptedIn] = useState(false);

  // Track the reduced-motion preference (and react if it changes live).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  // Play only when visible AND motion is allowed; pause when offscreen. This is
  // the single source of truth for playback — covers autoplay, scroll, and the
  // reduced-motion opt-in without ever fighting an `autoPlay` attribute.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const allowed = !reduced || optedIn;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (e.isIntersecting && allowed) {
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [reduced, optedIn]);

  const showPlayButton = reduced && !optedIn;

  return (
    <div aria-hidden={!showPlayButton} className="absolute inset-0 -z-0">
      {/* Feathered full-bleed video. The radial mask dissolves the clip's white
          studio background into the page so there is NO hard rectangular edge;
          object-position keeps the robot framed on the start side. The mask +
          object-position flip to a top-anchored portrait crop on mobile (see the
          scoped media query at the bottom). */}
      <video
        ref={videoRef}
        className="sw-hero-video absolute inset-0 h-full w-full object-cover"
        poster="/videos/switchy-hero-poster.jpg"
        aria-label="Switchy — סוכן ה-AI שמשווה לכם תקשורת וחוסך לכם כסף"
        muted
        loop
        playsInline
        preload="metadata"
        style={{
          objectPosition: "32% 50%",
          WebkitMaskImage:
            "radial-gradient(125% 118% at 31% 47%, #000 40%, transparent 80%)",
          maskImage:
            "radial-gradient(125% 118% at 31% 47%, #000 40%, transparent 80%)",
        }}
      >
        <source src="/videos/switchy-hero.mp4" type="video/mp4" />
      </video>

      {/* Legibility scrim — a theme-aware wash in the page background color that
          fades from solid on the right (the RTL start edge, where the text sits)
          to transparent on the left (where the robot shows). var(--background)
          re-skins automatically in dark mode. On mobile it becomes a
          bottom-anchored wash so the text reads below the robot. */}
      <div
        aria-hidden="true"
        className="sw-hero-scrim absolute inset-0"
        style={{
          background:
            "linear-gradient(to left, var(--background) 0%, var(--background) 27%, color-mix(in srgb, var(--background) 72%, transparent) 45%, transparent 67%)",
        }}
      />

      {/* Reduced-motion: hold on the poster + a real, focusable opt-in to play.
          Pinned to the start side over the robot so it's discoverable without
          covering the headline. */}
      {showPlayButton && (
        <button
          type="button"
          onClick={() => setOptedIn(true)}
          className="interactive press absolute bottom-4 start-4 z-10 inline-flex items-center gap-2 rounded-full px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="glass-strong inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-ink shadow-[var(--shadow-card)]">
            <span aria-hidden="true">▶</span> נגן את ההדגמה
          </span>
        </button>
      )}

      {/* Responsive switch: on narrow screens the robot moves to the top and the
          scrim anchors to the bottom so the headline/CTAs read below the clip. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media (max-width: 760px) {
          .sw-hero-video {
            /* Frame the robot's head + shoulders (was cropping near the waist) and
               keep the clip opaque longer before the mask feathers it into the page. */
            object-position: 50% 8% !important;
            -webkit-mask-image: linear-gradient(to bottom, #000 44%, transparent 82%) !important;
            mask-image: linear-gradient(to bottom, #000 44%, transparent 82%) !important;
          }
          .sw-hero-scrim {
            /* Don't tint the top — let the robot read clearly — then ramp to the page
               background lower down so the headline/CTAs below stay legible. */
            background: linear-gradient(to bottom, transparent 0%, transparent 32%, var(--background) 66%) !important;
          }
        }
      `,
        }}
      />
    </div>
  );
}
