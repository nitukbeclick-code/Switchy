"use client";

// ────────────────────────────────────────────────────────────────────────────
// <HeroVideo> — the homepage hero's visual anchor: a short, looping clip of
// Switchy, the AI agent, in a branded glass frame with a green ACTION spotlight
// and the mascot floating as a brand accent. Replaces the old static app
// mockup.
//
// Playback is JS-controlled (no `autoPlay` attribute) so we can honour
// prefers-reduced-motion correctly: reduced-motion users see the poster still +
// a focusable "נגן" button and motion only starts if THEY ask. Everyone else
// gets a muted, looping, inline autoplay that pauses when scrolled offscreen
// (perf + battery). The poster is a tiny SVG (instant LCP); the video itself is
// ~1.3 MB H.264. Muted throughout, so no captions are needed; if a narrated cut
// is ever used, add a <track kind="captions">.
// RTL + dark are inherited from the brand tokens.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import SwitchyMascot from "./SwitchyMascot";

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
    <div
      className="sw-reveal relative mx-auto w-full max-w-xl lg:mx-0"
      style={{ animationDelay: "180ms" }}
    >
      {/* Green ACTION spotlight behind the frame — decorative, never announced. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[36px] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 42%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 70%)",
        }}
      />

      {/* The framed clip. aspect-[1408/768] matches the source exactly → zero
          crop, zero layout shift. .bento + .glow-accent carry the brand frame. */}
      <div className="interactive sw-lift bento glow-accent relative aspect-[1408/768] w-full overflow-hidden rounded-[var(--radius-xl)]">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          poster="/videos/switchy-hero-poster.svg"
          aria-label="Switchy — סוכן ה-AI שמשווה לכם תקשורת וחוסך לכם כסף"
          muted
          loop
          playsInline
          preload="metadata"
        >
          <source src="/videos/switchy-hero.mp4" type="video/mp4" />
        </video>

        {/* Reduced-motion: hold on the poster + a real, focusable opt-in to play. */}
        {showPlayButton && (
          <button
            type="button"
            onClick={() => setOptedIn(true)}
            className="interactive press absolute inset-0 z-10 flex items-center justify-center bg-ink/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="glass-strong inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-ink shadow-[var(--shadow-card)]">
              <span aria-hidden="true">▶</span> נגן את ההדגמה
            </span>
          </button>
        )}
      </div>

      {/* Floating mascot accent — embeds the robot into the page chrome. The
          video's aria-label already names it, so this chip is decorative. */}
      <div
        aria-hidden="true"
        className="glass-strong absolute -top-3 inline-flex items-center gap-1.5 rounded-full border border-accent/25 px-3 py-1.5 shadow-[var(--glow-accent)] end-4 lg:-end-3"
      >
        <SwitchyMascot size={22} spark />
        <span className="text-xs font-semibold text-ink">Switchy · סוכן AI</span>
      </div>
    </div>
  );
}
