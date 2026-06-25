import * as React from "react";

export interface SwitchyMascotProps {
  /** Rendered square size in px. */
  size?: number;
  /** Accessible label. When omitted the mascot is decorative (aria-hidden). */
  label?: string;
  /** Show the optional amber "signal" spark. Off by default. */
  spark?: boolean;
  className?: string;
}

/**
 * Switchy — the brand mascot (v1). A minimal, geometric robot built entirely
 * from the brand palette: ink structure (inherits `currentColor` → set via the
 * wrapper's `color`/`--ink`), green `--accent` eyes + antenna + chest switch,
 * an optional amber `--value` signal spark. Friendly, restrained, on-brand —
 * a v1 starting point the owner can refine. Decorative by default
 * (`aria-hidden`); pass `label` to announce it. RTL/dark-safe (symmetric, all
 * colors via tokens).
 */
export function SwitchyMascot({ size = 96, label, spark = false, className }: SwitchyMascotProps) {
  const decorative = !label;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : label}
      style={{ color: "var(--ink)" }}
    >
      {/* antenna + signal dot */}
      <line x1="48" y1="14" x2="48" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="10.5" r="4" fill="var(--accent)" />
      {/* head */}
      <rect x="22" y="24" width="52" height="40" rx="14" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      {/* visor wash */}
      <rect x="29" y="33" width="38" height="22" rx="9" fill="var(--accent)" opacity="0.10" />
      {/* eyes */}
      <circle cx="40" cy="44" r="4.5" fill="var(--accent)" />
      <circle cx="56" cy="44" r="4.5" fill="var(--accent)" />
      {/* smile */}
      <path d="M40 53 Q48 58 56 53" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      {/* side nubs */}
      <rect x="17" y="38" width="6" height="12" rx="3" fill="currentColor" />
      <rect x="73" y="38" width="6" height="12" rx="3" fill="currentColor" />
      {/* body */}
      <rect x="30" y="66" width="36" height="20" rx="8" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      {/* chest "switch" motif */}
      <rect x="42" y="72" width="12" height="8" rx="4" fill="var(--accent)" opacity="0.9" />
      {/* optional amber signal spark */}
      {spark && <path d="M70 19 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z" fill="var(--value)" />}
    </svg>
  );
}

export default SwitchyMascot;
