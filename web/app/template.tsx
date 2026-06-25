"use client";

import styles from "./template.module.css";

/**
 * Root route TEMPLATE (Next.js App Router `template.tsx`).
 *
 * Unlike `layout.tsx` (which persists across navigations), a template re-mounts
 * on every route change with a fresh key — so this wrapper replays a fast, tactile
 * enter animation each time the user navigates between pages, giving the site the
 * same "settle into place" feel the Flutter app has.
 *
 * The motion lives entirely in `template.module.css` (a one-shot opacity +
 * translateY keyframe on the brand `--ease-out`, 240ms — the app's motionMedium):
 *   • RTL-correct — motion is vertical only, so there is no physical left/right
 *     bias to follow the logical end; it reads identically in RTL and LTR.
 *   • Zero-CLS — animates compositor-only props (opacity/transform); the committed
 *     resting style is fully visible, so SSR content is never hidden from crawlers
 *     and layout never shifts.
 *   • Reduced-motion-safe — under `prefers-reduced-motion: reduce` the keyframe is
 *     disabled and children render statically.
 *
 * It is intentionally tiny and dependency-free (no Framer Motion): just a class on
 * a single passthrough wrapper `<div>` (the standard App Router template shape — a
 * real box is required for the opacity/transform animation to render). The div is
 * a plain block that spans the content width with auto height, so it is
 * layout-neutral and introduces no extra sizing of its own.
 */
export default function Template({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={styles.transition}>{children}</div>;
}
